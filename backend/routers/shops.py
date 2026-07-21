from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, cast, String, func
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from uuid import UUID
import datetime

from database import get_db
import models, schemas
from routers.auth import get_current_user
from routers.ai import translate_text

router = APIRouter(tags=["shops"])

def require_admin(current_user: models.Profile):
    if current_user.role not in ["admin", "supervisor"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


def normalize_slug_value(slug: Optional[str]) -> Optional[str]:
    if slug is None:
        return None

    normalized = slug.strip().lower()
    return normalized or None

def resolve_shop_contact_profile_id(db: Session, shop: models.Shop) -> Optional[UUID]:
    if shop.owner_id:
        return shop.owner_id

    manager = db.query(models.ShopMember.profile_id).filter(
        models.ShopMember.shop_id == shop.id,
        models.ShopMember.status == "approved",
        models.ShopMember.employment_status == "active",
        models.ShopMember.can_manage_shop == True,
    ).order_by(models.ShopMember.joined_at.asc()).first()

    if manager:
        return manager[0]

    return None

def attach_contact_profile_id(db: Session, shop: models.Shop) -> models.Shop:
    setattr(shop, "contact_profile_id", resolve_shop_contact_profile_id(db, shop))
    return shop

# 1. Static and Specific Paths First
@router.get("/admin/all", response_model=List[schemas.ShopResponse])
def read_all_shops(
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    if current_user.role in ["admin", "supervisor"]:
        return db.query(models.Shop).all()

    # Also include shops where the user is a manager with can_manage_shop=True
    managed_shop_ids = db.query(models.ShopMember.shop_id).filter(
        models.ShopMember.profile_id == current_user.id,
        models.ShopMember.can_manage_shop == True
    ).all()
    managed_shop_ids = [r[0] for r in managed_shop_ids]

    return db.query(models.Shop).filter(
        or_(
            models.Shop.owner_id == current_user.id,
            models.Shop.id.in_(managed_shop_ids)
        )
    ).all()

@router.get("/me/favorites", response_model=List[schemas.FavoriteShopResponse])
def get_my_favorites(
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    return db.query(models.FavoriteShop).options(joinedload(models.FavoriteShop.shop)).filter(models.FavoriteShop.profile_id == current_user.id).all()

@router.post("/admin", response_model=schemas.ShopResponse, status_code=status.HTTP_201_CREATED)
async def create_shop(
    shop: schemas.ShopCreate,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    require_admin(current_user)
    payload = shop.model_dump()
    payload["slug"] = normalize_slug_value(payload.get("slug"))
    db_shop = models.Shop(**payload)

    # Auto-translate description if present
    if db_shop.description:
        db_shop.description_en = await translate_text(db_shop.description, "en")
        db_shop.description_zh = await translate_text(db_shop.description, "zh")
        db_shop.description_ko = await translate_text(db_shop.description, "ko")

    db.add(db_shop)
    db.commit()
    db.refresh(db_shop)
    return db_shop

@router.post("/register", response_model=schemas.ShopResponse, status_code=status.HTTP_201_CREATED)
async def register_shop(
    shop: schemas.ShopCreate,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    approved_owner_application = db.query(models.OwnerApplication).filter(
        models.OwnerApplication.profile_id == current_user.id,
        models.OwnerApplication.status == "approved"
    ).first()

    can_claim_owner = current_user.role in ["admin", "supervisor"] or approved_owner_application is not None

    payload = shop.model_dump(exclude={"owner_id"})
    payload["slug"] = normalize_slug_value(payload.get("slug"))
    db_shop = models.Shop(**payload)
    db_shop.owner_id = current_user.id if can_claim_owner else None
    db_shop.claim_status = "claimed" if can_claim_owner else "unclaimed"

    if db_shop.description:
        db_shop.description_en = await translate_text(db_shop.description, "en")
        db_shop.description_zh = await translate_text(db_shop.description, "zh")
        db_shop.description_ko = await translate_text(db_shop.description, "ko")

    db.add(db_shop)
    db.commit()
    db.refresh(db_shop)

    if can_claim_owner:
        existing_member = db.query(models.ShopMember).filter(
            models.ShopMember.shop_id == db_shop.id,
            models.ShopMember.profile_id == current_user.id
        ).first()
        if not existing_member:
            db.add(models.ShopMember(
                shop_id=db_shop.id,
                profile_id=current_user.id,
                role="owner",
                display_name=current_user.display_name or "Owner",
                can_manage_shop=True,
                status="approved",
                employment_status="active"
            ))
            db.commit()

    db.refresh(db_shop)
    return db_shop

@router.get("/", response_model=List[schemas.ShopResponse])
def read_shops(
    skip: int = 0,
    limit: int = 100,
    random: bool = False,
    category: Optional[str] = None,
    tags: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(models.Shop).options(joinedload(models.Shop.media_assets)).filter(models.Shop.is_approved == True)

    if category:
        query = query.filter(models.Shop.category == category)

    if tags:
        tag_list = [
            tag.strip()
            for tag in tags.split(',')
            if tag.strip()
        ]
        if tag_list:
            for tag in tag_list:
                query = query.filter(cast(models.Shop.tags, String).like(f"%{tag}%"))

    if q:
        search = f"%{q}%"
        query = query.filter(or_(
            models.Shop.name.ilike(search),
            models.Shop.description.ilike(search)
        ))

    if random:
        query = query.order_by(func.random())

    shops = query.offset(skip).limit(limit).all()
    for shop in shops:
        attach_contact_profile_id(db, shop)
    return shops

# 2. Favorite/Action Paths with shop_id prefix
@router.post("/{shop_id}/favorite", status_code=status.HTTP_201_CREATED)
def favorite_shop(
    shop_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    shop = db.query(models.Shop.id).filter(models.Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shop not found")

    existing = db.query(models.FavoriteShop).filter(
        models.FavoriteShop.shop_id == shop_id,
        models.FavoriteShop.profile_id == current_user.id
    ).first()
    if existing:
        return {"message": "Already favorited"}

    fav = models.FavoriteShop(shop_id=shop_id, profile_id=current_user.id)
    db.add(fav)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Favorite could not be saved because the shop or profile is missing"
        )
    return {"message": "Favorited successfully"}

@router.delete("/{shop_id}/favorite", status_code=status.HTTP_204_NO_CONTENT)
def unfavorite_shop(
    shop_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    fav = db.query(models.FavoriteShop).filter(
        models.FavoriteShop.shop_id == shop_id,
        models.FavoriteShop.profile_id == current_user.id
    ).first()
    if fav:
        db.delete(fav)
        db.commit()
    return None

@router.post("/admin/{shop_id}/approve", response_model=schemas.ShopResponse)
def approve_shop(
    shop_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    require_admin(current_user)
    db_shop = db.query(models.Shop).filter(models.Shop.id == shop_id).first()
    if db_shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")

    if not db_shop.slug:
        raise HTTPException(status_code=400, detail="Slug is required before approval")

    db_shop.is_approved = True
    db.commit()
    db.refresh(db_shop)
    return db_shop

# 3. Dynamic paths (Catch-all) LAST
@router.put("/{shop_id}", response_model=schemas.ShopResponse)
async def update_shop(
    shop_id: UUID,
    shop_update: schemas.ShopUpdate,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    db_shop = db.query(models.Shop).filter(models.Shop.id == shop_id).first()
    if db_shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")

    # RBAC: Admin or Approved Owner or Manager
    is_authorized = current_user.role in ["admin", "supervisor"] or db_shop.owner_id == current_user.id
    if not is_authorized:
        member = db.query(models.ShopMember).filter(
            models.ShopMember.shop_id == shop_id,
            models.ShopMember.profile_id == current_user.id,
            models.ShopMember.can_manage_shop == True
        ).first()
        if member:
            is_authorized = True

    if not is_authorized:
        raise HTTPException(status_code=403, detail="Not authorized to update this shop")

    update_data = shop_update.model_dump(exclude_unset=True)
    if "slug" in update_data:
        update_data["slug"] = normalize_slug_value(update_data["slug"])
    for key, value in update_data.items():
        setattr(db_shop, key, value)

    # Re-translate if description or custom_description changed
    if "description" in update_data or "custom_description" in update_data:
        source_text = db_shop.custom_description or db_shop.description
        if source_text:
            db_shop.description_en = await translate_text(source_text, "en")
            db_shop.description_zh = await translate_text(source_text, "zh")
            db_shop.description_ko = await translate_text(source_text, "ko")
        else:
            db_shop.description_en = None
            db_shop.description_zh = None
            db_shop.description_ko = None

    db.commit()
    db.refresh(db_shop)
    return db_shop

@router.post("/{shop_id}/apply-membership", status_code=status.HTTP_201_CREATED)
def apply_membership(
    shop_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    shop = db.query(models.Shop.id).filter(models.Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shop not found")

    existing = db.query(models.ShopMember).filter(
        models.ShopMember.shop_id == shop_id,
        models.ShopMember.profile_id == current_user.id
    ).first()
    if existing:
        return {"message": "Already a member or application pending", "status": existing.status}

    member = models.ShopMember(
        shop_id=shop_id,
        profile_id=current_user.id,
        role="staff",
        display_name=current_user.display_name or "New Member",
        status="pending",
        employment_status="active",
        display_order=0,
        can_manage_shop=False
    )
    db.add(member)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Membership application could not be saved"
        )
    return {"message": "Application submitted successfully", "status": "pending"}

@router.delete("/{shop_id}/membership", status_code=status.HTTP_204_NO_CONTENT)
def leave_shop(
    shop_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    member = db.query(models.ShopMember).filter(
        models.ShopMember.shop_id == shop_id,
        models.ShopMember.profile_id == current_user.id
    ).first()
    if member:
        db.delete(member)
        db.commit()
    return None

@router.get("/{shop_id_or_slug}/public-members", response_model=List[schemas.PublicShopMemberResponse])
def read_public_shop_members(shop_id_or_slug: str, db: Session = Depends(get_db)):
    try:
        shop_id = UUID(shop_id_or_slug)
        shop = db.query(models.Shop).filter(models.Shop.id == shop_id).first()
    except ValueError:
        shop = db.query(models.Shop).filter(models.Shop.slug == shop_id_or_slug).first()

    if shop is None or not shop.is_approved:
        raise HTTPException(status_code=404, detail="Shop not found")

    settings = db.query(models.ShopPublicSettings).filter(models.ShopPublicSettings.shop_id == shop.id).first()
    if not settings or not settings.show_today_staff:
        return []

    members = (
        db.query(models.ShopMember)
        .options(
            joinedload(models.ShopMember.profile).joinedload(models.Profile.media_assets),
        )
        .filter(
            models.ShopMember.shop_id == shop.id,
            models.ShopMember.status == "approved",
            models.ShopMember.employment_status == "active",
        )
        .order_by(models.ShopMember.display_order.asc(), models.ShopMember.joined_at.asc())
        .all()
    )

    public_members = []
    for member in members:
        profile_image_url = None
        if member.profile:
            profile_images = [
                asset for asset in member.profile.media_assets
                if asset.asset_type == "profile_image" and asset.active and not asset.deleted_at
            ]
            profile_images.sort(key=lambda asset: asset.created_at or datetime.datetime.min, reverse=True)
            if profile_images:
                profile_image_url = profile_images[0].url

        public_members.append(
            schemas.PublicShopMemberResponse(
                id=member.id,
                display_name=member.display_name,
                profile_image_url=profile_image_url,
            )
        )

    return public_members

@router.get("/{shop_id_or_slug}", response_model=schemas.ShopResponse)
def read_shop(shop_id_or_slug: str, db: Session = Depends(get_db)):
    try:
        shop_id = UUID(shop_id_or_slug)
        shop = db.query(models.Shop).options(joinedload(models.Shop.media_assets)).filter(models.Shop.id == shop_id).first()
    except ValueError:
        shop = db.query(models.Shop).options(joinedload(models.Shop.media_assets)).filter(models.Shop.slug == shop_id_or_slug).first()

    if shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")
    return attach_contact_profile_id(db, shop)
