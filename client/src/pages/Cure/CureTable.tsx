

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

// ── Types ─

type AllowedStatus = "APPROVED" | "REJECTED";

// FIX (Medium): strict shape — no index signature, no loose `any` fields
type PendingRow = {
  id: string;
  transaction_no: string;
  lc_number: string;
  result_tab: string;
  discrepancy_id: string;
  approval_status: string;
  created_at: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

// FIX (High): explicit allowlist for status values
const ALLOWED_STATUSES: AllowedStatus[] = ["APPROVED", "REJECTED"];

// FIX (Low): explicit allowlist for page-size values
const ALLOWED_LIMITS = [5, 10, 25] as const;
type AllowedLimit = (typeof ALLOWED_LIMITS)[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip sub-second precision from ISO timestamps. */
const formatCreatedAt = (value: string): string => {
  const raw = value.trim();
  if (!raw) return "";
  return raw.replace(/\.\d+/, "");
};

/** Read a CSRF token from <meta name="csrf-token"> set by your server. */
const getCsrfToken = (): string =>
  document
    .querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
    ?.getAttribute("content") ?? "";

/**
 * FIX (Medium): sanitize and shape-validate each row from the API.
 * Unknown fields are dropped; every rendered field is coerced to string.
 */
const sanitizeRow = (r: unknown, index: number): PendingRow => {
  if (!r || typeof r !== "object") {
    return {
      id: String(index),
      transaction_no: "",
      lc_number: "",
      result_tab: "",
      discrepancy_id: "",
      approval_status: "",
      created_at: "",
    };
  }
  const obj = r as Record<string, unknown>;
  return {
    id: String(obj.id ?? obj.source_row_id ?? index),
    transaction_no: String(obj.transaction_no ?? ""),
    lc_number: String(obj.lc_number ?? ""),
    result_tab: String(obj.result_tab ?? ""),
    discrepancy_id: String(obj.discrepancy_id ?? ""),
    approval_status: String(
      obj.approval_status ?? obj.status ?? obj.Status ?? ""
    ),
    created_at: String(obj.created_at ?? ""),
  };
};

// ── Component ─────────────────────────────────────────────────────────────────

const CureTable = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewRows, setViewRows] = useState<PendingRow[]>([]);
  const [viewStatus, setViewStatus] = useState<AllowedStatus>("APPROVED");
  const [viewErr, setViewErr] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewPage, setViewPage] = useState(1);
  const [viewLimit, setViewLimit] = useState<AllowedLimit>(10);

  // FIX (Medium): AbortController ref — cancels in-flight requests on
  // rapid tab switches so stale responses never overwrite newer state.
  const abortRef = useRef<AbortController | null>(null);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const openViewStatus = useCallback(async (status: AllowedStatus) => {
    // FIX (High): runtime allowlist guard — rejects any value not in the list
    if (!ALLOWED_STATUSES.includes(status)) {
      console.error("[CureTable] invalid status:", status);
      return;
    }

    // FIX (Medium): abort any previous in-flight request before starting a new one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setViewStatus(status);
    setViewErr(null);
    setViewRows([]);
    setViewPage(1);
    setSearchTerm("");
    setViewLoading(true);

    try {
      // FIX (High): use URLSearchParams for safe, encoded query construction
      const url = new URL("/api/lc/cure/results", window.location.origin);
      url.searchParams.set("status", status);

      // FIX (High): include CSRF token; use same-origin credentials
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        credentials: "same-origin",
        headers: {
          "X-CSRF-Token": getCsrfToken(),
        },
      });

      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      // FIX (High): treat non-ok responses as real errors — do NOT silently
      // continue with empty rows and a false "success" alert
      if (!res.ok || (data as any)?.success === false) {
        throw new Error(
          (data as any)?.message || `Server error (HTTP ${res.status})`
        );
      }

      const rawRows = Array.isArray((data as any)?.rows)
        ? (data as any).rows
        : [];

      // FIX (Medium): sanitize every row from the server before using it
      const rows: PendingRow[] = rawRows.map(sanitizeRow);
      setViewRows(rows);
    } catch (e: unknown) {
      // FIX (Medium): ignore AbortError — it's intentional, not a real failure
      if (e instanceof Error && e.name === "AbortError") return;

      // FIX (Medium): log full error internally; show only a safe generic
      // message to the user — never expose server internals in the UI
      console.error("[CureTable] load error:", e);
      setViewErr("Failed to load rows. Please try again.");
    } finally {
      setViewLoading(false);
    }
  }, []);

  // Abort on unmount to prevent state updates on an unmounted component
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    openViewStatus("APPROVED");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────────

  const filteredViewRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return viewRows;
    return viewRows.filter((r) => {
      const txn = r.transaction_no.toLowerCase();
      const lc = r.lc_number.toLowerCase();
      return txn.includes(q) || lc.includes(q);
    });
  }, [viewRows, searchTerm]);

  const totalViewPages = Math.max(
    1,
    Math.ceil(filteredViewRows.length / viewLimit)
  );

  const paginatedViewRows = useMemo(() => {
    const start = (viewPage - 1) * viewLimit;
    return filteredViewRows.slice(start, start + viewLimit);
  }, [filteredViewRows, viewPage, viewLimit]);

  // Clamp current page when filter/limit changes reduce total pages
  useEffect(() => {
    if (viewPage > totalViewPages) {
      setViewPage(totalViewPages);
    }
  }, [viewPage, totalViewPages]);

  // ── Render ──

  return (
    <div>
      <div className="py-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Tab bar */}
          <div
            className="inline-flex items-center gap-6 border-b border-gray-200"
            role="tablist"
            aria-label="Cure Table Status Tabs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewStatus === "APPROVED"}
              className={`pb-2 text-md bg-transparent border-0 shadow-none ${
                viewStatus === "APPROVED"
                  ? "text-primary font-semibold border-b-2 border-primary -mb-px"
                  : "text-gray-900"
              }`}
              onClick={() => openViewStatus("APPROVED")}
            >
              Approved Rows
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewStatus === "REJECTED"}
              className={`pb-2 text-md bg-transparent border-0 shadow-none ${
                viewStatus === "REJECTED"
                  ? "text-primary font-semibold border-b-2 border-primary -mb-px"
                  : "text-gray-900"
              }`}
              onClick={() => openViewStatus("REJECTED")}
            >
              Rejected Rows
            </button>
          </div>

          {/* Search */}
          <div className="input input-md w-full sm:w-72 border hover:border-blue-400 border-blue-300 text-sm flex items-center gap-2">
            <i className="ki-filled ki-magnifier" />
            <input
              className="w-full outline-none"
              placeholder="Search txn no / lc number"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setViewPage(1);
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="card min-w-full">
          {/* Card header */}
          <div className="card-header flex items-center justify-between gap-2">
            <div className="font-semibold">
              {viewStatus === "APPROVED" ? "Approved Rows" : "Rejected Rows"}
            </div>
            <button
              type="button"
              className="btn btn-sm btn-light"
              onClick={() => {
                setViewRows([]);
                setViewErr(null);
              }}
            >
              Close
            </button>
          </div>

          {/* Table area */}
          <div className="card-table scrollable-x-auto scrollable-y-auto">
            {viewLoading ? (
              <div className="p-4 flex items-center gap-2 text-sm">
                <span className="animate-spin inline-block h-5 w-5 rounded-full border-4 border-current border-t-transparent opacity-80" />
                Loading...
              </div>
            ) : viewErr ? (
              // FIX (Medium): display only the safe generic message stored in viewErr
              <div className="p-4">
                <div className="rounded border border-red-400 p-2 text-sm text-red-700">
                  {viewErr}
                </div>
              </div>
            ) : (
              <table className="table align-middle text-gray-700 font-medium text-sm min-w-full">
                <thead className="h-16">
                  <tr>
                    <th className="text-left">id</th>
                    <th className="text-left">transaction_no</th>
                    <th className="text-left">lc_number</th>
                    <th className="text-left">Cure Name</th>
                    <th className="text-left">Discrepancy Id</th>
                    <th className="text-left">Status</th>
                    <th className="text-left">created_at</th>
                  </tr>
                </thead>

                <tbody className="fw-semibold text-gray-600">
                  {filteredViewRows.length === 0 ? (
                    <tr className="h-16">
                      {/* FIX (Low): colSpan matches the actual 7 columns */}
                      <td colSpan={7} className="text-center text-gray-500">
                        No rows
                      </td>
                    </tr>
                  ) : (
                    paginatedViewRows.map((r, index) => (
                      <tr
                        // FIX (Medium): stable, unique key using multiple fields
                        key={`${r.transaction_no}-${r.lc_number}-${r.id}-${index}`}
                        className={`text-left h-16 ${
                          index % 2 === 0 ? "" : "bg-gray-100"
                        } hover:bg-gray-100`}
                      >
                        <td className="fw-bold">{r.id}</td>
                        <td>{r.transaction_no}</td>
                        <td>{r.lc_number}</td>
                        <td>{r.result_tab}</td>
                        <td>{r.discrepancy_id}</td>
                        <td>{r.approval_status}</td>
                        <td>{formatCreatedAt(r.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Pagination toolbar */}
        {!viewLoading && !viewErr && (
          <div className="kt-datatable-toolbar flex justify-between items-center border-t p-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              Show
              <select
                className="border rounded-md p-1 w-16"
                value={viewLimit}
                onChange={(e) => {
                  // FIX (Low): allowlist validation — reject DOM-tampered values
                  const val = Number(e.target.value) as AllowedLimit;
                  if (!(ALLOWED_LIMITS as readonly number[]).includes(val))
                    return;
                  setViewLimit(val);
                  setViewPage(1);
                }}
              >
                {ALLOWED_LIMITS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              per page
            </div>

            <span>
              Page {viewPage} of {totalViewPages}
            </span>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setViewPage((prev) => Math.max(1, prev - 1))}
                disabled={viewPage <= 1}
                className="px-3 py-1 border rounded-md disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() =>
                  setViewPage((prev) => Math.min(totalViewPages, prev + 1))
                }
                disabled={viewPage >= totalViewPages}
                className="px-3 py-1 border rounded-md disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CureTable;
