from sqlalchemy import Column, String, Boolean, DateTime, Date, ForeignKey, Text, JSON, Uuid, Integer, Numeric, UniqueConstraint
from sqlalchemy.orm import relationship
import uuid
import datetime
from database import Base, ARRAY_COMPAT

class Profile(Base):
    __tablename__ = "profiles"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True)
    display_name = Column(String)
    role = Column(String, default="user") # user, admin, supervisor
    web_push_subscription = Column(JSON, nullable=True)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    shops = relationship("Shop", back_populates="owner")
    memberships = relationship("ShopMember", back_populates="profile")
    owner_applications = relationship("OwnerApplication", foreign_keys="OwnerApplication.profile_id", back_populates="profile")
    job_seeker_profile = relationship("JobSeekerProfile", back_populates="profile", uselist=False)
    media_assets = relationship("MediaAsset", back_populates="profile")

class JobSeekerProfile(Base):
    __tablename__ = "job_seeker_profiles"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), unique=True)
    bio = Column(Text, nullable=True)
    desired_roles = Column(ARRAY_COMPAT(String), nullable=True)
    availability_note = Column(Text, nullable=True)
    is_open_to_work = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    profile = relationship("Profile", back_populates="job_seeker_profile")
    media_assets = relationship("MediaAsset", primaryjoin="JobSeekerProfile.profile_id==MediaAsset.profile_id", foreign_keys="[MediaAsset.profile_id]", viewonly=True)

class Shop(Base):
    __tablename__ = "shops"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug = Column(String, unique=True, index=True)
    name = Column(String)
    category = Column(String, nullable=True) # e.g., cafe, bar, restaurant
    description = Column(Text)
    address = Column(String)
    tags = Column(ARRAY_COMPAT(String), nullable=True)
    owner_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    is_approved = Column(Boolean, default=False, index=True)
    claim_status = Column(String, default="unclaimed") # unclaimed, pending, claimed
    verification_method = Column(String, nullable=True) # phone, mail, in_person
    is_manual_edited = Column(Boolean, default=False)
    original_description = Column(Text, nullable=True)
    custom_description = Column(Text, nullable=True)
    description_en = Column(Text, nullable=True)
    description_zh = Column(Text, nullable=True)
    description_ko = Column(Text, nullable=True)
    x_account_id = Column(String, nullable=True)
    instagram_account_id = Column(String, nullable=True)
    shift_cutoff_time = Column(String, default="06:00")
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    owner = relationship("Profile", back_populates="shops")
    members = relationship("ShopMember", back_populates="shop")
    boosts = relationship("Boost", back_populates="shop")
    job_posts = relationship("JobPost", back_populates="shop")
    media_assets = relationship("MediaAsset", back_populates="shop")
    public_settings = relationship("ShopPublicSettings", back_populates="shop", uselist=False)

class ShopPublicSettings(Base):
    __tablename__ = "shop_public_settings"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id = Column(Uuid(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), unique=True)
    show_today_staff = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    shop = relationship("Shop", back_populates="public_settings")

