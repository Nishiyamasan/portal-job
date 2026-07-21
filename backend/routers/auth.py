from fastapi import APIRouter, Depends, HTTPException, Request, status, Header
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError, OperationalError
from typing import Optional, List
from uuid import UUID
import os
import datetime
import logging
import jwt
from jwt import PyJWKClient

from database import get_db
import models, schemas

router = APIRouter()
logger = logging.getLogger(__name__)

# 1. クライアントを関数の外で初期化（JWKSのキャッシュを有効にするため）
JWKS_URL = os.getenv("SUPABASE_JWKS_URL")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

if JWKS_URL:
    # PyJWKClientは内部でキャッシュを保持するため、リクエストのたびに生成しない
    jwks_client = PyJWKClient(JWKS_URL)
else:
    jwks_client = None
    if not SUPABASE_JWT_SECRET:
        logger.warning("Neither SUPABASE_JWKS_URL nor SUPABASE_JWT_SECRET is set")


def resolve_display_name(payload: dict, fallback: Optional[str] = None) -> str:
    if fallback:
        return fallback

    metadata = payload.get("user_metadata") or {}
    candidates = [
        metadata.get("display_name"),
        metadata.get("full_name"),
        payload.get("display_name"),
        payload.get("full_name"),
        payload.get("name"),
        payload.get("email"),
    ]

    for candidate in candidates:
        if candidate:
            return candidate.split("@")[0] if "@" in candidate else candidate

    return "User"


def ensure_profile_exists(
    db: Session,
    profile_id: UUID,
    email: Optional[str],
    display_name: Optional[str],
) -> models.Profile:
    deleted_profile = db.query(models.Profile).filter(
        models.Profile.id == profile_id,
        models.Profile.deleted_at.isnot(None)
    ).first()
    if deleted_profile:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account has been deleted")

    profile = db.query(models.Profile).filter(
        models.Profile.id == profile_id,
        models.Profile.deleted_at.is_(None)
    ).first()

    if profile:
        changed = False
        if email and profile.email != email:
            profile.email = email
            changed = True

        if changed:
            try:
                db.commit()
            except IntegrityError as exc:
                db.rollback()
                logger.warning("Profile sync failed because email is already used by another account")
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Another active account already uses this email address."
                ) from exc
            db.refresh(profile)
        return profile

    existing_email_profile = None
    if email:
        existing_email_profile = db.query(models.Profile).filter(
            models.Profile.email == email,
            models.Profile.deleted_at.is_(None)
        ).first()
        if existing_email_profile and existing_email_profile.id != profile_id:
            logger.warning(
                "Reusing existing profile id=%s for migrated auth user id=%s based on matching email",
                existing_email_profile.id,
                profile_id,
            )
            changed = False
            if not existing_email_profile.display_name and display_name:
                existing_email_profile.display_name = display_name
                changed = True
            if changed:
                db.commit()
                db.refresh(existing_email_profile)
            return existing_email_profile

    if not email:
        raise HTTPException(status_code=400, detail="Email is required for new profile")

    profile = models.Profile(
        id=profile_id,
        email=email,
        display_name=display_name or email.split("@")[0] or "User",
        role="user"
    )
    db.add(profile)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        logger.warning("Profile creation failed because email is already used by another account")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another active account already uses this email address."
        ) from exc

    db.refresh(profile)
    return profile

async def get_token_payload(
    request: Request,
    authorization: Optional[str] = Header(None)
):
    if request.method == "OPTIONS":
        return None

    # 1. ヘッダーの存在確認
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header is missing",
        )

    # 2. フォーマット確認
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header format",
        )

    token = authorization.split(" ")[1]

    try:
        if jwks_client:
            # 3. 署名鍵の取得（キャッシュがあればそこから取得される）
            signing_key = jwks_client.get_signing_key_from_jwt(token)

            # 4. デコードと検証
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256", "ES256"],
                audience="authenticated",
                options={"verify_aud": True, "verify_exp": True}
            )
            return payload
        elif SUPABASE_JWT_SECRET:
            # Fallback to HS256 with JWT SECRET
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
                options={"verify_aud": True, "verify_exp": True}
            )
            return payload
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication is not configured (JWKS or Secret)"
            )

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidAlgorithmError as e:
        logger.warning("JWT algorithm validation failed")
        raise HTTPException(status_code=401, detail=f"Invalid algorithm: {str(e)}")
    except jwt.InvalidTokenError as e:
        logger.warning("JWT token validation failed")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        logger.exception("Unexpected authentication error")
        raise HTTPException(status_code=500, detail="Internal authentication error")

