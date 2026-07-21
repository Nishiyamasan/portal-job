from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List
from uuid import UUID
import datetime

from database import get_db
import models, schemas
from routers.auth import get_current_user
from routers.ai import translate_text

router = APIRouter(tags=["admin"])

def check_admin(user: models.Profile):
    if user.role != "admin" and user.role != "supervisor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

def check_shop_admin(
    shop_id: UUID,
    db: Session,
    current_user: models.Profile
):
    shop = db.query(models.Shop).filter(models.Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    if current_user.role in ["admin", "supervisor"]:
        return current_user

    # Check ownership
    if shop.owner_id == current_user.id:
        return current_user

    # Check shop membership
    member = db.query(models.ShopMember).filter(
        models.ShopMember.shop_id == shop_id,
        models.ShopMember.profile_id == current_user.id,
        models.ShopMember.can_manage_shop == True
    ).first()
    if member:
        return current_user

    raise HTTPException(status_code=403, detail="Access denied")

@router.get("/owner-applications", response_model=List[schemas.OwnerApplicationResponse])
def read_owner_applications(
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    check_admin(current_user)
    return (
        db.query(models.OwnerApplication)
        .options(
            joinedload(models.OwnerApplication.profile),
            joinedload(models.OwnerApplication.shop),
        )
        .order_by(models.OwnerApplication.created_at.desc())
        .all()
    )

@router.patch("/owner-applications/{application_id}", response_model=schemas.OwnerApplicationResponse)
async def update_owner_application(
    application_id: UUID,
    update: schemas.OwnerApplicationUpdate,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    check_admin(current_user)

    db_app = db.query(models.OwnerApplication).filter(models.OwnerApplication.id == application_id).first()
    if not db_app:
        raise HTTPException(status_code=404, detail="Application not found")

    previous_status = db_app.status
    db_app.status = update.status
    db_app.review_comment = update.review_comment
    db_app.reviewed_by = current_user.id
    db_app.reviewed_at = datetime.datetime.now(datetime.timezone.utc)

    if update.status == "approved" and db_app.shop_id:
        shop = db.query(models.Shop).filter(models.Shop.id == db_app.shop_id).first()
        if shop:
            shop.owner_id = db_app.profile_id
            shop.claim_status = "claimed"
            shop.is_approved = True # Automatically approve shop upon successful claim
            shop.updated_at = datetime.datetime.now(datetime.timezone.utc)

            # Auto-translate description if it exists but translations are missing
            if shop.description and not shop.description_en:
                shop.description_en = await translate_text(shop.description, "en")
                shop.description_zh = await translate_text(shop.description, "zh")
                shop.description_ko = await translate_text(shop.description, "ko")

            # Also add as a shop member with owner role
            member = db.query(models.ShopMember).filter(
                models.ShopMember.shop_id == shop.id,
                models.ShopMember.profile_id == db_app.profile_id
            ).first()

            if not member:
                member = models.ShopMember(
                    shop_id=shop.id,
                    profile_id=db_app.profile_id,
                    role="owner",
                    display_name=db_app.profile.display_name or "Owner",
                    can_manage_shop=True
                )
                db.add(member)
    elif update.status in ["rejected", "pending"] and db_app.shop_id:
        shop = db.query(models.Shop).filter(models.Shop.id == db_app.shop_id).first()
        if shop:
            shop.claim_status = "unclaimed"
            if shop.owner_id == db_app.profile_id:
                shop.owner_id = None
            if previous_status == "approved":
                shop.is_approved = False
            shop.updated_at = datetime.datetime.now(datetime.timezone.utc)

    db.commit()
    db.refresh(db_app)
    return db_app

# Shop Management Endpoints
@router.get("/shops/{shop_id}/public-settings", response_model=schemas.ShopPublicSettingsResponse)
def get_shop_public_settings(
    shop_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    check_shop_admin(shop_id, db, current_user)
    settings = db.query(models.ShopPublicSettings).filter(models.ShopPublicSettings.shop_id == shop_id).first()
    if not settings:
        settings = models.ShopPublicSettings(shop_id=shop_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings

@router.put("/shops/{shop_id}/public-settings", response_model=schemas.ShopPublicSettingsResponse)
def update_shop_public_settings(
    shop_id: UUID,
    update: schemas.ShopPublicSettingsBase,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    check_shop_admin(shop_id, db, current_user)
    settings = db.query(models.ShopPublicSettings).filter(models.ShopPublicSettings.shop_id == shop_id).first()
    if not settings:
        settings = models.ShopPublicSettings(shop_id=shop_id)
        db.add(settings)

    settings.show_today_staff = update.show_today_staff
    settings.updated_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    db.refresh(settings)
    return settings

@router.get("/shops/{shop_id}/members", response_model=List[schemas.ShopMemberResponse])
def get_shop_members(
    shop_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    check_shop_admin(shop_id, db, current_user)
    return (
        db.query(models.ShopMember)
        .options(joinedload(models.ShopMember.profile))
        .filter(models.ShopMember.shop_id == shop_id)
        .order_by(models.ShopMember.display_order.asc(), models.ShopMember.joined_at.asc())
        .all()
    )

@router.post("/shops/{shop_id}/members", response_model=schemas.ShopMemberResponse)
def add_shop_member(
    shop_id: UUID,
    member: schemas.ShopMemberCreate,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    check_shop_admin(shop_id, db, current_user)
    existing = db.query(models.ShopMember).filter(
        models.ShopMember.shop_id == shop_id,
        models.ShopMember.profile_id == member.profile_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="User is already a member of this shop")

    db_member = models.ShopMember(
        shop_id=shop_id,
        **member.model_dump()
    )
    db_member.status = "approved"
    db.add(db_member)
    db.commit()
    db.refresh(db_member)
    return db_member

@router.patch("/shops/{shop_id}/members/{member_id}", response_model=schemas.ShopMemberResponse)
def update_shop_member(
    shop_id: UUID,
    member_id: UUID,
    update: schemas.ShopMemberUpdate,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    check_shop_admin(shop_id, db, current_user)
    db_member = db.query(models.ShopMember).filter(
        models.ShopMember.id == member_id,
        models.ShopMember.shop_id == shop_id
    ).first()
    if not db_member:
        raise HTTPException(status_code=404, detail="Member not found")

    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_member, key, value)

    db.commit()
    db.refresh(db_member)
    return db_member

@router.delete("/shops/{shop_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shop_member(
    shop_id: UUID,
    member_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    check_shop_admin(shop_id, db, current_user)
    db_member = db.query(models.ShopMember).filter(
        models.ShopMember.id == member_id,
        models.ShopMember.shop_id == shop_id
    ).first()
    if not db_member:
        raise HTTPException(status_code=404, detail="Member not found")

    if db_member.role == "owner":
        raise HTTPException(status_code=400, detail="Owner member cannot be removed")

    db.delete(db_member)
    db.commit()
    return None

@router.get("/shops/{shop_id}/members/{member_id}/public-settings", response_model=schemas.MemberPublicSettingsResponse)
def get_member_public_settings(
    shop_id: UUID,
    member_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    db_member = db.query(models.ShopMember).filter(
        models.ShopMember.id == member_id,
        models.ShopMember.shop_id == shop_id
    ).first()
    if not db_member:
        raise HTTPException(status_code=404, detail="Member not found")

    if db_member.profile_id != current_user.id:
        check_shop_admin(shop_id, db, current_user)

    settings = db.query(models.MemberPublicSettings).filter(models.MemberPublicSettings.shop_member_id == member_id).first()
    if not settings:
        settings = models.MemberPublicSettings(shop_member_id=member_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings

@router.put("/shops/{shop_id}/members/{member_id}/public-settings", response_model=schemas.MemberPublicSettingsResponse)
def update_member_public_settings(
    shop_id: UUID,
    member_id: UUID,
    update: schemas.MemberPublicSettingsBase,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    db_member = db.query(models.ShopMember).filter(
        models.ShopMember.id == member_id,
        models.ShopMember.shop_id == shop_id
    ).first()
    if not db_member:
        raise HTTPException(status_code=404, detail="Member not found")

    if db_member.profile_id != current_user.id:
        check_shop_admin(shop_id, db, current_user)

    settings = db.query(models.MemberPublicSettings).filter(models.MemberPublicSettings.shop_member_id == member_id).first()
    if not settings:
        settings = models.MemberPublicSettings(shop_member_id=member_id)
        db.add(settings)

    update_data = update.model_dump()
    for key, value in update_data.items():
        setattr(settings, key, value)

    settings.updated_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    db.refresh(settings)
    return settings
