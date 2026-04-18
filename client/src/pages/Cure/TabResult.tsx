

import React from "react";
import { Accordion, AccordionItem } from "@/components/accordion";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/tabs";
import {
  normalizeActionItems,
  getCureKey,
  getActionItemKey,
  getOverallActionItems,
  getRowKey,
} from "./cureResultHelpers";

export type ResultTab =
  | "own"
  | "cross"
  // | "moc"
  | "multihop"
  | "overall_ai"
  | "overall_rag"
  | "mt799_ai"
  | "mt799_rag";

type BuildTabResultFunctionsParams = {
  analysis: unknown;
  dedupeInfo: unknown;
  decisionByTab: Record<ResultTab, Record<string, "APPROVE" | "REJECT">>;
  selectedByTab: Record<ResultTab, Set<string>>;
  toggleSelection: (tab: ResultTab, key: string) => void;
  selectedRow: unknown;
  pipelineResult: unknown;
  fmt: (v: unknown) => string;
  hasText: (v: unknown) => boolean;
  toArray: (v: unknown) => unknown[];
};

export const unwrapCure = (v: unknown): unknown => {
  if (
    v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    (v as Record<string, unknown>).cure &&
    typeof (v as Record<string, unknown>).cure === "object"
  ) {
    return (v as Record<string, unknown>).cure;
  }
  return v;
};