async def get_current_user(
    payload: Optional[dict] = Depends(get_token_payload),
    db: Session = Depends(get_db)
):
    def query_profile_first(query_builder):
        for attempt in range(2):
            try:
                return query_builder().first()
            except OperationalError:
                db.rollback()
                if attempt == 0:
                    logger.warning("Transient DB connection issue in get_current_user; retrying once")
                    continue
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Database connection error"
                )

    try:
        if payload is None:
            return None

        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

        profile_id = UUID(user_id)
        email = payload.get("email") or payload.get("email_primary")
        display_name = resolve_display_name(payload)
        db_user = query_profile_first(lambda: db.query(models.Profile).filter(
            models.Profile.id == profile_id,
            models.Profile.deleted_at.is_(None)
        ))
        deleted_profile = query_profile_first(lambda: db.query(models.Profile).filter(
            models.Profile.id == profile_id,
            models.Profile.deleted_at.isnot(None)
        ))

        if deleted_profile:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account has been deleted")

        if db_user is None:
            db_user = ensure_profile_exists(db, profile_id, email, display_name)

        return db_user
    except (ValueError, AttributeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token format")

@router.post("/sync-profile", response_model=schemas.ProfileResponse)
def sync_profile(
    profile_data: schemas.ProfileSyncRequest,
    payload: dict = Depends(get_token_payload),
    db: Session = Depends(get_db),
):
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    profile_id = UUID(user_id)
    if profile_data.id != profile_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Profile mismatch")

    email = payload.get("email") or payload.get("email_primary") or profile_data.email
    display_name = resolve_display_name(payload, profile_data.display_name)
    db_profile = ensure_profile_exists(db, profile_id, email, display_name)
    return db_profile

@router.get("/me", response_model=schemas.ProfileResponse)
def get_me(current_user: models.Profile = Depends(get_current_user)):
    return current_user

@router.put("/me", response_model=schemas.ProfileResponse)
def update_me(
    update: schemas.ProfileUpdate,
    current_user: models.Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(current_user, key, value)

    db.commit()
    db.refresh(current_user)
    return current_user

@router.get("/me/job-seeker-profile", response_model=schemas.JobSeekerProfileResponse)
def get_job_seeker_profile(
    current_user: models.Profile = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = db.query(models.JobSeekerProfile).options(joinedload(models.JobSeekerProfile.media_assets)).filter(models.JobSeekerProfile.profile_id == current_user.id).first()
    if not profile:
        profile = models.JobSeekerProfile(profile_id=current_user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile

@router.get("/me/memberships", response_model=List[schemas.ShopMemberResponse])
def get_my_memberships(
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    return db.query(models.ShopMember).options(joinedload(models.ShopMember.shop)).filter(models.ShopMember.profile_id == current_user.id).all()

@router.put("/me/job-seeker-profile", response_model=schemas.JobSeekerProfileResponse)
def update_job_seeker_profile(
    update: schemas.JobSeekerProfileBase,
    current_user: models.Profile = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = db.query(models.JobSeekerProfile).options(joinedload(models.JobSeekerProfile.media_assets)).filter(models.JobSeekerProfile.profile_id == current_user.id).first()
    if not profile:
        profile = models.JobSeekerProfile(profile_id=current_user.id)
        db.add(profile)

    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(profile, key, value)

    db.commit()
    db.refresh(profile)
    return profile

@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    current_user: models.Profile = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    now = datetime.datetime.now(datetime.timezone.utc)
    owned_shop_ids = [
        row[0]
        for row in db.query(models.Shop.id).filter(models.Shop.owner_id == current_user.id).all()
    ]

    if owned_shop_ids:
        db.query(models.JobPost).filter(models.JobPost.shop_id.in_(owned_shop_ids)).update(
            {
                models.JobPost.status: "archived",
                models.JobPost.updated_at: now,
            },
            synchronize_session=False,
        )

    db.query(models.Shop).filter(models.Shop.owner_id == current_user.id).update(
        {
            models.Shop.owner_id: None,
            models.Shop.claim_status: "unclaimed",
            models.Shop.is_approved: False,
            models.Shop.updated_at: now,
        },
        synchronize_session=False,
    )

    # Keep row for audit/FK integrity, but anonymize to avoid unique-email conflicts.
    deleted_suffix = str(current_user.id).replace("-", "")
    current_user.deleted_at = now
    current_user.email = f"deleted+{deleted_suffix}@deleted.portal-job.local"
    current_user.display_name = "Deleted User"
    current_user.web_push_subscription = None
    current_user.updated_at = now

    db.commit()
    return None
