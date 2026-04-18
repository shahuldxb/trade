                               

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { TabPanel, Tabs } from "@/components/tabs";
import { toast } from "sonner";
import { ComposeEmail } from "./ComposeEmail";
import CurePreview from "./CurePreview";
import CureUIView, { type CureItem, type CureTab } from "./CureUIview";
import { createTabResultFunctions } from "./TabResult";
import {
  normalizeActionItems,
  getCureKey,
  getActionItemKey,
  getOverallActionItems,
  getRowKey,
} from "./cureResultHelpers";
import { buildCurePdfDoc, extractMt799Message } from "./PDFConverter";
import { useAuthContext } from "@/auth";
import { useMenuAuthContext } from "@/auth/AuthContext";
import { hasPermission } from "@/utils/rbac.utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PendingRow = {
  id: number | string;
  transaction_no?: string;
  cifno?: string;
  lc_number?: string;
  UserID?: number | string;
  Status?: string;
  status?: string;
  Model?: string;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
};

type PayloadSummary = {
  lc_document_chars?: number;
  sub_documents_chars?: number;
  own_discrepancies?: number;
  cross_discrepancies?: number;
  multihop_discrepancies?: number;
  own_validation_present?: boolean;
  cross_validation_present?: boolean;
  multihop_validation_present?: boolean;
  [k: string]: unknown;
};

type PayloadSummaryResponse = {
  row: PendingRow;
  summary: PayloadSummary;
};

type JobStatus = {
  job_id: string;
  row_id: number;
  running: boolean;
  error?: string | null;
  last_step?: string | null;
  label?: string | null;
  step_index?: number | null;
  total_steps?: number | null;
  progress?: number;
  updated_at?: string;
  logs?: string[];
  done?: boolean;
  status?: string;
  state?: string;
};

type JobResult = {
  job_id: string;
  row_id: number;
  cures?: unknown;
  mt799?: unknown;
  deduplicated_cures?: unknown;
  files_loaded?: unknown;
  payload_summary?: unknown;
  logs?: unknown;
  snapshot?: JobResult;
  transaction_no?: string;
  UserID?: number | string | null;
  lc_document?: string | null;
  sub_documents?: string | null;
  lc_document_ref?: string;    
  sub_documents_ref?: string;  
  documents?: {
    lc_document?: string;
    sub_documents?: string;
    lc_document_ref?: string;
    sub_documents_ref?: string;
  };
};

type ResultTab =
  | "own"
  | "cross"
  // | "moc"
  | "multihop"
  | "overall_ai"
  | "overall_rag"
  | "mt799_ai"
  | "mt799_rag";

type Decision = "APPROVE" | "REJECT";

type TabDecisionStatus = {
  decision: Decision;
  message: string;
  at: number;
  count: number;
};

type PageAlertKind = "success" | "error" | "info";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const _NON_ALNUM = /[^a-z0-9]+/g;
const PENDING_STATUS_VALUES = new Set([
  "pending",
  "inqueue",
  "queued",
  "queue",
  "awaiting",
]);

// Polling: starts at 1 s, doubles each miss up to 10 s (FIX: exponential backoff)
const POLL_INITIAL_MS = 1_000;
const POLL_MAX_MS = 10_000;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const normalizeStatus = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(_NON_ALNUM, "");

const fmt = (v: unknown) => (v == null ? "" : String(v));
const hasText = (v: unknown) => v != null && String(v).trim() !== "";
const toArray = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []);

