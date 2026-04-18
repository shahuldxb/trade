"""
secure_matching_algorithms.py
VAPT Fixes Applied:
  [M1] Prompt injection prevention - user inputs sanitized before LLM prompt
  [M2] LLM response parsed safely - no eval(), no exec()
  [M3] MD5 replaced with SHA-256 for cache key (MD5 is not collision-safe)
  [M4] Global mutable token counters made thread-safe with threading.Lock
  [M5] Embedding cache size bounded to prevent unbounded memory growth
  [M6] Exception details NOT propagated to callers - logged internally only
  [M7] print() usage removed from production paths (only internal logger)
"""

import re
import os
import math
import hashlib
import logging
import threading
from functools import lru_cache
from typing import TypedDict
from urllib.parse import urlparse
from dotenv import load_dotenv
from reference_tables.request_response import (
    insert_llm_request,
    insert_llm_response,
    update_instrument_prompt
)

load_dotenv()

_logger = logging.getLogger("sanctions.matching")

# --------------------------------------------------
# [M4] Thread-safe token counters
# --------------------------------------------------
_token_lock = threading.Lock()
TOTAL_PROMPT_TOKENS = 0
TOTAL_COMPLETION_TOKENS = 0


def _add_tokens(prompt: int, completion: int):
    global TOTAL_PROMPT_TOKENS, TOTAL_COMPLETION_TOKENS
    with _token_lock:
        TOTAL_PROMPT_TOKENS += prompt
        TOTAL_COMPLETION_TOKENS += completion


# --------------------------------------------------
# FUZZY MATCHING
# --------------------------------------------------
try:
    from rapidfuzz import fuzz
    USING_RAPIDFUZZ = True
except ImportError:
    fuzz = None
    USING_RAPIDFUZZ = False
    _logger.warning("rapidfuzz not found - fuzzy matching disabled")

# --------------------------------------------------
# PHONETIC
# --------------------------------------------------
try:
    from phonetics import metaphone
except Exception:
    metaphone = None
    _logger.warning("phonetics not available")

# --------------------------------------------------
# AZURE OPENAI
# --------------------------------------------------
try:
    from openai import AzureOpenAI
except Exception:
    AzureOpenAI = None

# --------------------------------------------------
# LANGGRAPH
# --------------------------------------------------
try:
    from langgraph.graph import StateGraph, END
    from langchain_openai import AzureChatOpenAI
    LANGGRAPH_AVAILABLE = True
    _LANGGRAPH_IMPORT_ERROR = None
except Exception as e:
    StateGraph = None
    END = None
    AzureChatOpenAI = None
    LANGGRAPH_AVAILABLE = False
    _LANGGRAPH_IMPORT_ERROR = e

# --------------------------------------------------
# GLOBALS
# --------------------------------------------------
EMBEDDING_MODEL = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")
CHAT_MODEL = os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT")

_llm_cache: dict = {}
# [M5] Bounded embedding cache - max 5000 entries
_MAX_EMBEDDING_CACHE = 5000
_embedding_cache: dict = {}
_LLM_GRAPH = None


# --------------------------------------------------
# CLIENT
# --------------------------------------------------
def get_azure_client():
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    api_version = os.getenv("AZURE_OPENAI_API_VERSION")

    if not all([endpoint, api_key, api_version]):
        raise ValueError("Azure OpenAI credentials not configured.")

    return AzureOpenAI(
        azure_endpoint=endpoint,
        api_key=api_key,
        api_version=api_version
    )


# --------------------------------------------------
# LANGGRAPH HELPERS
# --------------------------------------------------
class LLMState(TypedDict):
    prompt: str
    response_text: str
    prompt_tokens: int
    completion_tokens: int


def normalize_azure_endpoint(endpoint: str | None) -> str | None:
    if not endpoint:
        return None
    endpoint = endpoint.strip().strip('"').strip("'")
    parsed = urlparse(endpoint)
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    return endpoint.rstrip("/")


