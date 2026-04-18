import type { Request } from "express";
import sql from "mssql";
import { getPool } from "./db";

export type ErrorSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ErrorLogRecord = {
  id: number;
  timestamp: string;
  user_id: string | null;
  module_name: string | null;
  function_name: string | null;
  error_code: string | null;
  error_message: string | null;
  error_type: string | null;
  severity: string | null;
  asset_id: string | null;
  request_payload: string | null;
  response_payload: string | null;
  status: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  remarks: string | null;
};

export type CreateErrorLogInput = {
  user_id?: string | null;
  module_name?: string | null;
  function_name?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  error_type?: string | null;
  severity?: ErrorSeverity | string | null;
  asset_id?: string | null;
  request_payload?: string | null;
  response_payload?: string | null;
  status?: string | null;
  resolved_by?: string | null;
  resolved_at?: Date | string | null;
  remarks?: string | null;
};


function cleanText(value: unknown, maxLength = 4000): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function safeJson(value: unknown, maxLength = 16000): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return cleanText(text, maxLength);
  } catch {
    return cleanText(String(value), maxLength);
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getErrorType(error: unknown): string {
  if (error instanceof Error) {
    return error.name || "Error";
  }

  return typeof error;
}

export async function insertErrorLog(input: CreateErrorLogInput): Promise<void> {
  const pool = await getPool();
  const request = pool.request();

  request.input("user_id", sql.VarChar(50), cleanText(input.user_id, 50));
  request.input("module_name", sql.VarChar(100), cleanText(input.module_name, 100));
  request.input("function_name", sql.VarChar(100), cleanText(input.function_name, 100));
  request.input("error_code", sql.VarChar(50), cleanText(input.error_code, 50));
  request.input("error_message", sql.NVarChar(sql.MAX), cleanText(input.error_message, 32000));
  request.input("error_type", sql.VarChar(50), cleanText(input.error_type, 50));
  request.input("severity", sql.VarChar(20), cleanText(input.severity ?? "HIGH", 20));
  request.input("asset_id", sql.VarChar(100), cleanText(input.asset_id, 100));
  request.input("request_payload", sql.NVarChar(sql.MAX), cleanText(input.request_payload, 32000));
  request.input("response_payload", sql.NVarChar(sql.MAX), cleanText(input.response_payload, 32000));
  request.input("status", sql.VarChar(20), cleanText(input.status ?? "OPEN", 20));
  request.input("resolved_by", sql.VarChar(50), cleanText(input.resolved_by, 50));
  request.input(
    "resolved_at",
    sql.DateTime,
    input.resolved_at ? new Date(input.resolved_at) : null,
  );
  request.input("remarks", sql.NVarChar(sql.MAX), cleanText(input.remarks, 32000));

  await request.execute("dbo.sp_InsertErrorLog");
}

export async function getErrorLogs(limit = 200): Promise<ErrorLogRecord[]> {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 1000) : 200;
  const pool = await getPool();
  const request = pool.request();
  request.input("limit", sql.Int, safeLimit);

  const result = await request.query<ErrorLogRecord>(`
    SELECT TOP (@limit)
      id,
      [timestamp],
      user_id,
      module_name,
      function_name,
      error_code,
      error_message,
      error_type,
      severity,
      asset_id,
      request_payload,
      response_payload,
      [status],
      resolved_by,
      resolved_at,
      remarks
    FROM dbo.error_logs
    ORDER BY id DESC
  `);

  return result.recordset;
}

export function buildExpressErrorLog(req: Request, error: unknown): CreateErrorLogInput {
  const requestBody =
    req.body && typeof req.body === "object"
      ? safeJson(req.body)
      : cleanText(req.body, 32000);

  return {
    user_id: cleanText(req.header("X-User-Id"), 50),
    module_name: "node-api",
    function_name: cleanText(`${req.method} ${req.originalUrl || req.path}`, 100),
    error_code: cleanText((error as { code?: unknown })?.code, 50),
    error_message: cleanText(getErrorMessage(error), 32000),
    error_type: cleanText(getErrorType(error), 50),
    severity: "HIGH",
    asset_id: cleanText(req.header("X-Asset-Id") ?? req.body?.asset_id ?? req.body?.assetId, 100),
    request_payload: requestBody,
    response_payload: null,
    status: "OPEN",
    remarks: cleanText((error as Error)?.stack, 32000),
  };
}

export function buildProcessErrorLog(source: string, error: unknown): CreateErrorLogInput {
  return {
    module_name: "node-process",
    function_name: cleanText(source, 100),
    error_code: cleanText((error as { code?: unknown })?.code, 50),
    error_message: cleanText(getErrorMessage(error), 32000),
    error_type: cleanText(getErrorType(error), 50),
    severity: "CRITICAL",
    status: "OPEN",
    remarks: cleanText((error as Error)?.stack, 32000),
  };
}
