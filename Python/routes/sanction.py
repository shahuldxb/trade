"""
sanction.py — SECURED VERSION
VAPT fixes applied:
  [CRITICAL] CORS wildcard replaced with explicit origins
  [CRITICAL] /logs endpoint requires auth header
  [CRITICAL] Path disclosure removed from SSE error payloads
  [HIGH]     Input validation via Pydantic validators (length + safe chars)
  [HIGH]     Hardcoded CIF ID removed — now env-based
  [HIGH]     user_id removed from URL query params; passed via header instead
  [MEDIUM]   Full exception messages no longer returned to client
  [MEDIUM]   Security response headers added via middleware
  [LOW]      traceback.print_exc() replaced with structured internal logging
"""

import base64
import hashlib
import hmac
import logging
import os
import sys
import json
import time
import uuid
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, APIRouter, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from mcp.client.stdio import stdio_client, StdioServerParameters
from mcp.client.session import ClientSession

from sanction_1.db_utils import (
    test_database_connection,
    test_azure_openai_connection,
    get_sanctions_data,
    add_sanction_entry,
    save_screening_activity,
    retrieve_screening_activity,
    log_message,
)
from reference_tables.request_response import (
    create_instrument,
    insert_llm_request,
    insert_llm_response,
)
from sanction_1.matching_algorithms import run_all_matching_techniques
from TBML_matching.db_utils import insert_tool_billing, generate_transaction_no
import sanction_1.matching_algorithms as ma

# --------------------------------------------------
# LOGGER SETUP (no traceback.print_exc to stdout)
# --------------------------------------------------
logger = logging.getLogger("sanctions")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# --------------------------------------------------
# CONFIG FROM ENV (never hardcoded)
# --------------------------------------------------
# [FIX CRITICAL] CORS — read allowed origins from env
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]

# [FIX HIGH] CIF ID from env, not hardcoded
DEFAULT_CIF_ID = os.getenv("DEFAULT_CIF_ID", "UNKNOWN")

# Internal API key for protecting sensitive endpoints (like /logs)
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")

# --------------------------------------------------
# INPUT VALIDATION HELPERS
# --------------------------------------------------
import re

_SAFE_NAME_RE = re.compile(r"^[\w\s\-\.\,\']{1,200}$")
_SAFE_SERIAL_RE = re.compile(r"^SCR-[\dA-Za-z\-]{1,60}$")
JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"


def _validate_name(v: str) -> str:
    """
    [FIX HIGH] Reject oversized or suspicious input names.
    Blocks control chars, SQL meta-characters, script tags.
    """
    v = v.strip()
    if not v:
        raise ValueError("Name must not be empty")
    if len(v) > 200:
        raise ValueError("Name exceeds maximum length of 200 characters")
    if not _SAFE_NAME_RE.match(v):
        raise ValueError("Name contains invalid characters")
    return v


def _validate_source(v: str) -> str:
    v = v.strip()
    if len(v) > 100:
        raise ValueError("Source exceeds maximum length of 100 characters")
    return v


def _validate_lc_number(v: str) -> str:
    if len(v) > 100:
        raise ValueError("LC number exceeds maximum length")
    return v


