from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Optional, List, Dict, Any

class ProfileBase(BaseModel):
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: str = "user"

class ProfileResponse(ProfileBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    media_assets: List["MediaAssetResponse"] = []
    model_config = ConfigDict(from_attributes=True)

class ProfileSyncRequest(BaseModel):
    id: UUID
    email: Optional[str] = None
    display_name: Optional[str] = None

class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None

class JobSeekerProfileBase(BaseModel):
    bio: Optional[str] = None
    desired_roles: Optional[List[str]] = None
    availability_note: Optional[str] = None
    is_open_to_work: bool = True

class JobSeekerProfileCreate(JobSeekerProfileBase):
    profile_id: UUID

class JobSeekerProfileResponse(JobSeekerProfileBase):
    id: UUID
    profile_id: UUID
    updated_at: datetime
    media_assets: List["MediaAssetResponse"] = []
    model_config = ConfigDict(from_attributes=True)

class ShopBase(BaseModel):
    name: str
    slug: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    tags: Optional[List[str]] = None

class ShopCreate(ShopBase):
    owner_id: Optional[UUID] = None

class ShopUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    tags: Optional[List[str]] = None
    is_approved: Optional[bool] = None
    claim_status: Optional[str] = None
    verification_method: Optional[str] = None
    is_manual_edited: Optional[bool] = None
    custom_description: Optional[str] = None
    description_en: Optional[str] = None
    description_zh: Optional[str] = None
    description_ko: Optional[str] = None
    x_account_id: Optional[str] = None
    instagram_account_id: Optional[str] = None

class ShopResponse(ShopBase):
    id: UUID
    owner_id: Optional[UUID] = None
    is_approved: bool
    claim_status: str
    description_en: Optional[str] = None
    description_zh: Optional[str] = None
    description_ko: Optional[str] = None
    x_account_id: Optional[str] = None
    instagram_account_id: Optional[str] = None
    contact_profile_id: Optional[UUID] = None
    updated_at: datetime
    media_assets: List["MediaAssetResponse"] = []
    model_config = ConfigDict(from_attributes=True)

class SupervisorShopResponse(ShopResponse):
    owner_email: Optional[str] = None

class ShopPublicSettingsBase(BaseModel):
    show_today_staff: bool = False

class ShopPublicSettingsResponse(ShopPublicSettingsBase):
    id: UUID
    shop_id: UUID
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ShopMemberBase(BaseModel):
    role: str
    display_name: str
    status: str = "approved"
    employment_status: str = "active"
    display_order: int = 0
    can_manage_shop: bool = False

class ShopMemberCreate(ShopMemberBase):
    profile_id: UUID

class ShopMemberUpdate(BaseModel):
    role: Optional[str] = None
    display_name: Optional[str] = None
    status: Optional[str] = None
    employment_status: Optional[str] = None
    display_order: Optional[int] = None
    can_manage_shop: Optional[bool] = None

class ShopMemberResponse(ShopMemberBase):
    id: UUID
    shop_id: UUID
    profile_id: UUID
    joined_at: datetime
    shop: Optional["ShopResponse"] = None
    model_config = ConfigDict(from_attributes=True)

class PublicShopMemberResponse(BaseModel):
    id: UUID
    display_name: str
    profile_image_url: Optional[str] = None

class MemberPublicSettingsBase(BaseModel):
    is_visible_on_shop_page: bool = False
    show_profile_text: bool = False
    show_image: bool = False
    profile_text: Optional[str] = None

class MemberPublicSettingsResponse(MemberPublicSettingsBase):
    id: UUID
    shop_member_id: UUID
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class OwnerApplicationBase(BaseModel):
    reason: str
    shop_id: Optional[UUID] = None

class OwnerApplicationCreate(OwnerApplicationBase):
    profile_id: UUID

class OwnerApplicationResponse(OwnerApplicationBase):
    id: UUID
    profile_id: UUID
    status: str
    review_comment: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    profile: Optional[ProfileResponse] = None
    shop: Optional["ShopResponse"] = None
    model_config = ConfigDict(from_attributes=True)

class OwnerApplicationUpdate(BaseModel):
    status: str
    review_comment: Optional[str] = None

class BoostBase(BaseModel):
    shop_id: UUID
    end_time: datetime

class BoostResponse(BoostBase):
    id: UUID
    start_time: datetime
    status: str
    model_config = ConfigDict(from_attributes=True)

class JobPostBase(BaseModel):
    title: str
    description: str
    employment_type: Optional[str] = None
    location: Optional[str] = None
    status: str = "open"
    application_deadline: Optional[datetime] = None
    published_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

class JobPostCreate(JobPostBase):
    shop_id: UUID

class JobPostResponse(JobPostBase):
    id: UUID
    shop_id: UUID
    created_at: datetime
    updated_at: datetime
    media_assets: List["MediaAssetResponse"] = []
    model_config = ConfigDict(from_attributes=True)

class JobApplicationBase(BaseModel):
    message: Optional[str] = None

class JobApplicationCreate(JobApplicationBase):
    job_post_id: UUID

class JobApplicationResponse(JobApplicationBase):
    id: UUID
    job_post_id: UUID
    profile_id: UUID
    status: str
    created_at: datetime
    updated_at: datetime
    profile: Optional[ProfileResponse] = None
    job_post: Optional[JobPostResponse] = None
    model_config = ConfigDict(from_attributes=True)

class JobApplicationUpdate(BaseModel):
    status: str

class FavoriteShopBase(BaseModel):
    shop_id: UUID

class FavoriteShopResponse(FavoriteShopBase):
    id: UUID
    profile_id: UUID
    created_at: datetime
    shop: Optional["ShopResponse"] = None
    model_config = ConfigDict(from_attributes=True)

class MessageBase(BaseModel):
    sender_id: UUID
    receiver_id: UUID
    shop_id: Optional[UUID] = None
    content: str

class MessageCreate(BaseModel):
    receiver_id: UUID
    shop_id: UUID
    content: str

class MessageResponse(MessageBase):
    id: UUID
    is_read: bool
    created_at: datetime
    sender: Optional[ProfileResponse] = None
    receiver: Optional[ProfileResponse] = None
    shop: Optional["ShopResponse"] = None
    model_config = ConfigDict(from_attributes=True)

class ConversationSummary(BaseModel):
    shop_id: UUID
    other_user_id: UUID
    shop: Optional["ShopResponse"] = None
    other_user: Optional[ProfileResponse] = None
    last_message: Optional[MessageResponse] = None
    unread_count: int = 0

class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str

class PushSubscriptionCreate(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys
    user_agent: Optional[str] = None

class PushSubscriptionResponse(BaseModel):
    id: UUID
    endpoint: str
    is_active: bool
    created_at: datetime
    last_used_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class PushNotificationConfig(BaseModel):
    enabled: bool
    public_key: Optional[str] = None

class MediaAssetBase(BaseModel):
    asset_type: str
    provider: Optional[str] = "cloudinary"
    url: str
    shop_id: Optional[UUID] = None
    profile_id: Optional[UUID] = None
    job_post_id: Optional[UUID] = None
    storage_bucket: Optional[str] = None
    storage_path: Optional[str] = None
    mime_type: Optional[str] = None
    bytes: Optional[str] = None
    width: Optional[str] = None
    height: Optional[str] = None
    active: Optional[bool] = True
    cloudinary_public_id: Optional[str] = None
    asset_metadata: Optional[Dict[str, Any]] = None

class MediaAssetResponse(MediaAssetBase):
    id: UUID
    created_at: datetime
    replaced_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class InquiryBase(BaseModel):
    inquiry_type: str
    name: str
    email: str
    content: str

class InquiryCreate(InquiryBase):
    pass

class InquiryResponse(InquiryBase):
    id: UUID
    is_resolved: bool = False
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[UUID] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class InquiryUpdate(BaseModel):
    is_resolved: bool


class SystemSettingBase(BaseModel):
    key: str
    value: str


class SystemSettingUpdate(BaseModel):
    value: str


class SystemSettingResponse(SystemSettingBase):
    updated_by: Optional[UUID] = None
    updated_at: Optional[datetime] = None
    source: str = "db"
    model_config = ConfigDict(from_attributes=True)


class SystemSettingHistoryResponse(BaseModel):
    id: UUID
    setting_key: str
    old_value: Optional[str] = None
    new_value: str
    changed_by: Optional[UUID] = None
    changed_at: datetime
    model_config = ConfigDict(from_attributes=True)
