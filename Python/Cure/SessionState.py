from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# Maximum number of log entries retained per session to prevent memory exhaustion.
_MAX_LOGS = 200

# Known state keys whose values must be specific types.
_EXPECTED_TYPES: dict[str, type] = {
    "files_loaded": dict,
    "discrepancies": dict,
    "cures": dict,
    "mt799": dict,
    "deduplicated_cures": dict,
    "db_pipeline": dict,
    "logs": list,
}


class SessionState(dict):
    """A dict that also supports attribute access like st.session_state.foo"""

    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError:
            raise AttributeError(
                f"SessionState has no attribute {name!r}. "
                "Check for typos or call init_session_state() first."
            ) from None

    def __setattr__(self, name: str, value: Any) -> None:
        expected = _EXPECTED_TYPES.get(name)
        if expected is not None and not isinstance(value, expected):
            raise TypeError(
                f"SessionState.{name} must be {expected.__name__}, "
                f"got {type(value).__name__}"
            )
        self[name] = value

    def append_log(self, message: str) -> None:
        """Append a log entry, capping the list at _MAX_LOGS to prevent memory exhaustion."""
        logs = self.get("logs")
        if not isinstance(logs, list):
            self["logs"] = []
            logs = self["logs"]
        logs.append(str(message))
        if len(logs) > _MAX_LOGS:
            del logs[: len(logs) - _MAX_LOGS]

    def init_session_state(self) -> None:
        """Initialize required keys (safe to call many times)."""
        self.setdefault(
            "files_loaded",
            {
                "lc_document": False,
                "sub_documents": False,
                "own_validation": False,
                "cross_validation": False,
                "moc_validation": False,
                "multihop_rag": False,
            },
        )
        self.setdefault("lc_document", "")
        self.setdefault("sub_documents", "")
        self.setdefault("discrepancies", {"own": [], "cross": [], "moc": [], "multihop": []})
        self.setdefault("selected_db_row", None)

        self.setdefault(
            "cures",
            {
                "own": [],
                "cross": [],
                "moc": [],
                "multihop": [],
                "overall_ai": None,
                "overall_rag": None,
            },
        )
        self.setdefault("mt799", {"overall_ai": None, "overall_rag": None})
        self.setdefault(
            "deduplicated_cures",
            {
                "all": [],
                "duplicates_found": [],
                "duplicate_check_done": False,
                "duplicate_method": None,
                "duplicate_error": None,
                "original_count": 0,
                "deduplicated_count": 0,
            },
        )
        self.setdefault(
            "db_pipeline",
            {"running": False, "step_index": None, "row": None, "error": None, "last_step": None},
        )
        self.setdefault("logs", [])

    def reset(self) -> None:
        """Reset the session state to initial values."""
        self["files_loaded"] = {
            "lc_document": False,
            "sub_documents": False,
            "own_validation": False,
            "cross_validation": False,
            "moc_validation": False,
            "multihop_rag": False,
        }
        self["lc_document"] = ""
        self["sub_documents"] = ""
        self["discrepancies"] = {"own": [], "cross": [], "moc": [], "multihop": []}
        self["selected_db_row"] = None

        self["cures"] = {
            "own": [],
            "cross": [],
            "moc": [],
            "multihop": [],
            "overall_ai": None,
            "overall_rag": None,
        }
        self["mt799"] = {"overall_ai": None, "overall_rag": None}
        self["deduplicated_cures"] = {
            "all": [],
            "duplicates_found": [],
            "duplicate_check_done": False,
            "duplicate_method": None,
            "duplicate_error": None,
            "original_count": 0,
            "deduplicated_count": 0,
        }
        self["db_pipeline"] = {"running": False, "step_index": None, "row": None, "error": None, "last_step": None}
        self["logs"] = []
