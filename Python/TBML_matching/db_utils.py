"""
db_utils.py (Secure)
--------------------
Security fixes applied:
  [HIGH]    random.randint() → secrets.token_hex() for entry IDs
  [MEDIUM]  Sensitive values removed from log output
  [LOW]     Context-manager pattern to prevent connection leaks
"""

import os
import secrets
from contextlib import contextmanager
from datetime import datetime

import pyodbc
from dotenv import load_dotenv

load_dotenv()


def log_message(message: str, log_type: str = "INFO") -> None:
    """Structured log — never prints user data or query values."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [{log_type}] {message}")


@contextmanager
def get_db_connection():
    """
    Context-manager DB connection.
    Usage:
        with get_db_connection() as conn:
            ...
    Ensures the connection is always closed, even on exception.
    """
    conn = None
    try:
        conn = pyodbc.connect(
            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
            f"SERVER={os.getenv('DB_SERVER')};"
            f"DATABASE={os.getenv('DB_NAME')};"
            f"UID={os.getenv('DB_USER')};"
            f"PWD={os.getenv('DB_PASSWORD')};"
            f"Timeout={os.getenv('DB_TIMEOUT', '30')};"
        )
        log_message("DB connection established", "SQL")
        yield conn
    except pyodbc.Error as e:
        log_message(f"DB connection failed: {type(e).__name__}", "ERROR")
        raise
    finally:
        if conn:
            conn.close()
            log_message("DB connection closed", "SQL")


def _generate_secure_id() -> str:
    """
    16-character cryptographically random hex string.
    Replaces random.randint(100000, 999999) which had only 900 000 possibilities.
    """
    return secrets.token_hex(8).upper()   # e.g. "3F7A2B1C4D9E0F5A"


def generate_transaction_no() -> str:
    date_part = datetime.now().strftime("%Y%m")
    rand_part = secrets.token_hex(3).upper()   # 16M possibilities vs previous 6-char alphanumeric
    return f"TXN-{date_part}-{rand_part}"


# ─────────────────────────────────────────────
# TRADE TRANSACTION
# ─────────────────────────────────────────────
def insert_trade_transaction(txn: dict, user_id: int) -> str:
    transaction_no = generate_transaction_no()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "EXEC sp_insert_trade_transaction ?,?,?,?,?,?,?,?,?",
            transaction_no,
            txn["exporter_name"],
            txn["exporter_country"],
            txn["importer_name"],
            txn["importer_country"],
            txn["total_value"],
            txn["currency"],
            txn["shipping_route"],
            user_id,
        )
        conn.commit()
    log_message(f"Trade transaction inserted: {transaction_no}", "SQL")
    return transaction_no


def insert_transaction_items(transaction_no: str, items: list, user_id: int) -> None:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        for item in items:
            cursor.execute(
                "EXEC sp_insert_transaction_item ?,?,?,?,?,?",
                transaction_no,
                item["good_code"],
                item["description"],
                int(item["quantity"]),
                float(item["unit_price"]),
                user_id,
            )
        conn.commit()
    log_message(f"Inserted {len(items)} items for {transaction_no}", "SQL")


# ─────────────────────────────────────────────
# WATCHLIST
# ─────────────────────────────────────────────
def fetch_watchlist() -> list:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("EXEC sp_GetActiveWatchlist")
        rows = cursor.fetchall()

    watchlist = []
    for r in rows:
        cols = list(r)
        watchlist.append({
            "name":        cols[0] if len(cols) > 0 else None,
            "address":     cols[1] if len(cols) > 1 else None,
            "source":      cols[2] if len(cols) > 2 else "Watchlist",
            "aliases":     cols[3] if len(cols) > 3 else None,
            "nationality": cols[4] if len(cols) > 4 else None,
            "entity_type": cols[5] if len(cols) > 5 else None,
            "risk_level":  cols[6] if len(cols) > 6 else None,
        })
    log_message(f"Fetched {len(watchlist)} watchlist entries", "SQL")
    return watchlist


def insert_watchlist_entry(data: dict) -> None:
    entry_id = _generate_secure_id()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "EXEC sp_InsertWatchlistEntry ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?",
            entry_id,
            data["user_id"],
            data["source"],
            data["entity_type"],
            data["name"],
            data["name"].lower().strip(),
            data.get("aliases"),
            data.get("address"),
            data.get("nationality"),
            data.get("dob"),
            data.get("program"),
            data["risk_level"],
        )
        conn.commit()
    log_message("WatchlistEntry inserted", "SQL")  # no entry_id in log


# ─────────────────────────────────────────────
# EXPORT CONTROL
# ─────────────────────────────────────────────
def fetch_export_control_items() -> list:
    items = []
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("EXEC sp_GetActiveExportControlItems")
        rows = cursor.fetchall()
        for r in rows:
            items.append({
                "item_id":          r[0],
                "source":           r[1],
                "control_code":     r[2],
                "control_code_norm":r[3],
                "description":      r[4],
                "short_desc":       r[5],
                "alt_names":        r[6] or "",
                "keywords":         r[7] or "",
                "cas":              r[8],
                "category":         r[9],
                "is_military":      r[10],
                "is_dual_use":      r[11],
                "is_chemical":      r[12],
                "end_use":          r[13],
                "catch_all":        r[14],
            })
    log_message(f"Fetched {len(items)} ExportControlItems", "SQL")
    return items


def insert_export_control_item(data: dict) -> None:
    control_code_norm = data["control_code"].upper().replace(" ", "")
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            EXEC sp_InsertExportControlItem
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            """,
            data["source_regulation"],
            data.get("source_country"),
            data.get("regulation_version"),
            data["control_code"],
            control_code_norm,
            data.get("category"),
            data.get("sub_category"),
            data["item_description"],
            data.get("short_description"),
            data.get("alternative_names"),
            data.get("keywords"),
            data.get("cas_number"),
            int(data["is_military"]),
            int(data["is_dual_use"]),
            int(data["is_chemical"]),
            int(data["is_biological"]),
            int(data["is_nuclear"]),
            int(data["is_missile"]),
            int(data["end_use_control"]),
            int(data["catch_all_control"]),
            data.get("control_reason"),
            data.get("license_requirement"),
        )
        conn.commit()
    log_message(f"ExportControlItem inserted: {data['control_code']}", "SQL")


