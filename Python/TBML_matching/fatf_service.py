"""
fatf_service.py (Secure)
------------------------
Security fix:
  [MEDIUM] API key sent ONLY in Authorization header — removed from query params
           (query params appear in server access logs and browser history)
"""

import os
import re
import time
from typing import Any, Dict, Iterable, Set

import requests
from dotenv import load_dotenv

load_dotenv()

_CACHE: Dict[str, Any] = {
    "expires_at": 0.0,
    "countries": set(),
}

_COUNTRY_KEYS = {
    "country",
    "country_name",
    "name",
    "jurisdiction",
    "state",
    "member_state",
}


def _normalize_country_name(value: str) -> str:
    if not value:
        return ""
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9\s-]", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def _extract_from_obj(obj: Any, out: Set[str]) -> None:
    if obj is None:
        return
    if isinstance(obj, str):
        n = _normalize_country_name(obj)
        if n and len(n) >= 3:
            out.add(n)
        return
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(k, str) and k.strip().lower() in _COUNTRY_KEYS and isinstance(v, str):
                n = _normalize_country_name(v)
                if n:
                    out.add(n)
            _extract_from_obj(v, out)
        return
    if isinstance(obj, Iterable):
        for item in obj:
            _extract_from_obj(item, out)


def _parse_country_names(payload: Any) -> Set[str]:
    countries: Set[str] = set()
    _extract_from_obj(payload, countries)
    return countries


def fetch_fatf_grey_countries() -> Set[str]:
    now = time.time()
    if now < _CACHE["expires_at"]:
        return set(_CACHE["countries"])

    url     = os.getenv("FATF_API_URL", "").strip()
    api_key = os.getenv("FATF_API_KEY", "").strip()
    ttl     = int(os.getenv("FATF_CACHE_TTL_SECONDS", "21600") or "21600")

    if not url:
        return set(_CACHE["countries"])

    # ✅ API key ONLY in headers — never in query params (avoids log exposure)
    headers: Dict[str, str] = {"Accept": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
        headers["x-api-key"] = api_key
    # params intentionally left empty — no api_key in query string

    try:
        res = requests.get(url, headers=headers, timeout=10)
        res.raise_for_status()
        payload = res.json()
        countries = _parse_country_names(payload)

        if countries:
            _CACHE["countries"] = countries
            _CACHE["expires_at"] = now + max(ttl, 60)
            print(f"[FATF] Loaded countries={len(countries)} ttl={ttl}s")
            return set(countries)

        print("[FATF][WARN] API returned no country entries")
        _CACHE["expires_at"] = now + 300
        return set(_CACHE["countries"])

    except requests.RequestException as exc:
        print(f"[FATF][WARN] fetch failed: {type(exc).__name__}")
        _CACHE["expires_at"] = now + 300
        return set(_CACHE["countries"])