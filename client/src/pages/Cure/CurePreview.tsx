

import React, { useEffect } from "react";
import { KeenIcon } from "@/components";
import {
  extractMainDocument,
  extractMt799Message,
  extractSubDocument,
  getSelectedRowDetails,
  sanitizeResultView,
} from "./PDFConverter";
import { normalizeActionItems } from "./cureResultHelpers";

// ── Constants ─────────────────────────────────────────────────────────────────

/** FIX (High): cap array rendering to prevent browser freeze on large payloads */
const MAX_PREVIEW_ITEMS = 50;

/** FIX (High): max recursion depth for renderPreviewValue */
const MAX_RENDER_DEPTH = 5;

const SAFE_ROW_DETAIL_KEYS: string[] = [
  "id",
  "transaction_no",
  "lc_number",
  "created_at",
];

// ── Types ─────────────────────────────────────────────────────────────────────

type CurePreviewProps = {
  open: boolean;
  onClose: () => void;
  pipelineResult: unknown;
  selectedRow: unknown;
  mt799Ai: unknown;
  mt799Rag: unknown;
  ownCures: unknown[];
  crossCures: unknown[];
  // mocCures: unknown[];
  multihopCures: unknown[];
  overallAi: unknown;
  overallRag: unknown;
  onEmail: (e: React.MouseEvent<HTMLButtonElement>) => void;
};

// ── Error boundary ────────────────────────────────────────────────────────────

/**
 * FIX (Medium): wrap each section in an error boundary so a single bad value
 * cannot crash the entire preview modal to a white screen.
 */
class PreviewErrorBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: Error) {
    console.error("[CurePreview] render error:", err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-sm text-red-600 p-2 rounded border border-red-200">
          Could not render{this.props.label ? ` "${this.props.label}"` : " this section"}.
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const stringifySafe = (v: unknown): string => {
  try {
    return typeof v === "string" ? v : (JSON.stringify(v) ?? String(v));
  } catch {
    return "[unserializable value]";
  }
};

const formatPreviewKey = (key: string): string =>
  String(key ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * FIX (High): sanitize only at the root call (depth === 0) so sanitizeResultView
 * is not called recursively on every nested node, preventing double-recursion
 * stack exhaustion.
 *
 * FIX (High): enforce MAX_RENDER_DEPTH hard ceiling to prevent call stack crash
 * on deeply nested payloads.
 *
 * FIX (High): cap array rendering at MAX_PREVIEW_ITEMS to prevent browser freeze.
 *
 * FIX (Low): include `depth` in React keys to prevent duplicates across sibling
 * recursive tables.
 */
const renderPreviewValue = (value: unknown, depth = 0): React.ReactNode => {
  // Sanitize once at root — never re-sanitize inside recursion
  const cleaned = depth === 0 ? sanitizeResultView(value) : value;

  if (cleaned == null || cleaned === "") {
    return <span className="text-gray-500">N/A</span>;
  }

  if (
    typeof cleaned === "string" ||
    typeof cleaned === "number" ||
    typeof cleaned === "boolean"
  ) {
    return <span className="text-gray-800">{String(cleaned)}</span>;
  }

  // FIX (High): hard depth ceiling — serialise instead of crashing
  if (depth >= MAX_RENDER_DEPTH) {
    return (
      <pre className="text-sm whitespace-pre-wrap break-words text-gray-900 card rounded p-2">
        {stringifySafe(cleaned)}
      </pre>
    );
  }

  if (Array.isArray(cleaned)) {
    if (cleaned.length === 0) {
      return <span className="text-gray-500">No items</span>;
    }

    // FIX (High): cap rendering to prevent DOM freeze on huge arrays
    const visible = cleaned.slice(0, MAX_PREVIEW_ITEMS);

    return (
      <div className="space-y-2">
        {visible.map((item, idx) => (
          <div key={`arr-${depth}-${idx}`} className="card rounded p-2">
            <div className="text-sm font-bold text-gray-900 mb-1">
              Discrepancy {idx + 1}
            </div>
            {renderPreviewValue(item, depth + 1)}
          </div>
        ))}
        {cleaned.length > MAX_PREVIEW_ITEMS && (
          <div className="text-xs text-amber-600 px-2 py-1 border border-amber-200 rounded bg-amber-50">
            Showing {MAX_PREVIEW_ITEMS} of {cleaned.length} items. Download the
            PDF for the full list.
          </div>
        )}
      </div>
    );
  }

  if (typeof cleaned === "object") {
    const entries = Object.entries(cleaned as Record<string, unknown>).filter(
      ([, v]) => v !== undefined
    );

    if (entries.length === 0) {
      return <span className="text-gray-500">No fields</span>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="table align-middle text-sm min-w-full">
          <tbody className="text-gray-700">
            {entries.map(([k, v], i) => (
              // FIX (Low): include depth in key to avoid duplicates across
              // sibling recursive tables with the same field names
              <tr key={`obj-${depth}-${k}-${i}`}>
                <td className="font-semibold w-64">{formatPreviewKey(k)}</td>
                <td>{renderPreviewValue(v, depth + 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <span className="text-gray-800">{String(cleaned)}</span>;
};

// ── Section renderers ─────────────────────────────────────────────────────────

const renderPreviewSection = (title: string, value: unknown) => (
  <PreviewErrorBoundary label={title}>
    <div className="card rounded p-3">
      <div className="font-semibold mb-2 text-gray-900">{title}</div>
      {renderPreviewValue(value)}
    </div>
  </PreviewErrorBoundary>
);

/**
 * FIX (Medium): only render fields in SAFE_ROW_DETAIL_KEYS — suppress
 * UserID, cifno, Model (PII / internal identifiers).
 */
const renderSelectedRowDetailsSection = (
  details: Record<string, unknown>
) => {
  const entries = SAFE_ROW_DETAIL_KEYS.map((k) => [k, details[k]] as [string, unknown]).filter(
    ([, v]) => v != null && String(v) !== "N/A" && String(v).trim() !== ""
  );

  return (
    <PreviewErrorBoundary label="Row Details">
      <div className="card rounded p-3">
        <div className="font-bold mb-2 text-gray-900">Row Details</div>
        {entries.length === 0 ? (
          <div className="text-gray-500">No fields</div>
        ) : (
          <div className="space-y-1 text-sm text-gray-800">
            {entries.map(([k, v]) => (
              <div key={k}>
                <span className="font-semibold">{k}</span>
                <span>{` : ${String(v)}`}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PreviewErrorBoundary>
  );
};

const renderPreviewTextSection = (title: string, text: string) => (
  <PreviewErrorBoundary label={title}>
    <div className="card rounded p-3">
      <div className="font-semibold mb-2 text-gray-900">{title}</div>
      <div className="text-sm whitespace-pre-wrap break-words text-gray-700 p-2 leading-6 text-justify">
        {text?.trim() ? text : "N/A"}
      </div>
    </div>
  </PreviewErrorBoundary>
);

const parseMaybeJsonObject = (value: unknown): unknown => {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (!(raw.startsWith("{") || raw.startsWith("["))) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const pickOverallCureObject = (overall: unknown) => {
  const cleanOverall = sanitizeResultView(overall) as Record<string, unknown> | null;
  const directCure = cleanOverall?.cure;
  const parsedDirectCure = parseMaybeJsonObject(directCure);
  const cureCandidate = parsedDirectCure ?? directCure;
  const isObjectCure =
    cureCandidate &&
    typeof cureCandidate === "object" &&
    !Array.isArray(cureCandidate);
  return {
    overall: cleanOverall,
    cure: (isObjectCure ? cureCandidate : cleanOverall) as Record<string, unknown> | null,
  };
};

/**
 * FIX (Low): validate value is a primitive before String() coercion to avoid
 * rendering "[object Object]" for non-string API fields.
 */
const renderFieldLine = (label: string, value: unknown): React.ReactNode => {
  if (value == null) return null;

  let display: string;
  if (typeof value === "string") {
    display = value.trim();
  } else if (typeof value === "number" || typeof value === "boolean") {
    display = String(value);
  } else {
    // Objects / arrays — serialise safely instead of "[object Object]"
    display = stringifySafe(value);
  }

  if (!display) return null;

  return (
    <div className="text-sm text-gray-700">
      <span className="font-semibold text-gray-900">{label}:</span> {display}
    </div>
  );
};

/**
 * FIX (Medium): validate each doc is a string before rendering — prevents
 * "[object Object]" badges and closes prototype-pollution rendering path.
 */
const renderDocuments = (docs: unknown): React.ReactNode => {
  const raw = Array.isArray(docs) ? docs : docs ? [docs] : [];
  // Only render actual non-empty strings
  const list = raw.filter(
    (d): d is string => typeof d === "string" && d.trim() !== ""
  );
  if (!list.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {list.map((doc, idx) => (
        <span
          key={`${doc}-${idx}`}
          className="rounded card px-2 py-1 text-xs text-gray-900"
        >
          {doc}
        </span>
      ))}
    </div>
  );
};

const renderOverallPreviewSection = (title: string, overall: unknown) => {
  const { overall: overallValue, cure } = pickOverallCureObject(overall);

  const actionItems = normalizeActionItems(
    cure?.action_items ??
      cure?.actionItems ??
      cure?.actions ??
      overallValue?.action_items ??
      overallValue?.actionItems ??
      overallValue?.actions
  );

  // FIX (High): never render raw API error strings in the UI — log internally
  // and show only a safe generic message to the user.
  const rawError = overallValue?.error ?? cure?.error;
  if (rawError) {
    console.error("[CurePreview] overall section error field:", rawError);
  }
  const hasError = !!rawError;

  return (
    <PreviewErrorBoundary label={title}>
      <div className="card rounded p-3">
        <div className="font-semibold mb-2 text-gray-900">{title}</div>

        <div className="card rounded p-3 mb-3">
          <div className="font-semibold text-gray-900 mb-2">Overall Summary</div>

          {/* FIX (High): safe generic error message — no raw API text */}
          {hasError ? (
            <div className="text-sm text-red-600 mb-2">
              An error occurred processing this result.
            </div>
          ) : null}

          <div className="space-y-1">
            {renderFieldLine("Source", overallValue?.source)}
            {renderFieldLine(
              "Input Counts",
              overallValue?.input_counts
                ? `Own ${(overallValue.input_counts as Record<string,unknown>)?.own ?? 0} | Cross ${(overallValue.input_counts as Record<string,unknown>)?.cross ?? 0} | MOC ${(overallValue.input_counts as Record<string,unknown>)?.moc ?? 0} | Multihop ${(overallValue.input_counts as Record<string,unknown>)?.multihop ?? 0}`
                : ""
            )}
            {renderFieldLine(
              "Deduplicated",
              overallValue?.deduplicated != null
                ? String(overallValue.deduplicated)
                : ""
            )}
            {renderFieldLine(
              "Root Cause",
              cure?.root_cause ?? cure?.issue ?? cure?.discrepancy
            )}
            {renderFieldLine("Recommended Action", cure?.recommended_action)}
            {renderFieldLine(
              "Alternate Action",
              cure?.alternate_action ?? cure?.alternative_action
            )}
            {renderFieldLine("Timeline", cure?.timeline)}
            {renderFieldLine("Success Criteria", cure?.success_criteria)}
            {renderFieldLine("Synthesis Notes", cure?.synthesis_notes)}
          </div>
          {renderDocuments(cure?.document_name ?? cure?.documents)}
        </div>

        <div className="card rounded p-3">
          <div className="font-semibold text-gray-900 mb-2">Action Items</div>
          {actionItems.length === 0 ? (
            <div className="text-sm text-gray-500">No action items</div>
          ) : (
            <div className="space-y-2">
              {actionItems.map((item: unknown, index: number) => {
                const it = item as Record<string, unknown>;
                return (
                  <div key={index} className="card rounded p-2">
                    <div className="text-sm font-semibold text-gray-900 mb-1">
                      {it?.cure_id ? `#${it.cure_id}` : `Item ${index + 1}`}
                    </div>
                    <div className="space-y-1">
                      {renderFieldLine(
                        "Issue",
                        it?.issue ?? it?.root_cause ?? item
                      )}
                      {renderFieldLine(
                        "Recommended Action",
                        it?.recommended_action
                      )}
                      {renderFieldLine(
                        "Alternate Action",
                        it?.alternate_action ?? it?.alternative_action
                      )}
                    </div>
                    {renderDocuments(it?.documents ?? it?.document_name)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PreviewErrorBoundary>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

function CurePreview({
  open,
  onClose,
  pipelineResult,
  selectedRow,
  mt799Ai,
  mt799Rag,
  ownCures,
  crossCures,
  // mocCures,
  multihopCures,
  overallAi,
  overallRag,
  onEmail,
}: CurePreviewProps) {

  // FIX (Low): close modal on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const hasRenderable = (value: unknown): boolean => {
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value as object).length > 0;
    return true;
  };

  const snap = (pipelineResult as Record<string, unknown>)?.snapshot ?? pipelineResult ?? {};
  const mainDocument = extractMainDocument(snap);
  const subDocument = extractSubDocument(snap);
  const mt799AiMessage = extractMt799Message(mt799Ai);
  const mt799RagMessage = extractMt799Message(mt799Rag);

  return (
    // Backdrop
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999] p-4">
      {/*
        FIX (Low): role="dialog", aria-modal, aria-label for screen readers
        and keyboard accessibility.
      */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cure result preview"
        className="card shadow-lg w-full max-w-6xl max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <h3 className="text-lg font-bold text-gray-800">
            Cure Result Preview
          </h3>

          {/* FIX (Low): type="button" + aria-label on close button */}
          <button
            type="button"
            aria-label="Close cure result preview"
            className="btn btn-secondary"
            onClick={onClose}
          >
            <KeenIcon icon="cross" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-auto scrollable-x space-y-3">
          {/* FIX (Medium): only safe fields rendered — PII fields suppressed */}
          {renderSelectedRowDetailsSection(
            getSelectedRowDetails(selectedRow, snap) as Record<string, unknown>
          )}

          {renderPreviewTextSection("Main Document", mainDocument)}
          {renderPreviewTextSection("Sub Document", subDocument)}

          {hasRenderable(ownCures)
            ? renderPreviewSection("Own Document Cure", ownCures ?? [])
            : null}
          {hasRenderable(crossCures)
            ? renderPreviewSection("Cross Document Cure", crossCures ?? [])
            : null}
          {/* {hasRenderable(mocCures)
            ? renderPreviewSection("MOC Cure", mocCures ?? [])
            : null} */}
          {hasRenderable(multihopCures)
            ? renderPreviewSection("Multihop RAG Cure", multihopCures ?? [])
            : null}
          {hasRenderable(overallAi)
            ? renderOverallPreviewSection("Overall Cure (AI)", overallAi ?? {})
            : null}
          {hasRenderable(overallRag)
            ? renderOverallPreviewSection("Overall Cure (RAG)", overallRag ?? {})
            : null}
          {hasRenderable(mt799AiMessage)
            ? renderPreviewTextSection("MT799 Message (AI)", mt799AiMessage)
            : null}
          {hasRenderable(mt799RagMessage)
            ? renderPreviewTextSection("MT799 Message (RAG)", mt799RagMessage)
            : null}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end my-5 mx-5 gap-2">
          <button
            type="button"
            aria-label="Send cure result via email"
            className="btn btn-primary btn-outline cursor-pointer"
            onClick={onEmail}
          >
            Email
          </button>
        </div>
      </div>
    </div>
  );
}

export default CurePreview;