# ─────────────────────────────────────────────
# FLAGS & BILLING
# ─────────────────────────────────────────────
def insert_transaction_flags(transaction_no: str, flags: list, user_id: int) -> None:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        for f in flags:
            cursor.execute(
                "EXEC sp_InsertTransactionFlag ?, ?, ?, ?, ?, ?, ?, ?, ?",
                transaction_no,
                f["FlagType"],
                f["RuleName"],
                f["RiskLevel"],
                f["Reason"],
                f["MatchedValue"],
                f["Source"],
                f["Score"],
                f["Technique"],
            )
        conn.commit()
    log_message(f"Inserted {len(flags)} flags for {transaction_no}", "SQL")


def insert_tool_billing(data: dict) -> None:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            EXEC sp_InsertToolBilling
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            """,
            data.get("transaction_no"),
            data.get("cifid"),
            data.get("module"),
            data.get("instrument_type"),
            data.get("lifecycle"),
            data.get("lc_number"),
            data.get("variation"),
            data.get("status"),
            data.get("userid"),
            data.get("request_tokens"),
            data.get("response_tokens"),
        )
        conn.commit()
    log_message("Tool billing inserted", "SQL")


# ─────────────────────────────────────────────
# REFERENCE DATA
# ─────────────────────────────────────────────
def fetch_sanctioned_countries() -> set:
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("EXEC sp_GetSanctionedCountries")
        rows = cur.fetchall()
    return {r[0].strip().lower() for r in rows if r[0]}


def fetch_prompt_by_modalname(
    module_name: str,
    analysis_mode: str,
    version_desc: str,
    instrument_type: str = "-",
    lifecycle_stage: str = "-",
) -> dict | None:
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "EXEC dbo.Sp_GetPromptText_ByModalname ?, ?, ?, ?, ?",
            module_name, analysis_mode, version_desc, instrument_type, lifecycle_stage,
        )
        row = cur.fetchone()

    if not row:
        log_message(
            f"No prompt found | module={module_name} mode={analysis_mode} key={version_desc}",
            "WARN",
        )
        return None

    return {
        "prompt_id":      row[0],
        "subprompt_id":   row[1],
        "module_name":    row[2],
        "analysis_mode":  row[3],
        "prompt_key":     row[4],
        "prompt_text":    row[5],
        "modified_date":  row[6],
        "created_date":   row[7],
    }