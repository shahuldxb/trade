

const safeGet = (obj: Record<string, unknown>, key: string): unknown =>
  Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;


const enc = (s: string): string => encodeURIComponent(s);

// ── Exports ───────────────────────────────────────────────────────────────────


export const normalizeActionItems = (raw: unknown, depth = 0): unknown[] => {
  if (!raw) return [];

  if (depth > 1) {
    return typeof raw === "string" && raw.trim() ? [raw] : [];
  }

  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      // Only recurse if the parsed result is a non-primitive (object / array).
      // Parsing a string like `"hello"` yields a string — do not re-enter.
      if (parsed !== null && typeof parsed === "object") {
        return normalizeActionItems(parsed, depth + 1);
      }
    } catch {
      // Not valid JSON — keep as a raw single-item string.
    }
    return raw.trim() ? [raw] : [];
  }

  if (Array.isArray(raw)) return raw;

  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;

    // FIX (High): use safeGet to avoid reading prototype-polluted properties
    const maybeArr =
      safeGet(obj, "action_items") ??
      safeGet(obj, "items") ??
      safeGet(obj, "actions") ??
      safeGet(obj, "actionItems");

    if (Array.isArray(maybeArr)) return maybeArr;

    // Wrap the object itself only if it has own enumerable keys
    return Object.keys(obj).length ? [obj] : [];
  }

  return [];
};

export const getCureKey = (
  item: unknown,
  index: number,
  source: string
): string => {
  // FIX (Low): guard before accessing object properties
  if (item == null || typeof item !== "object" || Array.isArray(item)) {
    return `${source}|idx|${index}`;
  }

  const obj = item as Record<string, unknown>;

  // FIX (High): use safeGet to prevent prototype-polluted key reads
  const discId = safeGet(obj, "discrepancy_id") ?? safeGet(obj, "cure_id");

  if (discId != null && String(discId).trim() !== "") {
    // FIX (Medium): include source in ID-based key to prevent cross-source collision
    return `${source}|id|${String(discId)}`;
  }

  return `${source}|idx|${index}`;
};

export const getRowKey = (
  selectedRow: unknown,
  pipelineResult: unknown
): string => {
  const row =
    selectedRow != null && typeof selectedRow === "object"
      ? (selectedRow as Record<string, unknown>)
      : {};

  const snap =
    pipelineResult != null &&
    typeof pipelineResult === "object" &&
    (pipelineResult as Record<string, unknown>).snapshot != null &&
    typeof (pipelineResult as Record<string, unknown>).snapshot === "object"
      ? ((pipelineResult as Record<string, unknown>).snapshot as Record<
          string,
          unknown
        >)
      : {};

  // FIX (High): use safeGet to avoid prototype-polluted reads
  const key =
    safeGet(row, "transaction_no") ??
    safeGet(row, "id") ??
    safeGet(snap, "transaction_no") ??
    safeGet(snap, "row_id");

  if (key == null || String(key).trim() === "") {
    // FIX (Medium): unique fallback — never the static literal "unknown"
    console.warn(
      "[cureResultHelpers] getRowKey: no identifier found on selectedRow or pipelineResult — using timestamp fallback"
    );
    return `unknown-${Date.now()}`;
  }

  return String(key);
};

export const getActionItemKey = (
  item: unknown,
  index: number,
  tab: string,
  rowKey: string
): string => {
  // FIX (Low): explicit type guard before property access
  const obj =
    item != null && typeof item === "object" && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : {};

  // FIX (High): use safeGet to prevent prototype-polluted reads
  const actionId =
    safeGet(obj, "cure_id") ?? safeGet(obj, "discrepancy_id") ?? index;

  // FIX (Medium): encode every segment so pipe chars inside values are safe
  return `overall|${enc(tab)}|action|${enc(rowKey)}|${enc(String(actionId))}`;
};


export const getOverallActionItems = (
  overall: unknown,
  cure: unknown,
  isObject: boolean
): unknown => {
  // FIX (Low): validate each input is actually a plain object before reading
  const c: Record<string, unknown> | null =
    isObject && cure != null && typeof cure === "object" && !Array.isArray(cure)
      ? (cure as Record<string, unknown>)
      : null;

  const o: Record<string, unknown> | null =
    overall != null && typeof overall === "object" && !Array.isArray(overall)
      ? (overall as Record<string, unknown>)
      : null;

  // FIX (Low): guard overall.cure access with own-property check
  const oCureRaw = o != null ? safeGet(o, "cure") : undefined;
  const oc: Record<string, unknown> | null =
    oCureRaw != null &&
    typeof oCureRaw === "object" &&
    !Array.isArray(oCureRaw)
      ? (oCureRaw as Record<string, unknown>)
      : null;

  // FIX (High): all property reads use safeGet — prototype pollution safe
  return (
    (c != null ? safeGet(c, "action_items") : undefined) ??
    (c != null ? safeGet(c, "actionItems") : undefined) ??
    (c != null ? safeGet(c, "actions") : undefined) ??
    (o != null ? safeGet(o, "action_items") : undefined) ??
    (o != null ? safeGet(o, "actionItems") : undefined) ??
    (o != null ? safeGet(o, "actions") : undefined) ??
    (oc != null ? safeGet(oc, "action_items") : undefined) ??
    (oc != null ? safeGet(oc, "actionItems") : undefined) ??
    (oc != null ? safeGet(oc, "actions") : undefined) ??
    null
  );
};
