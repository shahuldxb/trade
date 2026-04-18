

import { jsPDF } from "jspdf";

// ── Constants ─────────────────────────────────────────────────────────────────

const OMIT_RESULT_KEYS = new Set([
  "id",
  "source_row_id",
  "userid",
  "model",
  "created_at",
  "createdat",
  "transaction_no",
  "transactionno",
  "lc_number",
  "lcnumber",
  "cifno",
  "remarks",
  "remark",
  "lc_document",
  "lcdocument",
  "updated_at",
  "updatedat",
  "source_rag_document",
  "source_rag_documents",
  "sourceragdocument",
  "sourceragdocuments",
  "status",
  "source",
  "discrepancy_id",
  "discrepancyid",
  "ownstandardsdiscrepancy",
  "crossdocumentvalidationdiscrepancy",
  "multihopdiscrepancy",
  "multihopsdiscrepancy",
  "input counts",
]);

/** FIX (High): maximum recursion depth for sanitizeResultView and collectTextFragments */
const MAX_SANITIZE_DEPTH = 20;

/** FIX (High): maximum recursion depth for coerceReadableText */
const MAX_COERCE_DEPTH = 10;

/** FIX (High): maximum characters per text section to prevent browser freeze */
const MAX_FIELD_CHARS = 50_000;

/** FIX (High): maximum items rendered per array section */
const MAX_ARRAY_ITEMS = 200;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * FIX (Low): safe own-property accessor — prevents prototype-polluted keys
 * (__proto__, constructor, prototype) from being read via property access.
 */
const safeGet = (obj: Record<string, unknown>, key: string): unknown =>
  Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;

/**
 * FIX (Medium): circular-reference-safe JSON.stringify.
 * Replaces all bare JSON.stringify() calls throughout the file.
 */
const safeStringify = (v: unknown): string => {
  try {
    return JSON.stringify(v, null, 2) ?? String(v);
  } catch {
    return "[unserializable value]";
  }
};

/**
 * FIX (High): cap text fields to MAX_FIELD_CHARS to prevent browser freeze
 * when a document section contains megabytes of content.
 */
const truncate = (s: string): string =>
  s.length > MAX_FIELD_CHARS
    ? s.slice(0, MAX_FIELD_CHARS) + "\n\n[content truncated — see full document]"
    : s;

/**
 * FIX (High): cap array sections to MAX_ARRAY_ITEMS to prevent DOM / PDF
 * freeze on huge cure lists.
 */
const capArray = <T,>(arr: T[]): T[] => arr.slice(0, MAX_ARRAY_ITEMS);

// ── Sanitization ──────────────────────────────────────────────────────────────

/**
 * Recursively strip OMIT_RESULT_KEYS from an arbitrary value before display.
 *
 * FIX (High): `depth` guard — caps recursion at MAX_SANITIZE_DEPTH to prevent
 * call stack exhaustion on deeply nested API payloads.
 *
 * FIX (High): skips __proto__, constructor, and prototype keys explicitly to
 * prevent prototype pollution via Object.entries traversal.
 *
 * FIX (Low): typed `unknown` instead of `any` on all boundaries.
 */
export const sanitizeResultView = (value: unknown, depth = 0): unknown => {
  // FIX (High): hard recursion ceiling
  if (depth > MAX_SANITIZE_DEPTH) return "[max depth reached]";

  if (Array.isArray(value)) {
    return value.map((v) => sanitizeResultView(v, depth + 1));
  }

  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // FIX (High): skip prototype-polluting keys before any other check
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      const normalized = k.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (OMIT_RESULT_KEYS.has(normalized)) continue;
      out[k] = sanitizeResultView(v, depth + 1);
    }
    return out;
  }

  return value;
};

// ── Text normalisation ────────────────────────────────────────────────────────

const normalizeEscapedText = (raw: string): string =>
  String(raw ?? "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * Walk a value tree collecting all string leaves.
 *
 * FIX (High): `depth` guard — prevents call stack exhaustion when traversing
 * deeply nested objects alongside coerceReadableText.
 *
 * FIX (Low): typed `unknown` instead of `any`.
 */
const collectTextFragments = (
  value: unknown,
  out: string[],
  depth = 0
): void => {
  if (value == null || depth > MAX_SANITIZE_DEPTH) return;

  if (typeof value === "string") {
    const cleaned = normalizeEscapedText(value);
    if (cleaned) out.push(cleaned);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectTextFragments(item, out, depth + 1));
    return;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === "string") {
      const cleaned = normalizeEscapedText(obj.text);
      if (cleaned) out.push(cleaned);
    } else {
      Object.values(obj).forEach((item) =>
        collectTextFragments(item, out, depth + 1)
      );
    }
  }
};

