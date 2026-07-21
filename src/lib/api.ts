import { type Shop } from './content';
export type { Shop };
import { supabase } from './supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10001';
const PUBLIC_READ_API_URL = process.env.NEXT_PUBLIC_PUBLIC_READ_API_URL || process.env.NEXT_PUBLIC_GO_API_URL;
const GO_API_URL = process.env.NEXT_PUBLIC_GO_API_URL || PUBLIC_READ_API_URL;

export interface Profile {
  id: string;
  role: string;
  display_name: string;
  email: string;
  media_assets?: MediaAsset[];
}

export interface JobPost {
  id: string;
  shop_id: string;
  title: string;
  description: string;
  employment_type?: string | null;
  location?: string | null;
  status: string;
  application_deadline?: string | null;
  published_at?: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
  shop?: Shop;
  media_assets?: MediaAsset[];
}

export interface JobApplication {
  id: string;
  job_post_id: string;
  profile_id: string;
  status: string;
  message?: string;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  job_post?: JobPost;
}

export interface FavoriteShop {
  id: string;
  profile_id: string;
  shop_id: string;
  created_at: string;
  shop?: Shop;
}

export interface MediaAsset {
  id: string;
  asset_type: string;
  provider?: 'cloudinary' | 'gcs' | string;
  url: string;
  shop_id?: string;
  profile_id?: string;
  job_post_id?: string;
  storage_bucket?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  bytes?: string | null;
  width?: string | null;
  height?: string | null;
  active?: boolean;
  cloudinary_public_id?: string | null;
  asset_metadata?: Record<string, unknown> | null;
  created_at?: string;
  replaced_at?: string | null;
  deleted_at?: string | null;
}

export interface MemberPublicSettings {
  is_visible_on_shop_page?: boolean;
  show_profile_text?: boolean;
  show_image?: boolean;
  profile_text?: string | null;
}

export interface OwnerApplication {
  id: string;
  profile_id: string;
  shop_id?: string;
  status: string;
  reason: string;
  review_comment?: string;
  reviewed_at?: string;
  created_at: string;
  profile?: Profile;
  shop?: Shop;
}

export interface SupervisorStats {
  total_shops: number;
  approved_shops: number;
  pending_shops: number;
  total_users: number;
  total_applications: number;
  pending_applications: number;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  shop_id?: string;
  content: string;
  is_read: boolean;
  created_at: string;
  sender?: Profile;
  receiver?: Profile;
  shop?: Shop;
}

export interface ConversationSummary {
  shop_id: string;
  other_user_id: string;
  shop?: Shop;
  other_user?: Profile;
  last_message?: Message;
  unread_count: number;
}

export interface Inquiry {
  id: string;
  inquiry_type: string;
  name: string;
  email: string;
  content: string;
  is_resolved: boolean;
  resolved_at?: string | null;
  resolved_by?: string | null;
  created_at: string;
}

export interface PushNotificationConfig {
  enabled: boolean;
  public_key?: string | null;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  user_agent?: string;
}

export interface SystemSetting {
  key: string;
  value: string;
  updated_by?: string | null;
  updated_at?: string | null;
  source?: 'db' | 'default';
}

export interface SystemSettingHistory {
  id: string;
  setting_key: string;
  old_value?: string | null;
  new_value: string;
  changed_by?: string | null;
  changed_at: string;
}

export interface StaffShift {
  id: string;
  shop_id: string;
  profile_id: string;
  business_date: string;
  start_time: number;
  end_time: number;
  note?: string;
  status: 'draft' | 'submitted' | 'approved';
  created_at: string;
  updated_at: string;
  profile?: {
    id: string;
    display_name: string;
    email: string;
  };
}

export interface ShopUpdatePayload {
  name?: string;
  slug?: string;
  description?: string;
  address?: string;
  category?: string;
  tags?: string[];
  custom_description?: string;
  x_account_id?: string;
  instagram_account_id?: string;
  owner_id?: string | null;
  is_approved?: boolean;
  claim_status?: string;
}

