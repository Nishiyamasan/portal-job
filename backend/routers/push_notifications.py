import os

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from routers.auth import get_current_user
from services.push_notifications import push_is_configured

router = APIRouter(tags=["push-notifications"])


@router.get("/config", response_model=schemas.PushNotificationConfig)
def get_push_config():
    public_key = os.getenv("VAPID_PUBLIC_KEY")
    return schemas.PushNotificationConfig(enabled=push_is_configured(), public_key=public_key)


@router.post("/subscriptions", response_model=schemas.PushSubscriptionResponse, status_code=status.HTTP_201_CREATED)
def save_push_subscription(
    subscription: schemas.PushSubscriptionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user),
):
    user_agent = subscription.user_agent or request.headers.get("user-agent")
    existing = db.query(models.PushSubscription).filter(
        models.PushSubscription.endpoint == subscription.endpoint
    ).first()

    if existing:
        existing.profile_id = current_user.id
        existing.p256dh = subscription.keys.p256dh
        existing.auth = subscription.keys.auth
        existing.user_agent = user_agent
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return existing

    db_subscription = models.PushSubscription(
        profile_id=current_user.id,
        endpoint=subscription.endpoint,
        p256dh=subscription.keys.p256dh,
        auth=subscription.keys.auth,
        user_agent=user_agent,
        is_active=True,
    )
    db.add(db_subscription)
    db.commit()
    db.refresh(db_subscription)
    return db_subscription


@router.delete("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
def delete_push_subscription(
    subscription: schemas.PushSubscriptionCreate,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user),
):
    existing = db.query(models.PushSubscription).filter(
        models.PushSubscription.endpoint == subscription.endpoint,
        models.PushSubscription.profile_id == current_user.id,
    ).first()
    if existing:
        existing.is_active = False
        db.commit()
    return None
