from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import os
import time
import hashlib
import datetime
from uuid import UUID

from database import get_db
import models, schemas
from routers.auth import get_current_user
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(tags=["media"])

CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

@router.get("/upload-params")
def get_upload_params(current_user: models.Profile = Depends(get_current_user)):
    return create_cloudinary_upload_intent()

@router.get("/upload-intent")
def get_upload_intent(current_user: models.Profile = Depends(get_current_user)):
    return create_cloudinary_upload_intent()

def create_cloudinary_upload_intent():
    if not CLOUDINARY_API_SECRET or not CLOUDINARY_API_KEY or not CLOUDINARY_CLOUD_NAME:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cloudinary environment variables are required for media uploads"
        )

    timestamp = int(time.time())
    folder = "portal-job"

    params_to_sign = {
        "folder": folder,
        "timestamp": timestamp
    }

    # Sort params alphabetically for signing
    # NOTE: Cloudinary signature is formed by joining sorted params with '&' and appending the secret directly (WITHOUT another '&')
    sorted_params = "&".join([f"{k}={v}" for k, v in sorted(params_to_sign.items())])
    signature = hashlib.sha1(f"{sorted_params}{CLOUDINARY_API_SECRET}".encode("utf-8")).hexdigest()

    return {
        "provider": "cloudinary",
        "cloud_name": CLOUDINARY_CLOUD_NAME,
        "api_key": CLOUDINARY_API_KEY,
        "timestamp": timestamp,
        "signature": signature,
        "folder": folder
    }

def user_can_manage_shop(db: Session, shop_id: UUID, current_user: models.Profile) -> bool:
    if current_user.role in ["admin", "supervisor"]:
        return True

    shop = db.query(models.Shop).filter(models.Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shop not found")

    if shop.owner_id == current_user.id:
        return True

    return db.query(models.ShopMember).filter(
        models.ShopMember.shop_id == shop_id,
        models.ShopMember.profile_id == current_user.id,
        models.ShopMember.can_manage_shop == True
    ).first() is not None

@router.post("/assets", response_model=schemas.MediaAssetResponse)
def create_media_asset(
    asset: schemas.MediaAssetBase,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    allowed_asset_types = {"shop_image", "profile_image", "job_image"}
    allowed_providers = {"cloudinary", "gcs"}
    provider = asset.provider or "cloudinary"

    if asset.asset_type not in allowed_asset_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported asset type")

    if provider not in allowed_providers:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported media provider")

    shop_id = asset.shop_id
    profile_id = asset.profile_id
    job_post_id = asset.job_post_id

    if asset.asset_type == "profile_image":
        profile_id = current_user.id
        shop_id = None
        job_post_id = None
    elif asset.asset_type == "shop_image":
        if not shop_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="shop_id is required for shop images")
        if not user_can_manage_shop(db, shop_id, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this shop image")
        profile_id = None
        job_post_id = None
    elif asset.asset_type == "job_image":
        if not job_post_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="job_post_id is required for job images")
        job_post = db.query(models.JobPost).filter(models.JobPost.id == job_post_id).first()
        if not job_post:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job post not found")
        if not user_can_manage_shop(db, job_post.shop_id, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this job image")
        shop_id = job_post.shop_id
        profile_id = None

    now = datetime.datetime.utcnow()
    existing_query = db.query(models.MediaAsset).filter(
        models.MediaAsset.asset_type == asset.asset_type,
        models.MediaAsset.active == True,
        models.MediaAsset.deleted_at.is_(None)
    )
    if asset.asset_type == "job_image":
        existing_query = existing_query.filter(models.MediaAsset.job_post_id == job_post_id)
    elif shop_id:
        existing_query = existing_query.filter(models.MediaAsset.shop_id == shop_id)
    else:
        existing_query = existing_query.filter(models.MediaAsset.profile_id == profile_id)

    for existing in existing_query.all():
        existing.active = False
        existing.replaced_at = now

    db_asset = models.MediaAsset(
        shop_id=shop_id,
        profile_id=profile_id,
        job_post_id=job_post_id,
        asset_type=asset.asset_type,
        provider=provider,
        url=asset.url,
        storage_bucket=asset.storage_bucket,
        storage_path=asset.storage_path,
        mime_type=asset.mime_type,
        bytes=asset.bytes,
        width=asset.width,
        height=asset.height,
        active=True,
        cloudinary_public_id=asset.cloudinary_public_id,
        asset_metadata=asset.asset_metadata
    )
    db.add(db_asset)
    db.commit()
    db.refresh(db_asset)
    return db_asset
