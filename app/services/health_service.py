import asyncio
import logging
import time
from dataclasses import dataclass

import app.supabase_client as supabase_client

logger = logging.getLogger(__name__)

# Table already used elsewhere (app/repository/email_repo.py); a 1-row select
# against it is the cheapest real round-trip we can make to prove Supabase is
# actually answering queries, not just resolving DNS.
PROBE_TABLE = "mail_sends"
CHECK_TIMEOUT_SECONDS = 5


@dataclass
class HealthCheckResult:
    supabase_up: bool
    transitioned_down: bool
    transitioned_up: bool
    down_duration_seconds: float | None = None


class HealthService:
    """Tracks Supabase reachability across /health calls and flags state transitions.

    State is in-process only (resets on redeploy/restart) — good enough here since
    the purpose is "alert me once when it goes down", not durable uptime history.
    """

    def __init__(self):
        # Optimistic default so a down reading on the very first check still
        # registers as a transition (and therefore alerts).
        self._supabase_up: bool = True
        self._down_since: float | None = None

    async def _probe_supabase(self) -> bool:
        client = supabase_client.supabase
        if client is None:
            logger.warning("Supabase health check: client not initialized")
            return False

        try:
            await asyncio.wait_for(
                client.table(PROBE_TABLE).select("id").limit(1).execute(),
                timeout=CHECK_TIMEOUT_SECONDS,
            )
            return True
        except Exception:
            logger.exception("Supabase health check failed")
            return False

    async def check(self) -> HealthCheckResult:
        is_up = await self._probe_supabase()

        transitioned_down = self._supabase_up and not is_up
        transitioned_up = (not self._supabase_up) and is_up

        if transitioned_down:
            self._down_since = time.monotonic()

        down_duration = None
        if transitioned_up and self._down_since is not None:
            down_duration = time.monotonic() - self._down_since

        if is_up:
            self._down_since = None

        self._supabase_up = is_up

        return HealthCheckResult(
            supabase_up=is_up,
            transitioned_down=transitioned_down,
            transitioned_up=transitioned_up,
            down_duration_seconds=down_duration,
        )
