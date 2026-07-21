import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from database import get_db
import models, schemas
from routers.auth import get_current_user

router = APIRouter(tags=["inquiries"])

def get_supervisor(user: models.Profile = Depends(get_current_user)) -> models.Profile:
    if user.role not in ["supervisor", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Supervisor access required"
        )
    return user

@router.post("/", response_model=schemas.InquiryResponse)
def create_inquiry(
    inquiry: schemas.InquiryCreate,
    db: Session = Depends(get_db)
):
    if inquiry.inquiry_type not in ["listing", "removal", "other"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid inquiry type"
        )
    data = inquiry.model_dump()
    email = data["email"].strip()
    if not email or "@" not in email or email.startswith("@") or email.endswith("@"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email"
        )

    data["email"] = email
    data["name"] = data["name"].strip()
    data["content"] = data["content"].strip()
    db_inquiry = models.Inquiry(**data)
    db.add(db_inquiry)
    db.commit()
    db.refresh(db_inquiry)
    return db_inquiry

@router.get("/", response_model=List[schemas.InquiryResponse])
def get_inquiries(
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_supervisor),
    skip: int = 0,
    limit: int = 100
):
    return db.query(models.Inquiry).order_by(models.Inquiry.created_at.desc()).offset(skip).limit(limit).all()

@router.patch("/{inquiry_id}", response_model=schemas.InquiryResponse)
def update_inquiry(
    inquiry_id: UUID,
    update: schemas.InquiryUpdate,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_supervisor)
):
    inquiry = db.query(models.Inquiry).filter(models.Inquiry.id == inquiry_id).first()
    if not inquiry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inquiry not found")

    inquiry.is_resolved = update.is_resolved
    inquiry.resolved_at = datetime.datetime.now(datetime.timezone.utc) if update.is_resolved else None
    inquiry.resolved_by = current_user.id if update.is_resolved else None
    db.commit()
    db.refresh(inquiry)
    return inquiry