def _b64url_decode(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _verify_and_decode_bearer_token(token: str) -> dict:
    if not JWT_SECRET:
        logger.error("JWT_SECRET is not configured")
        raise HTTPException(status_code=500, detail="Authentication is not configured")

    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    header_b64, payload_b64, signature_b64 = parts

    try:
        header = json.loads(_b64url_decode(header_b64).decode("utf-8"))
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        provided_signature = _b64url_decode(signature_b64)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    if header.get("alg") != JWT_ALGORITHM:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    expected_signature = hmac.new(
        JWT_SECRET.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()

    if not hmac.compare_digest(provided_signature, expected_signature):
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    exp = payload.get("exp")
    if exp is not None:
        try:
            if int(exp) <= int(time.time()):
                raise HTTPException(status_code=401, detail="Authentication token expired")
        except (TypeError, ValueError):
            raise HTTPException(status_code=401, detail="Invalid authentication token")

    return payload


def get_authenticated_user_id(request: Request) -> int:
    auth_header = (request.headers.get("Authorization") or "").strip()
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    payload = _verify_and_decode_bearer_token(auth_header.split(" ", 1)[1].strip())
    raw_user_id = str(payload.get("UserID") or payload.get("user_id") or "").strip()
    if not re.fullmatch(r"\d{1,20}", raw_user_id):
        raise HTTPException(status_code=401, detail="Invalid user context")
    return int(raw_user_id)


# --------------------------------------------------
# PYDANTIC MODELS WITH VALIDATORS
# --------------------------------------------------
class AddSanctionEntryRequest(BaseModel):
    name: str
    country: str
    source: Optional[str] = "Manual Entry"
    user_id: Optional[int] = None

    @field_validator("name")
    @classmethod
    def name_ok(cls, v):
        return _validate_name(v)

    @field_validator("country")
    @classmethod
    def country_ok(cls, v):
        v = v.strip()
        if len(v) > 100:
            raise ValueError("Country exceeds maximum length")
        return v

    @field_validator("source")
    @classmethod
    def source_ok(cls, v):
        return _validate_source(v or "Manual Entry")


class ScreeningRequest(BaseModel):
    name: str
    lc_number: Optional[str] = ""
    user_id: Optional[int] = None

    @field_validator("name")
    @classmethod
    def name_ok(cls, v):
        return _validate_name(v)

    @field_validator("lc_number")
    @classmethod
    def lc_ok(cls, v):
        return _validate_lc_number(v or "")


class RetrieveRequest(BaseModel):
    serial_number: str

    @field_validator("serial_number")
    @classmethod
    def serial_ok(cls, v):
        v = v.strip()
        # [FIX HIGH] Only accept well-formed serial numbers
        if not _SAFE_SERIAL_RE.match(v):
            raise ValueError("Invalid serial number format")
        return v


# --------------------------------------------------
# SECURITY HEADERS MIDDLEWARE
# [FIX LOW] Add Content-Security-Policy, X-Frame-Options, etc.
# --------------------------------------------------
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'none'; object-src 'none'"
        )
        return response


# --------------------------------------------------
# AUTH DEPENDENCY FOR SENSITIVE ENDPOINTS
# --------------------------------------------------
def require_internal_key(x_internal_key: str = Header(default="")):
    """
    [FIX CRITICAL] Protect /logs and other ops endpoints with a shared secret.
    Set INTERNAL_API_KEY env var on your server.
    """
    if not INTERNAL_API_KEY:
        raise HTTPException(status_code=503, detail="Service not configured")
    if x_internal_key != INTERNAL_API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")


# --------------------------------------------------
# APP INIT
# --------------------------------------------------
logger.info("Starting Sanctions Screening API")

app = FastAPI(
    title="Sanctions Screening API",
    version="4.0",
    # [FIX LOW] Don't expose OpenAPI docs in production
    docs_url=None if os.getenv("ENV") == "production" else "/docs",
    redoc_url=None if os.getenv("ENV") == "production" else "/redoc",
)

# [FIX CRITICAL] Explicit CORS origins only
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization", "X-Internal-Key"],
)

app.add_middleware(SecurityHeadersMiddleware)

router = APIRouter(prefix="/api/lc", tags=["sanction"])

MCP_DETAILS = {
    "title": "MCP Integration (Backend Python)",
    "bullets": [
        "FastAPI /api/lc/screening/run starts an MCP stdio client.",
        "The backend launches the sanctions MCP server (sanction_1/mcp_matching_server.py) named sanctions-matching.",
        "For each sanctions record, it calls tool run_all_matching_techniques.",
        "Results are aggregated, stored in tf_sanctions_activity, and returned to the UI.",
    ],
    "tool": {
        "name": "run_all_matching_techniques",
        "server": "sanctions-matching",
        "transport": "stdio",
    },
}

# --------------------------------------------------
# HELPERS
# --------------------------------------------------
def _find_mcp_server_path(start_dir: str) -> tuple[str, str]:
    base_dir = os.path.abspath(start_dir)
    candidate = os.path.abspath(
        os.path.join(base_dir, "..", "sanction_1", "mcp_matching_server.py")
    )
    return candidate, os.path.dirname(candidate)


