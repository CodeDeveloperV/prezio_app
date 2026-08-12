import asyncio
import logging

from fastapi import WebSocket

from app.core.redis import get_redis

logger = logging.getLogger(__name__)

PRICE_UPDATES_CHANNEL_PREFIX = "price_updates:"
PRICE_UPDATES_PATTERN = f"{PRICE_UPDATES_CHANNEL_PREFIX}*"

SHOPPING_LIST_UPDATES_CHANNEL_PREFIX = "shopping_list_updates:"
SHOPPING_LIST_UPDATES_PATTERN = f"{SHOPPING_LIST_UPDATES_CHANNEL_PREFIX}*"

# Per-user channel for invitation notices: the invitee isn't a member of the list yet, so they
# can't be authorized onto the list's own topic -- this personal topic is the only thing they're
# allowed to subscribe to for themselves (see the /shopping-lists/ws handler).
USER_INVITATIONS_CHANNEL_PREFIX = "user_invitations:"
USER_INVITATIONS_PATTERN = f"{USER_INVITATIONS_CHANNEL_PREFIX}*"


def shopping_list_topic(shopping_list_id: int) -> str:
    # Non-numeric prefix so this can never collide with pricing's bare-numeric
    # store_product_id topics in the same ConnectionManager._topic_connections dict.
    return f"shopping_list:{shopping_list_id}"


def user_invitations_topic(user_id: int) -> str:
    return f"user_invitations:{user_id}"


class ConnectionManager:
    """Tracks local WebSocket connections per topic (topic = store_product_id, or the namespaced
    shopping_list:/user_invitations: keys above).

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
        await pubsub.psubscribe(PRICE_UPDATES_PATTERN, SHOPPING_LIST_UPDATES_PATTERN, USER_INVITATIONS_PATTERN)
        try:
            async for message in pubsub.listen():
                if message["type"] != "pmessage":
                    continue
                channel: str = message["channel"]
                if channel.startswith(SHOPPING_LIST_UPDATES_CHANNEL_PREFIX):
                    shopping_list_id = channel.removeprefix(SHOPPING_LIST_UPDATES_CHANNEL_PREFIX)
                    topic = shopping_list_topic(int(shopping_list_id))
                elif channel.startswith(USER_INVITATIONS_CHANNEL_PREFIX):
                    user_id = channel.removeprefix(USER_INVITATIONS_CHANNEL_PREFIX)
                    topic = user_invitations_topic(int(user_id))
                else:
                    topic = channel.removeprefix(PRICE_UPDATES_CHANNEL_PREFIX)
                await self._manager.broadcast_to_topic(topic, message["data"])
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Redis listener crashed, real-time updates will stop broadcasting")
        finally:
            await pubsub.punsubscribe(PRICE_UPDATES_PATTERN, SHOPPING_LIST_UPDATES_PATTERN, USER_INVITATIONS_PATTERN)
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
