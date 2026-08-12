import asyncio
import logging

from fastapi import WebSocket

from app.core.redis import get_redis

logger = logging.getLogger(__name__)

PRICE_UPDATES_CHANNEL_PREFIX = "price_updates:"
PRICE_UPDATES_PATTERN = f"{PRICE_UPDATES_CHANNEL_PREFIX}*"


class ConnectionManager:
    """Tracks local WebSocket connections per topic (topic = store_product_id as string).

    Only this process's sockets are held here. Cross-instance fan-out happens via
    Redis pub/sub (see RedisListener) so multiple API replicas stay in sync.
    """

    def __init__(self) -> None:
        self._topic_connections: dict[str, set[WebSocket]] = {}

    def subscribe(self, websocket: WebSocket, topic: str) -> None:
        self._topic_connections.setdefault(topic, set()).add(websocket)

    def unsubscribe(self, websocket: WebSocket, topic: str) -> None:
        connections = self._topic_connections.get(topic)
        if connections:
            connections.discard(websocket)
            if not connections:
                self._topic_connections.pop(topic, None)

    def disconnect(self, websocket: WebSocket) -> None:
        for topic in list(self._topic_connections.keys()):
            self.unsubscribe(websocket, topic)

    async def broadcast_to_topic(self, topic: str, message: str) -> None:
        for connection in list(self._topic_connections.get(topic, set())):
            try:
                await connection.send_text(message)
            except Exception:
                # Dead socket: drop it rather than let one bad client break the broadcast.
                self.unsubscribe(connection, topic)


connection_manager = ConnectionManager()


class RedisListener:
    """Background task that bridges Redis pub/sub messages into local WebSocket broadcasts."""

    def __init__(self, manager: ConnectionManager) -> None:
        self._manager = manager
        self._task: asyncio.Task | None = None

    async def _listen(self) -> None:
        redis = get_redis()
        pubsub = redis.pubsub()
        await pubsub.psubscribe(PRICE_UPDATES_PATTERN)
        try:
            async for message in pubsub.listen():
                if message["type"] != "pmessage":
                    continue
                channel: str = message["channel"]
                topic = channel.removeprefix(PRICE_UPDATES_CHANNEL_PREFIX)
                await self._manager.broadcast_to_topic(topic, message["data"])
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Redis listener crashed, price updates will stop broadcasting")
        finally:
            await pubsub.punsubscribe(PRICE_UPDATES_PATTERN)
            await pubsub.close()

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._listen())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None


redis_listener = RedisListener(connection_manager)