const unwrapCure = (v: unknown): unknown => {
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

const isPendingStatus = (row: PendingRow) => {
  const status = row?.Status ?? row?.status;
  return PENDING_STATUS_VALUES.has(normalizeStatus(status));
};

const sanitizeServerString = (v: unknown, maxLen = 512): string =>
  String(v ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "") // strip control chars
    .slice(0, maxLen);

const asStringOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

const API = {
  pending: "/api/lc/cure/pending?status=pending",
  summary: (id: number | string) => `/api/lc/cure/pending/${encodeURIComponent(String(id))}/summary`,
  runFull: (id: number | string) => `/api/lc/cure/pending/${encodeURIComponent(String(id))}/run-full`,
  status: (jobId: string) => `/api/lc/cure/pipeline/status/${encodeURIComponent(jobId)}`,
  result: (jobId: string) => `/api/lc/cure/pipeline/result/${encodeURIComponent(jobId)}`,
  approval: "/api/lc/cure/results/approval",
  decisions: "/api/lc/cure/results/decisions",
};

const apiGet = async (url: string): Promise<unknown> => {
  const res = await fetch(url, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

const apiPost = async (url: string, body?: unknown): Promise<unknown> => {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",                         // FIX: session cookie
    headers: body
      ? { "Content-Type": "application/json" }
      : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

const getErrorMessage = (data: unknown): string => {
  if (!data) return "Run full failed";
  const d = data as Record<string, unknown>;
  const detail = d?.detail;
  if (detail) {
    if (typeof detail === "string") return detail;
    const dm = (detail as Record<string, unknown>)?.message;
    if (typeof dm === "string") return dm;
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  if (typeof d?.message === "string") return d.message;
  return "Run full failed";
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const Cure = () => {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedRow, setSelectedRow] = useState<PendingRow | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [payloadSummary, setPayloadSummary] = useState<PayloadSummaryResponse | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<JobStatus | null>(null);
  const [runPipelineLoading, setRunPipelineLoading] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<JobResult | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStepRef = useRef<string | null>(null);
  const pollDelayRef = useRef<number>(POLL_INITIAL_MS); 
  const pendingRows = useMemo(() => (rows ?? []).filter(isPendingStatus), [rows]);
  const { currentUser } = useAuthContext();
  const { rbac } = useMenuAuthContext();
  const canViewPage = hasPermission(rbac, "Cure", ["view"]);
  const cangenerateCure = hasPermission(rbac, "Cure", ["generate"]);
  const canapprove = hasPermission(rbac, "Cure", ["approve"]);
  const canreject = hasPermission(rbac, "Cure", ["reject"]);

  const [viewRows, setViewRows] = useState<PendingRow[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewErr, setViewErr] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailDefaultSubject, setEmailDefaultSubject] = useState("");
  const [emailDefaultBody, setEmailDefaultBody] = useState("");
  const [emailAttachmentFile, setEmailAttachmentFile] = useState<File | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [pageAlertOpen, setPageAlertOpen] = useState(false);
  const [pageAlertKind, setPageAlertKind] = useState<PageAlertKind>("info");
  const [pageAlertTitle, setPageAlertTitle] = useState("");
  const [pageAlertBody, setPageAlertBody] = useState("");
  const [modalTab, setModalTab] = useState<ResultTab | null>(null);
  const [modalAction, setModalAction] = useState<"APPROVE" | "REJECT" | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [viewStatus, setViewStatus] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRowsCount, setSelectedRowsCount] = useState(0);
  const [resultsLoaded, setResultsLoaded] = useState({
    own: false,
    cross: false,
    // moc: false,
    multihop: false,
    overall_ai: false,
    overall_rag: false,
    mt799_ai: false,
    mt799_rag: false,
  });

  const selectedCount = (tab: ResultTab) => selectedByTab[tab]?.size ?? 0;
  const selectedRowIdNum = Number(selectedRow?.id ?? 0);

  const [tabStatus, setTabStatus] = useState<Partial<Record<ResultTab, TabDecisionStatus>>>({});
  const [selectedByTab, setSelectedByTab] = useState<Record<ResultTab, Set<string>>>({
    own: new Set(),
    cross: new Set(),
    // moc: new Set(),
    multihop: new Set(),
    overall_ai: new Set(),
    overall_rag: new Set(),
    mt799_ai: new Set(),
    mt799_rag: new Set(),
  });
  const [defaultSelectionAppliedForRow, setDefaultSelectionAppliedForRow] = useState<string | null>(null);
  const [decisionByTab, setDecisionByTab] = useState<Record<ResultTab, Record<string, Decision>>>({
    own: {},
    cross: {},
    // moc: {},
    multihop: {},
    overall_ai: {},
    overall_rag: {},
    mt799_ai: {},
    mt799_rag: {},
  });

  const toggleSelection = (tab: ResultTab, key: string) => {
    setSelectedByTab((prev) => {
      const next = new Set(prev[tab] ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, [tab]: next };
    });
  };

  const stringifySafe = (v: unknown): string => {
    try {
      return typeof v === "string" ? v : JSON.stringify(v);
    } catch {
      return String(v ?? "");
    }
  };

  const normalizeMt799ForExport = (value: unknown) => {
    if (!value || typeof value !== "object") return value ?? null;
    const payload = value as Record<string, unknown>;
    const senderBank =
      payload.sender_bank_name ??
      (payload.sender_bank &&
      typeof payload.sender_bank === "object" &&
      (payload.sender_bank as Record<string, unknown>).name);
    const receiverBank =
      payload.receiver_bank_name ??
      (payload.receiver_bank &&
      typeof payload.receiver_bank === "object" &&
      (payload.receiver_bank as Record<string, unknown>).name);

    return {
      success: payload.success ?? true,
      sender_bank_name: senderBank ?? "N/A",
      receiver_bank_name: receiverBank ?? "N/A",
      sender_bic: payload.sender_bic ?? "N/A",
      receiver_bic: payload.receiver_bic ?? "N/A",
      transaction_ref: payload.transaction_ref ?? "",
      related_ref: payload.related_ref ?? "",
      mt799_message: extractMt799Message(payload),
      swift_message: extractMt799Message(payload),
      error: payload.error ?? null,
    };
  };

  const showAlert = (kind: PageAlertKind, title: string, body: string) => {
    setPageAlertKind(kind);
    setPageAlertTitle(title);
    setPageAlertBody(body);
    setPageAlertOpen(true);
  };

  // ---------------------------------------------------------------------------
  // View approved / rejected rows
  // FIX: removed X-User-Id header; credentials: "include" used instead
  // ---------------------------------------------------------------------------
  const openViewStatus = async (status: "APPROVED" | "REJECTED") => {
    setViewStatus(status);
    setViewErr(null);
    setViewRows([]);
    setViewLoading(true);
    showAlert(
      "info",
      status === "APPROVED" ? "Showing Approved Rows" : "Showing Rejected Rows",
      "Loading results from server..."
    );

    try {
      const res = await fetch(`/api/lc/cure/results?status=${encodeURIComponent(status)}`, {
        credentials: "include", // FIX
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || (data as Record<string, unknown>)?.success === false)
        throw new Error((data as Record<string, unknown>)?.message as string || "Failed to load rows");

      const fetchedRows = Array.isArray((data as Record<string, unknown>)?.rows)
        ? ((data as Record<string, unknown>).rows as PendingRow[])
        : [];
      setViewRows(fetchedRows);

      showAlert(
        "success",
        status === "APPROVED" ? "Approved Rows Loaded" : "Rejected Rows Loaded",
        `Found ${fetchedRows.length} rows.`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setViewErr(msg);
      showAlert("error", "Load Failed", msg);
    } finally {
      setViewLoading(false);
    }
  };

  // FIX: Removed useEffect that read userId from localStorage.
  // Identity is now managed entirely by the session cookie + auth context.

  const options = useMemo(
    () =>
      pendingRows.map((r) => ({
        id: String(r.id),
        label: `ID ${r.id} | TXN ${r.transaction_no ?? "N/A"} | LC ${r.lc_number ?? "N/A"}`,
      })),
    [pendingRows]
  );

  const missingPayloads = useMemo(() => {
    const s = payloadSummary?.summary ?? {};
    const missing: string[] = [];
    if ((s.lc_document_chars ?? 0) === 0) missing.push("LC Document");
    if ((s.sub_documents_chars ?? 0) === 0) missing.push("Sub Documents");
    const ownPresent = s.own_validation_present ?? (s.own_discrepancies ?? 0) > 0;
    const crossPresent = s.cross_validation_present ?? (s.cross_discrepancies ?? 0) > 0;
    const multihopPresent = s.multihop_validation_present ?? (s.multihop_discrepancies ?? 0) > 0;
    if (!ownPresent) missing.push("Own Document Validation");
    if (!crossPresent) missing.push("Cross Document Validation");
    if (!multihopPresent) missing.push("Multi-Hops Agentic RAG");
    return missing;
  }, [payloadSummary]);

  const blockingMissingPayloads = useMemo(() => {
    const s = payloadSummary?.summary ?? {};
    const missing: string[] = [];
    if ((s.lc_document_chars ?? 0) === 0) missing.push("LC Document");
    if ((s.sub_documents_chars ?? 0) === 0) missing.push("Sub Documents");
    return missing;
  }, [payloadSummary]);

  const hasBlockingMissing = blockingMissingPayloads.length > 0;

  const analysis = pipelineResult?.snapshot ?? pipelineResult;
  const analysisCures = (analysis?.cures as Record<string, unknown>) ?? {};
  const ownCures = Array.isArray(analysisCures?.own) ? (analysisCures.own as unknown[]) : [];
  const crossCures = Array.isArray(analysisCures?.cross) ? (analysisCures.cross as unknown[]) : [];
  // const mocCures = Array.isArray(analysisCures?.moc) ? (analysisCures.moc as unknown[]) : [];
  const multihopCures = Array.isArray(analysisCures?.multihop)
    ? (analysisCures.multihop as unknown[])
    : [];
  const overallAi =
    analysisCures?.overall_ai ??
    ((analysis as JobResult & { overall_key?: string; overall_cure?: unknown })?.overall_key === "overall_ai"
      ? (analysis as JobResult & { overall_cure?: unknown })?.overall_cure
      : null);
  const overallRag =
    analysisCures?.overall_rag ??
    ((analysis as JobResult & { overall_key?: string; overall_cure?: unknown })?.overall_key === "overall_rag"
      ? (analysis as JobResult & { overall_cure?: unknown })?.overall_cure
      : null);
  const mt799Payload = (analysis as JobResult & { mt799?: Record<string, unknown> })?.mt799 ?? {};
  const mt799Ai = mt799Payload?.overall_ai ?? analysisCures?.mt799_ai ?? null;
  const mt799Rag = mt799Payload?.overall_rag ?? analysisCures?.mt799_rag ?? null;
  const dedupeInfo =
    (analysis as JobResult & { deduplicated_cures?: unknown; dedup_info?: unknown })?.deduplicated_cures ??
    (analysis as JobResult & { dedup_info?: unknown })?.dedup_info ??
    null;

  // ---------------------------------------------------------------------------
  // Refresh pending queue
  // ---------------------------------------------------------------------------
  const refreshPendingQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lc/cure/pending?status=pending", {
        credentials: "include", // FIX
      });
      if (!res.ok) throw new Error(await res.text());
      const payload = await res.json();
      const fetchedRows: PendingRow[] = (payload as Record<string, unknown>).rows as PendingRow[] || [];
      setRows(fetchedRows);
    } catch (e: unknown) {
      setErr('Database Disconnected');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canViewPage) return;
    refreshPendingQueue();
  }, [canViewPage]);

  // ---------------------------------------------------------------------------
  // Run full pipeline
  // FIX: removed X-User-Id header; server uses session for identity
  // ---------------------------------------------------------------------------
  const handleRunFullPipeline = async () => {
    if (!selectedRow?.id) return;

    setPipelineResult(null);
    setPipelineStatus(null);
    lastStepRef.current = null;
    pollDelayRef.current = POLL_INITIAL_MS; // FIX: reset backoff
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setRunPipelineLoading(true);

    try {
      const rowId = Number(selectedRow.id);
      const response = await fetch(API.runFull(rowId), {
        method: "POST",
        credentials: "include", // FIX: session cookie carries identity
      });

      let resData: unknown = null;
      try {
        resData = await response.json();
      } catch {
        resData = null;
      }

      if (!response.ok || (resData as Record<string, unknown>)?.success === false) {
        throw new Error(getErrorMessage(resData));
      }

      const jobId = (resData as Record<string, unknown>)?.job_id as string | undefined;
      if (!jobId)
        throw new Error("No job_id returned. Backend must run in async mode.");

      setCurrentJobId(jobId);

      setResultsLoaded({
        own: true,
        cross: true,
        // moc: true,
        multihop: true,
        overall_ai: true,
        overall_rag: true,
        mt799_ai: true,
        mt799_rag: true,
      });
    } catch (e: unknown) {
      setRunPipelineLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedId) {
      setSelectedRow(null);
      setPayloadSummary(null);
      return;
    }
    const found = pendingRows.find((r) => String(r.id) === String(selectedId)) ?? null;
    setSelectedRow(found);
  }, [selectedId, pendingRows]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedRow?.id) {
      setPayloadSummary(null);
      setSummaryLoading(false);
      return;
    }
    (async () => {
      try {
        setErr(null);
        setSummaryLoading(true);
        setPayloadSummary(null);
        const summary = await apiGet(API.summary(selectedRow.id));
        if (!cancelled) setPayloadSummary(summary as PayloadSummaryResponse);
      } catch (e: unknown) {
        if (!cancelled) {
          setPayloadSummary(null);
          setErr(`Summary error: ${e instanceof Error ? e.message : String(e)}`);
        }
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRow?.id]);

  // ---------------------------------------------------------------------------
  // Pipeline polling  — FIX: exponential backoff instead of fixed 1 s interval
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!currentJobId) return;

    let alive = true;

    const scheduleTick = (delayMs: number) => {
      pollTimerRef.current = setTimeout(tick, delayMs);
    };

    const tick = async () => {
      if (!alive) return;

      try {
        const status = (await apiGet(API.status(currentJobId as string))) as JobStatus;
        if (!alive) return;

        setPipelineStatus(status);

        const step = status?.last_step ?? null;
        if (step && step !== lastStepRef.current) {
          lastStepRef.current = step;
          const snap = (await apiGet(API.result(currentJobId as string))) as JobResult;
          if (!alive) return;
          setPipelineResult({ snapshot: snap } as unknown as JobResult);
        }

        if (!status?.running || status?.error) {
          const snap = (await apiGet(API.result(currentJobId as string))) as JobResult;
          if (!alive) return;
          setPipelineResult({ snapshot: snap } as unknown as JobResult);
          setRunPipelineLoading(false);
          setCurrentJobId(null);
          pollDelayRef.current = POLL_INITIAL_MS;
          return; // done — do not reschedule
        }

        // FIX: back off exponentially up to POLL_MAX_MS
        pollDelayRef.current = Math.min(pollDelayRef.current * 2, POLL_MAX_MS);
        if (alive) scheduleTick(pollDelayRef.current);
      } catch (e: unknown) {
        if (!alive) return;
        setErr(`Pipeline polling error: ${e instanceof Error ? e.message : String(e)}`);
        setRunPipelineLoading(false);
        setCurrentJobId(null);
        pollDelayRef.current = POLL_INITIAL_MS;
      }
    };

    pollDelayRef.current = POLL_INITIAL_MS;
    scheduleTick(POLL_INITIAL_MS);

    return () => {
      alive = false;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [currentJobId]);

  // ---------------------------------------------------------------------------
  // File download helper
  // ---------------------------------------------------------------------------
  function downloadTextFile(filename: string, text: string, mime = "application/json") {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------
  const handleExportAllResults = () => {
    const snapshot = pipelineResult?.snapshot ?? pipelineResult;
    if (!snapshot) {
      setErr("No results to export yet. Run the pipeline first.");
      return;
    }
    try {
      const approved = getApprovedPreviewAndPdfData();
      const hasApprovedContent =
        (approved?.ownCures?.length ?? 0) > 0 ||
        (approved?.crossCures?.length ?? 0) > 0 ||
        // (approved?.mocCures?.length ?? 0) > 0 ||
        (approved?.multihopCures?.length ?? 0) > 0 ||
        !!approved?.overallAi ||
        !!approved?.overallRag ||
        !!approved?.mt799Ai ||
        !!approved?.mt799Rag;

      if (!hasApprovedContent) {
        setErr("No approved results found to export.");
        return;
      }

      const rowId = (snapshot as JobResult).row_id ?? selectedRow?.id ?? "unknown";
      const jobId = (snapshot as JobResult).job_id ?? currentJobId ?? "nojob";
      const ts = new Date().toISOString().replace(/[:.]/g, "-");

      const exportObj = {
        exported_at: new Date().toISOString(),
        row_id: rowId,
        job_id: jobId,
        approved_only: true,
        approved_results: {
          own_cures: approved?.ownCures ?? [],
          cross_cures: approved?.crossCures ?? [],
          // moc_cures: approved?.mocCures ?? [],
          multihop_cures: approved?.multihopCures ?? [],
          overall_ai: approved?.overallAi ?? null,
          overall_rag: approved?.overallRag ?? null,
          mt799_ai: normalizeMt799ForExport(approved?.mt799Ai),
          mt799_rag: normalizeMt799ForExport(approved?.mt799Rag),
        },
      };

      downloadTextFile(
        `cure_approved_results_row_${rowId}_${ts}.json`,
        JSON.stringify(exportObj, null, 2),
        "application/json"
      );
    } catch (e: unknown) {
      setErr(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // ---------------------------------------------------------------------------
  // MT799 key helper
  // ---------------------------------------------------------------------------
  const getMt799Key = (title: string) => {
    const rowKey =
      selectedRow?.transaction_no ??
      selectedRow?.id ??
      (pipelineResult?.snapshot as JobResult)?.transaction_no ??
      (pipelineResult?.snapshot as JobResult)?.row_id ??
      "unknown";
    const kind = String(title || "mt799").toLowerCase().replace(/\s+/g, "_");
    return `mt799-${rowKey}-${kind}`;
  };

  // ---------------------------------------------------------------------------
  // Default selections
  // ---------------------------------------------------------------------------
  const buildDefaultSelectedByTab = useCallback((): Record<ResultTab, Set<string>> => {
    const next: Record<ResultTab, Set<string>> = {
      own: new Set<string>(),
      cross: new Set<string>(),
      // moc: new Set<string>(),
      multihop: new Set<string>(),
      overall_ai: new Set<string>(),
      overall_rag: new Set<string>(),
      mt799_ai: new Set<string>(),
      mt799_rag: new Set<string>(),
    };

    const addIfUndecided = (tab: ResultTab, key: string) => {
      if (!decisionByTab[tab]?.[key]) next[tab].add(key);
    };

    (ownCures || []).forEach((item, index) => addIfUndecided("own", getCureKey(item, index, "own")));
    (crossCures || []).forEach((item, index) => addIfUndecided("cross", getCureKey(item, index, "cross")));
    // (mocCures || []).forEach((item, index) => addIfUndecided("moc", getCureKey(item, index, "moc")));
    (multihopCures || []).forEach((item, index) =>
      addIfUndecided("multihop", getCureKey(item, index, "multihop"))
    );

    const rowKey = getRowKey(selectedRow, pipelineResult);
    const addOverallDefaults = (tab: "overall_ai" | "overall_rag", overall: unknown) => {
      if (!overall) return;
      addIfUndecided(tab, `${tab}-overall-${rowKey}`);
      const cure = unwrapCure(overall);
      const isObject = cure != null && typeof cure === "object" && !Array.isArray(cure);
      const actionItems = normalizeActionItems(getOverallActionItems(overall, cure, isObject));
      actionItems.forEach((item: unknown, index: number) => {
        addIfUndecided(tab, getActionItemKey(item, index, tab, rowKey));
      });
    };

    addOverallDefaults("overall_ai", overallAi);
    addOverallDefaults("overall_rag", overallRag);

    if (mt799Ai) addIfUndecided("mt799_ai", getMt799Key("MT799 (AI)"));
    if (mt799Rag) addIfUndecided("mt799_rag", getMt799Key("MT799 (RAG)"));

    return next;
  }, [decisionByTab, ownCures, crossCures,  multihopCures, overallAi, overallRag, mt799Ai, mt799Rag, selectedRow, pipelineResult]);

  // }, [decisionByTab, ownCures, crossCures, mocCures, multihopCures, overallAi, overallRag, mt799Ai, mt799Rag, selectedRow, pipelineResult]);

  // ---------------------------------------------------------------------------
  // Pipeline live-card renderer
  // FIX: server strings are sanitized before rendering
  // ---------------------------------------------------------------------------
  const renderPipelineLiveCard = () => {
    if (!pipelineStatus) return null;

    const progress = Math.max(0, Math.min(1, Number(pipelineStatus?.progress ?? 0)));
    const percent = Math.round(progress * 100);
    const isDone =
      pipelineStatus?.done === true ||
      pipelineStatus?.status === "completed" ||
      pipelineStatus?.state === "completed" ||
      pipelineStatus?.state === "done" ||
      progress >= 1;
    const hasError = !!pipelineStatus?.error;
    const isRunning = !hasError && !isDone;

    const logs = pipelineStatus?.logs ?? [];
    if (!isRunning) return null;

    const lastStartIdx = (() => {
      for (let i = logs.length - 1; i >= 0; i--) {
        if (/step started\s*:/i.test(logs[i])) return i;
      }
      return -1;
    })();

    const stepLogs = lastStartIdx >= 0 ? logs.slice(lastStartIdx) : logs;
    const lastLogs = stepLogs.slice(-8);

    // FIX: sanitize all server-provided strings before rendering
    const safeLabel = sanitizeServerString(
      pipelineStatus?.label || pipelineStatus?.last_step || "Running..."
    );
    const safeError = sanitizeServerString(pipelineStatus?.error ?? "");

    return (
      <div className="mb-4 rounded border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold">
            {hasError ? "Failed" : isDone ? "Completed" : safeLabel}
          </div>
          {isRunning ? <div className="text-sm opacity-70">{percent}%</div> : null}
        </div>

        {isRunning ? (
          <div className="progress h-2 w-full rounded bg-gray-200 my-5">
            <div className="progress-bar rounded bg-blue-600" style={{ width: `${percent}%` }} />
          </div>
        ) : null}

        {hasError ? (
          <div className="mt-2 text-sm font-semibold text-red-600">{safeError}</div>
        ) : isDone ? (
          <div className="mt-2 text-sm font-semibold text-blue-600">Cure completed</div>
        ) : null}

        {isRunning && lastLogs.length ? (
          <div className="mt-2 text-xs whitespace-pre-wrap">
            {lastLogs.map((line: string, idx: number) => {
              const safeLine = sanitizeServerString(line); // FIX: sanitize log lines
              const mStep = safeLine.match(/^\s*(Step started)\s*:\s*(.*)\s*$/i);
              if (mStep) {
                return (
                  <div key={idx}>
                    <span className="text-md font-semibold">{mStep[1]}:</span>{" "}
                    <span className="text-md font-semibold text-blue-600">{mStep[2] || ""}</span>
                  </div>
                );
              }
              return (
                <div key={idx} className="text-gray-700 opacity-80">
                  {safeLine}
                </div>
              );
            })}
          </div>
        ) : null}

        {currentJobId ? (
          <div className="mt-2 text-xs">
            <span className="text-md font-semibold">job_id:</span>{" "}
            <span className="text-md font-semibold text-blue-600">
              {sanitizeServerString(currentJobId)}
            </span>
          </div>
        ) : null}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Approved preview / PDF data
  // ---------------------------------------------------------------------------
  function getApprovedPreviewAndPdfData() {
    const pickApprovedFromList = (list: unknown[], tab: ResultTab) =>
      (list || []).filter(
        (item, index) => decisionByTab[tab]?.[getCureKey(item, index, tab)] === "APPROVE"
      );

    const deepClone = <T,>(value: T): T => {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return value;
      }
    };

    const stripOverallActions = (overall: unknown): Record<string, unknown> => {
      const clone = deepClone(overall ?? {}) as Record<string, unknown>;
      if (!clone || typeof clone !== "object") return clone;
      delete clone.action_items;
      delete clone.actionItems;
      delete clone.actions;
      if (clone.cure && typeof clone.cure === "object") {
        const cure = clone.cure as Record<string, unknown>;
        delete cure.action_items;
        delete cure.actionItems;
        delete cure.actions;
      }
      return clone;
    };

    const addOverallActions = (overall: unknown, filteredActions: unknown[]): unknown => {
      const clone = stripOverallActions(overall);
      if (!filteredActions.length) return clone;
      const o = overall as Record<string, unknown> | null;
      const hadCureLevelActions =
        (o?.cure as Record<string, unknown>)?.action_items != null ||
        (o?.cure as Record<string, unknown>)?.actionItems != null ||
        (o?.cure as Record<string, unknown>)?.actions != null;
      if (hadCureLevelActions) {
        clone.cure = {
          ...((clone.cure as object) ?? {}),
          action_items: filteredActions,
        };
      } else {
        clone.action_items = filteredActions;
      }
      return clone;
    };

    const getApprovedOverall = (
      tab: "overall_ai" | "overall_rag",
      overall: unknown,
      rowKey: string
    ) => {
      if (!overall) return null;
      const summaryKey = `${tab}-overall-${rowKey}`;
      const actionPrefix = `overall|${tab}|action|${rowKey}|`;
      const summaryApproved = decisionByTab[tab]?.[summaryKey] === "APPROVE";

      const cure = unwrapCure(overall);
      const isObject = cure != null && typeof cure === "object" && !Array.isArray(cure);
      const actions = normalizeActionItems(getOverallActionItems(overall, cure, isObject));

      const approvedActions = actions.filter((item: unknown, index: number) => {
        const i = item as Record<string, unknown>;
        const actionId = i?.cure_id ?? i?.discrepancy_id ?? index;
        const actionKey = `${actionPrefix}${String(actionId)}`;
        return decisionByTab[tab]?.[actionKey] === "APPROVE";
      });

      if (!summaryApproved && approvedActions.length === 0) return null;
      const base = summaryApproved ? overall : {};
      return addOverallActions(base, approvedActions);
    };

    const rowKey = getRowKey(selectedRow, pipelineResult);
    const mt799AiKey = getMt799Key("MT799 (AI)");
    const mt799RagKey = getMt799Key("MT799 (RAG)");
    const hasApprovedDecision = (tab: ResultTab, key: string) =>
      decisionByTab[tab]?.[key] === "APPROVE";

    return {
      ownCures: pickApprovedFromList(ownCures, "own"),
      crossCures: pickApprovedFromList(crossCures, "cross"),
      // mocCures: pickApprovedFromList(mocCures, "moc"),
      multihopCures: pickApprovedFromList(multihopCures, "multihop"),
      overallAi: getApprovedOverall("overall_ai", overallAi, rowKey),
      overallRag: getApprovedOverall("overall_rag", overallRag, rowKey),
      mt799Ai: hasApprovedDecision("mt799_ai", mt799AiKey) ? mt799Ai : null,
      mt799Rag: hasApprovedDecision("mt799_rag", mt799RagKey) ? mt799Rag : null,
    };
  }

  // ---------------------------------------------------------------------------
  // PDF generation
  // ---------------------------------------------------------------------------
  const generatePDF = () => {
    const approved = getApprovedPreviewAndPdfData();
    const { doc, filename } = buildCurePdfDoc({
      selectedRow,
      pipelineResult,
      mt799Ai: approved.mt799Ai,
      mt799Rag: approved.mt799Rag,
      ownCures: approved.ownCures,
      crossCures: approved.crossCures,
      // mocCures: approved.mocCures,
      multihopCures: approved.multihopCures,
      overallAi: approved.overallAi,
      overallRag: approved.overallRag,
    });
    doc.save(filename);
  };

  const openEmailWithGeneratedPdf = () => {
    const approved = getApprovedPreviewAndPdfData();
    const { doc, filename } = buildCurePdfDoc({
      selectedRow,
      pipelineResult,
      mt799Ai: approved.mt799Ai,
      mt799Rag: approved.mt799Rag,
      ownCures: approved.ownCures,
      crossCures: approved.crossCures,
      multihopCures: approved.multihopCures,
      overallAi: approved.overallAi,
      overallRag: approved.overallRag,
    });
    const blob = doc.output("blob");
    const file = new File([blob], filename, { type: "application/pdf" });
    setEmailAttachmentFile(file);
    setEmailDefaultSubject(`Cure Result PDF - ${filename}`);
    setEmailDefaultBody("");
    setShowEmailForm(true);
  };

  // ---------------------------------------------------------------------------
  // Submit tab decision
  // FIX: full document content NOT sent in the payload — only reference IDs
  // FIX: no X-User-Id header; credentials: "include" carries the session
  // FIX: all console.log calls with sensitive data removed
  // ---------------------------------------------------------------------------
  const submitTabDecision = async (tab: ResultTab, decision: Decision) => {
    if (!selectedRow?.id) {
      toast.error("No row selected");
      return;
    }

    const keys = Array.from(selectedByTab[tab] ?? []);
    if (keys.length === 0) {
      toast.info("No selection", { description: "Select checkbox first." });
      return;
    }

    const pickFrom = (list: unknown[]) =>
      (list || [])
        .map((x, i) => ({ x, i, k: getCureKey(x, i, tab) }))
        .filter((o) => keys.includes(o.k))
        .map((o) => ({ x: o.x, sourceIndex: o.i }));

    const pickSelectedOverallRows = (overall: unknown, overallTab: "overall_ai" | "overall_rag") => {
      if (!overall) return [];
      const pickedRows: unknown[] = [];
      const rowKey = getRowKey(selectedRow, pipelineResult);
      const overallSummaryKey = `${overallTab}-overall-${rowKey}`;

      if (keys.includes(overallSummaryKey)) pickedRows.push(overall);

      const cure = unwrapCure(overall);
      const isObject = cure != null && typeof cure === "object" && !Array.isArray(cure);
      const actionItems = normalizeActionItems(getOverallActionItems(overall, cure, isObject));
      actionItems.forEach((item: unknown, index: number) => {
        const actionKey = getActionItemKey(item, index, overallTab, rowKey);
        if (keys.includes(actionKey)) pickedRows.push(item);
      });

      return pickedRows;
    };

    let picked: Array<{ x: unknown; sourceIndex?: number }> = [];
    if (tab === "own") picked = pickFrom(ownCures);
    else if (tab === "cross") picked = pickFrom(crossCures);
    else if (tab === "multihop") picked = pickFrom(multihopCures);
    // else if (tab === "moc") picked = pickFrom(mocCures);
    else if (tab === "overall_ai")
      picked = pickSelectedOverallRows(overallAi, "overall_ai").map((x) => ({ x }));
    else if (tab === "overall_rag")
      picked = pickSelectedOverallRows(overallRag, "overall_rag").map((x) => ({ x }));
    else if (tab === "mt799_ai") picked = [mt799Ai].filter(Boolean).map((x) => ({ x }));
    else if (tab === "mt799_rag") picked = [mt799Rag].filter(Boolean).map((x) => ({ x }));

    const txn =
      selectedRow.transaction_no ??
      (pipelineResult?.snapshot as JobResult)?.transaction_no ??
      "";

    const snap = pipelineResult?.snapshot ?? pipelineResult;
    const jobId = (snap as JobResult)?.job_id ?? currentJobId ?? null;
    const rowId = Number(selectedRow.id);

    const docs = (snap as JobResult & { documents?: Record<string, unknown> })?.documents ?? {};
    const lcDocument =
      asStringOrNull(docs?.lc_document) ??
      asStringOrNull((snap as JobResult)?.lc_document) ??
      asStringOrNull((snap as JobResult)?.snapshot?.lc_document) ??
      null;
    const subDocuments =
      asStringOrNull(docs?.sub_documents) ??
      asStringOrNull((snap as JobResult)?.sub_documents) ??
      asStringOrNull((snap as JobResult)?.snapshot?.sub_documents) ??
      null;
    const lcDocumentRef =
      (docs?.lc_document_ref as string) ??
      (snap as JobResult)?.lc_document_ref ??
      null;
    const subDocumentsRef =
      (docs?.sub_documents_ref as string) ??
      (snap as JobResult)?.sub_documents_ref ??
      null;

    const rowsPayload = picked.map((pickedItem, pickedIdx) => {
      const x = pickedItem?.x as Record<string, unknown>;
      const sourceIndex = pickedItem?.sourceIndex;
      const baseDiscId = x?.discrepancy_id ?? x?.cure_id ?? x?.discrepancy_no ?? null;
      const fallbackDiscId =
        sourceIndex != null ? String(sourceIndex + 1) : String(pickedIdx + 1);
      const discId =
        baseDiscId != null && String(baseDiscId).trim() !== ""
          ? String(baseDiscId)
          : fallbackDiscId;

      return {
        transaction_no: txn,
        job_id: jobId,
        UserID: currentUser?.UserID ?? selectedRow.UserID ?? (snap as JobResult)?.UserID ?? null,
        cifno: selectedRow.cifno ?? null,
        source_row_id: rowId,
        module: "CURE",
        Model: selectedRow.Model ?? "Cure",
        lc_number: selectedRow.lc_number ?? null,
        lc_document: lcDocument ?? "",
        sub_documents: subDocuments ?? "",
        lc_document_ref: lcDocumentRef,
        sub_documents_ref: subDocumentsRef,
        discrepancy_id: discId,
        Cure_results: stringifySafe(x),
        result_tab: tab,
      };
    });

    const toastId = toast.loading(`${decision} saving...`, {
      description: `${tab.toUpperCase()} | ${rowsPayload.length} item(s)`,
    });

    try {
      const resp = await apiPost(API.decisions, {
        decision,
        rows: rowsPayload,
      }) as Record<string, unknown>;

      const inserted = resp?.inserted ?? rowsPayload.length;

      setDecisionByTab((prev) => {
        const next = { ...prev };
        const current = { ...(next[tab] ?? {}) };
        keys.forEach((k) => {
          current[k] = decision;
        });
        next[tab] = current;
        return next;
      });

      setSelectedByTab((prev) => {
        const next = { ...prev };
        next[tab].clear();
        return next;
      });

      setTabStatus((prev) => ({
        ...prev,
        [tab]: {
          decision,
          message:
            decision === "APPROVE"
              ? ` Successfully approved ${inserted} item(s)`
              : ` Successfully rejected ${inserted} item(s)`,
          at: Date.now(),
          count: inserted as number,
        },
      }));

      toast.success(decision === "APPROVE" ? "Approved" : "Rejected", {
        id: toastId,
        description: `Saved ${inserted} item(s)`,
      });
    } catch (e: unknown) {
      toast.error("Save failed", {
        id: toastId,
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Modal helpers
  // ---------------------------------------------------------------------------
  const openModal = (action: "APPROVE" | "REJECT", tab: ResultTab) => {
    if (action === "APPROVE" && !canapprove) {
      toast.error("You do not have permission to approve.");
      return;
    }
    if (action === "REJECT" && !canreject) {
      toast.error("You do not have permission to reject.");
      return;
    }
    setSelectedRowsCount(selectedCount(tab));
    setModalAction(action);
    setModalTab(tab);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalAction(null);
    setModalTab(null);
    setSelectedRowsCount(0);
  };

  const handleConfirmAction = async () => {
    if (modalAction !== null && modalTab !== null) {
      if (modalAction === "APPROVE" && !canapprove) {
        toast.error("You do not have permission to approve.");
        closeModal();
        return;
      }
      if (modalAction === "REJECT" && !canreject) {
        toast.error("You do not have permission to reject.");
        closeModal();
        return;
      }
      await submitTabDecision(modalTab, modalAction);
    }
    closeModal();
  };

  // ---------------------------------------------------------------------------
  // Derived pipeline state
  // ---------------------------------------------------------------------------
  const pipelineDone =
    pipelineStatus?.done === true ||
    pipelineStatus?.status === "completed" ||
    pipelineStatus?.state === "completed" ||
    pipelineStatus?.state === "done" ||
    Number(pipelineStatus?.progress ?? 0) >= 1;

  const lastPipelineRowId = Number(
    (pipelineResult?.snapshot as JobResult)?.row_id ??
    pipelineResult?.row_id ??
    0
  );

  const pipelineCompleteForSelectedRow =
    !!selectedRowIdNum &&
    lastPipelineRowId === selectedRowIdNum &&
    pipelineDone &&
    !!analysis &&
    !runPipelineLoading &&
    !currentJobId;

  const currentSelectionRowKey = getRowKey(selectedRow, pipelineResult);

  useEffect(() => {
    if (!analysis) return;
    const defaults = buildDefaultSelectedByTab();
    setSelectedByTab((prev) => {
      if (defaultSelectionAppliedForRow !== currentSelectionRowKey) {
        return defaults;
      }
      const next: Record<ResultTab, Set<string>> = {
        own: new Set(prev.own),
        cross: new Set(prev.cross),
        // moc: new Set(prev.moc),
        multihop: new Set(prev.multihop),
        overall_ai: new Set(prev.overall_ai),
        overall_rag: new Set(prev.overall_rag),
        mt799_ai: new Set(prev.mt799_ai),
        mt799_rag: new Set(prev.mt799_rag),
      };
      (Object.keys(next) as ResultTab[]).forEach((tab) => {
        defaults[tab].forEach((key) => {
          if (!decisionByTab[tab]?.[key]) next[tab].add(key);
        });
      });
      return next;
    });
    setDefaultSelectionAppliedForRow(currentSelectionRowKey);
  }, [analysis, currentSelectionRowKey, decisionByTab, defaultSelectionAppliedForRow, buildDefaultSelectedByTab]);

  // ---------------------------------------------------------------------------
  // Decision key accounting for preview gate
  // ---------------------------------------------------------------------------
  const allDecisionKeysForPreview = useMemo(() => {
    if (!analysis) return [] as Array<{ tab: ResultTab; key: string }>;
    const keys: Array<{ tab: ResultTab; key: string }> = [];

    (ownCures || []).forEach((item, index) =>
      keys.push({ tab: "own", key: getCureKey(item, index, "own") })
    );
    (crossCures || []).forEach((item, index) =>
      keys.push({ tab: "cross", key: getCureKey(item, index, "cross") })
    );
    // (mocCures || []).forEach((item, index) =>
    //   keys.push({ tab: "moc", key: getCureKey(item, index, "moc") })
    // );
    (multihopCures || []).forEach((item, index) =>
      keys.push({ tab: "multihop", key: getCureKey(item, index, "multihop") })
    );

    const rowKey = getRowKey(selectedRow, pipelineResult);
    const collectOverallKeys = (tab: "overall_ai" | "overall_rag", overall: unknown) => {
      if (!overall) return;
      keys.push({ tab, key: `${tab}-overall-${rowKey}` });
      const cure = unwrapCure(overall);
      const isObject = cure != null && typeof cure === "object" && !Array.isArray(cure);
      const actionItems = normalizeActionItems(getOverallActionItems(overall, cure, isObject));
      actionItems.forEach((item: unknown, index: number) => {
        keys.push({ tab, key: getActionItemKey(item, index, tab, rowKey) });
      });
    };

    collectOverallKeys("overall_ai", overallAi);
    collectOverallKeys("overall_rag", overallRag);
    keys.push({ tab: "mt799_ai", key: getMt799Key("MT799 (AI)") });
    keys.push({ tab: "mt799_rag", key: getMt799Key("MT799 (RAG)") });

    return keys;
  }, [analysis, ownCures, crossCures, multihopCures, overallAi, overallRag, selectedRow, pipelineResult]);

  // }, [analysis, ownCures, crossCures, mocCures, multihopCures, overallAi, overallRag, selectedRow, pipelineResult]);

  const decidedCheckboxCount = useMemo(
    () =>
      allDecisionKeysForPreview.filter(
        ({ tab, key }) =>
          decisionByTab[tab]?.[key] === "APPROVE" || decisionByTab[tab]?.[key] === "REJECT"
      ).length,
    [allDecisionKeysForPreview, decisionByTab]
  );
  const totalCheckboxCountForPreview = allDecisionKeysForPreview.length;
  const canOpenPreview =
    totalCheckboxCountForPreview > 0 && decidedCheckboxCount === totalCheckboxCountForPreview;

  const tabResultFns = createTabResultFunctions({
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
  });

  const renderCureListForUIView = (
    items: CureItem[],
    emptyText: string,
    title?: string,
    tab?: CureTab
  ) => {
    if (!tab) {
      return <div className="text-sm opacity-70">{emptyText}</div>;
    }
    return tabResultFns.renderCureList(items, emptyText, title, tab);
  };

  const ownCureItems = ownCures as CureItem[];
  const crossCureItems = crossCures as CureItem[];
  // const mocCureItems = mocCures as CureItem[];
  const multihopCureItems = multihopCures as CureItem[];

  const approvedPreviewData = getApprovedPreviewAndPdfData();

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="card md:p-5">
      <h1 className="font-bold text-xl">Trade Finance Discrepancy Cure Solution</h1>

      <div className="my-5">
        <Tabs defaultValue={1} className="">
          <TabPanel value={1}>
            <div className="flex flexgap-5-col">
              <div className="card px-4 w-full">
                

                {err && (
                  <div className="rounded border border-red-400 p-2 text-sm text-red-700 mb-3">
                    {err}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-1 lg:grid-cols-1 gap-4">
                  <h3 className="card-title text-sm md:text-xl my-5">
                    Select a pending Cure row to process
                  </h3>

                  {loading ? (
                    <div className="text-sm opacity-70">Loading pending rows...</div>
                  ) : pendingRows.length === 0 ? (
                    <div className="text-sm opacity-70">
                      No pending rows available.
                    </div>
                  ) : (
                    <Select onValueChange={setSelectedId} value={selectedId ?? ""}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="-- Select --" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((o) => (
                          <SelectItem key={o.id} value={String(o.id)}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="card p-4">
                      <h3 className="card-title text-sm md:text-lg mb-3">
                        Selected Row Details
                      </h3>
                      {!selectedRow ? (
                        <div className="text-sm opacity-70">Select a row to view details.</div>
                      ) : (
                        <div className="card-table scrollable-x-auto">
                          <table className="table align-middle text-gray-700 font-medium text-sm">
                            <tbody className="fw-semibold text-gray-600">
                              {[
                                { label: "id", value: selectedRow.id },
                                { label: "transaction_no", value: selectedRow.transaction_no },
                                { label: "lc_number", value: selectedRow.lc_number },
                                { label: "cifno", value: selectedRow.cifno },
                                {
                                  label: "status",
                                  value: selectedRow.Status ?? selectedRow.status,
                                },
                              ].map((row, index) => (
                                <tr
                                  key={row.label}
                                  className={`h-12 ${
                                    index % 2 === 0 ? "" : "bg-gray-100"
                                  } hover:bg-gray-100`}
                                >
                                  <td className="fw-bold opacity-70">{row.label}</td>
                                  <td className="text-end font-semibold">{fmt(row.value)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="card p-4">
                      <div className="card-title text-sm md:text-lg mb-3">Payload Summary</div>
                      {!selectedRow ? (
                        <div className="text-sm opacity-70">
                          Select a row to view payload summary.
                        </div>
                      ) : summaryLoading ? (
                        <div className="text-sm">Loading summary...</div>
                      ) : !payloadSummary ? (
                        <div className="text-sm opacity-70">No summary available.</div>
                      ) : (
                        <div className="overflow-auto">
                          <table className="table align-middle text-gray-700 font-medium text-sm min-w-full">
                            <thead className="h-12">
                              <tr>
                                <th className="text-left">Metric</th>
                                <th className="text-right">Value</th>
                              </tr>
                            </thead>
                            <tbody className="fw-semibold text-gray-600">
                              {Object.entries(payloadSummary.summary ?? {}).map(([k, v], i) => (
                                <tr
                                  key={k}
                                  className={`h-12 ${
                                    i % 2 === 0 ? "" : "bg-gray-100"
                                  } hover:bg-gray-100`}
                                >
                                  <td className="text-left">{k}</td>
                                  <td className="text-right font-semibold">{fmt(v)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="my-4 flex flex-wrap justify-end gap-2">
                    <button
                      className="btn btn-primary text-sm font-semibold flex items-center gap-2"
                      disabled={
                        !selectedRow?.id ||
                        (runPipelineLoading ?? false) ||
                        (!!payloadSummary && (hasBlockingMissing ?? false)) ||
                        !cangenerateCure
                      }
                      onClick={handleRunFullPipeline}
                    >
                      {runPipelineLoading ? (
                        <span className="animate-spin inline-block h-5 w-5 rounded-full border-4 border-white/80 border-t-transparent" />
                      ) : null}
                      <span>
                        {runPipelineLoading
                          ? "Loading"
                          : "Run Full Cure Pipeline for pending database"}
                      </span>
                    </button>
                  </div>

                  {renderPipelineLiveCard()}
                </div>
              </div>
            </div>
          </TabPanel>
        </Tabs>
      </div>

      {/* Analysis Result */}
      <CureUIView
        openViewStatus={openViewStatus}
        onPreview={() => {
          if (!canOpenPreview) {
            toast.info("Complete all checkbox decisions first", {
              description: `Decided ${decidedCheckboxCount}/${totalCheckboxCountForPreview} checkbox items.`,
            });
            return;
          }
          setPreviewOpen(true);
        }}
        onDownloadPdf={generatePDF}
        canOpenPreview={canOpenPreview}
        decidedCheckboxCount={decidedCheckboxCount}
        totalCheckboxCountForPreview={totalCheckboxCountForPreview}
        showEmailForm={showEmailForm}
        onCloseEmailForm={() => {
          setShowEmailForm(false);
          setEmailAttachmentFile(null);
        }}
        emailDefaultSubject={emailDefaultSubject}
        selectedRow={selectedRow}
        emailDefaultBody={emailDefaultBody}
        emailAttachmentFile={emailAttachmentFile}
        resultsLoaded={resultsLoaded}
        selectedCount={selectedCount}
        canapprove={canapprove}
        canreject={canreject}
        openModal={openModal}
        renderCureList={renderCureListForUIView}
        ownCures={ownCureItems}
        crossCures={crossCureItems}
        // mocCures={mocCureItems}
        multihopCures={multihopCureItems}
        renderOverallCure={tabResultFns.renderOverallCure}
        overallAi={overallAi}
        overallRag={overallRag}
        analysis={analysis}
        renderMt799Card={tabResultFns.renderMt799Card}
        mt799Ai={mt799Ai}
        mt799Rag={mt799Rag}
        pipelineCompleteForSelectedRow={pipelineCompleteForSelectedRow}
        renderDuplicateAnalysis={tabResultFns.renderDuplicateAnalysis}
        handleExportAllResults={handleExportAllResults}
        pipelineResult={pipelineResult}
        viewStatus={viewStatus}
        onCloseViewStatus={() => {
          setViewStatus(null);
          setViewRows([]);
          setViewErr(null);
        }}
        viewLoading={viewLoading}
        viewErr={viewErr}
        viewRows={viewRows}
      />

      <ComposeEmail open={composeOpen} onClose={() => setComposeOpen(false)} />

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999]">
          <div className="card shadow-lg w-[420px] p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-3">Confirm approve</h3>
            <p className="text-gray-600 mb-5">
              Are you sure you want to {modalAction}
              <span className="font-semibold text-primary mx-1">{selectedRowsCount}</span>
              row(s)?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={closeModal} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleConfirmAction} className="btn btn-primary">
                {modalAction}
              </button>
            </div>
          </div>
        </div>
      )}

      <CurePreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        pipelineResult={pipelineResult}
        selectedRow={selectedRow}
        mt799Ai={approvedPreviewData.mt799Ai}
        mt799Rag={approvedPreviewData.mt799Rag}
        ownCures={approvedPreviewData.ownCures ?? []}
        crossCures={approvedPreviewData.crossCures ?? []}
        // mocCures={approvedPreviewData.mocCures ?? []}
        multihopCures={approvedPreviewData.multihopCures ?? []}
        overallAi={approvedPreviewData.overallAi ?? {}}
        overallRag={approvedPreviewData.overallRag ?? {}}
        onEmail={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPreviewOpen(false);
          openEmailWithGeneratedPdf();
        }}
      />
    </div>
  );
};

export default Cure;