@lru_cache(maxsize=1)
def build_llm_client():
    if not LANGGRAPH_AVAILABLE:
        raise ImportError(f"LangGraph/AzureChatOpenAI not available: {_LANGGRAPH_IMPORT_ERROR}")

    endpoint = (
        os.getenv("AZURE_OPENAI_ENDPOINT_MULTI")
        or os.getenv("AZURE_OPENAI_ENDPOINT")
    )
    endpoint = normalize_azure_endpoint(endpoint)
    if not endpoint:
        raise ValueError("Missing AZURE_OPENAI_ENDPOINT(_MULTI)")

    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    api_version = os.getenv("AZURE_OPENAI_API_VERSION")
    deployment = os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT")

    return AzureChatOpenAI(
        azure_endpoint=endpoint,
        api_key=api_key,
        api_version=api_version,
        azure_deployment=deployment,
    )


def _extract_token_usage(response) -> tuple[int, int]:
    prompt_tokens = 0
    completion_tokens = 0

    usage = getattr(response, "usage_metadata", None)
    if usage:
        prompt_tokens = usage.get("input_tokens") or usage.get("prompt_tokens") or 0
        completion_tokens = (
            usage.get("output_tokens") or usage.get("completion_tokens") or 0
        )

    response_metadata = getattr(response, "response_metadata", None)
    if response_metadata:
        token_usage = response_metadata.get("token_usage") or {}
        prompt_tokens = token_usage.get("prompt_tokens", prompt_tokens) or prompt_tokens
        completion_tokens = token_usage.get("completion_tokens", completion_tokens) or completion_tokens

    additional_kwargs = getattr(response, "additional_kwargs", None)
    if additional_kwargs:
        token_usage = additional_kwargs.get("token_usage") or additional_kwargs.get("usage") or {}
        prompt_tokens = token_usage.get("prompt_tokens", prompt_tokens) or prompt_tokens
        completion_tokens = token_usage.get("completion_tokens", completion_tokens) or completion_tokens

    return int(prompt_tokens or 0), int(completion_tokens or 0)


def call_llm(state: LLMState) -> LLMState:
    llm = build_llm_client()
    prompt = state.get("prompt", "")
    response = llm.invoke(prompt, temperature=0, max_tokens=150)

    response_text = getattr(response, "content", None)
    if response_text is None:
        response_text = str(response)

    prompt_tokens, completion_tokens = _extract_token_usage(response)
    return {
        "prompt": prompt,
        "response_text": response_text,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
    }


def get_llm_graph():
    global _LLM_GRAPH
    if _LLM_GRAPH is not None:
        return _LLM_GRAPH
    if not LANGGRAPH_AVAILABLE:
        raise ImportError(f"LangGraph not available: {_LANGGRAPH_IMPORT_ERROR}")
    graph = StateGraph(LLMState)
    graph.add_node("call_llm", call_llm)
    graph.set_entry_point("call_llm")
    graph.add_edge("call_llm", END)
    _LLM_GRAPH = graph.compile()
    return _LLM_GRAPH


# --------------------------------------------------
# HELPERS
# --------------------------------------------------
def normalize_text(text: str) -> str:
    return " ".join(text.lower().strip().split()) if text else ""


def _sanitize_for_prompt(text: str) -> str:
    """
    [M1] Sanitize user-supplied text before inserting into LLM prompt.
    - Strip prompt injection attempts (role-play, instruction overrides).
    - Limit length.
    - Remove control characters.
    """
    if not text:
        return ""
    # Strip control characters
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    # Remove common prompt injection patterns (case-insensitive)
    injection_patterns = [
        r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions?",
        r"you\s+are\s+now\s+",
        r"act\s+as\s+",
        r"pretend\s+(you\s+are|to\s+be)",
        r"disregard\s+(all\s+)?",
        r"system\s*:",
        r"<\s*/?system\s*>",
        r"\[INST\]",
        r"###\s*Instruction",
    ]
    for pattern in injection_patterns:
        text = re.sub(pattern, "[REDACTED]", text, flags=re.IGNORECASE)
    # Limit length
    return text[:300]


def hash_key(*args) -> str:
    """[M3] SHA-256 cache key (MD5 removed - collision risk)."""
    raw = "|".join([str(a) for a in args]).encode()
    return hashlib.sha256(raw).hexdigest()


def cosine_similarity(v1, v2) -> float:
    dot = sum(a * b for a, b in zip(v1, v2))
    mag1 = math.sqrt(sum(a * a for a in v1))
    mag2 = math.sqrt(sum(b * b for b in v2))
    return dot / (mag1 * mag2) if mag1 and mag2 else 0.0


# --------------------------------------------------
# 1 EXACT
# --------------------------------------------------
def exact_match(a: str, b: str) -> dict:
    return {'match': a == b, 'score': 1.0 if a == b else 0.0, 'technique': '1 Exact'}


