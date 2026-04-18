"""
tbml_goods_async.py (Secure)
----------------------------
Security fixes applied:
  [HIGH]   Global mutable counters replaced with asyncio-safe return aggregation
  [MEDIUM] Bare except replaced with typed exception handling + logging
"""

import asyncio
import re
from difflib import SequenceMatcher

from TBML_matching.azure_llm import explain_sanction_reason, semantic_similarity

MAX_LLM_PARALLEL = 25
CHUNK_SIZE = 50
semaphore = asyncio.Semaphore(MAX_LLM_PARALLEL)


def normalize(text: str) -> str:
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def similarity(a: str, b: str) -> float:
    try:
        return SequenceMatcher(None, normalize(a), normalize(b)).ratio()
    except Exception as exc:
        print(f"[ERROR][SIMILARITY] {type(exc).__name__}: {exc}")
        return 0.0


def keyword_overlap(a: str, b: str) -> float:
    try:
        ta = set(normalize(a).split())
        tb = set(normalize(b).split())
        return len(ta & tb) / max(len(ta | tb), 1)
    except Exception as exc:
        print(f"[ERROR][KEYWORD_OVERLAP] {type(exc).__name__}: {exc}")
        return 0.0


async def analyze_item_vs_control(item: dict, ctrl: dict) -> dict | None:
    """
    Returns a flag dict on match, or None.
    Token usage is returned inside the dict so callers can aggregate safely
    without touching shared state.
    """
    prompt_tokens = 0
    completion_tokens = 0

    try:
        code_score = similarity(item["good_code"], ctrl["control_code"])
        desc_score = similarity(item["description"], ctrl["description"])
        key_score  = keyword_overlap(item["description"], ctrl["keywords"])

        classical = max(code_score, desc_score, key_score)

        print(
            f"[GOODS-CLASSICAL] {item['good_code']} vs {ctrl['control_code']} "
            f"=> code={code_score:.2f} desc={desc_score:.2f} key={key_score:.2f}"
        )

        if classical < 0.75:
            return None

        async with semaphore:
            llm = semantic_similarity(
                item["description"],
                ctrl["description"],
                transaction_no=item.get("transaction_no"),
                user_id=item.get("user_id"),
            )

        prompt_tokens     += llm.get("prompt_tokens", 0)
        completion_tokens += llm.get("completion_tokens", 0)

        final = max(classical, llm["score"])
        print(f"[GOODS-LLM] {ctrl['control_code']} llm={llm['score']:.2f} final={final:.2f}")

        if final < 0.85:
            return None

        explanation = explain_sanction_reason(
            input_text=f"{item.get('good_code')} | {item.get('description')}",
            matched_text=f"{ctrl.get('control_code')} | {ctrl.get('description')}",
            context="Goods description or HS code matched a sanctioned/export-control item.",
            transaction_no=item.get("transaction_no"),
            user_id=item.get("user_id"),
        )
        prompt_tokens     += explanation.get("prompt_tokens", 0)
        completion_tokens += explanation.get("completion_tokens", 0)

        return {
            "FlagType":     "GOODS",
            "Rule":         "Export Control Item Match",
            "RiskLevel":    "High" if ctrl.get("is_military") else "Medium",
            "Reason":       explanation.get("explanation") or "Item matches export controlled goods",
            "Explanation":  explanation.get("explanation"),
            "MatchedValue": ctrl["control_code"],
            "Source":       ctrl["source"],
            "Score":        round(final, 2),
            "Techniques":   "Code+Description+Keywords+LLM",
            # carried inline — no global state touched
            "_prompt_tokens":     prompt_tokens,
            "_completion_tokens": completion_tokens,
        }

    except Exception as exc:
        print(
            f"[ERROR][GOODS-MATCH] Item={item.get('good_code')} "
            f"Control={ctrl.get('control_code')} {type(exc).__name__}: {exc}"
        )
        return None


async def analyze_item(item: dict, export_controls: list) -> tuple[list, int, int]:
    """Returns (flags, prompt_tokens, completion_tokens) for this item."""
    flags: list = []
    prompt_tokens = 0
    completion_tokens = 0

    try:
        for i in range(0, len(export_controls), CHUNK_SIZE):
            chunk = export_controls[i:i + CHUNK_SIZE]
            tasks = [analyze_item_vs_control(item, ctrl) for ctrl in chunk]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for r in results:
                if isinstance(r, Exception):
                    print(f"[ERROR][ASYNC-GATHER] {type(r).__name__}: {r}")
                elif r is not None:
                    # accumulate token usage locally
                    prompt_tokens     += r.pop("_prompt_tokens", 0)
                    completion_tokens += r.pop("_completion_tokens", 0)
                    flags.append(r)

    except Exception as exc:
        print(f"[ERROR][ANALYZE_ITEM] Item={item.get('good_code')} {type(exc).__name__}: {exc}")

    return flags, prompt_tokens, completion_tokens


async def tbml_goods_async(items: list, export_controls: list) -> tuple[list, dict]:
    """
    Returns (all_flags, token_usage_dict).
    Token counts are accumulated locally — no shared global state.
    """
    print("[TBML] Async GOODS analysis started")

    all_flags: list = []
    total_prompt = 0
    total_completion = 0

    try:
        for item in items:
            print(f"[TBML] Processing item: {item.get('good_code')}")
            flags, pt, ct = await analyze_item(item, export_controls)
            all_flags.extend(flags)
            total_prompt     += pt
            total_completion += ct

        print(
            f"[TBML] GOODS completed | Flags={len(all_flags)} | "
            f"PromptTokens={total_prompt} | CompletionTokens={total_completion}"
        )

    except Exception as exc:
        print(f"[ERROR][TBML-GOODS] {type(exc).__name__}: {exc}")

    return all_flags, {"prompt_tokens": total_prompt, "completion_tokens": total_completion}