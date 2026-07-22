from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List
from uuid import UUID
import datetime
from routers.auth import get_current_user
from database import get_db
import models, schemas

router = APIRouter(tags=["jobs"])

# 1. Static paths first to avoid conflict with /{job_id}
@router.get("/my-jobs", response_model=List[schemas.JobPostResponse])
def read_my_jobs(
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    # Shops where the user is an owner or manager
    owned_shop_ids = [s.id for s in current_user.shops]
    managed_shop_ids = [m.shop_id for m in current_user.memberships if m.can_manage_shop]
    all_shop_ids = list(set(owned_shop_ids + managed_shop_ids))

    if current_user.role in ["admin", "supervisor"]:
        return db.query(models.JobPost).options(joinedload(models.JobPost.media_assets)).all()

    return db.query(models.JobPost).options(joinedload(models.JobPost.media_assets)).filter(models.JobPost.shop_id.in_(all_shop_ids)).all()

@router.get("/my-applications", response_model=List[schemas.JobApplicationResponse])
def read_my_applications(
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    return db.query(models.JobApplication).filter(models.JobApplication.profile_id == current_user.id).all()

@router.get("/applications/{application_id}", response_model=schemas.JobApplicationResponse)
def get_application(
    application_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    db_app = db.query(models.JobApplication).filter(models.JobApplication.id == application_id).first()
    if not db_app:
        raise HTTPException(status_code=404, detail="Application not found")
    
    # Check access: applicant or shop admin
    if db_app.profile_id != current_user.id:
        if not check_shop_access(db_app.job_post.shop_id, db, current_user):
            raise HTTPException(status_code=403, detail="Access denied")
    
    return db_app

@router.patch("/applications/{application_id}", response_model=schemas.JobApplicationResponse)
def update_application_status(
    application_id: UUID,
    update: schemas.JobApplicationUpdate,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    db_app = db.query(models.JobApplication).filter(models.JobApplication.id == application_id).first()
    if not db_app:
        raise HTTPException(status_code=404, detail="Application not found")

    if not check_shop_access(db_app.job_post.shop_id, db, current_user):
        raise HTTPException(status_code=403, detail="Access denied to update application status")
    ensure_shop_approved_for_management(db_app.job_post.shop_id, db, current_user)

    db_app.status = update.status
    db.commit()
    db.refresh(db_app)
    return db_app

# 2. General list query
@router.get("/", response_model=List[schemas.JobPostResponse])
def read_jobs(skip: int = 0, limit: int = 100, random: bool = False, db: Session = Depends(get_db)):
    query = db.query(models.JobPost).options(joinedload(models.JobPost.media_assets)).filter(models.JobPost.status == "open")

    if random:
        query = query.order_by(func.random())

    jobs = query.offset(skip).limit(limit).all()
    return jobs

# 3. Dynamic paths with specific prefixes
@router.get("/shop/{shop_id}", response_model=List[schemas.JobPostResponse])
def read_shop_jobs(
    shop_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    ensure_shop_approved_for_management(shop_id, db, current_user)
    return db.query(models.JobPost).options(joinedload(models.JobPost.media_assets)).filter(models.JobPost.shop_id == shop_id).all()

# 4. Catch-all ID paths last
@router.get("/{job_id}", response_model=schemas.JobPostResponse)
def read_job(job_id: UUID, db: Session = Depends(get_db)):
    job = db.query(models.JobPost).options(joinedload(models.JobPost.media_assets)).filter(models.JobPost.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.put("/{job_id}", response_model=schemas.JobPostResponse)
def update_job(
    job_id: UUID,
    job_update: schemas.JobPostBase,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    db_job = db.query(models.JobPost).filter(models.JobPost.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not check_shop_access(db_job.shop_id, db, current_user):
        raise HTTPException(status_code=403, detail="Access denied to update this job")
    ensure_shop_approved_for_management(db_job.shop_id, db, current_user)

    update_data = job_update.model_dump()
    if pub_at := update_data.get("published_at"):
        update_data["expires_at"] = pub_at + datetime.timedelta(weeks=4)

    for key, value in update_data.items():
        setattr(db_job, key, value)

    db.commit()
    db.refresh(db_job)
    return db_job

@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    db_job = db.query(models.JobPost).filter(models.JobPost.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not check_shop_access(db_job.shop_id, db, current_user):
        raise HTTPException(status_code=403, detail="Access denied to delete this job")
    ensure_shop_approved_for_management(db_job.shop_id, db, current_user)

    db.delete(db_job)
    db.commit()
    return None

@router.post("/{job_id}/apply", response_model=schemas.JobApplicationResponse)
def apply_to_job(
    job_id: UUID,
    application: schemas.JobApplicationBase,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    db_job = db.query(models.JobPost).filter(models.JobPost.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")

    existing = db.query(models.JobApplication).filter(
        models.JobApplication.job_post_id == job_id,
        models.JobApplication.profile_id == current_user.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already applied to this job")

    db_app = models.JobApplication(
        job_post_id=job_id,
        profile_id=current_user.id,
        message=application.message
    )
    db.add(db_app)
    db.commit()
    db.refresh(db_app)
    return db_app

@router.get("/{job_id}/applications", response_model=List[schemas.JobApplicationResponse])
def read_job_applications(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    db_job = db.query(models.JobPost).filter(models.JobPost.id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not check_shop_access(db_job.shop_id, db, current_user):
        raise HTTPException(status_code=403, detail="Access denied to view applications")
    ensure_shop_approved_for_management(db_job.shop_id, db, current_user)

    return db.query(models.JobApplication).filter(models.JobApplication.job_post_id == job_id).all()

# --- Helper Functions ---
def check_shop_access(shop_id: UUID, db: Session, current_user: models.Profile):
    if current_user.role in ["admin", "supervisor"]:
        return True

    shop = db.query(models.Shop).filter(models.Shop.id == shop_id).first()
    if not shop:
        return False

    if shop.owner_id == current_user.id:
        return True

    member = db.query(models.ShopMember).filter(
        models.ShopMember.shop_id == shop_id,
        models.ShopMember.profile_id == current_user.id,
        models.ShopMember.can_manage_shop == True
    ).first()
    return member is not None

def ensure_shop_approved_for_management(shop_id: UUID, db: Session, current_user: models.Profile):
    if current_user.role in ["admin", "supervisor"]:
        return True

    shop = db.query(models.Shop).filter(models.Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    if not shop.is_approved:
        raise HTTPException(status_code=403, detail="Job management is only available for approved shops")

    return True

@router.post("/", response_model=schemas.JobPostResponse, status_code=status.HTTP_201_CREATED)
def create_job(
    job: schemas.JobPostCreate,
    db: Session = Depends(get_db),
    current_user: models.Profile = Depends(get_current_user)
):
    if not check_shop_access(job.shop_id, db, current_user):
        raise HTTPException(status_code=403, detail="Access denied to create job for this shop")
    ensure_shop_approved_for_management(job.shop_id, db, current_user)
    
    data = job.model_dump()
    if data.get("published_at"):
        # Auto-set expires_at to 4 weeks after published_at
        pub_at = data["published_at"]
        if isinstance(pub_at, str):
            pub_at = datetime.datetime.fromisoformat(pub_at.replace("Z", "+00:00"))
        data["expires_at"] = pub_at + datetime.timedelta(weeks=4)

    db_job = models.JobPost(**data)
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return db_job