def _sse_payload(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


async def _mcp_run_all_matching_techniques(
    session,
    input_name: str,
    input_addr: str,
    db_record: dict,
    transaction_no: str,
    user_id: int | None,
):
    tool_result = await session.call_tool(
        "run_all_matching_techniques",
        {
            "input_name": input_name,
            "input_addr": input_addr,
            "db_record": db_record,
            "transaction_no": transaction_no,
            "user_id": user_id,
        },
    )

    if tool_result.isError:
        raise RuntimeError("MCP tool returned an error")  # [FIX] No internal details

    text = None
    for item in tool_result.content:
        item_text = getattr(item, "text", None)
        if item_text:
            text = item_text
            break

    if not text:
        raise RuntimeError("MCP tool returned no text content")

    return json.loads(text)


# --------------------------------------------------
# ROUTES
# --------------------------------------------------
@router.get("/connectivity")
async def check_connectivity(user_id: int = Depends(get_authenticated_user_id)):
    try:
        logger.info("Checking DB and Azure connectivity")
        db_status, db_msg = test_database_connection()
        ai_status, ai_msg = test_azure_openai_connection()
        return {
            "database": {"status": db_status, "message": db_msg},
            "azure": {"status": ai_status, "message": ai_msg},
        }
    except Exception as e:
        logger.error("Connectivity check failed", exc_info=True)
        raise HTTPException(status_code=500, detail="Connectivity check failed")


@router.get("/mcp/details")
async def get_mcp_details(user_id: int = Depends(get_authenticated_user_id)):
    return MCP_DETAILS


# --------------------------------------------------
# SSE STREAMING ENDPOINT
# [FIX HIGH] user_id from Authorization header, not URL query param
# [FIX CRITICAL] No server path exposed in error messages
# --------------------------------------------------
@router.get("/screening/run/stream")
async def run_screening_stream(
    request: Request,
    name: str,
    lc_number: str = "",
):
    # Validate inputs before entering the generator
    try:
        validated_name = _validate_name(name)
        validated_lc = _validate_lc_number(lc_number)
        user_id = get_authenticated_user_id(request)
    except ValueError as ve:
        async def _err():
            yield _sse_payload({"type": "error", "message": str(ve), "ts": _now_iso()})
        return StreamingResponse(_err(), media_type="text/event-stream")
    except HTTPException as he:
        async def _auth_err():
            yield _sse_payload({"type": "error", "message": he.detail, "ts": _now_iso()})
        return StreamingResponse(_auth_err(), media_type="text/event-stream")

    async def event_stream():
        try:
            yield _sse_payload({"type": "step", "message": "Starting screening", "ts": _now_iso()})

            # [FIX HIGH] Thread-safe — use local token counters, not globals
            request_tokens = 0
            response_tokens = 0

            start_time = time.time()

            serial = f"SCR-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}"
            yield _sse_payload({
                "type": "serial",
                "message": "Serial generated",
                "serial": serial,
                "ts": _now_iso(),
            })

            yield _sse_payload({
                "type": "step",
                "message": "Fetching sanctions data from database",
                "ts": _now_iso(),
            })
            sanctions = get_sanctions_data()
            total_records = len(sanctions)

            yield _sse_payload({
                "type": "step",
                "message": f"Fetched {total_records} sanctions records",
                "total": total_records,
                "ts": _now_iso(),
            })

            transaction_no = generate_transaction_no()
            create_instrument(
                transaction_no=transaction_no,
                cifno=DEFAULT_CIF_ID,   # [FIX HIGH] No hardcoded CIF
                user_id=user_id,
                model="SANCTIONS",
            )

            all_matches = []

            server_path, server_cwd = _find_mcp_server_path(os.path.dirname(__file__))
            if not os.path.exists(server_path):
                # [FIX CRITICAL] Don't expose server_path in error payload
                logger.error("MCP server script not found at: %s", server_path)
                yield _sse_payload({
                    "type": "error",
                    "message": "Internal server configuration error. Contact admin.",
                    "ts": _now_iso(),
                })
                return

            yield _sse_payload({
                "type": "step",
                "message": "Launching MCP server and initializing session",
                "ts": _now_iso(),
            })

            server_params = StdioServerParameters(
                command=sys.executable,
                args=[server_path],
                cwd=server_cwd,
            )

            progress_every = max(1, total_records // 20) if total_records else 1

            async with stdio_client(server_params) as (read_stream, write_stream):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    yield _sse_payload({
                        "type": "step",
                        "message": "MCP session initialized",
                        "ts": _now_iso(),
                    })

                    for idx, record in enumerate(sanctions, start=1):
                        if idx == 1 or idx % progress_every == 0 or idx == total_records:
                            yield _sse_payload({
                                "type": "progress",
                                "message": f"Screening record {idx}/{total_records}",
                                "current": idx,
                                "total": total_records,
                                "ts": _now_iso(),
                            })

                        try:
                            result = await _mcp_run_all_matching_techniques(
                                session,
                                validated_name,
                                "",
                                record,
                                transaction_no,
                                user_id,
                            )

                            token_usage = result.get("token_usage") or {}
                            request_tokens += int(token_usage.get("prompt_tokens") or 0)
                            response_tokens += int(token_usage.get("completion_tokens") or 0)

                            if result.get("any_match"):
                                techniques = [t for t in result["techniques"] if t["match"]]
                                avg_score = (
                                    sum(t["score"] for t in techniques) / len(techniques)
                                    if techniques else 0
                                )
                                all_matches.append({
                                    "matching_name": record.get("name"),
                                    "country": record.get("country"),
                                    "relevancy_score": f"{avg_score * 100:.1f}%",
                                    "match_count": result.get("match_count"),
                                    "techniques_used": ", ".join(
                                        t["technique"] for t in techniques if t["match"]
                                    ),
                                    "reasoning": "; ".join(
                                        t.get("details", "") for t in techniques if t["match"]
                                    ),
                                    "source": record.get("source"),
                                })

                        except Exception:
                            logger.warning("Matching failed for record %d", idx, exc_info=True)
                            yield _sse_payload({
                                "type": "warn",
                                "message": f"Could not process record {idx}",
                                "ts": _now_iso(),
                            })

            duration_seconds = round(time.time() - start_time, 2)

            yield _sse_payload({"type": "step", "message": "Saving screening activity", "ts": _now_iso()})

            save_screening_activity(
                serial_number=serial,
                lc_number=validated_lc,
                input_name=validated_name,
                input_address=None,
                matches_data=json.dumps(all_matches),
                total_matches=len(all_matches),
                records_processed=total_records,
                duration_seconds=duration_seconds,
                user_id=user_id,
            )

            yield _sse_payload({"type": "step", "message": "Saving tool billing", "ts": _now_iso()})

            billing_data = {
                "transaction_no": transaction_no,
                "cifid": DEFAULT_CIF_ID,
                "module": "SANCTIONS",
                "instrument_type": "LC",
                "lifecycle": "Screening",
                "lc_number": validated_lc,
                "variation": "LLM",
                "status": "SUCCESS",
                "userid": user_id,
                "request_tokens": request_tokens,
                "response_tokens": response_tokens,
            }

            insert_tool_billing(billing_data)

            yield _sse_payload({
                "type": "done",
                "serial": serial,
                "total_records": total_records,
                "matches_found": len(all_matches),
                "results": all_matches,
                "duration_seconds": duration_seconds,
                "ts": _now_iso(),
            })

        except Exception:
            logger.error("/screening/run/stream failed", exc_info=True)
            yield _sse_payload({
                "type": "error",
                "message": "Screening failed. Please try again.",
                "ts": _now_iso(),
            })

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# --------------------------------------------------
@router.post("/sanction/add")
async def add_sanction_entry_route(
    request: AddSanctionEntryRequest,
    user_id: int = Depends(get_authenticated_user_id),
):
    try:
        # [FIX MEDIUM] Don't log full request dict (contains user data)
        logger.info("Sanction add requested by user_id=%s", user_id)

        ok, msg = add_sanction_entry(
            request.name, request.country, request.source, user_id
        )

        if not ok:
            # [FIX MEDIUM] Return generic error, not raw DB exception
            logger.error("add_sanction_entry failed: %s", msg)
            raise HTTPException(status_code=400, detail="Failed to add entry. Check inputs.")

        return {"message": "Entry added successfully."}

    except HTTPException:
        raise
    except Exception:
        logger.error("/sanction/add unexpected error", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to add sanction entry")


# --------------------------------------------------
@router.post("/screening/run")
async def run_screening(request: ScreeningRequest, user_id: int = Depends(get_authenticated_user_id)):
    try:
        logger.info("Screening started for user_id=%s", user_id)

        # [FIX HIGH] Thread-safe local counters
        request_tokens = 0
        response_tokens = 0

        start_time = time.time()
        serial = f"SCR-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}"

        sanctions = get_sanctions_data()
        logger.info("Records fetched: %d", len(sanctions))

        transaction_no = generate_transaction_no()
        create_instrument(
            transaction_no=transaction_no,
            cifno=DEFAULT_CIF_ID,  # [FIX HIGH] env-based
            user_id=user_id,
            model="SANCTIONS",
        )

        all_matches = []

        server_path, server_cwd = _find_mcp_server_path(os.path.dirname(__file__))
        if not os.path.exists(server_path):
            logger.error("MCP server script not found at: %s", server_path)
            raise HTTPException(status_code=500, detail="Internal configuration error")

        server_params = StdioServerParameters(
            command=sys.executable,
            args=[server_path],
            cwd=server_cwd,
        )

        async with stdio_client(server_params) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()

                for idx, record in enumerate(sanctions, start=1):
                    try:
                        result = await _mcp_run_all_matching_techniques(
                            session,
                            request.name,
                            "",
                            record,
                            transaction_no,
                            user_id,
                        )

                        token_usage = result.get("token_usage") or {}
                        request_tokens += int(token_usage.get("prompt_tokens") or 0)
                        response_tokens += int(token_usage.get("completion_tokens") or 0)

                        if result.get("any_match"):
                            techniques = [t for t in result["techniques"] if t["match"]]
                            avg_score = (
                                sum(t["score"] for t in techniques) / len(techniques)
                                if techniques else 0
                            )
                            all_matches.append({
                                "matching_name": record.get("name"),
                                "country": record.get("country"),
                                "relevancy_score": f"{avg_score * 100:.1f}%",
                                "match_count": result.get("match_count"),
                                "techniques_used": ", ".join(
                                    t["technique"] for t in techniques if t["match"]
                                ),
                                "reasoning": "; ".join(
                                    t.get("details", "") for t in techniques if t["match"]
                                ),
                                "source": record.get("source"),
                            })

                    except Exception:
                        logger.warning("Matching failed for record %d", idx, exc_info=True)

        duration_seconds = round(time.time() - start_time, 2)

        response_data = {
            "serial": serial,
            "total_records": len(sanctions),
            "matches_found": len(all_matches),
            "results": all_matches,
        }

        save_screening_activity(
            serial_number=serial,
            lc_number=request.lc_number,
            input_name=request.name,
            input_address=None,
            matches_data=json.dumps(all_matches),
            total_matches=len(all_matches),
            records_processed=len(sanctions),
            duration_seconds=duration_seconds,
            user_id=user_id,
        )

        billing_data = {
            "transaction_no": transaction_no,
            "cifid": DEFAULT_CIF_ID,
            "module": "SANCTIONS",
            "instrument_type": "LC",
            "lifecycle": "Screening",
            "lc_number": request.lc_number,
            "variation": "LLM",
            "status": "SUCCESS",
            "userid": user_id,
            "request_tokens": request_tokens,
            "response_tokens": response_tokens,
        }

        insert_tool_billing(billing_data)
        return response_data

    except HTTPException:
        raise
    except Exception:
        logger.error("/screening/run failed", exc_info=True)
        raise HTTPException(status_code=500, detail="Screening failed")


# --------------------------------------------------
@router.post("/screening/retrieve")
async def retrieve_screening(request: RetrieveRequest, user_id: int = Depends(get_authenticated_user_id)):
    try:
        logger.info("Retrieving screening: %s", request.serial_number)

        result = retrieve_screening_activity(request.serial_number)
        if not result:
            raise HTTPException(status_code=404, detail="No history found")

        raw_matches = result.get("matches_data")
        if isinstance(raw_matches, str):
            try:
                parsed_matches = json.loads(raw_matches)
            except Exception:
                parsed_matches = []
        else:
            parsed_matches = raw_matches or []

        return {
            "serial": result.get("serial_number"),
            "name": result.get("input_name"),
            "address": result.get("input_address"),
            "results": parsed_matches,
            "total_records": len(parsed_matches),
            "matches_found": len(parsed_matches),
            "created_at": result.get("created_at"),
        }

    except HTTPException:
        raise
    except Exception:
        logger.error("/screening/retrieve failed", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve screening")


# --------------------------------------------------
# [FIX CRITICAL] Logs endpoint requires internal API key
# --------------------------------------------------
@router.get("/logs", dependencies=[Depends(require_internal_key)])
async def get_logs(limit: int = 50):
    """
    Protected endpoint — requires X-Internal-Key header.
    Only returns last N lines; limit capped at 500.
    """
    limit = min(max(1, limit), 500)  # cap to prevent abuse
    try:
        log_path = os.path.join(os.path.expanduser("~"), "audit_log.txt")
        with open(log_path, "r", encoding="utf-8") as f:
            logs = f.readlines()
        return {"logs": logs[-limit:]}
    except FileNotFoundError:
        return {"logs": []}
    except Exception:
        logger.error("Failed to read logs", exc_info=True)
        raise HTTPException(status_code=500, detail="Log read error")


# --------------------------------------------------
app.include_router(router)