export interface ShopCreatePayload {
  name: string;
  slug?: string | null;
  description?: string | null;
  address?: string | null;
  category?: string | null;
  tags?: string[];
  custom_description?: string | null;
  x_account_id?: string | null;
  instagram_account_id?: string | null;
}

export async function callApi<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  return callApiWithBaseUrl<T>(resolvePrimaryApiUrl(), path, options);
}

export async function callGoApi<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  return callApiWithBaseUrl<T>(resolveGoApiUrl(), path, options);
}

function resolvePrimaryApiUrl() {
  if (typeof window === 'undefined') {
    return process.env.INTERNAL_API_URL || API_URL;
  }

  return API_URL;
}

function resolveGoApiUrl() {
  if (typeof window === 'undefined') {
    return process.env.INTERNAL_GO_API_URL || process.env.INTERNAL_PUBLIC_READ_API_URL || GO_API_URL || resolvePrimaryApiUrl();
  }

  return GO_API_URL || API_URL;
}

async function callApiWithBaseUrl<T>(
  apiUrl: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let token: string | undefined = undefined;

  if (typeof window === 'undefined') {
    try {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      token = cookieStore.get('sb-access-token')?.value;
    } catch {
      // In standalone fetching without request context
    }
  } else {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token;
    } catch {
      // Ignore
    }
  }

  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => 'Unknown error');
    throw new Error(`API error ${res.status}: ${errorBody}`);
  }

  if (res.status === 204) {
    return null as T;
  }

  return res.json();
}

function resolvePublicReadApiUrl() {
  if (typeof window === 'undefined') {
    return process.env.INTERNAL_PUBLIC_READ_API_URL || PUBLIC_READ_API_URL || process.env.INTERNAL_API_URL || API_URL;
  }

  return PUBLIC_READ_API_URL || API_URL;
}

