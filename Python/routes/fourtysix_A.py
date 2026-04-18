import base64
import hashlib
import hmac
import json
import logging
import os
import re
from collections import defaultdict, deque
import time
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from Fourty_six_A.database import (
    get_all_documents,
    get_document_details,
    upsert_check_detail,
    initialize_check_details,
    get_all_check_details,
    analyze_and_import_document,
    delete_document,
    fetch_46a_documents_required,
    get_magic_box_case_ids,
    get_magic_box_document_names,
)

# VAPT FIX: Use structured logger instead of print/stdout
logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/lc",
    tags=["FoutySixA"],
)


class DocumentImportRequest(BaseModel):
    document_text: str


class UpdateDetailRequest(BaseModel):
    detailId: int
    checked: bool
    narration: str | None = None


MAX_DOCUMENT_TEXT_LEN = 5000
MAX_NARRATION_LEN = 1000
SAFE_CASE_ID = re.compile(r"^[A-Za-z0-9_-]{1,100}$")
SAFE_DOC_TYPE = {"MAIN", "SUB"}
SAFE_DOC_KEY = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"

ANALYZE_RATE_LIMIT = 5
ANALYZE_WINDOW_SECONDS = 60
_ANALYZE_REQUESTS = defaultdict(deque)



def _require_positive_int(value: int, field_name: str) -> int:
    if not isinstance(value, int) or value <= 0:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}")
    return value


def _sanitize_text(value: Optional[str], max_len: int) -> str:
    cleaned = (value or "").replace("\x00", "").strip()
    return cleaned[:max_len]


def _safe_server_error() -> HTTPException:
    return HTTPException(status_code=500, detail="Internal server error")


def _b64url_decode(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _verify_and_decode_bearer_token(token: str) -> dict:
    if not JWT_SECRET:
        logger.error("[AUTH] JWT_SECRET is not configured")
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


def get_user_id(request: Request) -> str:
    auth_header = (request.headers.get("Authorization") or "").strip()
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    payload = _verify_and_decode_bearer_token(auth_header.split(" ", 1)[1].strip())
    user_id = str(payload.get("UserID") or payload.get("user_id") or "").strip()
    if not re.fullmatch(r"\d{1,20}", user_id):
        raise HTTPException(status_code=401, detail="Invalid user context")
    return user_id


def merge_document_checklist(details_df: pd.DataFrame, checks_df: pd.DataFrame):
    merged = pd.merge(details_df, checks_df, on="detailId", how="left")
    # VAPT FIX: Explicitly cast to int AFTER fillna to prevent type confusion.
    # Validates that the resulting value is strictly 0 or 1 before returning —
    # prevents any unexpected numeric data from leaking a truthy "checked" state.
    merged["checked"] = merged["checked"].fillna(0).astype(int).clip(0, 1)
    merged["narration"] = merged["narration"].fillna("").apply(
        lambda x: str(x).replace("\x00", "").strip()[:MAX_NARRATION_LEN]
    )
    return merged.to_dict(orient="records")

def _enforce_analyze_rate_limit(user_id: str) -> None:
    now = time.time()
    window_start = now - ANALYZE_WINDOW_SECONDS
    requests = _ANALYZE_REQUESTS[user_id]

    while requests and requests[0] < window_start:
        requests.popleft()

    if len(requests) >= ANALYZE_RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Too many analyze requests. Max {ANALYZE_RATE_LIMIT} per minute."
        )

    requests.append(now)



@router.get("/documents")
def list_documents(user_id: str = Depends(get_user_id)):
    try:
        df = get_all_documents()
        return df.to_dict(orient="records")
    except HTTPException:
        raise
    except Exception:
        logger.exception("[ERROR] list_documents failed")
        raise _safe_server_error()


@router.get("/documents/{doc_id}/details")
def document_details(doc_id: int, user_id: str = Depends(get_user_id)):
    safe_doc_id = _require_positive_int(doc_id, "document ID")
    initialize_check_details(user_id, safe_doc_id)

    details = get_document_details(safe_doc_id, user_id)
    check_details = get_all_check_details(user_id, safe_doc_id)

    return merge_document_checklist(details, check_details)