class OwnerApplication(Base):
    __tablename__ = "owner_applications"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id"))
    shop_id = Column(Uuid(as_uuid=True), ForeignKey("shops.id"), nullable=True)
    status = Column(String, default="pending") # pending, approved, rejected
    reason = Column(Text)
    review_comment = Column(Text, nullable=True)
    reviewed_by = Column(Uuid(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    profile = relationship("Profile", foreign_keys=[profile_id], back_populates="owner_applications")
    reviewer = relationship("Profile", foreign_keys=[reviewed_by])
    shop = relationship("Shop")

class ShopMember(Base):
    __tablename__ = "shop_members"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id = Column(Uuid(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"))
    profile_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"))
    role = Column(String) # staff, cast, manager, owner
    display_name = Column(String)
    status = Column(String, default="approved") # pending, approved, rejected
    employment_status = Column(String, default="active") # active, inactive, retired
    display_order = Column(Integer, default=0)
    can_manage_shop = Column(Boolean, default=False)
    joined_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    shop = relationship("Shop", back_populates="members")
    profile = relationship("Profile", back_populates="memberships")
    public_settings = relationship("MemberPublicSettings", back_populates="shop_member", uselist=False)

class MemberPublicSettings(Base):
    __tablename__ = "member_public_settings"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_member_id = Column(Uuid(as_uuid=True), ForeignKey("shop_members.id", ondelete="CASCADE"), unique=True)
    is_visible_on_shop_page = Column(Boolean, default=False)
    show_profile_text = Column(Boolean, default=False)
    show_image = Column(Boolean, default=False)
    image_type = Column(String, nullable=True) # photo, illustration
    profile_text = Column(Text, nullable=True)
    image_url = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    shop_member = relationship("ShopMember", back_populates="public_settings")

class Boost(Base):
    __tablename__ = "boosts"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id = Column(Uuid(as_uuid=True), ForeignKey("shops.id"))
    start_time = Column(DateTime, default=datetime.datetime.utcnow)
    end_time = Column(DateTime)
    status = Column(String, default="active", index=True) # active, expired, cancelled

    # Relationships
    shop = relationship("Shop", back_populates="boosts")

class StaffShift(Base):
    __tablename__ = "staff_shifts"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id = Column(Uuid(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"), nullable=False)
    profile_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    business_date = Column(Date, nullable=False)
    start_time = Column(Numeric, nullable=False) # e.g. 21.5
    end_time = Column(Numeric, nullable=False)   # e.g. 29.0
    note = Column(Text, nullable=True)
    status = Column(String, default="draft") # draft, submitted, approved
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('shop_id', 'profile_id', 'business_date', name='uq_staff_shift_date'),
    )

class JobPost(Base):
    __tablename__ = "job_posts"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id = Column(Uuid(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"))
    title = Column(String)
    description = Column(Text)
    employment_type = Column(String, nullable=True)
    location = Column(String, nullable=True)
    status = Column(String, default="open", index=True) # draft, open, closed, archived
    application_deadline = Column(DateTime, nullable=True)
    published_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    shop = relationship("Shop", back_populates="job_posts")
    applications = relationship("JobApplication", back_populates="job_post", cascade="all, delete-orphan")
    media_assets = relationship("MediaAsset", back_populates="job_post")

class JobApplication(Base):
    __tablename__ = "job_applications"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_post_id = Column(Uuid(as_uuid=True), ForeignKey("job_posts.id", ondelete="CASCADE"))
    profile_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"))
    status = Column(String, default="pending") # pending, reviewing, accepted, rejected
    message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    job_post = relationship("JobPost", back_populates="applications")
    profile = relationship("Profile")

class FavoriteShop(Base):
    __tablename__ = "favorite_shops"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"))
    shop_id = Column(Uuid(as_uuid=True), ForeignKey("shops.id", ondelete="CASCADE"))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    profile = relationship("Profile")
    shop = relationship("Shop")

class Message(Base):
    __tablename__ = "messages"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sender_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id"))
    receiver_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id"))
    shop_id = Column(Uuid(as_uuid=True), ForeignKey("shops.id"), nullable=True)
    content = Column(Text)
    is_read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    sender = relationship("Profile", foreign_keys=[sender_id])
    receiver = relationship("Profile", foreign_keys=[receiver_id])
    shop = relationship("Shop")


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    endpoint = Column(Text, unique=True, nullable=False)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    user_agent = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)

    # Relationships
    profile = relationship("Profile")


class MediaAsset(Base):
    __tablename__ = "media_assets"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id = Column(Uuid(as_uuid=True), ForeignKey("shops.id"), nullable=True)
    profile_id = Column(Uuid(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    job_post_id = Column(Uuid(as_uuid=True), ForeignKey("job_posts.id", ondelete="CASCADE"), nullable=True)
    asset_type = Column(String) # shop_image, profile_image, job_image
    provider = Column(String, default="cloudinary")
    url = Column(String)
    storage_bucket = Column(String, nullable=True)
    storage_path = Column(String, nullable=True)
    mime_type = Column(String, nullable=True)
    bytes = Column(String, nullable=True)
    width = Column(String, nullable=True)
    height = Column(String, nullable=True)
    active = Column(Boolean, default=True)
    cloudinary_public_id = Column(String, nullable=True)
    asset_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    replaced_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)

    # Relationships
    shop = relationship("Shop", back_populates="media_assets")
    profile = relationship("Profile", back_populates="media_assets")
    job_post = relationship("JobPost", back_populates="media_assets")


class Inquiry(Base):
    __tablename__ = "inquiries"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inquiry_type = Column(String)  # listing, removal, other
    name = Column(String)
    email = Column(String)
    content = Column(Text)
    is_resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime, nullable=True)
    resolved_by = Column(Uuid(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class SystemSetting(Base):
    __tablename__ = "system_settings"
    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False, default="")
    updated_by = Column(Uuid(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    updater = relationship("Profile")
    histories = relationship("SystemSettingHistory", back_populates="setting", cascade="all, delete-orphan")


class SystemSettingHistory(Base):
    __tablename__ = "system_settings_history"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    setting_key = Column(String, ForeignKey("system_settings.key", ondelete="CASCADE"), index=True, nullable=False)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=False, default="")
    changed_by = Column(Uuid(as_uuid=True), ForeignKey("profiles.id"), nullable=True)
    changed_at = Column(DateTime, default=datetime.datetime.utcnow)

    setting = relationship("SystemSetting", back_populates="histories")
    changer = relationship("Profile")
