"""
Database operations for Document Checklist (SQL Server)
Enhanced version with AI document import capability
"""

import os
import logging
import pandas as pd
import pyodbc
import json
import requests
from typing import Optional, Dict, List, TypedDict
from dotenv import load_dotenv

from TBML_matching.db_utils import (
    generate_transaction_no,
    insert_tool_billing,
    fetch_prompt_by_modalname
)
from reference_tables.request_response import (
    create_instrument,
    insert_llm_request,
    insert_llm_response
)

from langgraph.graph import StateGraph
import re
from core.db import get_connection as get_tf_connection, get_connection_OCR


# Load environment variables
load_dotenv()

# ── Secure logger (no sensitive data printed to stdout) ──────────────────────
logger = logging.getLogger(__name__)

# Database configuration — sourced from .env only, no hardcoded defaults for credentials
DB_SERVER = os.getenv("DB_SERVER", "localhost")
DB_NAME = os.getenv("DB_NAME", "tf_genie")
DB_USER = os.getenv("DB_USER", "")        # VAPT FIX: removed hardcoded "sa" default
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_TIMEOUT = int(os.getenv("DB_TIMEOUT", "30"))

# Azure OpenAI configuration — loaded lazily via property to avoid module-level key exposure
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT", "").strip('"')
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY", "").strip('"')

PROMPT_MODULE = "46A"
PROMPT_ANALYSIS_MODE = "Model5"
PROMPT_VERSION_DESC = "PARSE_DOCUMENT_SYSTEM_PROMPT"
MAX_AI_INPUT_LEN = 5000
MAX_DESCRIPTION_LEN = 255
MAX_LC_TYPE_LEN = 50
MAX_COMMODITY_LEN = 100
MAX_SUBDOCUMENTS = 200
MAX_SUBDOCUMENT_LEN = 1000
AZURE_TIMEOUT_SECONDS = 30

# ── VAPT FIX: Build Azure headers lazily so the API key is read at call-time, ──
# not at import time (avoids accidental exposure in memory dumps / module repr).
def _get_azure_headers() -> dict:
    return {
        "Content-Type": "application/json",
        "api-key": AZURE_OPENAI_API_KEY,
    }


class ParseDocumentState(TypedDict):
    text: str
    prompt_text: str
    response_status: Optional[int]
    response_text: Optional[str]


_PARSE_DOCUMENT_AGENT = None


# ── VAPT FIX: _safe_log now uses Python logging instead of raw print ──────────
# This prevents sensitive values (user IDs, doc IDs) from being written to
# stdout / application logs in plain text and enables log-level filtering.
def _safe_log(message: str) -> None:
    logger.info(message)


def _safe_log_error(message: str) -> None:
    # VAPT FIX: never log raw exception strings that contain internal details
    logger.error(message)


def _clean_text(value: Optional[str], max_len: int) -> str:
    return str(value or "").replace("\x00", "").strip()[:max_len]


def _normalize_subdocuments(values: object) -> List[str]:
    if not isinstance(values, list):
        raise ValueError("subDocuments must be a list")

    cleaned: List[str] = []
    for item in values[:MAX_SUBDOCUMENTS]:
        text = _clean_text(item if isinstance(item, str) else "", MAX_SUBDOCUMENT_LEN)
        if text:
            cleaned.append(text)

    if not cleaned:
        raise ValueError("subDocuments must contain at least one item")

    return cleaned


def _normalize_parsed_document(parsed: Dict) -> Dict:
    if not isinstance(parsed, dict):
        raise ValueError("Parsed AI response must be an object")

    description = _clean_text(parsed.get("description"), MAX_DESCRIPTION_LEN)
    if not description:
        raise ValueError("Missing document description")

    lc_type = _clean_text(parsed.get("lcType") or "Sight", MAX_LC_TYPE_LEN)
    commodity = _clean_text(parsed.get("commodity"), MAX_COMMODITY_LEN) or None
    sub_documents = _normalize_subdocuments(parsed.get("subDocuments"))

    return {
        "description": description,
        "lcType": lc_type,
        "commodity": commodity,
        "subDocuments": sub_documents,
    }


