from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List
from uuid import UUID

from database import get_db
import models, schemas
from routers.auth import get_current_user

router = APIRouter(tags=["supervisor"])

def get_supervisor(user: models.Profile = Depends(get_current_user)) -> models.Profile:
    if user.role not in ["supervisor", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Supervisor access required"
        )
    return user

@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_supervisor)
):

    total_shops = db.query(models.Shop).count()
    approved_shops = db.query(models.Shop).filter(models.Shop.is_approved == True).count()
    pending_shops = total_shops - approved_shops
    total_users = db.query(models.Profile).count()
    total_applications = db.query(models.OwnerApplication).count()
    pending_applications = db.query(models.OwnerApplication).filter(models.OwnerApplication.status == "pending").count()

    return {
        "total_shops": total_shops,
        "approved_shops": approved_shops,
        "pending_shops": pending_shops,
        "total_users": total_users,
        "total_applications": total_applications,
        "pending_applications": pending_applications
    }

@router.get("/shops", response_model=List[schemas.SupervisorShopResponse])
def get_all_shops(
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_supervisor),
    skip: int = 0,
    limit: int = 100
):
    shops = (
        db.query(models.Shop)
        .options(joinedload(models.Shop.owner))
        .offset(skip)
        .limit(limit)
        .all()
    )

    result: List[schemas.SupervisorShopResponse] = []
    for shop in shops:
        payload = schemas.ShopResponse.model_validate(shop).model_dump()
        payload["owner_email"] = shop.owner.email if shop.owner else None
        result.append(schemas.SupervisorShopResponse(**payload))

    return result

@router.post("/shops/{shop_id}/approve", response_model=schemas.ShopResponse)
def approve_shop(
    shop_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_supervisor)
):
    db_shop = db.query(models.Shop).filter(models.Shop.id == shop_id).first()
    if not db_shop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shop not found")

    db_shop.is_approved = True
    db.commit()
    db.refresh(db_shop)
    return db_shop