# --------------------------------------------------
# 2 CASE INSENSITIVE
# --------------------------------------------------
def case_insensitive_match(a: str, b: str) -> dict:
    a, b = normalize_text(a), normalize_text(b)
    return {'match': a == b, 'score': 1.0 if a == b else 0.0, 'technique': '2 Case'}


# --------------------------------------------------
# 3 FUZZY
# --------------------------------------------------
def fuzzy_similarity(a: str, b: str, threshold: int = 80) -> dict:
    if not a or not b:
        return {'match': False, 'score': 0.0, 'technique': '3 Fuzzy', 'details': 'Empty field'}
    if not USING_RAPIDFUZZ or fuzz is None:
        return {'match': False, 'score': 0.0, 'technique': '3 Fuzzy', 'details': 'rapidfuzz not available'}
    score = fuzz.token_sort_ratio(a, b)
    return {'match': score >= threshold, 'score': score / 100, 'technique': '3 Fuzzy',
            'details': f"Token sort score: {score}"}


# --------------------------------------------------
# 4 TOKEN SET
# --------------------------------------------------
def token_set_match(a: str, b: str, threshold: int = 80) -> dict:
    if not a or not b:
        return {'match': False, 'score': 0.0, 'technique': '4 Token', 'details': 'Empty field'}
    if not USING_RAPIDFUZZ or fuzz is None:
        return {'match': False, 'score': 0.0, 'technique': '4 Token', 'details': 'rapidfuzz not available'}
    score = max(fuzz.token_set_ratio(a, b), fuzz.token_sort_ratio(a, b))
    return {'match': score >= threshold, 'score': score / 100, 'technique': '4 Token',
            'details': f"Token score: {score}"}


# --------------------------------------------------
# 5 PHONETIC
# --------------------------------------------------
def phonetic_similarity(a: str, b: str) -> dict:
    if not metaphone or not a or not b:
        return {'match': False, 'score': 0.0, 'technique': '5 Phonetic',
                'details': 'phonetics not available or empty field'}
    m1 = metaphone(a)
    m2 = metaphone(b)
    match = (m1 == m2)
    return {'match': match, 'score': 1.0 if match else 0.0, 'technique': '5 Phonetic',
            'details': f"metaphone match: {match}"}


# --------------------------------------------------
# 6 NGRAM
# --------------------------------------------------
def ngram_jaccard_similarity(a: str, b: str, n: int = 2) -> dict:
    def grams(t):
        return set(t[i:i + n] for i in range(len(t) - n + 1))
    a, b = normalize_text(a), normalize_text(b)
    g1, g2 = grams(a), grams(b)
    score = len(g1 & g2) / len(g1 | g2) if g1 | g2 else 0
    return {'match': score >= 0.5, 'score': score, 'technique': '6 NGram',
            'details': f"Jaccard score: {score:.3f}"}


# --------------------------------------------------
# 7 EMBEDDING
# [M5] Bounded cache
# [M6] Exception swallowed safely
# --------------------------------------------------
def embedding_similarity(input_name: str, db_name: str, input_addr: str, db_addr: str) -> dict:
    try:
        key = hash_key(input_name, db_name, input_addr or "", db_addr or "")

        if key in _embedding_cache:
            return _embedding_cache[key]

        client = get_azure_client()
        text1 = f"{input_name or ''} {input_addr or ''}"
        text2 = f"{db_name or ''} {db_addr or ''}"

        resp1 = client.embeddings.create(model=EMBEDDING_MODEL, input=text1)
        resp2 = client.embeddings.create(model=EMBEDDING_MODEL, input=text2)

        _add_tokens(
            resp1.usage.prompt_tokens + resp2.usage.prompt_tokens,
            (resp1.usage.total_tokens - resp1.usage.prompt_tokens) +
            (resp2.usage.total_tokens - resp2.usage.prompt_tokens)
        )

        v1 = resp1.data[0].embedding
        v2 = resp2.data[0].embedding
        score = cosine_similarity(v1, v2)

        result = {
            "match": score >= 0.85,
            "score": score,
            "technique": "7 Embedding",
            "details": f"Cosine similarity: {score:.4f}"
        }

        # [M5] Evict oldest entry if cache is full
        if len(_embedding_cache) >= _MAX_EMBEDDING_CACHE:
            oldest_key = next(iter(_embedding_cache))
            del _embedding_cache[oldest_key]

        _embedding_cache[key] = result
        return result

    except Exception as e:
        _logger.error("embedding_similarity failed: %s", e)
        return {"match": False, "score": 0.0, "technique": "7 Embedding",
                "details": "Embedding unavailable"}