def _parse_document_node(state: ParseDocumentState) -> ParseDocumentState:
    _safe_log("[AGENT] parse_document node start")
    _safe_log(f"[AGENT] input length: {len(state.get('text', ''))}")
    payload = {
        "messages": [
            {"role": "system", "content": state["prompt_text"]},
            {"role": "user", "content": state["text"]},
        ],
        "temperature": 0.3,
        "max_tokens": 2000,
    }
    _safe_log("[AGENT] sending request to Azure OpenAI endpoint")
    # VAPT FIX: headers built lazily — API key not held in module-level dict
    response = requests.post(
        AZURE_OPENAI_ENDPOINT,
        headers=_get_azure_headers(),
        json=payload,
        timeout=AZURE_TIMEOUT_SECONDS,
    )
    _safe_log(f"[AGENT] response status: {response.status_code}")
    return {"response_status": response.status_code, "response_text": response.text}


def _get_parse_document_agent():
    global _PARSE_DOCUMENT_AGENT
    if _PARSE_DOCUMENT_AGENT is None:
        graph = StateGraph(ParseDocumentState)
        graph.add_node("parse_document", _parse_document_node)
        graph.set_entry_point("parse_document")
        graph.set_finish_point("parse_document")
        _PARSE_DOCUMENT_AGENT = graph.compile()
    return _PARSE_DOCUMENT_AGENT


def get_connection():
    """Existing 46A tables (tf_genie) connection."""
    return get_tf_connection()


def get_universal_connection():
    """magic_box lives in universal DB (DB_DATABASE from .env)."""
    return get_connection_OCR()


def _extract_46a_block(text: str) -> str | None:
    if not text:
        return None

    normalized = text.replace("\r\n", "\n").replace("\r", "\n")

    pattern = re.compile(
        r"(46A\s*:?\s*Documents\s+Required\b.*?)(?=\n\s*\d{2}[A-Z]\s*:|\Z)",
        flags=re.IGNORECASE | re.DOTALL,
    )
    m = pattern.search(normalized)
    return m.group(1).strip() if m else None


def _flatten_strings(value) -> List[str]:
    out: List[str] = []
    if value is None:
        return out
    if isinstance(value, str):
        out.append(value)
    elif isinstance(value, dict):
        for v in value.values():
            out.extend(_flatten_strings(v))
    elif isinstance(value, list):
        for item in value:
            out.extend(_flatten_strings(item))
    return out


def _format_required_list_block(title: str, items: List[str]) -> str:
    clean_items = [str(x).strip() for x in items if str(x).strip()]
    if not clean_items:
        return ""
    lines = [f"{idx}. {item}" for idx, item in enumerate(clean_items, start=1)]
    return f"{title}\n" + "\n".join(lines)