@router.post("/analyze")
def analyze_document(payload: DocumentImportRequest, user_id: str = Depends(get_user_id)):
    _enforce_analyze_rate_limit(user_id)
    document_text = _sanitize_text(payload.document_text, MAX_DOCUMENT_TEXT_LEN)
    if not document_text:
        raise HTTPException(status_code=400, detail="Document text is empty")
    if len(document_text) > MAX_DOCUMENT_TEXT_LEN:
        raise HTTPException(status_code=400, detail="Document text too large")

    result = analyze_and_import_document(
        text=document_text,
        user_id=int(user_id),
    )
    return {
        "description": result["description"],
        "detail_count": result["detail_count"],
    }


@router.post("/documents/{doc_id}/update")
def update_document_check(
    doc_id: int,
    payload: UpdateDetailRequest,
    user_id: str = Depends(get_user_id),
):
    safe_doc_id = _require_positive_int(doc_id, "document ID")
    safe_detail_id = _require_positive_int(payload.detailId, "detail ID")
    safe_narration = _sanitize_text(payload.narration, MAX_NARRATION_LEN) or None

    upsert_check_detail(
        user_id=user_id,
        docs_needed_id=safe_doc_id,
        detail_id=safe_detail_id,
        checked=1 if payload.checked else 0,
        narration=safe_narration,
    )
    return {"status": "ok"}


@router.delete("/documents/{doc_id}")
def delete_doc(doc_id: int, user_id: str = Depends(get_user_id)):
    # VAPT NOTE: user_id is validated (digits-only, from trusted header) by
    # get_user_id(). Authorization (owner-check) should be enforced inside
    # the delete_document stored procedure (sp_delete_document) — ensure
    # the SP accepts @UserID and verifies ownership before deleting.
    safe_doc_id = _require_positive_int(doc_id, "document ID")
    try:
        delete_document(safe_doc_id, int(user_id))
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("[ERROR] delete_doc failed")
        raise HTTPException(status_code=400, detail="Unable to delete document")


@router.get("/magic-box/case-ids")
def list_magic_box_case_ids(user_id: str = Depends(get_user_id)):
    try:
        return {"case_ids": get_magic_box_case_ids()}
    except Exception:
        logger.exception("[ERROR] list_magic_box_case_ids failed")
        raise _safe_server_error()


@router.get("/magic-box/{case_id}/document-names")
def list_magic_box_document_names(
    case_id: str,
    doc_type: str = Query("MAIN"),
    user_id: str = Depends(get_user_id),
):
    safe_case_id = (case_id or "").strip()
    safe_doc_type = (doc_type or "MAIN").upper()
    if not SAFE_CASE_ID.fullmatch(safe_case_id):
        raise HTTPException(status_code=400, detail="Invalid case ID")
    if safe_doc_type not in SAFE_DOC_TYPE:
        raise HTTPException(status_code=400, detail="Invalid document type")

    try:
        return {
            "case_id": safe_case_id,
            "doc_type": safe_doc_type,
            "document_names": get_magic_box_document_names(
                case_id=safe_case_id, doc_type=safe_doc_type
            ),
        }
    except Exception:
        logger.exception("[ERROR] list_magic_box_document_names failed")
        raise _safe_server_error()


@router.get("/prefill-46a")
def prefill_46a_text(
    case_id: str = Query(...),
    doc_type: str = Query("MAIN"),
    document_name: Optional[str] = Query(None),
    preferred_doc_key: str = Query("letter_of_credit"),
    user_id: str = Depends(get_user_id),
):
    safe_case_id = (case_id or "").strip()
    safe_doc_type = (doc_type or "MAIN").upper()
    safe_document_name = _sanitize_text(document_name, 255) or None
    safe_preferred_doc_key = (preferred_doc_key or "letter_of_credit").strip()

    if not SAFE_CASE_ID.fullmatch(safe_case_id):
        raise HTTPException(status_code=400, detail="Invalid case ID")
    if safe_doc_type not in SAFE_DOC_TYPE:
        raise HTTPException(status_code=400, detail="Invalid document type")
    if not SAFE_DOC_KEY.fullmatch(safe_preferred_doc_key):
        raise HTTPException(status_code=400, detail="Invalid document key")

    try:
        text = fetch_46a_documents_required(
            case_id=safe_case_id,
            doc_type=safe_doc_type,
            document_name=safe_document_name,
            preferred_doc_key=safe_preferred_doc_key,
        )
        return {"document_text": text}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        logger.exception("[ERROR] prefill_46a_text failed")
        raise _safe_server_error()
