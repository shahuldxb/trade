import sql from "mssql";
import jwt from "jsonwebtoken";

import { logger } from "./db";

const ERROR_LOG_DATABASE = process.env.ERROR_LOG_DATABASE || process.env.DB_NAME;

let errorLogPool: sql.ConnectionPool | null = null;
let tableEnsured = false;

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "authorization",
  "access_token",
  "refresh_token",
]);

type ErrorLogEntry = {
  user_id?: string | number | null;
  module_name?: string | null;
  function_name?: string | null;
  error_code?: string | null;
  error_message: string;
  error_type?: string | null;
  severity?: string | null;
  asset_id?: string | number | null;
  request_payload?: unknown;
  response_payload?: unknown;
  status?: string | null;
  resolved_by?: string | null;
  resolved_at?: Date | null;
  remarks?: string | null;
};

function buildErrorLogConfig(): sql.config {
  return {
    server: process.env.DB_SERVER!,
    port: Number(process.env.DB_PORT ?? 1433),
    database: ERROR_LOG_DATABASE!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    options: {
      encrypt: process.env.DB_ENCRYPT === "true",
      trustServerCertificate: process.env.DB_TRUST_CERT === "true",
      connectTimeout: 30000,
      requestTimeout: 30000,
      enableArithAbort: true,
    },
    pool: {
      max: Number(process.env.DB_POOL_MAX ?? 5),
      min: Number(process.env.DB_POOL_MIN ?? 0),
      idleTimeoutMillis: Number(process.env.DB_POOL_IDLE ?? 30000),
    },
  };
}

async function getErrorLogPool(): Promise<sql.ConnectionPool> {
  if (errorLogPool) {
    return errorLogPool;
  }

  errorLogPool = new sql.ConnectionPool(buildErrorLogConfig());
  await errorLogPool.connect();
  return errorLogPool;
}

function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text || null;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        SENSITIVE_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : redact(nestedValue),
      ]),
    );
  }

  return value;
}

function serializePayload(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const decoded = jwt.decode(token);
    return decoded && typeof decoded === "object" ? (decoded as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function deriveRequestContext(req: any) {
  const body = req?.body && typeof req.body === "object" ? req.body : {};
  const params = req?.params ?? {};
  const query = req?.query ?? {};
  const authHeader = req?.headers?.authorization || req?.headers?.Authorization;
  const jwtPayload =
    typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")
      ? decodeJwtPayload(authHeader.slice(7))
      : {};

  const path = req?.originalUrl || req?.path || "";
  const pathParts = String(path)
    .split("?")[0]
    .split("/")
    .filter((part: string) => part && part.toLowerCase() !== "api");

  return {
    user_id:
      body.user_id ??
      body.UserID ??
      req?.headers?.["x-user-id"] ??
      jwtPayload.UserID ??
      jwtPayload.user_id ??
      null,
    module_name: pathParts[0] || "node",
    function_name: `${req?.method || "REQUEST"} ${path}`.slice(0, 100),
    asset_id:
      params.asset_id ??
      query.asset_id ??
      body.asset_id ??
      params.doc_id ??
      query.doc_id ??
      body.doc_id ??
      params.id ??
      query.id ??
      body.id ??
      null,
    request_payload: redact({
      params,
      query,
      body,
    }),
  };
}

export async function ensureErrorLogTable(): Promise<void> {
  if (tableEnsured) {
    return;
  }

  tableEnsured = true;
}

export async function logApplicationError(entry: ErrorLogEntry): Promise<void> {
  try {
    await ensureErrorLogTable();
    const pool = await getErrorLogPool();
    const request = pool.request();

    request.input("user_id", sql.VarChar(50), normalizeText(entry.user_id));
    request.input("module_name", sql.VarChar(100), normalizeText(entry.module_name));
    request.input("function_name", sql.VarChar(100), normalizeText(entry.function_name));
    request.input("error_code", sql.VarChar(50), normalizeText(entry.error_code));
    request.input("error_message", sql.NVarChar(sql.MAX), normalizeText(entry.error_message));
    request.input("error_type", sql.VarChar(50), normalizeText(entry.error_type));
    request.input("severity", sql.VarChar(20), normalizeText(entry.severity) || "HIGH");
    request.input("asset_id", sql.VarChar(100), normalizeText(entry.asset_id));
    request.input("request_payload", sql.NVarChar(sql.MAX), serializePayload(entry.request_payload));
    request.input("response_payload", sql.NVarChar(sql.MAX), serializePayload(entry.response_payload));
    request.input("status", sql.VarChar(20), normalizeText(entry.status) || "OPEN");
    request.input("resolved_by", sql.VarChar(50), normalizeText(entry.resolved_by));
    request.input("resolved_at", sql.DateTime, entry.resolved_at ?? null);
    request.input("remarks", sql.NVarChar(sql.MAX), normalizeText(entry.remarks));

    await request.execute("dbo.sp_InsertErrorLog");
  } catch (error) {
    logger.error("Failed to write application error log", {
      message: error instanceof Error ? error.message : String(error),
      originalEntry: {
        ...entry,
        request_payload: serializePayload(entry.request_payload),
        response_payload: serializePayload(entry.response_payload),
      },
    });
  }
}
