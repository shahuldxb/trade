"""
Audit middleware for FastAPI - logs request/response metadata for auditing purposes.
"""
import time
import uuid
from fastapi import Request
from loguru import logger


async def audit_middleware(request: Request, call_next):
    """
    Middleware that attaches audit context to each request and logs
    request/response details for compliance and auditing.
    """
    request_id = str(uuid.uuid4())
    start_time = time.time()

    # Extract user identity from headers
    user_id = (
        request.headers.get("X-User-Id")
        or request.headers.get("x-user-id")
        or request.query_params.get("user_id")
        or "ANONYMOUS"
    )
    session_id = request.headers.get("x-session-id") or request.headers.get("X-Session-Id")
    asset_id = request.headers.get("X-Asset-Id") or request.headers.get("x-asset-id")

    # Attach audit context to request state
    request.state.audit = {
        "request_id": request_id,
        "UserID": user_id,
        "user_id": user_id,
        "session_id": session_id,
        "asset_id": asset_id,
        "method": request.method,
        "path": request.url.path,
        "timestamp": start_time,
    }

    try:
        response = await call_next(request)
        duration_ms = round((time.time() - start_time) * 1000, 2)

        logger.info(
            f"AUDIT | {request.method} {request.url.path} | "
            f"status={response.status_code} | user={user_id} | "
            f"duration={duration_ms}ms | req_id={request_id}"
        )
        return response

    except Exception as exc:
        duration_ms = round((time.time() - start_time) * 1000, 2)
        logger.error(
            f"AUDIT ERROR | {request.method} {request.url.path} | "
            f"error={str(exc)} | user={user_id} | "
            f"duration={duration_ms}ms | req_id={request_id}"
        )
        raise
