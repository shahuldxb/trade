# secure_db_utils.py
"""
SECURE Database utilities and logging functions for sanctions screening application
VAPT Fixes Applied:
  [V1] Sensitive data NOT logged (passwords, keys)
  [V2] Connection string uses parameterized env vars with validation
  [V3] Log file path injection prevented
  [V4] SQL injection prevented - stored procs with typed params only
  [V5] Error messages sanitized - no internal stack trace to caller
  [V6] Secrets never returned in error messages
  [V7] Audit log entries are sanitized before write
  [V8] DB connection timeout is validated as integer
"""

import pyodbc
import os
import re
import logging
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# -------------------------------------------------------
# SECURE LOG FILE - fixed path, no user-controlled input
# -------------------------------------------------------
_LOG_DIR = os.path.join(os.path.expanduser("~"), ".sanctions_audit")
AUDIT_LOG_FILE = os.path.join(_LOG_DIR, "audit_log.txt")

# Internal Python logger for server-side errors (not exposed to users)
_internal_logger = logging.getLogger("sanctions.db")


def _sanitize_log_message(message: str) -> str:
    """
    [V7] Strip control characters and limit length to prevent log injection.
    Newlines in user-supplied data could forge fake log entries.
    """
    if not isinstance(message, str):
        message = str(message)
    # Remove CRLF log injection vectors
    message = message.replace("\r", " ").replace("\n", " ")
    # Remove non-printable control characters
    message = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", message)
    # Limit length to prevent log flooding
    return message[:2000]


