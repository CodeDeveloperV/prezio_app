import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

from redis.asyncio import Redis

# Only deletes the key if it still holds the token we set -- without this, a lock instance
# whose TTL already expired (e.g. it was held past its lease during a slow cycle) could delete
# a *different* holder's lock on release.
_RELEASE_SCRIPT = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
"""


class DistributedLock:
    """Redis-backed mutual exclusion for the alert-check cycle across multiple API instances.

    `SET key token NX EX ttl_seconds` is the acquire: NX means only one instance's SET
    succeeds when the key doesn't already exist, and EX guarantees the lock self-expires even
    if the holder crashes before releasing it -- there is no unlock-on-crash path otherwise.
    """

    def __init__(self, redis: Redis, key: str, *, ttl_seconds: int) -> None:
        self._redis = redis
        self._key = key
        self._ttl_seconds = ttl_seconds

    async def acquire(self) -> str | None:
        token = uuid.uuid4().hex
        acquired = await self._redis.set(self._key, token, nx=True, ex=self._ttl_seconds)
        return token if acquired else None

    async def release(self, token: str) -> None:
        await self._redis.eval(_RELEASE_SCRIPT, 1, self._key, token)

    @asynccontextmanager
    async def try_lock(self) -> AsyncIterator[bool]:
        """Yields True if the lock was acquired (caller should do the work), False otherwise
        (another instance is already running this cycle -- caller should skip it)."""
        token = await self.acquire()
        try:
            yield token is not None
        finally:
            if token is not None:
                await self.release(token)
