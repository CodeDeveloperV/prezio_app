from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.redis import get_redis
from app.core.websocket_manager import connection_manager, shopping_list_topic, user_invitations_topic
from app.features.auth.dependencies import get_current_user, resolve_user_from_access_token
from app.features.notifications.repository import NotificationRepository
from app.features.notifications.service import NotificationService
from app.features.shopping_lists.exceptions import (
    DuplicatePendingInvitation,
    InvitationNotPending,
    InvitedUserAlreadyMember,
    ShoppingListAccessDenied,
    ShoppingListInvitationAccessDenied,
    ShoppingListInvitationNotFound,
    ShoppingListItemNotFound,
    ShoppingListItemVersionConflict,
    ShoppingListMemberNotFound,
    ShoppingListNotFound,
    ShoppingListOwnerCannotBeRemoved,
    ShoppingListPermissionDenied,
)
from app.features.shopping_lists.policy import ShoppingListPermissionService
from app.features.shopping_lists.repository import (
    ShoppingListInvitationRepository,
    ShoppingListItemRepository,
    ShoppingListMemberRepository,
    ShoppingListRepository,
)
from app.features.shopping_lists.schemas import (
    ShoppingListActiveBranchUpdate,
    ShoppingListCreate,
    ShoppingListInvitationCreate,
    ShoppingListInvitationRead,
    ShoppingListItemCreate,
    ShoppingListItemRead,
    ShoppingListItemUpdate,
    ShoppingListMemberRead,
    ShoppingListRead,
    ShoppingListSummaryRead,
)
from app.features.shopping_lists.service import ShoppingListService
from app.features.pricing.repository import StoreProductRepository
from app.features.stores.exceptions import StoreBranchNotFound
from app.features.stores.repository import StoreBranchRepository
from app.features.users.models import User
from app.features.users.repository import UserRepository

router = APIRouter(prefix="/shopping-lists", tags=["shopping_lists"])
invitations_router = APIRouter(prefix="/invitations", tags=["shopping_list_invitations"])


def get_shopping_list_service(
    db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)
) -> ShoppingListService:
    return ShoppingListService(
        db,
        ShoppingListRepository(db),
        ShoppingListItemRepository(db),
        ShoppingListMemberRepository(db),
        ShoppingListInvitationRepository(db),
        UserRepository(db),
        redis,
        NotificationService(db, NotificationRepository(db)),
        ShoppingListPermissionService(),
        StoreProductRepository(db),
        StoreBranchRepository(db),
    )