export async function callPublicReadApi<T>(path: string): Promise<T> {
  const publicApiUrl = resolvePublicReadApiUrl();
  const fallbackApiUrl = typeof window === 'undefined'
    ? process.env.INTERNAL_API_URL || API_URL
    : API_URL;

  const fetchPublic = async (apiUrl: string) => {
    const res = await fetch(`${apiUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => 'Unknown error');
      throw new Error(`API error ${res.status}: ${errorBody}`);
    }

    return res.json() as Promise<T>;
  };

  try {
    return await fetchPublic(publicApiUrl);
  } catch (error) {
    if (publicApiUrl === fallbackApiUrl) {
      throw error;
    }
    console.warn('Public read API failed; falling back to primary API:', error);
    return fetchPublic(fallbackApiUrl);
  }
}

export async function getMe() {
  return await callGoApi<Profile>('/api/v1/auth/me');
}

export async function updateMe(data: { display_name: string }) {
  return await callGoApi<Profile>('/api/v1/auth/me', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getSupervisorStats() {
  return await callGoApi<SupervisorStats>('/api/v1/n2-supervisor-portal-xyz/stats');
}

export async function getSupervisorShops() {
  return await callGoApi<Shop[]>('/api/v1/n2-supervisor-portal-xyz/shops');
}

export async function approveShopBySupervisor(shopId: string) {
  return await callGoApi<Shop>(`/api/v1/n2-supervisor-portal-xyz/shops/${shopId}/approve`, {
    method: 'POST',
  });
}

export async function getJobSeekerProfile() {
  return await callGoApi<{
    bio: string;
    desired_roles: string[];
    availability_note: string;
    is_open_to_work: boolean;
    media_assets: MediaAsset[];
  }>('/api/v1/auth/me/job-seeker-profile');
}

export async function updateJobSeekerProfile(data: { bio?: string, desired_roles?: string[], availability_note?: string, is_open_to_work?: boolean }) {
  return await callGoApi<void>('/api/v1/auth/me/job-seeker-profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getMyMemberships() {
  return await callGoApi<{
    id: string;
    shop_id: string;
    profile_id: string;
    role: string;
    display_name: string;
    status: string;
    employment_status: string;
    display_order: number;
    can_manage_shop: boolean;
    shop?: Shop;
  }[]>('/api/v1/auth/me/memberships');
}

export interface ShopMemberResponse {
  id: string;
  shop_id: string;
  profile_id: string;
  role: string;
  display_name: string;
  status: string;
  employment_status: string;
  display_order: number;
  can_manage_shop: boolean;
  shop?: Shop;
}

export async function submitOwnerApplication(data: { reason: string; shop_id?: string }) {
  return await callGoApi<OwnerApplication>('/api/v1/owner-applications/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteAccount() {
  return await callGoApi<void>('/api/v1/auth/me', {
    method: 'DELETE',
  });
}

export async function getMyOwnerApplications() {
  return await callGoApi<OwnerApplication[]>('/api/v1/owner-applications/me');
}

export async function getAllOwnerApplications() {
  return await callGoApi<OwnerApplication[]>('/api/v1/admin/owner-applications');
}

export async function processOwnerApplication(id: string, data: { status: string, review_comment: string }) {
  return await callGoApi<OwnerApplication>(`/api/v1/admin/owner-applications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function getShopById(id: string) {
  return await callGoApi<Shop>(`/api/v1/shops/${id}`);
}

export async function getShopPublicSettings(shopId: string) {
  return await callGoApi<{ show_today_staff: boolean }>(`/api/v1/admin/shops/${shopId}/public-settings`);
}

export async function updateShopPublicSettings(shopId: string, data: { show_today_staff: boolean }) {
  return await callGoApi<{ show_today_staff: boolean }>(`/api/v1/admin/shops/${shopId}/public-settings`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getShopMembers(shopId: string) {
  return await callGoApi<{
    id: string;
    shop_id: string;
    profile_id: string;
    role: string;
    display_name: string;
    status: string;
    employment_status: string;
    display_order: number;
    can_manage_shop: boolean;
  }[]>(`/api/v1/admin/shops/${shopId}/members`);
}

export async function addShopMember(shopId: string, data: { profile_id: string, role: string, display_name: string }) {
  return await callGoApi<void>(`/api/v1/admin/shops/${shopId}/members`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateShopMember(shopId: string, memberId: string, data: { role?: string, display_name?: string, employment_status?: string, can_manage_shop?: boolean, status?: string, display_order?: number }) {
  return await callGoApi<void>(`/api/v1/admin/shops/${shopId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteShopMember(shopId: string, memberId: string) {
  return await callGoApi<void>(`/api/v1/admin/shops/${shopId}/members/${memberId}`, {
    method: 'DELETE',
  });
}

export async function getMyShops() {
  return await callGoApi<Shop[]>('/api/v1/shops/admin/all');
}

export async function updateShop(shopId: string, data: ShopUpdatePayload) {
  return await callGoApi<Shop>(`/api/v1/shops/${shopId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function registerShop(data: ShopCreatePayload) {
  return await callGoApi<Shop>('/api/v1/shops/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function leaveShopMembership(shopId: string) {
  return await callGoApi<void>(`/api/v1/shops/${shopId}/membership`, {
    method: 'DELETE',
  });
}

export async function getMyJobs() {
  return await callGoApi<JobPost[]>('/api/v1/jobs/my-jobs');
}

export async function getShopJobs(shopId: string) {
  return await callGoApi<JobPost[]>(`/api/v1/jobs/shop/${shopId}`);
}

export async function createJob(data: Partial<JobPost>) {
  return await callGoApi<JobPost>('/api/v1/jobs/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateJob(jobId: string, data: Partial<JobPost>) {
  return await callGoApi<JobPost>(`/api/v1/jobs/${jobId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteJob(jobId: string) {
  return await callGoApi<void>(`/api/v1/jobs/${jobId}`, {
    method: 'DELETE',
  });
}

export async function getJobApplications(jobId: string) {
  return await callGoApi<JobApplication[]>(`/api/v1/jobs/${jobId}/applications`);
}

export async function updateApplicationStatus(applicationId: string, status: string) {
  return await callGoApi<JobApplication>(`/api/v1/jobs/applications/${applicationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function applyToJob(jobId: string, message: string) {
  return await callGoApi<JobApplication>(`/api/v1/jobs/${jobId}/apply`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function getMyApplications() {
  return await callGoApi<JobApplication[]>('/api/v1/jobs/my-applications');
}

export async function favoriteShop(shopId: string) {
  return await callGoApi<{ message: string }>(`/api/v1/shops/${shopId}/favorite`, {
    method: 'POST',
  });
}

export async function unfavoriteShop(shopId: string) {
  return await callGoApi<void>(`/api/v1/shops/${shopId}/favorite`, {
    method: 'DELETE',
  });
}

export async function getMyFavorites() {
  return await callGoApi<FavoriteShop[]>('/api/v1/shops/me/favorites');
}

export async function sendMessage(data: { receiver_id: string; shop_id: string; content: string }) {
  return await callGoApi<Message>('/api/v1/messages/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getConversation(shopId: string, otherUserId: string) {
  return await callGoApi<Message[]>(`/api/v1/messages/conversation/${shopId}/${otherUserId}`);
}

export async function getConversations() {
  return await callGoApi<ConversationSummary[]>('/api/v1/messages/conversations');
}

export async function getPushNotificationConfig() {
  return await callGoApi<PushNotificationConfig>('/api/v1/push/config');
}

export async function savePushSubscription(data: PushSubscriptionPayload) {
  return await callGoApi<void>('/api/v1/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deletePushSubscription(data: PushSubscriptionPayload) {
  return await callGoApi<void>('/api/v1/push/subscriptions', {
    method: 'DELETE',
    body: JSON.stringify(data),
  });
}

export async function submitInquiry(data: { inquiry_type: string; name: string; email: string; content: string }) {
  return await callGoApi<Inquiry>('/api/v1/inquiries/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getInquiries() {
  return await callGoApi<Inquiry[]>('/api/v1/inquiries/');
}

export async function updateInquiry(inquiryId: string, data: { is_resolved: boolean }) {
  return await callGoApi<Inquiry>(`/api/v1/inquiries/${inquiryId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function getPublicSystemSetting(key: string) {
  return await callGoApi<SystemSetting>(`/api/v1/public/system-settings/${encodeURIComponent(key)}`);
}

export async function getSystemSettingForAdmin(key: string) {
  return await callGoApi<SystemSetting>(`/api/v1/n2-supervisor-portal-xyz/system-settings/${encodeURIComponent(key)}`);
}

export async function updateSystemSettingForAdmin(key: string, value: string) {
  return await callGoApi<SystemSetting>(`/api/v1/n2-supervisor-portal-xyz/system-settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}

export async function getSystemSettingHistoryForAdmin(key: string) {
  return await callGoApi<SystemSettingHistory[]>(`/api/v1/n2-supervisor-portal-xyz/system-settings/${encodeURIComponent(key)}/history`);
}

export async function getBusinessDate(shopId: string) {
  return await callGoApi<{ business_date: string; cutoff_time: string }>(`/api/v1/shops/${shopId}/business-date`);
}

export async function getShifts(shopId: string, startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  const query = params.toString();
  return await callGoApi<StaffShift[]>(`/api/v1/shops/${shopId}/shifts${query ? `?${query}` : ''}`);
}

export async function upsertShift(shopId: string, data: { profile_id?: string; business_date: string; start_time: number; end_time: number; note?: string; status?: string }) {
  return await callGoApi<StaffShift>(`/api/v1/shops/${shopId}/shifts`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateShiftStatus(shopId: string, shiftId: string, status: string) {
  return await callGoApi<StaffShift>(`/api/v1/shops/${shopId}/shifts/${shiftId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