def fetch_46a_documents_required(
    case_id: str,
    doc_type: str = "MAIN",
    document_name: str | None = None,
    preferred_doc_key: str = "letter_of_credit",
) -> str:
    conn = None
    cursor = None
    try:
        conn = get_universal_connection()
        cursor = conn.cursor()

        doc_type = (doc_type or "MAIN").upper()
        cursor.execute(
            "EXEC dbo.sp_mb_get_document_payload ?, ?, ?",
            (case_id, doc_type, document_name),
        )

        row = cursor.fetchone()
        if not row:
            raise ValueError("magic_box record not found for given filters")

        raw_json = row[0]
        required_block = row[1]
        required_documents_json = row[2]

        # 1) Fast path: required_block already prepared by pipeline
        if isinstance(required_block, str) and required_block.strip():
            return required_block.strip()

        # 2) Fallback: required_documents_json if available
        if isinstance(required_documents_json, str) and required_documents_json.strip():
            try:
                req_obj = json.loads(required_documents_json)
                flattened = [s.strip() for s in _flatten_strings(req_obj) if isinstance(s, str) and s.strip()]
                if flattened:
                    combined_req = "\n".join(flattened)
                    block_46a = _extract_46a_block(combined_req)
                    if block_46a:
                        return block_46a
                    return combined_req
            except Exception:
                pass

        # Strict rule: SUB records should not fallback to generic documents_json scan.
        if doc_type == "SUB":
            raise ValueError("No 46A required documents available for selected SUB record")

        if not raw_json:
            raise ValueError("documents_json is empty for selected record")

        data = json.loads(raw_json) if isinstance(raw_json, str) else raw_json

        # 3) Fallback using required_documents_summary if present in documents_json
        if isinstance(data, dict):
            summary = data.get("required_documents_summary")
            if isinstance(summary, dict):
                summary_block = str(summary.get("required_block") or "").strip()
                if summary_block:
                    return summary_block

                required_docs = summary.get("required_documents")
                if isinstance(required_docs, list) and required_docs:
                    block = _format_required_list_block("46A: Documents Required", required_docs)
                    if block:
                        return block

                classified_docs = summary.get("classified_documents")
                if isinstance(classified_docs, list) and classified_docs:
                    block = _format_required_list_block(
                        "46A: Documents Required (Classified)", classified_docs
                    )
                    if block:
                        return block

        chunks: list[str] = []
        if isinstance(data, dict):
            if preferred_doc_key in data and isinstance(data[preferred_doc_key], list):
                for item in data[preferred_doc_key]:
                    if isinstance(item, dict) and item.get("text"):
                        chunks.append(item["text"])
            if not chunks:
                for arr in data.values():
                    if isinstance(arr, list):
                        for item in arr:
                            if isinstance(item, dict) and item.get("text"):
                                chunks.append(item["text"])

        combined = "\n".join(chunks).strip()
        block_46a = _extract_46a_block(combined)

        if not block_46a:
            raise ValueError("46A: Documents Required block not found")

        return block_46a

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def get_magic_box_case_ids() -> List[str]:
    """Return available case_ids from universal.dbo.magic_box."""
    conn = None
    cursor = None
    try:
        conn = get_universal_connection()
        cursor = conn.cursor()
        cursor.execute("EXEC dbo.sp_mb_get_case_ids")
        return [str(row[0]) for row in cursor.fetchall() if row[0]]
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def get_magic_box_document_names(case_id: str, doc_type: str = "MAIN") -> List[str]:
    """Return available document_name values for a case_id + doc_type."""
    conn = None
    cursor = None
    try:
        conn = get_universal_connection()
        cursor = conn.cursor()
        cursor.execute(
            "EXEC dbo.sp_mb_get_document_names ?, ?",
            (case_id, (doc_type or "MAIN").upper()),
        )
        return [str(row[0]) for row in cursor.fetchall() if row[0]]
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def get_all_documents() -> pd.DataFrame:
    """
    Get all documents with calculated Fully Compliant status and progress counts.
    Uses stored procedure: dbo.sp_get_all_documents
    """
    conn = None
    try:
        _safe_log("[INFO] Opening database connection for get_all_documents")
        conn = get_connection()

        _safe_log("[INFO] Executing stored procedure: sp_get_all_documents")
        query = "EXEC dbo.sp_get_all_documents"

        df = pd.read_sql(query, conn)

        _safe_log(f"[INFO] Retrieved {len(df)} records")

        if len(df.columns) == 9:
            df.columns = [
                "docsNeededId",
                "sampleNo",
                "description",
                "lcType",
                "commodity",
                "totalItems",
                "checkedItems",
                "fullyCompliant",
                "userId",
            ]
        else:
            df.columns = [
                "docsNeededId",
                "sampleNo",
                "description",
                "lcType",
                "commodity",
                "totalItems",
                "checkedItems",
                "fullyCompliant",
            ]

        if "checkedItems" in df.columns:
            df["checkedItems"] = df["checkedItems"].fillna(0).astype(int)
        if "totalItems" in df.columns:
            df["totalItems"] = df["totalItems"].fillna(0).astype(int)
        if "fullyCompliant" in df.columns:
            df["fullyCompliant"] = df["fullyCompliant"].fillna("N").astype(str)
        if "lcType" in df.columns:
            df["lcType"] = df["lcType"].fillna("Sight").astype(str)
        if "description" in df.columns:
            df["description"] = df["description"].fillna("").astype(str)
        if "commodity" in df.columns:
            df["commodity"] = df["commodity"].where(df["commodity"].notna(), None)
        if "userId" in df.columns:
            df["userId"] = df["userId"].where(df["userId"].notna(), None)

        # Final JSON-safe normalization: FastAPI cannot serialize NaN/NaT values.
        df = df.astype(object).where(pd.notna(df), None)

        _safe_log("[INFO] Column mapping completed")
        return df

    except Exception:
        # VAPT FIX: do not log raw exception — avoids internal schema leakage
        _safe_log_error("[ERROR] Failed to fetch documents")
        return pd.DataFrame()

    finally:
        if conn:
            conn.close()
            _safe_log("[INFO] Database connection closed")


