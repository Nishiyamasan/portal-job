import json
import logging
import os
import datetime
from typing import Any, Iterable

from database import SessionLocal

import models

try:
    from pywebpush import WebPushException, webpush
except ImportError:  # pragma: no cover - runtime environment may not enable push yet.
    WebPushException = Exception
    webpush = None

logger = logging.getLogger(__name__)


def push_is_configured() -> bool:
    return bool(os.getenv("VAPID_PUBLIC_KEY") and os.getenv("VAPID_PRIVATE_KEY") and webpush)


def send_web_push_payload(subscription: dict[str, Any], payload: dict) -> str:
    if not push_is_configured():
        return "skipped"

    try:
        webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": {
                    "p256dh": subscription["p256dh"],
                    "auth": subscription["auth"],
                },
            },
            data=json.dumps(payload),
            vapid_private_key=os.getenv("VAPID_PRIVATE_KEY"),
            vapid_claims={
                "sub": os.getenv("VAPID_SUBJECT", "mailto:admin@portal-job.local"),
            },
        )
        return "sent"
    except WebPushException as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        logger.warning("Web Push delivery failed: %s", exc)
        if status_code in {404, 410}:
            return "inactive"
        return "failed"
    except Exception as exc:
        logger.warning("Unexpected Web Push error: %s", exc)
        return "failed"


def send_subscription_payloads(subscriptions: Iterable[dict[str, Any]], payload: dict) -> None:
    sent_ids = []
    inactive_ids = []

    for subscription in subscriptions:
        status = send_web_push_payload(subscription, payload)
        if status == "sent":
            sent_ids.append(subscription["id"])
        elif status == "inactive":
            inactive_ids.append(subscription["id"])

    if not sent_ids and not inactive_ids:
        return

    db = SessionLocal()
    try:
        now = datetime.datetime.utcnow()
        if sent_ids:
            db.query(models.PushSubscription).filter(
                models.PushSubscription.id.in_(sent_ids)
            ).update({"last_used_at": now}, synchronize_session=False)
        if inactive_ids:
            db.query(models.PushSubscription).filter(
                models.PushSubscription.id.in_(inactive_ids)
            ).update({"is_active": False}, synchronize_session=False)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("Failed to update Web Push subscription status: %s", exc)
    finally:
        db.close()
