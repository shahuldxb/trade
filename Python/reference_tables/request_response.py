# TBML_matching/request_response.py

import json
import traceback
from TBML_matching.db_utils import get_db_connection



def create_instrument(
    transaction_no,
    cifno,
    user_id,
    model,
    prompt_id=None,
    prompt_text=None
):
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                EXEC sp_create_instrument
                    ?, ?, ?, ?, ?, ?, ?
            """, (
                transaction_no,
                cifno,
                "ACTIVE",
                prompt_id,
                prompt_text,
                user_id,
                model
            ))
            conn.commit()
            cur.close()
        print(f"[SUCCESS] Instrument created | txn={transaction_no}")

    except Exception:
        traceback.print_exc()

def update_instrument_prompt(transaction_no, prompt_text, prompt_id):
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            UPDATE tool_instrument
            SET
                prompt_text = ?,
                prompt_id   = ?
            WHERE transaction_no = ?
              AND prompt_id IS NULL
        """, (
            prompt_text,
            prompt_id,
            transaction_no
        ))
        conn.commit()
        cur.close()


def transaction_exists(transaction_no):
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("EXEC sp_transaction_exists ?", transaction_no)
        exists = cur.fetchone() is not None
        cur.close()
        return exists

def fetch_instrument_context(transaction_no):
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("EXEC sp_fetch_instrument_context ?", transaction_no)
        row = cur.fetchone()
        cur.close()

    if not row:
        return None

    return {
        "cifno": row[0],
        "prompt_id": row[1]
    }


def insert_llm_request(transaction_no, payload, token_count, user_id, model):
    try:
        if not transaction_exists(transaction_no):
            print(f"[WARN] Transaction not found: {transaction_no}")
            return None

        context = fetch_instrument_context(transaction_no)
        if not context:
            print(f"[WARN] Instrument context missing: {transaction_no}")
            return None

        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                EXEC sp_insert_llm_request
                    ?, ?, ?, ?, ?, ?, ?
            """, (
                transaction_no,
                json.dumps(payload),
                token_count,
                context["prompt_id"],
                context["cifno"],
                user_id,
                model
            ))
            request_id = cur.fetchone()[0]
            conn.commit()
            cur.close()

        print(f"[SUCCESS] LLM request inserted | request_id={request_id}")
        return request_id

    except Exception:
        print("[ERROR] insert_llm_request failed")
        traceback.print_exc()
        return None

def insert_llm_response(request_id, transaction_no, payload, token_count, user_id, model):
    try:
        context = fetch_instrument_context(transaction_no)
        if not context:
            print(f"[WARN] Instrument context missing: {transaction_no}")
            return

        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                EXEC sp_insert_llm_response
                    ?, ?, ?, ?, ?, ?, ?
            """, (
                request_id,
                transaction_no,
                json.dumps(payload),
                token_count,
                context["cifno"],
                user_id,
                model
            ))
            conn.commit()
            cur.close()
        print(f"[SUCCESS] LLM response inserted | request_id={request_id}")

    except Exception:
        print("[ERROR] insert_llm_response failed")
        traceback.print_exc()
