import os
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, case, func
from sqlalchemy.exc import IntegrityError
from typing import List
from uuid import UUID
from routers.auth import get_current_user
from database import get_db
import models, schemas
from services.push_notifications import send_subscription_payloads

router = APIRouter(tags=["messages"])
logger = logging.getLogger(__name__)

def get_or_create_placeholder_profile(profile_id: UUID, db: Session) -> models.Profile:
    profile = db.query(models.Profile).filter(models.Profile.id == profile_id).first()
    if profile:
        return profile

    profile = models.Profile(
        id=profile_id,
        email=f"{profile_id}@placeholder.portal-job.local",
        display_name="User",
        role="user",
    )
    db.add(profile)
    db.flush()
    return profile

@router.post("/", response_model=schemas.MessageResponse)
def send_message(
    message: schemas.MessageCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    if not message.content.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message content is required")

    shop = db.query(models.Shop.id).filter(models.Shop.id == message.shop_id).first()
    if not shop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shop not found")

    get_or_create_placeholder_profile(message.receiver_id, db)

    db_message = models.Message(
        sender_id=current_user.id,
        receiver_id=message.receiver_id,
        shop_id=message.shop_id,
        content=message.content.strip()
    )
    db.add(db_message)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e.orig))
    db.refresh(db_message)

    enriched_message = db.query(models.Message).options(
        joinedload(models.Message.sender).joinedload(models.Profile.media_assets),
        joinedload(models.Message.receiver).joinedload(models.Profile.media_assets),
        joinedload(models.Message.shop).joinedload(models.Shop.media_assets),
    ).filter(models.Message.id == db_message.id).first()

    subscriptions = db.query(models.PushSubscription).filter(
        models.PushSubscription.profile_id == message.receiver_id,
        models.PushSubscription.is_active == True
    ).all()
    if subscriptions:
        frontend_url = os.getenv("FRONTEND_URL", os.getenv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000")).rstrip("/")
        subscription_payloads = [
            {
                "id": subscription.id,
                "endpoint": subscription.endpoint,
                "p256dh": subscription.p256dh,
                "auth": subscription.auth,
            }
            for subscription in subscriptions
        ]
        background_tasks.add_task(
            send_subscription_payloads,
            subscription_payloads,
            {
                "title": "portal-job メッセージ",
                "body": f"{current_user.display_name or 'ユーザー'}さんから新しいメッセージが届きました。",
                "url": f"{frontend_url}/ja/chat/{message.shop_id}/{current_user.id}",
                "tag": f"message-{message.shop_id}-{current_user.id}",
            }
        )

    return enriched_message

@router.get("/conversation/{shop_id}/{other_user_id}", response_model=List[schemas.MessageResponse])
def get_conversation(
    shop_id: UUID,
    other_user_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    try:
        messages = db.query(models.Message).options(
            joinedload(models.Message.sender).joinedload(models.Profile.media_assets),
            joinedload(models.Message.receiver).joinedload(models.Profile.media_assets),
            joinedload(models.Message.shop).joinedload(models.Shop.media_assets),
        ).filter(
            models.Message.shop_id == shop_id,
            or_(
                and_(models.Message.sender_id == current_user.id, models.Message.receiver_id == other_user_id),
                and_(models.Message.sender_id == other_user_id, models.Message.receiver_id == current_user.id)
            )
        ).order_by(models.Message.created_at.asc()).all()

        # Mark messages as read
        unread_messages = [m for m in messages if m.receiver_id == current_user.id and not m.is_read]
        for m in unread_messages:
            m.is_read = True
        if unread_messages:
            try:
                db.commit()
            except Exception as e:
                logger.warning("Failed to mark conversation messages as read")
                db.rollback()

        return messages
    except Exception as e:
        logger.error(f"Error in get_conversation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/conversations", response_model=List[schemas.ConversationSummary])
def get_recent_conversations(
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    other_user_case = case(
        (models.Message.sender_id == current_user.id, models.Message.receiver_id),
        else_=models.Message.sender_id,
    )
    other_user_expr = other_user_case.label("other_user_id")

    ranked_messages = db.query(
        models.Message.id.label("message_id"),
        models.Message.shop_id.label("shop_id"),
        other_user_expr,
        func.row_number().over(
            partition_by=(models.Message.shop_id, other_user_case),
            order_by=models.Message.created_at.desc(),
        ).label("row_number"),
    ).filter(
        models.Message.shop_id.isnot(None),
        or_(
            models.Message.sender_id == current_user.id,
            models.Message.receiver_id == current_user.id,
        ),
    ).subquery()

    latest_rows = db.query(
        ranked_messages.c.message_id,
        ranked_messages.c.shop_id,
        ranked_messages.c.other_user_id,
    ).filter(ranked_messages.c.row_number == 1).all()

    if not latest_rows:
        return []

    latest_message_ids = [row.message_id for row in latest_rows]
    latest_messages = db.query(models.Message).options(
        joinedload(models.Message.sender).joinedload(models.Profile.media_assets),
        joinedload(models.Message.receiver).joinedload(models.Profile.media_assets),
        joinedload(models.Message.shop).joinedload(models.Shop.media_assets),
    ).filter(models.Message.id.in_(latest_message_ids)).all()
    latest_by_id = {message.id: message for message in latest_messages}

    unread_rows = db.query(
        models.Message.shop_id,
        models.Message.sender_id.label("other_user_id"),
        func.count(models.Message.id).label("unread_count"),
    ).filter(
        models.Message.shop_id.isnot(None),
        models.Message.receiver_id == current_user.id,
        models.Message.is_read == False,
    ).group_by(models.Message.shop_id, models.Message.sender_id).all()
    unread_counts = {
        (row.shop_id, row.other_user_id): row.unread_count
        for row in unread_rows
    }

    results = []
    rows_with_messages = [row for row in latest_rows if row.message_id in latest_by_id]
    sorted_rows = sorted(
        rows_with_messages,
        key=lambda row: latest_by_id[row.message_id].created_at,
        reverse=True,
    )

    for row in sorted_rows:
        last_msg = latest_by_id.get(row.message_id)
        if not last_msg:
            continue

        other_user = last_msg.receiver if last_msg.sender_id == current_user.id else last_msg.sender

        results.append(schemas.ConversationSummary(
            shop_id=row.shop_id,
            other_user_id=row.other_user_id,
            shop=schemas.ShopResponse.model_validate(last_msg.shop) if last_msg.shop else None,
            other_user=schemas.ProfileResponse.model_validate(other_user) if other_user else None,
            last_message=schemas.MessageResponse.model_validate(last_msg),
            unread_count=unread_counts.get((row.shop_id, row.other_user_id), 0)
        ))

    return results
