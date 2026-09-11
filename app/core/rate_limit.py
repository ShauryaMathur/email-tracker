from cachetools import TTLCache


class RateLimiter:
    """Fixed-window attempt limiter backed by an in-process TTL cache.

    In-process only — same tradeoff as HealthService's in-memory state:
    resets on redeploy/restart, doesn't coordinate across instances. Good
    enough for "slow down TOTP brute force", not meant as a durable ledger.
    """

    def __init__(self, max_attempts: int, window_seconds: int):
        self.max_attempts = max_attempts
        self._cache: TTLCache = TTLCache(maxsize=10000, ttl=window_seconds)

    def allow(self, key: str) -> bool:
        count = self._cache.get(key, 0)
        if count >= self.max_attempts:
            return False
        self._cache[key] = count + 1
        return True
