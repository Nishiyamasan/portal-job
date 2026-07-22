from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import datetime

from database import get_db
import models, schemas
from routers.auth import get_current_user

router = APIRouter(tags=["owner-applications"])

@router.post("/", response_model=schemas.OwnerApplicationResponse)
def create_owner_application(
    application: schemas.OwnerApplicationBase,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    # Check if shop exists
    if application.shop_id:
        shop = db.query(models.Shop).filter(models.Shop.id == application.shop_id).first()
        if not shop:
            raise HTTPException(status_code=404, detail="Shop not found")

        # Check if already claimed or pending
        if shop.claim_status != 'unclaimed':
             raise HTTPException(status_code=400, detail="Shop is already claimed or has a pending application")

    db_application = models.OwnerApplication(
        profile_id=current_user.id,
        shop_id=application.shop_id,
        reason=application.reason,
        status="pending",
        created_at=datetime.datetime.now(datetime.timezone.utc)
    )

    if application.shop_id:
        # Mark shop as pending
        shop.claim_status = "pending"
        shop.updated_at = datetime.datetime.now(datetime.timezone.utc)

    db.add(db_application)
    db.commit()
    db.refresh(db_application)
    return db_application

@router.get("/me", response_model=List[schemas.OwnerApplicationResponse])
def get_my_owner_applications(
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    return db.query(models.OwnerApplication).filter(models.OwnerApplication.profile_id == current_user.id).all()
