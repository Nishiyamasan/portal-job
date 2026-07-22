from datetime import datetime, timezone
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from routers.auth import get_current_user

router = APIRouter(tags=["system-settings"])


DEFAULT_SYSTEM_SETTINGS: Dict[str, str] = {
    "terms_ja": "# 利用規約\n\n現在、利用規約の本文を準備中です。",
    "terms_en": "# Terms of Service\n\nThe Terms of Service content is being prepared.",
    "privacy_ja": "# プライバシーポリシー\n\n現在、プライバシーポリシーの本文を準備中です。",
    "privacy_en": "# Privacy Policy\n\nThe Privacy Policy content is being prepared.",
}


def get_supervisor(user: models.Profile = Depends(get_current_user)) -> models.Profile:
    if not user or user.role not in ["supervisor", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Supervisor access required",
        )
    return user


def normalize_setting_key(key: str) -> str:
    normalized = key.strip().lower()
    if not normalized:
        raise HTTPException(status_code=400, detail="Setting key is required")
    return normalized


def build_setting_response_from_default(key: str) -> schemas.SystemSettingResponse:
    if key not in DEFAULT_SYSTEM_SETTINGS:
        raise HTTPException(status_code=404, detail="Setting not found")
    return schemas.SystemSettingResponse(
        key=key,
        value=DEFAULT_SYSTEM_SETTINGS[key],
        updated_by=None,
        updated_at=None,
        source="default",
    )


@router.get("/public/system-settings/{key}", response_model=schemas.SystemSettingResponse)
def get_public_system_setting(
    key: str,
    db: Session = Depends(get_db),
):
    normalized_key = normalize_setting_key(key)
    setting = db.query(models.SystemSetting).filter(models.SystemSetting.key == normalized_key).first()
    if setting:
        return schemas.SystemSettingResponse.model_validate(setting)
    return build_setting_response_from_default(normalized_key)


@router.get("/n2-supervisor-portal-xyz/system-settings/{key}", response_model=schemas.SystemSettingResponse)
def get_system_setting_for_admin(
    key: str,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_supervisor),
):
    del current_user
    normalized_key = normalize_setting_key(key)
    setting = db.query(models.SystemSetting).filter(models.SystemSetting.key == normalized_key).first()
    if setting:
        return schemas.SystemSettingResponse.model_validate(setting)
    return build_setting_response_from_default(normalized_key)


@router.put("/n2-supervisor-portal-xyz/system-settings/{key}", response_model=schemas.SystemSettingResponse)
def update_system_setting_for_admin(
    key: str,
    payload: schemas.SystemSettingUpdate,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_supervisor),
):
    normalized_key = normalize_setting_key(key)
    setting = db.query(models.SystemSetting).filter(models.SystemSetting.key == normalized_key).first()
    old_value = setting.value if setting else DEFAULT_SYSTEM_SETTINGS.get(normalized_key)

    now = datetime.now(timezone.utc)
    if setting:
        setting.value = payload.value
        setting.updated_by = current_user.id
        setting.updated_at = now
    else:
        setting = models.SystemSetting(
            key=normalized_key,
            value=payload.value,
            updated_by=current_user.id,
            updated_at=now,
        )
        db.add(setting)

    history = models.SystemSettingHistory(
        setting_key=normalized_key,
        old_value=old_value,
        new_value=payload.value,
        changed_by=current_user.id,
        changed_at=now,
    )
    db.add(history)
    db.commit()
    db.refresh(setting)
    return schemas.SystemSettingResponse.model_validate(setting)


@router.get(
    "/n2-supervisor-portal-xyz/system-settings/{key}/history",
    response_model=List[schemas.SystemSettingHistoryResponse],
)
def get_system_setting_history(
    key: str,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_supervisor),
):
    del current_user
    normalized_key = normalize_setting_key(key)
    histories = (
        db.query(models.SystemSettingHistory)
        .filter(models.SystemSettingHistory.setting_key == normalized_key)
        .order_by(models.SystemSettingHistory.changed_at.desc())
        .limit(20)
        .all()
    )
    return histories