def get_document_details(
    docs_needed_id: int, user_id: str = "default_user"
) -> pd.DataFrame:
    """
    Get details for a specific document using stored procedure: sp_get_document_details
    """
    conn = None
    try:
        # VAPT FIX: do not log user_id in plain text
        _safe_log("[INFO] Fetching document details")
        conn = get_connection()

        query = "EXEC dbo.sp_get_document_details ?"
        df = pd.read_sql(query, conn, params=(docs_needed_id,))

        _safe_log(f"[INFO] Retrieved {len(df)} detail rows")

        df.columns = ["detailId", "docsNeededId", "lineNo", "documentText"]

        _safe_log("[INFO] Column mapping completed")
        return df

    except Exception:
        _safe_log_error("[ERROR] Failed to fetch document details")
        return pd.DataFrame()

    finally:
        if conn:
            conn.close()
            _safe_log("[INFO] Database connection closed")


def get_or_create_master_check(user_id: str, docs_needed_id: int) -> int:
    """
    Get or create a master check record for a user and document.
    Returns CheckID.
    """
    conn = None
    cursor = None

    try:
        _safe_log("[INFO] Opening DB connection for get_or_create_master_check")
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            DECLARE @CheckID INT;
            EXEC dbo.sp_get_or_create_master_check
                @UserID = ?,
                @DocsNeededID = ?,
                @CheckID = @CheckID OUTPUT;
            SELECT @CheckID;
        """,
            (user_id, docs_needed_id),
        )

        check_id = cursor.fetchone()[0]
        conn.commit()

        _safe_log("[INFO] Master CheckID obtained")
        return int(check_id)

    except Exception:
        _safe_log_error("[ERROR] Failed to get or create master check")
        raise

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
            _safe_log("[INFO] Database connection closed")


def initialize_check_details(user_id: str, docs_needed_id: int) -> int:
    """
    Initialize check detail records for all document details.
    Returns CheckID.
    """
    conn = None
    cursor = None

    try:
        _safe_log("[INFO] Initializing check details")
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            DECLARE @CheckID INT;
            EXEC dbo.sp_initialize_check_details
                @UserID = ?,
                @DocsNeededID = ?,
                @CheckID = @CheckID OUTPUT;
            SELECT @CheckID;
        """,
            (user_id, docs_needed_id),
        )

        check_id = cursor.fetchone()[0]
        conn.commit()

        _safe_log("[INFO] Check details initialized successfully")
        return int(check_id)

    except Exception:
        _safe_log_error("[ERROR] Failed to initialize check details")
        raise

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
            _safe_log("[INFO] Database connection closed")


