
import React from "react";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/tabs";
import { ComposeEmail } from "./ComposeEmail";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum rows shown in the inline view table before a truncation warning. */
const VIEW_ROWS_LIMIT = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * FIX (Low): Replace pervasive `any` with concrete domain types.
 * Extend these as your real API shapes become clear.
 */
export type CureItem = {
  id?: string | number;
  result_tab?: string;
  discrepancy_id?: string;
  approval_status?: string;
  status?: string;
  Status?: string;
  [k: string]: unknown; // allow extra fields but typed at the boundary
};

export type SelectedRow = {
  id?: string | number;
  transaction_no?: string;
  lc_number?: string;
  cifno?: string;
  created_at?: string;
  [k: string]: unknown;
};

export type ViewRow = {
  id?: string | number;
  source_row_id?: string | number;
  transaction_no?: string;
  lc_number?: string;
  approval_status?: string;
  status?: string;
  Status?: string;
  created_at?: string;
};

/** Tab identifiers used throughout the component. */
export type CureTab =
  | "own"
  | "cross"
  // | "moc"
  | "multihop"
  | "overall_ai"
  | "overall_rag"
  | "mt799_ai"
  | "mt799_rag";

type CureUIViewProps = {
  openViewStatus: (status: "APPROVED" | "REJECTED") => void;
  onPreview: () => void;
  onDownloadPdf: () => void;
  canOpenPreview: boolean;
  decidedCheckboxCount: number;
  totalCheckboxCountForPreview: number;
  showEmailForm: boolean;
  onCloseEmailForm: () => void;
  emailDefaultSubject: string;
  // FIX (Medium/Low): typed instead of any
  selectedRow: SelectedRow | null;
  emailDefaultBody: string;
  emailAttachmentFile: File | null;
  resultsLoaded: Record<string, boolean>;
  selectedCount: (tab: CureTab) => number;
  canapprove: boolean;
  canreject: boolean;
  openModal: (action: "APPROVE" | "REJECT", tab: CureTab) => void;
  renderCureList: (
    items: CureItem[],
    emptyText: string,
    title?: string,
    tab?: CureTab
  ) => React.ReactNode;
  ownCures: CureItem[];
  crossCures: CureItem[];
  // mocCures: CureItem[];
  multihopCures: CureItem[];
  renderOverallCure: (
    overall: unknown,
    emptyText: string,
    tab: CureTab
  ) => React.ReactNode;
  overallAi: unknown;
  overallRag: unknown;
  analysis: unknown;
  renderMt799Card: (
    value: unknown,
    title: string,
    tab: CureTab
  ) => React.ReactNode;
  mt799Ai: unknown;
  mt799Rag: unknown;
  pipelineCompleteForSelectedRow: boolean;
  renderDuplicateAnalysis: () => React.ReactNode;
  handleExportAllResults: () => void;
  pipelineResult: unknown;
  viewStatus: "APPROVED" | "REJECTED" | null;
  onCloseViewStatus: () => void;
  viewLoading: boolean;
  // FIX (High): parent must only pass a safe generic error string —
  // never raw server error details (stack traces, HTTP status, etc.)
  viewErr: string | null;
  viewRows: ViewRow[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * FIX (Low): Strip sub-second precision from ISO timestamps and coerce
 * non-string values safely, matching the CureTable helper.
 */
const formatCreatedAt = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.replace(/\.\d+/, "");
};

/**
 * FIX (Medium): Strip CR / LF / NUL from any string used in email fields
 * to prevent email header injection.
 */
const sanitizeEmailField = (value: string): string =>
  value.replace(/[\r\n\0]/g, " ").trim();

// ── Component ─────────────────────────────────────────────────────────────────

function CureUIView({
  openViewStatus,
  onPreview,
  onDownloadPdf,
  canOpenPreview,
  decidedCheckboxCount,
  totalCheckboxCountForPreview,
  showEmailForm,
  onCloseEmailForm,
  emailDefaultSubject,
  selectedRow,
  emailDefaultBody,
  emailAttachmentFile,
  resultsLoaded,
  selectedCount,
  canapprove,
  canreject,
  openModal,
  renderCureList,
  ownCures,
  crossCures,
  // mocCures,
  multihopCures,
  renderOverallCure,
  overallAi,
  overallRag,
  analysis,
  renderMt799Card,
  mt799Ai,
  mt799Rag,
  pipelineCompleteForSelectedRow,
  renderDuplicateAnalysis,
  handleExportAllResults,
  pipelineResult,
  viewStatus,
  onCloseViewStatus,
  viewLoading,
  viewErr,
  viewRows,
}: CureUIViewProps) {

  // FIX (Medium): sanitize transaction_no before embedding in email subject
  // to prevent email header injection via \r\n characters.
  const safeTransactionNo = sanitizeEmailField(
    String(selectedRow?.transaction_no ?? "N/A")
  );

  // FIX (High): note for implementors — canapprove / canreject are UI-only
  // convenience flags. The backend API endpoint that processes APPROVE /
  // REJECT actions MUST independently re-verify the user's role and
  // permissions server-side. Never rely solely on these client flags.

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="card-header flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Analysis Result</h2>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary btn-outline"
            disabled={!canOpenPreview}
            onClick={onPreview}
            aria-label="Preview cure result"
          >
            Preview
          </button>

          <button
            type="button"
            className="btn btn-primary btn-outline"
            disabled={!canOpenPreview}
            onClick={onDownloadPdf}
            aria-label="Download cure result as PDF"
          >
            Download PDF
          </button>

          {showEmailForm && (
            <ComposeEmail
              open={showEmailForm}
              onClose={onCloseEmailForm}
              // FIX (Medium): use sanitized transaction number to prevent
              // header injection if the backend concatenates fields directly
              defaultSubject={
                emailDefaultSubject ||
                `Cure Result - ${safeTransactionNo}`
              }
              defaultBody={emailDefaultBody}
              attachmentFile={emailAttachmentFile}
            />
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="1" className="">
        <TabsList className="px-5 mb-2 flex flex-wrap items-center gap-6">
          <Tab value="1" className="text-md">Own Document Cure</Tab>
          <Tab value="2" className="text-md">Cross Document Cure</Tab>
          {/* <Tab value="3" className="text-md">MOC</Tab> */}
          <Tab value="4" className="text-md">Multihops Rag Cure</Tab>
          <Tab value="5" className="text-md">Overall Cure(AI)</Tab>
          <Tab value="6" className="text-md">Overall Cure(RAG)</Tab>
          <Tab value="7" className="text-md">MT 799 Messages</Tab>
          <Tab value="8" className="text-md">Duplicate Analysis</Tab>
          <Tab value="9" className="text-md">Export</Tab>
        </TabsList>

        {/* ── Tab 1: Own Document Cure ── */}
        <TabPanel value="1">
          <div className="p-4 space-y-3">
            <div className="flex justify-end gap-2">
              {/* FIX (Low): type="button" on all action buttons to prevent
                  accidental form submission in a parent <form> context */}
              <button
                type="button"
                className="btn btn-success"
                disabled={
                  !resultsLoaded["own"] ||
                  selectedCount("own") === 0 ||
                  !canapprove
                }
                onClick={() => openModal("APPROVE", "own")}
                // FIX (Low): aria-label describes scope for screen readers
                aria-label={`Approve ${selectedCount("own")} own document cure items`}
              >
                Approve ({selectedCount("own")})
              </button>

              <button
                type="button"
                className="btn btn-danger"
                disabled={
                  !resultsLoaded["own"] ||
                  selectedCount("own") === 0 ||
                  !canreject
                }
                onClick={() => openModal("REJECT", "own")}
                aria-label={`Reject ${selectedCount("own")} own document cure items`}
              >
                Reject ({selectedCount("own")})
              </button>
            </div>

            {renderCureList(
              ownCures,
              "No own document cures available.",
              "Own Document Cures",
              "own"
            )}
          </div>
        </TabPanel>

        {/* ── Tab 2: Cross Document Cure ── */}
        <TabPanel value="2">
          <div className="p-4 space-y-3">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-success"
                disabled={
                  !resultsLoaded["cross"] ||
                  selectedCount("cross") === 0 ||
                  !canapprove
                }
                onClick={() => openModal("APPROVE", "cross")}
                aria-label={`Approve ${selectedCount("cross")} cross document cure items`}
              >
                Approve ({selectedCount("cross")})
              </button>

              <button
                type="button"
                className="btn btn-danger"
                disabled={
                  !resultsLoaded["cross"] ||
                  selectedCount("cross") === 0 ||
                  !canreject
                }
                onClick={() => openModal("REJECT", "cross")}
                aria-label={`Reject ${selectedCount("cross")} cross document cure items`}
              >
                Reject ({selectedCount("cross")})
              </button>
            </div>

            {renderCureList(
              crossCures,
              "No cross document cures available.",
              "Cross Document Cures",
              "cross"
            )}
          </div>
        </TabPanel>

        {/* ── Tab 3: MOC ── */}
        {/* <TabPanel value="3">
          <div className="p-4 space-y-3">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-success"
                disabled={
                  !resultsLoaded["moc"] ||
                  selectedCount("moc") === 0 ||
                  !canapprove
                }
                onClick={() => openModal("APPROVE", "moc")}
                aria-label={`Approve ${selectedCount("moc")} MOC cure items`}
              >
                Approve ({selectedCount("moc")})
              </button>

              <button
                type="button"
                className="btn btn-danger"
                disabled={
                  !resultsLoaded["moc"] ||
                  selectedCount("moc") === 0 ||
                  !canreject
                }
                onClick={() => openModal("REJECT", "moc")}
                aria-label={`Reject ${selectedCount("moc")} MOC cure items`}
              >
                Reject ({selectedCount("moc")})
              </button>
            </div>

            {renderCureList(
              mocCures,
              "No MOC cures available.",
              "MOC Cures",
              "moc"
            )}
          </div>
        </TabPanel> */}

        {/* ── Tab 4: Multihop RAG Cure ── */}
        <TabPanel value="4">
          <div className="p-4 space-y-3">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-success"
                disabled={
                  !resultsLoaded["multihop"] ||
                  selectedCount("multihop") === 0 ||
                  !canapprove
                }
                onClick={() => openModal("APPROVE", "multihop")}
                aria-label={`Approve ${selectedCount("multihop")} multihop RAG cure items`}
              >
                Approve ({selectedCount("multihop")})
              </button>

              <button
                type="button"
                className="btn btn-danger"
                disabled={
                  !resultsLoaded["multihop"] ||
                  selectedCount("multihop") === 0 ||
                  !canreject
                }
                onClick={() => openModal("REJECT", "multihop")}
                aria-label={`Reject ${selectedCount("multihop")} multihop RAG cure items`}
              >
                Reject ({selectedCount("multihop")})
              </button>
            </div>

            {renderCureList(
              multihopCures,
              "No multihop RAG cures available.",
              "Multihop RAG Cures",
              "multihop"
            )}
          </div>
        </TabPanel>

        {/* ── Tab 5: Overall Cure (AI) ── */}
        <TabPanel value="5">
          <div className="p-4 space-y-3">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-success"
                disabled={
                  !resultsLoaded["overall_ai"] ||
                  selectedCount("overall_ai") === 0 ||
                  !canapprove
                }
                onClick={() => openModal("APPROVE", "overall_ai")}
                aria-label={`Approve ${selectedCount("overall_ai")} overall AI cure items`}
              >
                Approve ({selectedCount("overall_ai")})
              </button>

              <button
                type="button"
                className="btn btn-danger"
                disabled={
                  !resultsLoaded["overall_ai"] ||
                  selectedCount("overall_ai") === 0 ||
                  !canreject
                }
                onClick={() => openModal("REJECT", "overall_ai")}
                aria-label={`Reject ${selectedCount("overall_ai")} overall AI cure items`}
              >
                Reject ({selectedCount("overall_ai")})
              </button>
            </div>

            <div className="p-0">
              {renderOverallCure(
                overallAi,
                "Overall AI cure not available.",
                "overall_ai"
              )}
            </div>
          </div>
        </TabPanel>

        {/* ── Tab 6: Overall Cure (RAG) ── */}
        <TabPanel value="6">
          <div className="p-4 space-y-3">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-success"
                disabled={
                  !resultsLoaded["overall_rag"] ||
                  selectedCount("overall_rag") === 0 ||
                  !canapprove
                }
                onClick={() => openModal("APPROVE", "overall_rag")}
                aria-label={`Approve ${selectedCount("overall_rag")} overall RAG cure items`}
              >
                Approve ({selectedCount("overall_rag")})
              </button>

              <button
                type="button"
                className="btn btn-danger"
                disabled={
                  !resultsLoaded["overall_rag"] ||
                  selectedCount("overall_rag") === 0 ||
                  !canreject
                }
                onClick={() => openModal("REJECT", "overall_rag")}
                aria-label={`Reject ${selectedCount("overall_rag")} overall RAG cure items`}
              >
                Reject ({selectedCount("overall_rag")})
              </button>
            </div>

            <div className="p-0">
              {renderOverallCure(
                overallRag,
                "Overall RAG cure not available.",
                "overall_rag"
              )}
            </div>
          </div>
        </TabPanel>

        {/* ── Tab 7: MT 799 Messages ── */}
        <TabPanel value="7">
          <div className="p-4 space-y-4">
            {!analysis ? (
              <div className="text-sm opacity-70">
                Run the pipeline to view results.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {/* AI column */}
                <div className="space-y-2">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="btn btn-success"
                      disabled={
                        !pipelineCompleteForSelectedRow ||
                        selectedCount("mt799_ai") === 0 ||
                        !canapprove
                      }
                      onClick={() => openModal("APPROVE", "mt799_ai")}
                      aria-label={`Approve ${selectedCount("mt799_ai")} MT799 AI items`}
                    >
                      Approve AI ({selectedCount("mt799_ai")})
                    </button>

                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={
                        !pipelineCompleteForSelectedRow ||
                        selectedCount("mt799_ai") === 0 ||
                        !canreject
                      }
                      onClick={() => openModal("REJECT", "mt799_ai")}
                      aria-label={`Reject ${selectedCount("mt799_ai")} MT799 AI items`}
                    >
                      Reject AI ({selectedCount("mt799_ai")})
                    </button>
                  </div>
                  {renderMt799Card(mt799Ai, "MT799 (AI)", "mt799_ai")}
                </div>

                {/* RAG column */}
                <div className="space-y-2">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="btn btn-success"
                      disabled={
                        !pipelineCompleteForSelectedRow ||
                        selectedCount("mt799_rag") === 0 ||
                        !canapprove
                      }
                      onClick={() => openModal("APPROVE", "mt799_rag")}
                      aria-label={`Approve ${selectedCount("mt799_rag")} MT799 RAG items`}
                    >
                      Approve RAG ({selectedCount("mt799_rag")})
                    </button>

                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={
                        !pipelineCompleteForSelectedRow ||
                        selectedCount("mt799_rag") === 0 ||
                        !canreject
                      }
                      onClick={() => openModal("REJECT", "mt799_rag")}
                      aria-label={`Reject ${selectedCount("mt799_rag")} MT799 RAG items`}
                    >
                      Reject RAG ({selectedCount("mt799_rag")})
                    </button>
                  </div>
                  {renderMt799Card(mt799Rag, "MT799 (RAG)", "mt799_rag")}
                </div>
              </div>
            )}
          </div>
        </TabPanel>

        {/* ── Tab 8: Duplicate Analysis ── */}
        <TabPanel value="8">
          <div className="p-4">{renderDuplicateAnalysis()}</div>
        </TabPanel>

        {/* ── Tab 9: Export ── */}
        <TabPanel value="9">
          <div className="p-4 space-y-3">
            <button
              type="button"
              className="btn btn-primary btn-outline"
              onClick={handleExportAllResults}
              disabled={!pipelineResult}
              aria-label="Download approved results as JSON"
            >
              Download Approved JSON
            </button>
            {!pipelineResult && (
              <div className="text-sm opacity-70">
                Run the pipeline first. Export downloads approved items only.
              </div>
            )}
          </div>
        </TabPanel>
      </Tabs>

      {/* ── Inline view table (APPROVED / REJECTED rows) ── */}
      {viewStatus && (
        <>
          <h3 className="card-title text-sm md:text-lg my-5">
            {viewStatus === "APPROVED" ? "Approved Rows" : "Rejected Rows"}
          </h3>

          <div className="grid">
            <div className="card min-w-full">
              <div className="card-header flex items-center justify-between gap-2">
                <div className="font-semibold">
                  {viewStatus === "APPROVED" ? "Approved Rows" : "Rejected Rows"}
                </div>

                <button
                  type="button"
                  className="btn btn-sm btn-light"
                  onClick={onCloseViewStatus}
                  aria-label="Close row view"
                >
                  Close
                </button>
              </div>

              <div className="card-table scrollable-x-auto scrollable-y-auto">
                {viewLoading ? (
                  <div className="p-4 flex items-center gap-2 text-sm">
                    <span className="animate-spin inline-block h-5 w-5 rounded-full border-4 border-current border-t-transparent opacity-80" />
                    Loading...
                  </div>
                ) : viewErr ? (
                  // FIX (High): viewErr must only contain a safe generic message
                  // set by the parent — never raw server error details.
                  <div className="p-4">
                    <div className="rounded border border-red-400 p-2 text-sm text-red-700">
                      {viewErr}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* FIX (Medium): show a visible warning when rows are
                        truncated so reviewers know they are not seeing all data */}
                    {viewRows.length > VIEW_ROWS_LIMIT && (

                      <div className="text-xs text-amber-600 px-4 py-2 border-b border-amber-200 bg-amber-50">
                        Showing {VIEW_ROWS_LIMIT} of {viewRows.length} rows.
                        Use filters to narrow results.
                      </div>
                    )}

                    <table className="table align-middle text-gray-700 font-medium text-sm min-w-full">
                      <thead className="h-16">
                        <tr>
                          <th className="text-left">id</th>
                          <th className="text-left">transaction_no</th>
                          <th className="text-left">lc_number</th>
                          <th className="text-left">Status</th>
                          <th className="text-left">created_at</th>
                        </tr>
                      </thead>

                      <tbody className="fw-semibold text-gray-600">
                        {viewRows.length === 0 ? (
                          <tr className="h-16">
                            <td
                              colSpan={5}
                              className="text-center text-gray-500"
                            >
                              No rows
                            </td>
                          </tr>
                        ) : (
                          // FIX (Medium): apply explicit limit constant with
                          // the warning banner above instead of silent slice
                          viewRows
                            .slice(0, VIEW_ROWS_LIMIT)
                            .map((r, index) => {
                              const rowId =
                                r?.id ?? r?.source_row_id ?? index;
                              const statusVal =
                                r?.approval_status ??
                                r?.status ??
                                r?.Status ??
                                viewStatus;

                              return (
                                <tr
                                  // FIX (Medium): unique key combining multiple
                                  // fields to avoid duplicates when transaction_no
                                  // is absent for multiple rows
                                  key={`${r?.transaction_no ?? ""}-${r?.lc_number ?? ""}-${rowId}-${index}`}
                                  className={`text-left h-16 ${
                                    index % 2 === 0 ? "" : "bg-gray-100"
                                  } hover:bg-gray-100`}
                                >
                                  <td className="fw-bold">
                                    {String(rowId)}
                                  </td>
                                  <td>{r?.transaction_no ?? ""}</td>
                                  <td>{r?.lc_number ?? ""}</td>
                                  <td>{String(statusVal ?? "")}</td>
                                  {/* FIX (Low): use formatCreatedAt helper for
                                      consistent, safe timestamp rendering */}
                                  <td>{formatCreatedAt(r?.created_at)}</td>
                                </tr>
                              );
                            })
                        )}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default CureUIView;