# --------------------------------------------------
# 8 SEMANTIC LLM
# [M1] Sanitized prompt - no injection
# [M2] Safe response parsing
# [M4] Thread-safe token update
# --------------------------------------------------
def semantic_llm_similarity(
    input_name: str, db_name: str,
    input_addr: str, db_addr: str,
    transaction_no: str, user_id
) -> dict:
    request_id = None

    try:
        # [M1] Sanitize all user-derived values before embedding in prompt
        safe_input_name = _sanitize_for_prompt(input_name)
        safe_db_name = _sanitize_for_prompt(db_name)
        safe_input_addr = _sanitize_for_prompt(input_addr) if input_addr else "Not provided"
        safe_db_addr = _sanitize_for_prompt(db_addr) if db_addr else "Not provided"

        prompt = (
            "You are an expert in entity matching and sanctions screening.\n\n"
            "Analyze if these two entities represent the same person or organization.\n\n"
            "Input Entity:\n"
            f"- Name: {safe_input_name}\n"
            f"- Address: {safe_input_addr}\n\n"
            "Database Entity:\n"
            f"- Name: {safe_db_name}\n"
            f"- Address: {safe_db_addr}\n\n"
            "Respond ONLY in this exact format:\n"
            "MATCH: [YES/NO]\n"
            "CONFIDENCE: [0.0-1.0]\n"
            "REASONING: [Brief explanation]"
        )

        update_instrument_prompt(
            transaction_no=transaction_no,
            prompt_id=request_id,
            prompt_text=prompt
        )

        graph = get_llm_graph()
        result = graph.invoke({"prompt": prompt})
        text = (result.get("response_text") or "").strip()

        prompt_tokens = int(result.get("prompt_tokens") or 0)
        completion_tokens = int(result.get("completion_tokens") or 0)

        # [M4] Thread-safe update
        _add_tokens(prompt_tokens, completion_tokens)

        request_id = insert_llm_request(
            transaction_no=transaction_no,
            payload={"module": "SANCTIONS", "action": "flagging", "prompt": prompt},
            token_count=prompt_tokens,
            user_id=user_id,
            model="SANCTIONS",
        )

        insert_llm_response(
            request_id=request_id,
            transaction_no=transaction_no,
            payload=text,
            token_count=completion_tokens,
            user_id=user_id,
            model="SANCTIONS"
        )

        # [M2] Safe parsing - only check for the expected token, no eval/exec
        match = bool(re.search(r"^MATCH:\s*YES", text, re.IGNORECASE | re.MULTILINE))

        return {
            "match": match,
            "score": 1.0 if match else 0.0,
            "technique": "LLM",
            "details": text
        }

    except Exception as e:
        _logger.error("semantic_llm_similarity failed: %s", e)
        return {"match": False, "score": 0.0, "technique": "LLM",
                "details": "LLM unavailable"}


# --------------------------------------------------
# MAIN ENTRY
# --------------------------------------------------
def run_all_matching_techniques(
    input_name: str,
    input_addr: str,
    db_record: dict,
    transaction_no: str,
    user_id
) -> dict:
    input_name_n = normalize_text(input_name)
    input_addr_n = normalize_text(input_addr)
    db_name_n = normalize_text(db_record.get("name", ""))
    db_addr_n = normalize_text(db_record.get("country", ""))

    fuzzy = fuzzy_similarity(input_name_n, db_name_n)
    token = token_set_match(input_name_n, db_name_n)
    techniques = [fuzzy, token]

    is_candidate = max(fuzzy['score'], token['score']) >= 0.6

    if is_candidate:
        embedding = embedding_similarity(input_name_n, db_name_n, input_addr_n, db_addr_n)
        techniques.append(embedding)

        llm = semantic_llm_similarity(
            input_name_n, db_name_n, input_addr_n, db_addr_n,
            transaction_no, user_id
        )
        techniques.append(llm)

    return {
        'db_record': db_record,
        'any_match': any(t['match'] for t in techniques),
        'max_score': max(t['score'] for t in techniques),
        'techniques': techniques
    }