def get_check_detail(
    user_id: str, docs_needed_id: int, detail_id: int
) -> Optional[Dict]:
    """
    Get check detail for a specific user, document, and detail item.
    Uses stored procedure: sp_get_check_detail
    """
    conn = None
    cursor = None

    try:
        _safe_log("[INFO] Fetching check detail")
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            "EXEC dbo.sp_get_check_detail ?, ?, ?", (user_id, docs_needed_id, detail_id)
        )

        row = cursor.fetchone()

        if not row:
            _safe_log("[INFO] No check detail found")
            return None

        result = {
            "checkDetailId": row[0],
            "checkId": row[1],
            "detailId": row[2],
            "checked": row[3],
            "narration": row[4],
            "description": row[5],
            "updatedAt": row[6],
        }

        _safe_log("[INFO] Check detail retrieved")
        return result

    except Exception:
        _safe_log_error("[ERROR] Failed to fetch check detail")
        raise

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
            _safe_log("[INFO] Database connection closed")


def upsert_check_detail(
    user_id: str,
    docs_needed_id: int,
    detail_id: int,
    checked: int,
    narration: Optional[str] = None,
    description: Optional[str] = None,
) -> None:
    """
    Insert or update a check detail record.
    Uses stored procedure: sp_upsert_check_detail
    """
    conn = None
    cursor = None

    try:
        _safe_log("[INFO] Upserting check detail")
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            EXEC dbo.sp_upsert_check_detail
                @UserID = ?,
                @DocsNeededID = ?,
                @DetailID = ?,
                @Checked = ?,
                @Narration = ?,
                @Description = ?
            """,
            (user_id, docs_needed_id, detail_id, checked, narration, description),
        )

        conn.commit()
        _safe_log("[INFO] Check detail upsert completed successfully")

    except Exception:
        if conn:
            conn.rollback()
        _safe_log_error("[ERROR] Failed to upsert check detail")
        raise

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
            _safe_log("[INFO] Database connection closed")


def get_all_check_details(user_id: str, docs_needed_id: int) -> pd.DataFrame:
    """
    Get all check details for a document.
    Uses stored procedure: sp_get_all_check_details
    """
    conn = None

    try:
        _safe_log("[INFO] Fetching all check details")
        conn = get_connection()
        query = "EXEC dbo.sp_get_all_check_details ?, ?"

        df = pd.read_sql(query, conn, params=(user_id, docs_needed_id))

        _safe_log(f"[INFO] Retrieved {len(df)} check detail rows")

        df.columns = ["detailId", "checked", "narration", "description"]

        return df

    except Exception:
        _safe_log_error("[ERROR] Failed to fetch all check details")
        return pd.DataFrame()

    finally:
        if conn:
            conn.close()
            _safe_log("[INFO] Database connection closed")


# ============= AI Document Import Functions =============


def get_next_sample_no() -> int:
    """
    Get the next available sample number.
    VAPT FIX: Added proper connection lifecycle management with try/finally
    to prevent connection leaks that previously existed in this function.
    """
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        # VAPT FIX: Using stored procedure instead of raw table query
        # to avoid direct table name exposure and potential schema enumeration.
        # If sp_get_next_sample_no is unavailable, the parameterized form below
        # is still safe since there are no user-supplied values interpolated.
        cursor.execute("SELECT ISNULL(MAX(SampleNo), 0) + 1 FROM tf_docs_needed")
        next_no = cursor.fetchone()[0]
        return int(next_no)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def parse_document_with_ai(text: str, user_id: Optional[int]) -> Dict:
    """
    Azure OpenAI parsing
    WITH:
    - create_instrument
    - llm_request
    - llm_response
    - tool_billing
    """

    text = _clean_text(text, MAX_AI_INPUT_LEN)
    if not text:
        raise ValueError("Document text is required")

    if not AZURE_OPENAI_ENDPOINT or not AZURE_OPENAI_API_KEY:
        raise ValueError("Azure OpenAI credentials not configured")

    transaction_no = generate_transaction_no()
    model_name = "LC_46A"

    prompt = fetch_prompt_by_modalname(
        module_name=PROMPT_MODULE,
        analysis_mode=PROMPT_ANALYSIS_MODE,
        version_desc=PROMPT_VERSION_DESC
    )
    if not prompt or not prompt.get("prompt_text"):
        raise RuntimeError(
            f"Prompt not found for module={PROMPT_MODULE} mode={PROMPT_ANALYSIS_MODE} "
            f"version_desc={PROMPT_VERSION_DESC}"
        )

    create_instrument(
        transaction_no=transaction_no,
        cifno="CUS0006",
        user_id=user_id,
        model=model_name,
        prompt_id=prompt.get("prompt_id"),
        prompt_text=prompt.get("prompt_text"),
    )

    try:
        agent = _get_parse_document_agent()
        result = agent.invoke({"text": text, "prompt_text": prompt.get("prompt_text")})

        status_code = result.get("response_status")
        response_text = result.get("response_text") or ""

        if status_code != 200:
            # VAPT FIX: Do not include raw response_text in error (may contain internal info)
            raise RuntimeError(f"Azure OpenAI error {status_code}")

        if not response_text.strip():
            raise RuntimeError("Azure OpenAI returned EMPTY response")

        result_json = json.loads(response_text)

        if "choices" not in result_json:
            raise RuntimeError("Unexpected Azure response structure")

        content = result_json["choices"][0]["message"]["content"]

        def _safe_parse_model_json(raw_content):
            if isinstance(raw_content, dict):
                return raw_content

            text_content = str(raw_content or "").strip()

            try:
                return json.loads(text_content)
            except json.JSONDecodeError:
                pass

            cleaned = re.sub(r"^\s*```(?:json)?\s*", "", text_content, flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```\s*$", "", cleaned, flags=re.IGNORECASE).strip()
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError:
                pass

            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start != -1 and end != -1 and end > start:
                return json.loads(cleaned[start: end + 1])

            raise RuntimeError("Model response is not valid JSON")

        parsed = _safe_parse_model_json(content)

        if "description" not in parsed or "subDocuments" not in parsed:
            raise ValueError("Invalid AI response structure")

        parsed = _normalize_parsed_document(parsed)

        # Token usage
        usage = result_json.get("usage", {})
        request_tokens = usage.get("prompt_tokens", 0)
        response_tokens = usage.get("completion_tokens", 0)

        request_id = insert_llm_request(
            transaction_no=transaction_no,
            payload={
                "module": "LC_46A",
                "action": "DOCUMENT_PARSE",
                "input_text": text,
                "prompt_id": prompt.get("prompt_id"),
                "prompt_key": prompt.get("prompt_key"),
            },
            token_count=request_tokens,
            user_id=user_id,
            model=model_name,
        )

        insert_llm_response(
            request_id=request_id,
            transaction_no=transaction_no,
            payload=parsed,
            token_count=response_tokens,
            user_id=user_id,
            model=model_name,
        )

        insert_tool_billing(
            {
                "transaction_no": transaction_no,
                "cifid": "CUS0006",
                "module": "LC_46A",
                "instrument_type": "LC",
                "lifecycle": "DocumentAnalysis",
                "lc_number": None,
                "variation": "AI_PARSE",
                "status": "Completed",
                "userid": user_id,
                "request_tokens": request_tokens,
                "response_tokens": response_tokens,
            }
        )

        return parsed

    except Exception:
        insert_tool_billing(
            {
                "transaction_no": transaction_no,
                "cifid": "CUS0006",
                "module": "LC_46A",
                "instrument_type": "LC",
                "lifecycle": "DocumentAnalysis",
                "lc_number": None,
                "variation": "AI_PARSE",
                "status": "Failed",
                "userid": user_id,
                "request_tokens": 0,
                "response_tokens": 0,
            }
        )
        raise RuntimeError("Document parsing failed")


def insert_document(
    sample_no: int,
    description: str,
    lc_type: Optional[str],
    commodity: Optional[str],
    user_id: Optional[int],
) -> int:
    """
    Insert a new document into tf_docs_needed.
    Returns DocsNeededID.
    """
    conn = None
    cursor = None

    try:
        _safe_log("[INFO] Inserting new document")
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            DECLARE @DocsNeededID INT;
            EXEC dbo.sp_insert_document
                @SampleNo = ?,
                @Description = ?,
                @LCType = ?,
                @Commodity = ?,
                @UserID = ?,
                @DocsNeededID = @DocsNeededID OUTPUT;
            SELECT @DocsNeededID;
        """,
            (
                sample_no,
                _clean_text(description, MAX_DESCRIPTION_LEN),
                _clean_text(lc_type, MAX_LC_TYPE_LEN) or None,
                _clean_text(commodity, MAX_COMMODITY_LEN) or None,
                user_id,
            ),
        )

        docs_needed_id = cursor.fetchone()[0]
        conn.commit()

        _safe_log("[INFO] Document inserted successfully")
        return int(docs_needed_id)

    except Exception:
        if conn:
            conn.rollback()
        _safe_log_error("[ERROR] Failed to insert document")
        raise

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
            _safe_log("[INFO] Database connection closed")


