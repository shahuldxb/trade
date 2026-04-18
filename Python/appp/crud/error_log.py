import json
import sys
import threading
import traceback
from typing import Any

from loguru import logger

from core.db import get_connection


def ensure_error_log_table() -> None:
    return None


def _normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        return text or None
    return str(value)


def _serialize_payload(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        return str(value)


def insert_error_log(entry: dict[str, Any]) -> None:
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                EXEC dbo.sp_InsertErrorLog
                    @user_id = ?,
                    @module_name = ?,
                    @function_name = ?,
                    @error_code = ?,
                    @error_message = ?,
                    @error_type = ?,
                    @severity = ?,
                    @asset_id = ?,
                    @request_payload = ?,
                    @response_payload = ?,
                    @status = ?,
                    @resolved_by = ?,
                    @resolved_at = ?,
                    @remarks = ?
                """,
                (
                    _normalize_text(entry.get("user_id")),
                    _normalize_text(entry.get("module_name")),
                    _normalize_text(entry.get("function_name")),
                    _normalize_text(entry.get("error_code")),
                    _normalize_text(entry.get("error_message")),
                    _normalize_text(entry.get("error_type")),
                    _normalize_text(entry.get("severity")) or "HIGH",
                    _normalize_text(entry.get("asset_id")),
                    _serialize_payload(entry.get("request_payload")),
                    _serialize_payload(entry.get("response_payload")),
                    _normalize_text(entry.get("status")) or "OPEN",
                    _normalize_text(entry.get("resolved_by")),
                    entry.get("resolved_at"),
                    _normalize_text(entry.get("remarks")),
                ),
            )
            conn.commit()
    except Exception:
        print("Failed to insert application error log", file=sys.stderr)
        traceback.print_exc()


def write_application_error_log(
    *,
    user_id: Any = None,
    module_name: Any = None,
    function_name: Any = None,
    error_code: Any = None,
    error_message: Any = None,
    error_type: Any = None,
    severity: Any = "HIGH",
    asset_id: Any = None,
    request_payload: Any = None,
    response_payload: Any = None,
    status: Any = "OPEN",
    resolved_by: Any = None,
    resolved_at: Any = None,
    remarks: Any = None,
) -> None:
    insert_error_log(
        {
            "user_id": user_id,
            "module_name": module_name,
            "function_name": function_name,
            "error_code": error_code,
            "error_message": error_message,
            "error_type": error_type,
            "severity": severity,
            "asset_id": asset_id,
            "request_payload": request_payload,
            "response_payload": response_payload,
            "status": status,
            "resolved_by": resolved_by,
            "resolved_at": resolved_at,
            "remarks": remarks,
        }
    )


def write_error_log(case_id, doc_id, step, error, stack_trace=None, details=None):
    stack_value = stack_trace if stack_trace is not None else traceback.format_exc()
    extra = details or {}
    remarks_parts = []

    if case_id:
        remarks_parts.append(f"case_id={case_id}")
    if stack_value and stack_value.strip():
        remarks_parts.append(stack_value)
    if extra.get("remarks"):
        remarks_parts.append(str(extra["remarks"]))

    insert_error_log(
        {
            "user_id": extra.get("user_id"),
            "module_name": extra.get("module_name") or "PYTHON",
            "function_name": step,
            "error_code": extra.get("error_code") or type(error).__name__,
            "error_message": str(error),
            "error_type": extra.get("error_type") or type(error).__name__,
            "severity": extra.get("severity") or "HIGH",
            "asset_id": extra.get("asset_id") or doc_id,
            "request_payload": extra.get("request_payload"),
            "response_payload": extra.get("response_payload"),
            "status": extra.get("status") or "OPEN",
            "resolved_by": extra.get("resolved_by"),
            "resolved_at": extra.get("resolved_at"),
            "remarks": "\n\n".join(part for part in remarks_parts if part),
        }
    )


def install_global_error_hooks() -> None:
    def _write_uncaught_error(error: BaseException, origin: str) -> None:
        try:
            write_application_error_log(
                module_name="python-runtime",
                function_name=origin,
                error_code=type(error).__name__,
                error_message=str(error),
                error_type=type(error).__name__,
                severity="CRITICAL",
                remarks="".join(
                    traceback.format_exception(type(error), error, error.__traceback__)
                ),
            )
        except Exception:
            print(f"Failed to persist uncaught runtime error from {origin}", file=sys.stderr)
            traceback.print_exc()

    def _sys_excepthook(exc_type, exc_value, exc_traceback):
        if issubclass(exc_type, KeyboardInterrupt):
            return sys.__excepthook__(exc_type, exc_value, exc_traceback)
        _write_uncaught_error(
            exc_value,
            "sys.excepthook",
        )
        sys.__excepthook__(exc_type, exc_value, exc_traceback)

    def _threading_excepthook(args):
        _write_uncaught_error(
            args.exc_value,
            f"threading.excepthook:{getattr(args.thread, 'name', 'unknown')}",
        )
        if hasattr(threading, "__excepthook__"):
            threading.__excepthook__(args)

    sys.excepthook = _sys_excepthook
    if hasattr(threading, "excepthook"):
        threading.excepthook = _threading_excepthook