/**
 * Coerce any value to a human-readable string for PDF / preview rendering.
 *
 * FIX (High): `depth` guard — caps recursion at MAX_COERCE_DEPTH.
 *
 * FIX (High): JSON re-parse now only fires for strings that START with `{`
 * or `[` — plain strings, numbers, and booleans encoded as JSON no longer
 * re-enter the function, closing the infinite-recursion path.
 *
 * FIX (Medium): JSON.stringify replaced with safeStringify to handle circular
 * references without throwing.
 *
 * FIX (Low): typed `unknown` instead of `any`.
 */
const coerceReadableText = (value: unknown, depth = 0): string => {
  if (value == null) return "";

  // FIX (High): hard recursion ceiling
  if (depth > MAX_COERCE_DEPTH) return String(value);

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";

    // FIX (High): only attempt JSON.parse for strings that look like objects
    // or arrays — never for plain strings, numbers, or booleans encoded as JSON
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (parsed !== null && typeof parsed === "object") {
          return coerceReadableText(parsed, depth + 1);
        }
      } catch {
        // Not valid JSON — keep as raw string
      }
    }

    return normalizeEscapedText(trimmed);
  }

  if (Array.isArray(value)) {
    return value
      .map((v) => coerceReadableText(v, depth + 1))
      .filter(Boolean)
      .join("\n\n");
  }

  if (typeof value === "object") {
    const fragments: string[] = [];
    collectTextFragments(value, fragments, depth);
    if (fragments.length > 0) {
      return fragments.join("\n\n");
    }
    // FIX (Medium): use safeStringify to handle circular references
    return safeStringify(value);
  }

  return String(value);
};

// ── Public extractors ─────────────────────────────────────────────────────────

export const extractMainDocument = (snap: unknown): string =>
  coerceReadableText(
    (snap as Record<string, unknown>)?.documents
      ? ((snap as Record<string, unknown>).documents as Record<string, unknown>)
          ?.lc_document
      : (snap as Record<string, unknown>)?.lc_document ?? ""
  );

export const extractSubDocument = (snap: unknown): string =>
  coerceReadableText(
    (snap as Record<string, unknown>)?.documents
      ? ((snap as Record<string, unknown>).documents as Record<string, unknown>)
          ?.sub_documents
      : (snap as Record<string, unknown>)?.sub_documents ?? ""
  );

/**
 * Extract the MT799 message string from a value.
 *
 * FIX (Low): all property reads now use safeGet to prevent prototype-polluted
 * values (e.g. Object.prototype.message) being embedded in the PDF.
 *
 * FIX (Low): typed `unknown` instead of `any`.
 */
export const extractMt799Message = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const msg =
      safeGet(obj, "mt799_message") ??
      safeGet(obj, "swift_message") ??
      safeGet(obj, "message") ??
      safeGet(obj, "final_message");
    return typeof msg === "string" ? msg : "";
  }
  return "";
};

/**
 * FIX (Medium): only return fields that are safe to display — UserID, cifno,
 * and Model are PII / internal identifiers that OMIT_RESULT_KEYS suppresses
 * from all other outputs. They must not appear in PDFs or previews.
 *
 * FIX (Low): typed `unknown` instead of `any`.
 */
export const getSelectedRowDetails = (
  selectedRow: unknown,
  snap?: unknown
): Record<string, string> => {
  const source =
    selectedRow !== null && typeof selectedRow === "object"
      ? (selectedRow as Record<string, unknown>)
      : {};
  const fallback =
    snap !== null && typeof snap === "object"
      ? (snap as Record<string, unknown>)
      : {};

  // FIX (Medium): deliberately omit UserID, cifno, Model — PII fields
  return {
    id: String(
      safeGet(source, "id") ?? safeGet(fallback, "row_id") ?? "N/A"
    ),
    transaction_no: String(
      safeGet(source, "transaction_no") ??
        safeGet(fallback, "transaction_no") ??
        "N/A"
    ),
    lc_number: String(
      safeGet(source, "lc_number") ??
        safeGet(fallback, "lc_number") ??
        "N/A"
    ),
    created_at: String(
      safeGet(source, "created_at") ??
        safeGet(fallback, "created_at") ??
        "N/A"
    ),
  };
};