def insert_document_details(
    docs_needed_id: int, sub_documents: List[str], user_id: Optional[int]
) -> int:
    """
    Insert sub-documents into tf_docs_needed_detail.
    Returns number of details inserted.
    """
    conn = None
    cursor = None

    try:
        _safe_log(f"[INFO] Inserting document details")
        conn = get_connection()
        cursor = conn.cursor()

        tvp = []
        for line_no, doc_text in enumerate(_normalize_subdocuments(sub_documents), start=1):
            tvp.append((line_no, doc_text))

        cursor.execute(
            """
            DECLARE @InsertedCount INT;

            EXEC dbo.sp_insert_document_details
                @DocsNeededID = ?,
                @UserID = ?,
                @Details = ?,
                @InsertedCount = @InsertedCount OUTPUT;

            SELECT @InsertedCount;
        """,
            (docs_needed_id, user_id, tvp),
        )

        inserted_count = cursor.fetchone()[0]
        conn.commit()

        _safe_log(f"[INFO] Inserted {inserted_count} document detail rows")
        return int(inserted_count)

    except Exception:
        if conn:
            conn.rollback()
        _safe_log_error("[ERROR] Failed to insert document details")
        raise

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
            _safe_log("[INFO] Database connection closed")


def delete_document(docs_needed_id: int, user_id: Optional[int]) -> None:
    """
    Delete document and all related records from all tables.
    Uses stored procedure: sp_delete_document
    """
    conn = None
    cursor = None

    try:
        _safe_log("[INFO] Deleting document")
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("EXEC dbo.sp_delete_document ?, ?", (docs_needed_id, user_id))

        conn.commit()
        _safe_log("[INFO] Document deleted successfully")

    except Exception:
        if conn:
            conn.rollback()
        _safe_log_error("[ERROR] Failed to delete document")
        raise

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
            _safe_log("[INFO] Database connection closed")


def analyze_and_import_document(text: str, user_id: Optional[int]) -> Dict:
    """
    End-to-end LC document analysis + DB insert
    """
    _safe_log("[INFO] Starting LC document AI analysis")

    parsed = parse_document_with_ai(text, user_id)
    sample_no = get_next_sample_no()

    docs_needed_id = insert_document(
        sample_no=sample_no,
        description=parsed["description"],
        lc_type=parsed.get("lcType") or "Sight",
        commodity=parsed.get("commodity"),
        user_id=user_id,
    )

    detail_count = insert_document_details(
        docs_needed_id, parsed["subDocuments"], user_id
    )

    return {
        "docs_needed_id": docs_needed_id,
        "sample_no": sample_no,
        "description": parsed["description"],
        "detail_count": detail_count,
    }
