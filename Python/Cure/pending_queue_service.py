# pending_queue_service.py
from __future__ import annotations
import logging
import re
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

# Maximum length accepted for the status filter string.
_MAX_STATUS_LEN = 64

# Allowed status values that may be passed to the DB layer.
_ALLOWED_STATUS_INPUTS = {
    "pending", "queue", "queued", "new", "open", "waiting", "all",
}


class PendingQueueService:
    """
    Service class for:
    - fetching pending discrepancies from SQL Server
    - filtering to truly pending statuses (same as Streamlit)
    """

    _PENDING_STATUS_VALUES = {
        "pending",
        "queue",
        "queued",
        "new",
        "open",
        "waiting",
    }

    # Pre-compiled pattern reused in every _is_pending_status call.
    _NON_ALNUM = re.compile(r"[^a-z0-9]+")

    def __init__(self):
        # Import lazily so a missing DB config does not crash the module at import time.
        from Cure.db_access import Dbaccess
        self._dba = Dbaccess()

    # -------------------------
    # Public API
    # -------------------------

    @staticmethod
    def _is_pending_status(value) -> bool:
        """Return True when status is pending (or a pending synonym)."""
        if value is None:
            return False
        normalized = PendingQueueService._NON_ALNUM.sub("", str(value).lower())
        return normalized in PendingQueueService._PENDING_STATUS_VALUES

    def refresh_pending_queue(self, status: str = "pending") -> List[Dict[str, Any]]:
        """
        Streamlit Refresh Pending Queue logic (standalone):
          pending_db_rows = fetch_pending_discrepancies("pending")
          pending_rows = [row for row in pending_db_rows if _is_pending_status(row["Status"])]
        """
        # Validate and sanitize the status parameter before passing to the DB layer.
        if not isinstance(status, str):
            status = "pending"
        status = status.strip()[:_MAX_STATUS_LEN]
        normalized = self._NON_ALNUM.sub("", status.lower())
        if normalized not in _ALLOWED_STATUS_INPUTS:
            logger.warning("refresh_pending_queue: rejected unknown status value")
            return []

        if normalized == "all":
            rows_by_id: Dict[str, Dict[str, Any]] = {}
            for st in ("pending", "progress", "completed", "failed", "error"):
                rows = self._dba.fetch_pending_discrepancies(st) or []
                for row in rows:
                    row_id = str(row.get("id") or "")
                    dedupe_key = row_id if row_id else f"{st}:{len(rows_by_id)}"
                    rows_by_id[dedupe_key] = row
            all_rows = list(rows_by_id.values())
            logger.debug("refresh_pending_queue returned %d rows for all statuses", len(all_rows))
            return all_rows

        rows = self._dba.fetch_pending_discrepancies(normalized) or []
        pending_rows = [
            row for row in rows
            if self._is_pending_status(row.get("Status", row.get("status")))
        ]
        logger.debug("refresh_pending_queue returned %d rows", len(pending_rows))
        return pending_rows