export const createTabResultFunctions = ({
  analysis,
  dedupeInfo,
  decisionByTab,
  selectedByTab,
  toggleSelection,
  selectedRow,
  pipelineResult,
  fmt,
  hasText,
  toArray,
}: BuildTabResultFunctionsParams) => {
  const formatInputCounts = (counts: unknown) => {
    if (!counts || typeof counts !== "object") return "";
    const c = counts as Record<string, unknown>;
    const own = typeof c.own === "number" ? c.own : 0;
    const cross = typeof c.cross === "number" ? c.cross : 0;
    // const moc = typeof c.moc === "number" ? c.moc : 0;
    const multihop = typeof c.multihop === "number" ? c.multihop : 0;
    return `Own ${own} | Cross ${cross}  | Multihop ${multihop}`;

    // return `Own ${own} | Cross ${cross} | MOC ${moc} | Multihop ${multihop}`;
  };

  const renderField = (label: string, value: unknown) => {
    if (!hasText(value)) return null;
    const text = Array.isArray(value)
      ? (value as unknown[]).filter(hasText).map(String).join(", ")
      : String(value);
    return (
      <div className="text-sm text-gray-700 text-justify">
        <span className="font-semibold text-gray-900 ">{label}:</span> {text}
      </div>
    );
  };

  const renderDocuments = (docs: unknown) => {
    const list = toArray(docs).filter(hasText);
    if (!list.length) return null;
    return (
      <div className="mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-900">
          Documents
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {list.map((doc: unknown, index: number) => (
            <span
              key={`${String(doc)}-${index}`}
              className="rounded border border-gray-500  px-2 py-1 text-xs text-gray-900"
            >
              {String(doc)}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const getCureTitle = (item: unknown, index: number) => {
    const i = item as Record<string, unknown>;
    if (hasText(i?.discrepancy_id)) return `Discrepancy ${i.discrepancy_id}`;
    if (hasText(i?.cure_id)) return `Cure ${i.cure_id}`;
    return `Cure ${index + 1}`;
  };

  const safeParseMaybeJson = (v: unknown): unknown => {
    if (v == null) return null;
    if (typeof v === "object") return v;
    if (typeof v !== "string") return null;

    const s = v.trim();
    if (!s) return null;
    if (!(s.startsWith("{") || s.startsWith("["))) return null;

    try {
      return JSON.parse(s) as unknown;
    } catch {
      return null;
    }
  };

  const pickCureObject = (item: unknown): Record<string, unknown> | null => {
    const cure = unwrapCure(item);
    if (cure && typeof cure === "object" && !Array.isArray(cure)) return cure as Record<string, unknown>;
    const parsed = safeParseMaybeJson(cure);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const itemObj = item as Record<string, unknown>;
      const maybe = safeParseMaybeJson(itemObj?.cure ?? itemObj?.result ?? item);
      if (maybe && typeof maybe === "object" && !Array.isArray(maybe)) return maybe as Record<string, unknown>;
    }
    return null;
  };

  const renderCureDetails = (item: unknown) => {
    const itemObj = item && typeof item === "object" && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : null;
    const cureObj = pickCureObject(item);
    const documents = cureObj?.document_name ?? cureObj?.documents ?? itemObj?.documents;
    const error = itemObj?.error ?? cureObj?.error ?? null;
    const raw = unwrapCure(item);
    const plainText =
      typeof raw === "string" ? raw : (raw != null ? String(raw) : "");

    return (
      <div className="space-y-2 text-sm">
        {itemObj?.success === false ? (
          <div className="text-sm font-semibold text-red-600">Failed</div>
        ) : null}

        {hasText(error) ? (
          <div className="text-sm text-red-600">{String(error)}</div>
        ) : null}

        {cureObj ? (
          <div className="grid gap-2">
            {renderField("Root Cause", cureObj?.root_cause ?? cureObj?.issue ?? cureObj?.discrepancy)}
            {renderField("Recommended Action", cureObj?.recommended_action)}
            {renderField("Alternate Action", cureObj?.alternate_action ?? cureObj?.alternative_action)}
            {renderField("Timeline", cureObj?.timeline)}
            {renderField("Success Criteria", cureObj?.success_criteria)}
            {renderField("Synthesis Notes", cureObj?.synthesis_notes)}
          </div>
        ) : hasText(plainText) ? (
          <div className="text-gray-700 whitespace-pre-wrap">{plainText}</div>
        ) : (
          <div className="text-gray-500">No cure details available.</div>
        )}

        {renderDocuments(documents)}
      </div>
    );
  };

  const renderCureList = (items: unknown[], emptyText: string, title = "Cures", tab: ResultTab) => {
    if (!analysis) {
      return <div className="text-sm opacity-70">Run the pipeline to view results.</div>;
    }
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
      return <div className="text-sm opacity-70">{emptyText}</div>;
    }

    return (
      <div className="card p-4">
        <Accordion>
          <div title={`${title} (${list.length})`}>
            <div className="mt-2 space-y-3">
              {list.map((item: unknown, index: number) => {
                const key = getCureKey(item, index, tab);
                const decision = decisionByTab[tab]?.[key];
                const isApproved = decision === "APPROVE";
                const isRejected = decision === "REJECT";
                const checked = isApproved ? true : (selectedByTab[tab] ?? new Set()).has(key);
                const disabled = !!decision;

                return (
                  <div
                    key={key}
                    className="rounded border p-3 flex gap-3 items-start"
                  >
                    <div className="mt-1 relative h-4 w-4">
                      <input
                        type="checkbox"
                        className={`h-4 w-4 checkbox ${disabled ? "cursor-not-allowed appearance-none rounded-sm border border-gray-300 bg-white" : "cursor-pointer"}`}
                        checked={checked}
                        disabled={disabled}
                        onChange={() => !disabled && toggleSelection(tab, key)}
                      />
                      {isRejected ? (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] leading-none text-gray-500">
                          <i className="ki-filled ki-cross ml-1 mt-1"></i>
                        </span>
                      ) : isApproved ? (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] leading-none text-gray-500">
                          {/* <i className="ki-filled ki-check"></i> */}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex-1">
                      <div className="text-sm font-semibold mb-2">
                        {getCureTitle(item, index)}
                      </div>
                      {renderCureDetails(item)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Accordion>
      </div>
    );
  };

  const renderActionItems = (items: unknown, tab: ResultTab) => {
    const list = toArray(items).filter(Boolean);
    if (!list.length) return null;

    return (
      <div className="card p-4">
        <h3 className="card-title text-sm md:text-lg mb-3">Action Items</h3>

        <Accordion>
          {list.map((item: unknown, index: number) => {
            const isObject = item && typeof item === "object" && !Array.isArray(item);
            const itemObj = isObject ? (item as Record<string, unknown>) : null;
            const title = itemObj?.cure_id
              ? `#${itemObj.cure_id}`
              : isObject
                ? (itemObj?.title ?? itemObj?.issue ?? `Item ${index + 1}`)
                : `Item ${index + 1}`;

            const issueValue = isObject ? itemObj?.issue : item;
            const recValue = isObject ? itemObj?.recommended_action : null;
            const altValue = isObject ? itemObj?.alternate_action : null;
            const docsValue = isObject ? (itemObj?.documents ?? itemObj?.document_name) : null;

            const key = getActionItemKey(
              item,
              index,
              tab,
              getRowKey(selectedRow, pipelineResult)
            );
            const decision = decisionByTab[tab]?.[key];
            const isApproved = decision === "APPROVE";
            const isRejected = decision === "REJECT";
            const checked = isApproved ? true : (selectedByTab[tab] ?? new Set()).has(key);
            const disabled = !!decision;

            return (
              <div className="p-4 my-2" key={key} title={String(title)}>
                <div className="flex items-start gap-3">
                  <div className="mt-1 relative h-4 w-4">
                    <input
                      type="checkbox"
                      className={`h-4 w-4 checkbox ${disabled ? "cursor-not-allowed appearance-none rounded-sm border border-gray-300 bg-white" : "cursor-pointer"}`}
                      checked={checked}
                      disabled={disabled}
                      onChange={() => !disabled && toggleSelection(tab, key)}
                    />
                    {isRejected ? (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] leading-none text-gray-500">
                        <i className="ki-filled ki-cross ml-1 mt-1"></i>
                      </span>
                    ) : isApproved ? (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] leading-none text-gray-500">
                        {/* <i className="ki-filled ki-check"></i> */}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex-1">
                    <div className="text-sm font-semibold">{String(title)}</div>
                    <div className="grid gap-2 text-sm">
                      {renderField("Issue", issueValue)}
                      {renderField("Recommended Action", recValue)}
                      {renderField("Alternate Action", altValue)}
                      {renderDocuments(docsValue)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </Accordion>
      </div>
    );
  };

  const renderOverallCure = (overall: unknown, emptyText: string, tab: ResultTab) => {
    if (!analysis) {
      return <div className="text-sm opacity-70">Run the pipeline to view results.</div>;
    }
    if (!overall) {
      return <div className="text-sm opacity-70">{emptyText}</div>;
    }

    const overallObj = overall && typeof overall === "object" && !Array.isArray(overall)
      ? (overall as Record<string, unknown>)
      : null;
    const cure = unwrapCure(overall);
    // const isObject = cure && typeof cure === "object" && !Array.isArray(cure);
    const isObject = cure != null && typeof cure === "object" && !Array.isArray(cure);
    const cureObj = isObject ? (cure as Record<string, unknown>) : null;
    const inputCounts = formatInputCounts(overallObj?.input_counts);
    const error = overallObj?.error ?? (isObject ? cureObj?.error : null);
    const actionItems = getOverallActionItems(overall, cure, isObject);
    const overallKey = `${tab}-overall-${getRowKey(selectedRow, pipelineResult)}`;

    const overallDecision = decisionByTab[tab]?.[overallKey];
    const overallApproved = overallDecision === "APPROVE";
    const overallRejected = overallDecision === "REJECT";
    const overallChecked = overallApproved ? true : (selectedByTab[tab] ?? new Set()).has(overallKey);
    const overallDisabled = !!overallDecision;

    const summaryUI = (
      <div className="grid gap-4">
        <div className="card p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <h3 className="card-title text-sm md:text-lg">Overall Summary</h3>
              {overallObj?.success === false ? (
                <span className="text-sm text-red-600">Failed</span>
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <span className="relative inline-block h-4 w-4">
                <input
                  type="checkbox"
                  className={`h-4 w-4 checkbox ${overallDisabled ? "cursor-not-allowed appearance-none rounded-sm border border-gray-300  bg-white" : "cursor-pointer"}`}
                  checked={overallChecked}
                  disabled={overallDisabled}
                  onChange={() => !overallDisabled && toggleSelection(tab, overallKey)}
                />
                {overallRejected ? (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] leading-none text-gray-500">
                    <i className="ki-filled ki-cross ml-1 mt-1"></i>
                  </span>
                ) : overallApproved ? (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] leading-none text-gray-500">
                    {/* <i className="ki-filled ki-check"></i> */}
                  </span>
                ) : null}
              </span>
              Select
            </label>
          </div>

          {hasText(error) ? (
            <div className="mt-2 text-sm text-red-600">{String(error)}</div>
          ) : null}

          <div className="mt-3 grid gap-2">
            {renderField("Source", overallObj?.source)}
            {renderField("Input Counts", inputCounts)}
            {renderField(
              "Deduplicated",
              overallObj?.deduplicated != null ? String(overallObj.deduplicated) : ""
            )}
          </div>

          {!isObject ? (
            <div className="mt-2 text-sm text-gray-700">{fmt(cure)}</div>
          ) : (
            <div className="mt-3 grid gap-2">
              {renderField("Root Cause", cureObj?.root_cause)}
              {renderField("Recommended Action", cureObj?.recommended_action)}
              {renderField(
                "Alternate Action",
                cureObj?.alternate_action ?? cureObj?.alternative_action
              )}
              {renderField("Timeline", cureObj?.timeline)}
              {renderField("Success Criteria", cureObj?.success_criteria)}
              {renderField("Synthesis Notes", cureObj?.synthesis_notes)}
              {renderField("Raw Response", cureObj?.raw_response)}
            </div>
          )}

          {renderDocuments(
            isObject ? (cureObj?.document_name ?? cureObj?.documents) : null
          )}
        </div>
      </div>
    );

    const actionItemsUI = <>{renderActionItems(actionItems, tab)}</>;
    return (
      <div className="card p-4">
        <Tabs defaultValue="summary">
          <TabsList className="mb-3 flex flex-wrap items-center gap-4">
            <Tab value="summary" className="text-md">Overall Summary</Tab>
            <Tab value="actions" className="text-md">Action Results</Tab>
          </TabsList>

          <TabPanel value="summary">
            <div className="p-2 md:p-3">{summaryUI}</div>
          </TabPanel>

          <TabPanel value="actions">
            <div className="p-2 md:p-3">{actionItemsUI}</div>
          </TabPanel>
        </Tabs>
      </div>
    );
  };

  const getMt799Key = (title: string) => {
    const rowKey = getRowKey(selectedRow, pipelineResult);
    const kind = String(title || "mt799").toLowerCase().replace(/\s+/g, "_");
    return `mt799-${rowKey}-${kind}`;
  };

  const renderMt799Card = (payload: unknown, title: string, tab: ResultTab) => {
    const key = getMt799Key(title);
    const decision = decisionByTab[tab]?.[key];
    const isApproved = decision === "APPROVE";
    const isRejected = decision === "REJECT";
    const checked = isApproved ? true : (selectedByTab[tab] ?? new Set()).has(key);
    const disabled = !!decision;
    // Security: type-safe access — cast only after null/object check
    const p = payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;

    return (
      <div className="card p-4">
        <h3 className="card-title text-sm md:text-lg">{title}</h3>
        <div className="flex items-center justify-end mb-2">
          <div className="relative h-4 w-4">
            <input
              type="checkbox"
              className={`h-4 w-4 checkbox ${disabled ? "cursor-not-allowed appearance-none rounded-sm border border-gray-300 bg-white" : "cursor-pointer"}`}
              checked={checked}
              disabled={disabled}
              onChange={() => !disabled && toggleSelection(tab, key)}
            />
            {isRejected ? (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] leading-none text-gray-500">
                <i className="ki-filled ki-cross ml-1 mt-1 "></i>
              </span>
            ) : isApproved ? (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] leading-none text-gray-500">
                {/* <i className="ki-filled ki-check"></i> */}
              </span>
            ) : null}
          </div>
        </div>
        {!p ? (
          <div className="text-sm opacity-70">No MT799 message available.</div>
        ) : p?.success === false ? (
          <div className="text-sm text-red-600">
            {p?.error ? String(p.error) : "MT799 generation failed."}
          </div>
        ) : (
          <div className="grid gap-2">
            {renderField("Sender Bank", p?.sender_bank_name)}
            {renderField("Receiver Bank", p?.receiver_bank_name)}
            {renderField("Sender BIC", p?.sender_bic)}
            {renderField("Receiver BIC", p?.receiver_bic)}
            {renderField("Transaction Ref", p?.transaction_ref)}
            {renderField("Related Ref", p?.related_ref)}
            {hasText(p?.mt799_message) && (
              <div className="mt-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-900">
                  Swift Message
                </div>
                <div className="mt-2 rounded border border-gray-200  p-3 text-sm text-white-500 whitespace-pre-wrap">
                  {String(p.mt799_message)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderDuplicateAnalysis = () => {
    if (!analysis && !dedupeInfo) {
      return <div className="text-sm opacity-70">Run the pipeline to view results.</div>;
    }
    if (!dedupeInfo) {
      return <div className="text-sm opacity-70">Duplicate analysis not available.</div>;
    }

    const dedupeObj =
      typeof dedupeInfo === "string"
        ? (() => {
          try {
            return JSON.parse(dedupeInfo) as unknown;
          } catch {
            return null;
          }
        })()
        : dedupeInfo;

    if (!dedupeObj || typeof dedupeObj !== "object") {
      return <div className="text-sm opacity-70">Duplicate analysis invalid JSON.</div>;
    }

    // Security: single safe cast — all accesses go through this typed record
    const d = dedupeObj as Record<string, unknown>;
    const duplicatesRaw = Array.isArray(d.duplicates_found) ? d.duplicates_found as unknown[] : [];
    const hasGroupFormat = duplicatesRaw.some((x) => {
      const xo = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
      return xo?.original && Array.isArray(xo?.duplicates);
    });
    const allCures = Array.isArray(d.all) ? d.all as unknown[] : [];

    return (
      <div className="card p-4">
        <Accordion>
          <AccordionItem title="Summary">
            <div className="grid gap-2">
              {renderField("Original Count", d.original_count)}
              {renderField("Deduplicated Count", d.deduplicated_count)}
              {renderField("Removed Count", d.removed_count)}
              {renderField("Duplicate Method", d.duplicate_method)}
              {renderField("Duplicate Error", d.duplicate_error)}
            </div>
            {d.summary_message ? (
              <div className="mt-3 text-sm opacity-80">{String(d.summary_message)}</div>
            ) : null}
          </AccordionItem>

          <AccordionItem title={`Duplicate Groups (${duplicatesRaw.length})`}>
            {duplicatesRaw.length === 0 ? (
              <div className="text-sm opacity-70">No duplicates found across validation types.</div>
            ) : !hasGroupFormat ? (
              <div className="text-sm opacity-70">
                Duplicate format not supported. (duplicates_found exists but is not group-shaped)
              </div>
            ) : (
              <div className="mt-2 space-y-3">
                {duplicatesRaw.map((gRaw: unknown, i: number) => {
                  const g = gRaw && typeof gRaw === "object" ? (gRaw as Record<string, unknown>) : {};
                  const dupCount =
                    typeof g.duplicate_count === "number"
                      ? g.duplicate_count
                      : Array.isArray(g.duplicates) ? g.duplicates.length : 0;
                  const totalInGroup = typeof g.total_in_group === "number" ? g.total_in_group : dupCount + 1;
                  const original = g.original && typeof g.original === "object"
                    ? (g.original as Record<string, unknown>)
                    : {};
                  const dups = Array.isArray(g.duplicates) ? g.duplicates as unknown[] : [];
                  const groupTitle = `Group ${i + 1} — size ${totalInGroup} (duplicates: ${dupCount})`;

                  return (
                    <div key={`grp-${i}`} className="rounded border p-3">
                      <div className="mb-2 text-sm font-bold">{groupTitle}</div>
                      <div className="space-y-3 text-sm">
                        <div>
                          <div className="text-xs font-semibold uppercase opacity-70">Original</div>
                          <div>• Source: {String(original.source || "N/A").toUpperCase()}</div>
                          <div className="font-semibold text-gray-900">
                            • Root Cause: {String(original.root_cause || original.rootCause || "").slice(0, 200)}
                            {String(original.root_cause || original.rootCause || "").length > 200 ? "..." : ""}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase opacity-70">Duplicates</div>
                          {dups.length === 0 ? (
                            <div className="opacity-70">No duplicates listed.</div>
                          ) : (
                            <div className="grid gap-1">
                              {dups.map((dRaw: unknown, j: number) => {
                                const dup = dRaw && typeof dRaw === "object" ? (dRaw as Record<string, unknown>) : {};
                                const sim = dup.similarity;
                                const simTxt = typeof sim === "number" ? `${(sim * 100).toFixed(1)}%` : (sim ? String(sim) : "—");
                                return (
                                  <div key={`dup-${i}-${j}`}>
                                    • Source: {String(dup.source || "N/A").toUpperCase()} (Similarity: {simTxt})
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </AccordionItem>

          <AccordionItem title={`Deduplicated Cures (All) — ${allCures.length}`}>
            {allCures.length === 0 ? (
              <div className="text-sm opacity-70">No cures in deduplicated list.</div>
            ) : (
              <div className="mt-2 space-y-3">
                {allCures.map((xRaw: unknown, idx: number) => {
                  const x = xRaw && typeof xRaw === "object" ? (xRaw as Record<string, unknown>) : {};
                  const xCure = x.cure && typeof x.cure === "object" ? (x.cure as Record<string, unknown>) : {};
                  const source = x.source ?? xCure.source ?? "N/A";
                  const discId = x.discrepancy_id ?? xCure.discrepancy_id ?? "—";
                  const rootCause = xCure.root_cause ?? x.root_cause ?? "";
                  const itemTitle = `#${idx + 1} • ${String(source).toUpperCase()} • ${String(discId)}`;

                  return (
                    <div key={`all-${idx}`} className="rounded border p-3">
                      <div className="mb-2 text-sm font-bold">{itemTitle}</div>
                      <div className="space-y-2 text-sm">
                        <div className="grid gap-1">
                          <div><span className="text-xs font-semibold text-gray-900 uppercase">Root Cause:</span> {String(rootCause || "—")}</div>
                          <div><span className="text-xs font-semibold text-gray-900 uppercase">Recommended:</span> {String(xCure.recommended_action ?? "—")}</div>
                          <div><span className="text-xs font-semibold uppercase text-gray-900">Alternate:</span> {String(xCure.alternate_action ?? "—")}</div>
                          <div><span className="text-xs font-semibold uppercase text-gray-900">Timeline:</span> {String(xCure.timeline ?? "—")}</div>
                          <div><span className="text-xs font-semibold uppercase text-gray-900">Success Criteria:</span> {String(xCure.success_criteria ?? "—")}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </AccordionItem>
        </Accordion>
      </div>
    );
  };

  return {
    formatInputCounts,
    renderCureList,
    renderOverallCure,
    renderMt799Card,
    renderDuplicateAnalysis,
  };
};