def log_message(message: str, log_type: str = "INFO") -> str:
    """
    [V1][V7] Log messages to audit file.
    - Does NOT log connection strings or credentials.
    - Sanitizes message content before writing.
    """
    allowed_types = {"INFO", "ERROR", "SQL", "ACTIVITY"}
    if log_type not in allowed_types:
        log_type = "INFO"

    safe_message = _sanitize_log_message(message)

    try:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] [{log_type}] {safe_message}\n"

        os.makedirs(_LOG_DIR, exist_ok=True)

        with open(AUDIT_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(log_entry)

        return log_entry
    except Exception as e:
        _internal_logger.error("Failed to write audit log: %s", e)
        return f"[{log_type}] {safe_message}\n"


def _validate_db_env() -> dict:
    """
    [V2][V6] Validate all required DB env vars are present.
    Raises ValueError with a GENERIC message (no secret values exposed).
    """
    required = {
        "DB_SERVER": os.getenv("DB_SERVER"),
        "DB_NAME": os.getenv("DB_NAME"),
        "DB_USER": os.getenv("DB_USER"),
        "DB_PASSWORD": os.getenv("DB_PASSWORD"),
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        # [V6] Do NOT include actual values in error - just the key names
        raise ValueError(f"Missing required database configuration: {', '.join(missing)}")

    # [V8] Validate timeout is a valid integer
    timeout_raw = os.getenv("DB_TIMEOUT", "30")
    try:
        timeout = int(timeout_raw)
        if timeout <= 0 or timeout > 300:
            timeout = 30
    except ValueError:
        timeout = 30

    encrypt = os.getenv("DB_ENCRYPT", "yes").strip().lower()
    if encrypt not in {"yes", "no"}:
        encrypt = "yes"

    trust_server_certificate = os.getenv("DB_TRUST_SERVER_CERTIFICATE", "yes").strip().lower()
    if trust_server_certificate not in {"yes", "no"}:
        trust_server_certificate = "yes"

    driver = os.getenv("DB_DRIVER", "ODBC Driver 17 for SQL Server").strip()
    if not driver:
        driver = "ODBC Driver 17 for SQL Server"

    return {
        **required,
        "DB_TIMEOUT": timeout,
        "DB_ENCRYPT": encrypt,
        "DB_TRUST_SERVER_CERTIFICATE": trust_server_certificate,
        "DB_DRIVER": driver,
    }


def _build_connection_string(cfg: dict, trust_server_certificate: str | None = None) -> str:
    """
    [V2] Build connection string safely.
    All values come from validated env vars only - never user input.
    """
    trust_cert = trust_server_certificate or cfg["DB_TRUST_SERVER_CERTIFICATE"]
    return (
        f"DRIVER={{{cfg['DB_DRIVER']}}};"
        f"SERVER={cfg['DB_SERVER']};"
        f"DATABASE={cfg['DB_NAME']};"
        f"UID={cfg['DB_USER']};"
        f"PWD={cfg['DB_PASSWORD']};"
        f"Timeout={cfg['DB_TIMEOUT']};"
        f"Encrypt={cfg['DB_ENCRYPT']};"
        f"TrustServerCertificate={trust_cert};"
    )


def _is_certificate_trust_error(error: Exception) -> bool:
    message = str(error).lower()
    return (
        "certificate chain was issued by an authority that is not trusted" in message
        or "ssl provider" in message
    )


def get_db_connection():
    """
    [V2][V5][V6] Get a database connection.
    - Credentials come from env only.
    - Generic error raised to caller (no connection string in exception).
    """
    try:
        cfg = _validate_db_env()
        conn_str = _build_connection_string(cfg)
        try:
            conn = pyodbc.connect(conn_str)
        except pyodbc.Error as e:
            if cfg["DB_TRUST_SERVER_CERTIFICATE"] != "yes" and _is_certificate_trust_error(e):
                _internal_logger.warning(
                    "Retrying DB connection with TrustServerCertificate=yes due to certificate validation failure"
                )
                conn = pyodbc.connect(_build_connection_string(cfg, trust_server_certificate="yes"))
            else:
                raise
        log_message("Database connection established", "SQL")
        return conn
    except pyodbc.Error as e:
        # [V5][V6] Log full error internally, return sanitized message
        _internal_logger.error("DB connection failed: %s", e)
        log_message("Database connection failed (see server logs)", "ERROR")
        raise ConnectionError("Unable to connect to the database. Contact your administrator.")
    except ValueError as e:
        _internal_logger.error("DB config error: %s", e)
        raise


def test_database_connection() -> tuple[bool, str]:
    """
    [V5][V6] Test DB connection - returns generic success/fail, no internals.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        conn.close()
        log_message("Database connection test: SUCCESS", "INFO")
        return True, "✅ Database connection successful"
    except Exception:
        # [V5] Do NOT expose exception details to caller/UI
        log_message("Database connection test: FAILED", "ERROR")
        return False, "❌ Database connection failed. Check server configuration."


def test_azure_openai_connection() -> tuple[bool, str]:
    """
    [V5][V6] Test Azure OpenAI - returns generic result, no keys in response.
    """
    try:
        from openai import AzureOpenAI

        endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        api_key = os.getenv("AZURE_OPENAI_API_KEY")
        api_version = os.getenv("AZURE_OPENAI_API_VERSION")
        deployment = os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT")

        if not all([endpoint, api_key, api_version, deployment]):
            return False, "❌ Azure OpenAI configuration incomplete."

        client = AzureOpenAI(
            azure_endpoint=endpoint,
            api_key=api_key,
            api_version=api_version
        )

        client.chat.completions.create(
            model=deployment,
            messages=[{"role": "user", "content": "test"}],
            max_tokens=5
        )

        log_message("Azure OpenAI connection test: SUCCESS", "INFO")
        return True, "✅ Azure OpenAI connection successful"

    except Exception:
        log_message("Azure OpenAI connection test: FAILED", "ERROR")
        return False, "❌ Azure OpenAI connection failed. Check server configuration."


# --------------------------------------------------
# GET SANCTIONS DATA
# [V4] Uses stored procedure - no raw SQL from user input
# --------------------------------------------------
def get_sanctions_data() -> list[dict]:
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("EXEC sp_get_sanctions_data")
        columns = [c[0] for c in cursor.description]
        data = [dict(zip(columns, row)) for row in cursor.fetchall()]
        conn.close()
        log_message(f"Fetched {len(data)} sanctions records", "SQL")
        return data
    except Exception as e:
        _internal_logger.error("get_sanctions_data failed: %s", e)
        log_message("Failed to fetch sanctions data", "ERROR")
        raise


# --------------------------------------------------
# ADD SANCTION ENTRY
# [V4] Stored proc with typed params - no SQL injection risk
# [V5] Generic error returned to caller
# --------------------------------------------------
def add_sanction_entry(name: str, country: str, source: str, user_id=None) -> tuple[bool, str]:
    # [V7] Basic input length validation
    if not name or len(name) > 500:
        return False, "❌ Invalid name value."
    if country and len(country) > 200:
        return False, "❌ Invalid country value."
    if source and len(source) > 200:
        return False, "❌ Invalid source value."

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # [V4] Parameterized stored procedure call
        cursor.execute(
            "EXEC sp_add_sanction_entry ?, ?, ?, ?",
            user_id, name, country, source
        )
        conn.commit()
        conn.close()
        log_message(f"Sanction entry added by user {user_id}", "ACTIVITY")
        return True, "✅ Entry added successfully."
    except Exception as e:
        _internal_logger.error("add_sanction_entry failed: %s", e)
        log_message("Add sanction entry failed", "ERROR")
        # [V5][V6] No internal error details to UI
        return False, "❌ Failed to add entry. Please try again."


# --------------------------------------------------
# SAVE SCREENING ACTIVITY
# [V4] Parameterized sproc - safe
# --------------------------------------------------
def save_screening_activity(
    serial_number,
    lc_number,
    input_name,
    input_address,
    matches_data,
    total_matches,
    records_processed,
    duration_seconds=None,
    user_id=None
) -> bool:
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "EXEC sp_save_screening_activity ?, ?, ?, ?, ?, ?, ?, ?, ?",
            user_id,
            serial_number,
            lc_number,
            input_name,
            input_address,
            matches_data,
            total_matches,
            records_processed,
            duration_seconds
        )
        conn.commit()
        conn.close()
        log_message(
            f"Screening activity saved | Serial={_sanitize_log_message(str(serial_number))} | Matches={total_matches}",
            "ACTIVITY"
        )
        return True
    except Exception as e:
        _internal_logger.error("save_screening_activity failed: %s", e)
        log_message("Save screening activity failed", "ERROR")
        return False


# --------------------------------------------------
# RETRIEVE SCREENING ACTIVITY
# [V4] Parameterized - safe
# --------------------------------------------------
def retrieve_screening_activity(serial_number: str):
    # [V7] Validate serial number format before querying
    if not serial_number or not re.match(r'^[A-Za-z0-9\-]{1,100}$', serial_number):
        log_message("Invalid serial number format in retrieve request", "ERROR")
        return None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("EXEC sp_get_screening_activity ?", serial_number)
        row = cursor.fetchone()
        if not row:
            conn.close()
            return None
        columns = [c[0] for c in cursor.description]
        result = dict(zip(columns, row))
        conn.close()
        log_message(f"Retrieved screening activity: {_sanitize_log_message(serial_number)}", "ACTIVITY")
        return result
    except Exception as e:
        _internal_logger.error("retrieve_screening_activity failed: %s", e)
        log_message("Retrieve screening activity failed", "ERROR")
        return None


# --------------------------------------------------
# SAVE TOOL BILLING
# [V1] Sensitive billing params NOT printed to stdout
# --------------------------------------------------
def save_tool_billing(
    transaction_no,
    cifid=None,
    module=None,
    instrument_type=None,
    lifecycle=None,
    lc_number=None,
    variation=None,
    status="SUCCESS",
    user_id=None,
    request_tokens=None,
    response_tokens=None
) -> bool:
    # [V1] Removed console.print of billing details - use internal logger only
    _internal_logger.info(
        "Tool billing | TXN=%s | Module=%s | User=%s | ReqTokens=%s | RespTokens=%s",
        transaction_no, module, user_id, request_tokens, response_tokens
    )

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "EXEC sp_save_tool_billing ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?",
            transaction_no,
            cifid,
            module,
            instrument_type,
            lifecycle,
            lc_number,
            variation,
            status,
            user_id,
            request_tokens,
            response_tokens
        )
        conn.commit()
        conn.close()

        log_message(
            f"Tool billing saved | TXN={_sanitize_log_message(str(transaction_no))} | "
            f"REQ={request_tokens} | RESP={response_tokens}",
            "ACTIVITY"
        )
        return True

    except Exception as e:
        _internal_logger.error("save_tool_billing failed: %s", e)
        log_message("Tool billing failed", "ERROR")
        return False