// ── PDF builder ───────────────────────────────────────────────────────────────

/**
 * FIX (Medium): removed duplicate/dead parameters currentJobId, msg, jobId,
 * message — they were resolved then immediately suppressed with `void` and
 * had zero effect on the PDF output, creating a misleading API surface.
 *
 * FIX (Low): typed `unknown` instead of `any` on all fields.
 */
type BuildCurePdfDocInput = {
  selectedRow: unknown;
  pipelineResult: unknown;
  mt799Ai?: unknown;
  mt799Rag?: unknown;
  ownCures?: unknown[];
  crossCures?: unknown[];
  // mocCures?: unknown[];
  multihopCures?: unknown[];
  overallAi?: unknown;
  overallRag?: unknown;
};

export const buildCurePdfDoc = (input: BuildCurePdfDocInput) => {
  const {
    selectedRow,
    pipelineResult,
    mt799Ai,
    mt799Rag,
    ownCures = [],
    crossCures = [],
    // mocCures = [],
    multihopCures = [],
    overallAi = {},
    overallRag = {},
  } = input;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const sectionGap = 2;
  const lineHeight = 6;
  const maxTextWidth = pageWidth - margin * 2;
  let y = margin;

  const ensurePageSpace = (needed = lineHeight) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const addLine = (
    text: string,
    font: "normal" | "bold" = "normal",
    fontSize = 11,
    justify = false,
    indent = 0
  ) => {
    const x = margin + indent;
    const width = maxTextWidth - indent;
    doc.setFont("helvetica", font);
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(String(text ?? ""), width);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      ensurePageSpace();
      const isLast = i === lines.length - 1;
      if (justify && !isLast) {
        doc.text(line, x, y, { align: "justify", maxWidth: width });
      } else {
        doc.text(line, x, y);
      }
      y += lineHeight;
    }
  };

  const addParagraph = (
    text: string,
    fontSize = 9,
    justify = false,
    indent = 0
  ) => {
    const x = margin + indent;
    const width = maxTextWidth - indent;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    const blocks = String(text ?? "")
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (let b = 0; b < blocks.length; b++) {
      const lines = doc.splitTextToSize(blocks[b], width);
      for (let i = 0; i < lines.length; i++) {
        ensurePageSpace();
        const isLast = i === lines.length - 1;
        if (justify && !isLast) {
          doc.text(lines[i], x, y, { align: "justify", maxWidth: width });
        } else {
          doc.text(lines[i], x, y);
        }
        y += lineHeight;
      }
      if (b < blocks.length - 1) y += 1;
    }
  };

  const addSectionDivider = () => {
    ensurePageSpace(sectionGap + 1);
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += sectionGap;
  };

  const addSection = (
    title: string,
    value: unknown,
    options: {
      withUnderline?: boolean;
      justifyText?: boolean;
      category?: "own" | "cross" | "multihop";
      skipSanitize?: boolean;
    } = {}
  ) => {
    const { justifyText = false, category, skipSanitize = false } = options;
    const sanitizedValue = skipSanitize ? value : sanitizeResultView(value);

    addLine("");
    if (category) {
      addLine(`[${category.toUpperCase()}]`, "bold", 10);
    }
    addLine(title, "bold");

    if (sanitizedValue == null || sanitizedValue === "") {
      addLine("N/A");
      addSectionDivider();
      return;
    }

    if (typeof sanitizedValue === "string") {
      addParagraph(sanitizedValue, 9, justifyText);
      addSectionDivider();
      return;
    }

    const renderAligned = (val: unknown, indent = 0) => {
      if (val == null || val === "") {
        addLine("N/A", "normal", 10, false, indent);
        return;
      }

      if (Array.isArray(val)) {
        if (val.length === 0) {
          addLine("[]", "normal", 10, false, indent);
          return;
        }
        val.forEach((item, idx) => {
          if (item !== null && typeof item === "object") {
            addLine(`[${idx + 1}]`, "bold", 10, false, indent);
            renderAligned(item, indent + 2);
          } else {
            addLine(
              `[${idx + 1}] ${String(item)}`,
              "normal",
              10,
              false,
              indent
            );
          }
        });
        return;
      }

      if (typeof val === "object") {
        const entries = Object.entries(val as object).filter(
          ([, v]) => v !== undefined
        );

        // FIX (Medium): guard before Math.max — empty entries caused
        // Math.max(...[]) = -Infinity → padEnd(-Infinity) → RangeError
        if (entries.length === 0) {
          addLine("{}", "normal", 10, false, indent);
          return;
        }

        const maxKey = Math.max(...entries.map(([k]) => k.length));
        entries.forEach(([k, v]) => {
          const keyLabel = `${k.padEnd(maxKey, " ")} :`;
          if (v !== null && typeof v === "object") {
            addLine(keyLabel, "bold", 10, false, indent);
            renderAligned(v, indent + 2);
          } else {
            addLine(
              `${keyLabel} ${String(v ?? "")}`,
              "normal",
              10,
              false,
              indent
            );
          }
        });
        return;
      }

      addLine(String(val), "normal", 10, false, indent);
    };

    if (justifyText) {
      // FIX (Medium): safeStringify handles circular references without throwing
      addParagraph(safeStringify(sanitizedValue), 9, true);
    } else {
      renderAligned(sanitizedValue);
    }
    addSectionDivider();
  };

  // ── Resolve pipeline data ─────────────────────────────────────────────────

  const snap =
    (pipelineResult as Record<string, unknown>)?.snapshot ??
    pipelineResult ??
    {};

  const mainDocument = extractMainDocument(snap);
  const subDocument = extractSubDocument(snap);
  const mt799AiMessage = extractMt799Message(mt799Ai);
  const mt799RagMessage = extractMt799Message(mt799Rag);

  const txn =
    (selectedRow as Record<string, unknown>)?.transaction_no ??
    (snap as Record<string, unknown>)?.transaction_no ??
    "";

  const hasRenderable = (value: unknown): boolean => {
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value as object).length > 0;
    return true;
  };

  // ── Build PDF sections ────────────────────────────────────────────────────

  // FIX (Medium): Row Details no longer uses skipSanitize — PII-safe subset
  // returned by getSelectedRowDetails (UserID, cifno, Model omitted)
  addSection("Row Details", getSelectedRowDetails(selectedRow, snap));

  // FIX (High): truncate large text fields to prevent browser freeze
  addSection("Main Document", truncate(mainDocument || "N/A"), {
    justifyText: true,
  });
  addSection("Sub Document", truncate(subDocument || "N/A"), {
    justifyText: true,
  });

  // FIX (High): cap arrays to MAX_ARRAY_ITEMS to prevent PDF freeze
  if (hasRenderable(ownCures)) {
    addSection("Own Document Cure", capArray(ownCures ?? []), {
      withUnderline: true,
      category: "own",
    });
  }
  if (hasRenderable(crossCures)) {
    addSection("Cross Document Cure", capArray(crossCures ?? []), {
      withUnderline: true,
      category: "cross",
    });
  }
  // if (hasRenderable(mocCures)) {
  //   addSection("MOC Cure", capArray(mocCures ?? []), { withUnderline: true });
  // }
  if (hasRenderable(multihopCures)) {
    addSection("Multihop RAG Cure", capArray(multihopCures ?? []), {
      withUnderline: true,
      category: "multihop",
    });
  }
  if (hasRenderable(overallAi)) {
    addSection("Overall Cure (AI)", overallAi ?? {}, { withUnderline: true });
  }
  if (hasRenderable(overallRag)) {
    addSection("Overall Cure (RAG)", overallRag ?? {}, { withUnderline: true });
  }
  if (hasRenderable(mt799AiMessage || mt799Ai)) {
    addSection("MT799 Message (AI)", mt799AiMessage || mt799Ai || "N/A", {
      withUnderline: true,
      justifyText: true,
    });
  }
  if (hasRenderable(mt799RagMessage || mt799Rag)) {
    addSection("MT799 Message (RAG)", mt799RagMessage || mt799Rag || "N/A", {
      withUnderline: true,
      justifyText: true,
    });
  }

  // ── Filename sanitization ─────────────────────────────────────────────────

  // FIX (Low): collapse consecutive underscores, trim leading/trailing
  // underscores, cap length, and guarantee a non-empty fallback so
  // all-special-char transaction numbers don't produce a meaningless filename
  const safeTxn =
    String(txn || "result")
      .replace(/[^A-Za-z0-9._-]/g, "_")  // allow dots
      .replace(/_{2,}/g, "_")             // collapse runs of underscores
      .replace(/^_+|_+$/g, "")           // trim leading/trailing underscores
      .slice(0, 100) || "result";         // cap + guaranteed fallback

  const filename = `Approved_Cure-${safeTxn}.pdf`;
  return { doc, filename };
};