@router.get("", response_model=list[ShoppingListRead])
async def list_my_shopping_lists(
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> list[ShoppingListRead]:
    lists = await service.list_for_user(current_user.id)
    return [ShoppingListRead.model_validate(item) for item in lists]


@router.post("", response_model=ShoppingListRead, status_code=status.HTTP_201_CREATED)
async def create_shopping_list(
    payload: ShoppingListCreate,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> ShoppingListRead:
    shopping_list = await service.create(current_user.id, payload.name, payload.client_request_id)
    return ShoppingListRead.model_validate(shopping_list)


@router.get("/{shopping_list_id}", response_model=ShoppingListRead)
async def get_shopping_list(
    shopping_list_id: int,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> ShoppingListRead:
    try:
        shopping_list = await service.get(shopping_list_id, current_user.id)
    except ShoppingListNotFound as exc:
        raise HTTPException(404, "Shopping list not found") from exc
    except ShoppingListAccessDenied as exc:
        raise HTTPException(403, "You do not have access to this list") from exc
    return ShoppingListRead.model_validate(shopping_list)


@router.get("/{shopping_list_id}/summary", response_model=ShoppingListSummaryRead)
async def get_shopping_list_summary(
    shopping_list_id: int,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> ShoppingListSummaryRead:
    try:
        return await service.get_summary(shopping_list_id, current_user.id)
    except ShoppingListNotFound as exc:
        raise HTTPException(404, "Shopping list not found") from exc
    except ShoppingListAccessDenied as exc:
        raise HTTPException(403, "You do not have access to this list") from exc


@router.post("/{shopping_list_id}/archive", response_model=ShoppingListRead)
async def archive_shopping_list(
    shopping_list_id: int,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> ShoppingListRead:
    try:
        shopping_list = await service.archive(shopping_list_id, current_user.id)
    except ShoppingListNotFound as exc:
        raise HTTPException(404, "Shopping list not found") from exc
    except ShoppingListPermissionDenied as exc:
        raise HTTPException(403, str(exc)) from exc
    return ShoppingListRead.model_validate(shopping_list)


@router.delete("/{shopping_list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shopping_list(
    shopping_list_id: int,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> None:
    try:
        await service.delete(shopping_list_id, current_user.id)
    except ShoppingListNotFound as exc:
        raise HTTPException(404, "Shopping list not found") from exc
    except ShoppingListPermissionDenied as exc:
        raise HTTPException(403, str(exc)) from exc


@router.patch("/{shopping_list_id}/active-branch", response_model=ShoppingListRead)
async def set_active_branch(
    shopping_list_id: int,
    payload: ShoppingListActiveBranchUpdate,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> ShoppingListRead:
    try:
        shopping_list = await service.set_active_branch(
            shopping_list_id, current_user.id, payload.store_branch_id
        )
    except ShoppingListNotFound as exc:
        raise HTTPException(404, "Shopping list not found") from exc
    except ShoppingListPermissionDenied as exc:
        raise HTTPException(403, str(exc)) from exc
    except StoreBranchNotFound as exc:
        raise HTTPException(404, "Store branch not found") from exc
    return ShoppingListRead.model_validate(shopping_list)


@router.get("/{shopping_list_id}/members", response_model=list[ShoppingListMemberRead])
async def list_shopping_list_members(
    shopping_list_id: int,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> list[ShoppingListMemberRead]:
    try:
        members = await service.list_members(shopping_list_id, current_user.id)
    except ShoppingListNotFound as exc:
        raise HTTPException(404, "Shopping list not found") from exc
    except ShoppingListAccessDenied as exc:
        raise HTTPException(403, "You do not have access to this list") from exc
    return [ShoppingListMemberRead.model_validate(member) for member in members]


@router.delete("/{shopping_list_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_shopping_list_member(
    shopping_list_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> None:
    try:
        await service.remove_member(shopping_list_id, user_id, current_user.id)
    except ShoppingListNotFound as exc:
        raise HTTPException(404, "Shopping list not found") from exc
    except ShoppingListPermissionDenied as exc:
        raise HTTPException(403, str(exc)) from exc
    except ShoppingListMemberNotFound as exc:
        raise HTTPException(404, "Member not found") from exc
    except ShoppingListOwnerCannotBeRemoved as exc:
        raise HTTPException(400, "The list owner cannot be removed") from exc


@router.get("/{shopping_list_id}/items", response_model=list[ShoppingListItemRead])
async def list_shopping_list_items(
    shopping_list_id: int,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> list[ShoppingListItemRead]:
    try:
        items = await service.list_items(shopping_list_id, current_user.id)
    except ShoppingListNotFound as exc:
        raise HTTPException(404, "Shopping list not found") from exc
    except ShoppingListAccessDenied as exc:
        raise HTTPException(403, "You do not have access to this list") from exc
    return [ShoppingListItemRead.model_validate(item) for item in items]


@router.post(
    "/{shopping_list_id}/items",
    response_model=ShoppingListItemRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_shopping_list_item(
    shopping_list_id: int,
    payload: ShoppingListItemCreate,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> ShoppingListItemRead:
    try:
        item = await service.add_item(
            shopping_list_id,
            payload.product_id,
            payload.quantity,
            current_user.id,
            payload.client_request_id,
        )
    except ShoppingListNotFound as exc:
        raise HTTPException(404, "Shopping list not found") from exc
    except ShoppingListPermissionDenied as exc:
        raise HTTPException(403, str(exc)) from exc
    return ShoppingListItemRead.model_validate(item)


@router.patch("/{shopping_list_id}/items/{item_id}", response_model=ShoppingListItemRead)
async def update_shopping_list_item(
    shopping_list_id: int,
    item_id: int,
    payload: ShoppingListItemUpdate,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> ShoppingListItemRead | JSONResponse:
    try:
        updated = await service.update_item(
            shopping_list_id,
            item_id,
            current_user.id,
            expected_version=payload.version,
            quantity=payload.quantity,
            checked=payload.checked,
        )
    except ShoppingListNotFound as exc:
        raise HTTPException(404, "Shopping list not found") from exc
    except ShoppingListItemNotFound as exc:
        raise HTTPException(404, "Item not found") from exc
    except ShoppingListPermissionDenied as exc:
        raise HTTPException(403, str(exc)) from exc
    except ShoppingListItemVersionConflict as exc:
        # Client's version is stale: hand back the server's authoritative item state so it can retry.
        return JSONResponse(
            status_code=409,
            content={
                "detail": "Item was updated concurrently by someone else",
                "item": jsonable_encoder(ShoppingListItemRead.model_validate(exc.current_item)),
            },
        )
    return ShoppingListItemRead.model_validate(updated)


@router.delete("/{shopping_list_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shopping_list_item(
    shopping_list_id: int,
    item_id: int,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> None:
    try:
        await service.delete_item(shopping_list_id, item_id, current_user.id)
    except ShoppingListNotFound as exc:
        raise HTTPException(404, "Shopping list not found") from exc
    except ShoppingListPermissionDenied as exc:
        raise HTTPException(403, str(exc)) from exc


@router.post(
    "/{shopping_list_id}/invitations",
    response_model=ShoppingListInvitationRead,
    status_code=status.HTTP_201_CREATED,
)
async def invite_to_shopping_list(
    shopping_list_id: int,
    payload: ShoppingListInvitationCreate,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> ShoppingListInvitationRead:
    try:
        invitation = await service.create_invitation(shopping_list_id, payload.invited_email, current_user.id)
    except ShoppingListNotFound as exc:
        raise HTTPException(404, "Shopping list not found") from exc
    except ShoppingListPermissionDenied as exc:
        raise HTTPException(403, str(exc)) from exc
    except InvitedUserAlreadyMember as exc:
        raise HTTPException(400, "This user is already a member of the list") from exc
    except DuplicatePendingInvitation as exc:
        raise HTTPException(409, "There is already a pending invitation for this email") from exc
    return ShoppingListInvitationRead.model_validate(invitation)


@router.websocket("/ws")
async def shopping_list_updates_ws(websocket: WebSocket, db: AsyncSession = Depends(get_db)) -> None:
    """Clients send:
    - {"action": "subscribe"|"unsubscribe", "shopping_list_id": <int>} for a list's item/member
      events -- only allowed if the authenticated user is currently a member of that list.
    - {"action": "subscribe_invitations"} for the caller's own personal invitation-notice topic
      (there's no id to trust here: it's always the connection's own authenticated user).

    Auth is via a `token` query param (the WebSocket handshake carries no Authorization header) --
    the exact same access-token resolution REST uses (see resolve_user_from_access_token), so
    there's a single authorization path for both transports, not a second one.
    """
    token = websocket.query_params.get("token")
    user = await resolve_user_from_access_token(token, db) if token else None
    if user is None:
        await websocket.close(code=4401)
        return

    service = get_shopping_list_service(db, get_redis())

    await websocket.accept()
    try:
        while True:
            message = await websocket.receive_json()
            action = message.get("action")

            if action == "subscribe_invitations":
                connection_manager.subscribe(websocket, user_invitations_topic(user.id))
            elif action == "unsubscribe_invitations":
                connection_manager.unsubscribe(websocket, user_invitations_topic(user.id))
            elif action in ("subscribe", "unsubscribe"):
                shopping_list_id = message.get("shopping_list_id")
                if shopping_list_id is None:
                    continue
                topic = shopping_list_topic(int(shopping_list_id))
                if action == "unsubscribe":
                    connection_manager.unsubscribe(websocket, topic)
                    continue
                # Explicit membership check before every subscribe -- never trust just knowing
                # the id.
                if await service.can_subscribe(int(shopping_list_id), user.id):
                    connection_manager.subscribe(websocket, topic)
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)


@invitations_router.get("", response_model=list[ShoppingListInvitationRead])
async def list_my_invitations(
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> list[ShoppingListInvitationRead]:
    invitations = await service.list_invitations_for_user(current_user.id)
    return [ShoppingListInvitationRead.model_validate(invitation) for invitation in invitations]


@invitations_router.post("/{invitation_id}/accept", response_model=ShoppingListInvitationRead)
async def accept_invitation(
    invitation_id: int,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> ShoppingListInvitationRead:
    try:
        invitation = await service.accept_invitation(invitation_id, current_user.id)
    except ShoppingListInvitationNotFound as exc:
        raise HTTPException(404, "Invitation not found") from exc
    except ShoppingListInvitationAccessDenied as exc:
        raise HTTPException(403, "This invitation is not addressed to you") from exc
    except InvitationNotPending as exc:
        raise HTTPException(409, "This invitation is no longer pending") from exc
    return ShoppingListInvitationRead.model_validate(invitation)


@invitations_router.post("/{invitation_id}/decline", response_model=ShoppingListInvitationRead)
async def decline_invitation(
    invitation_id: int,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> ShoppingListInvitationRead:
    try:
        invitation = await service.decline_invitation(invitation_id, current_user.id)
    except ShoppingListInvitationNotFound as exc:
        raise HTTPException(404, "Invitation not found") from exc
    except ShoppingListInvitationAccessDenied as exc:
        raise HTTPException(403, "This invitation is not addressed to you") from exc
    except InvitationNotPending as exc:
        raise HTTPException(409, "This invitation is no longer pending") from exc
    return ShoppingListInvitationRead.model_validate(invitation)


@invitations_router.post("/{invitation_id}/revoke", response_model=ShoppingListInvitationRead)
async def revoke_invitation(
    invitation_id: int,
    current_user: User = Depends(get_current_user),
    service: ShoppingListService = Depends(get_shopping_list_service),
) -> ShoppingListInvitationRead:
    try:
        invitation = await service.revoke_invitation(invitation_id, current_user.id)
    except ShoppingListInvitationNotFound as exc:
        raise HTTPException(404, "Invitation not found") from exc
    except ShoppingListInvitationAccessDenied as exc:
        raise HTTPException(403, "You cannot revoke this invitation") from exc
    except InvitationNotPending as exc:
        raise HTTPException(409, "This invitation is no longer pending") from exc
    return ShoppingListInvitationRead.model_validate(invitation)
