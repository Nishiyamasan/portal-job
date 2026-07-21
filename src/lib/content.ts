import { MediaAsset, callPublicReadApi } from './api';

export interface Shop {
  id: string;
  name: string;
  slug: string;
  description: string;
  address: string;
  category: string;
  tags: string[];
  x_account_id?: string;
  instagram_account_id?: string;
  owner_id?: string;
  contact_profile_id?: string;
  is_approved?: boolean;
  claim_status?: string;
  shift_cutoff_time?: string;
  media_assets?: MediaAsset[];
}

export interface JobPost {
  id: string;
  shop_id: string;
  title: string;
  description: string;
  status: string;
  employmentType?: string;
  location?: string;
  publishedAt?: string | null;
  media_assets?: MediaAsset[];
  shop?: {
    id: string;
    name: string;
    slug: string;
  };
}

type ListOptions = {
  limit?: number;
  skip?: number;
  random?: boolean;
};

export interface PublicShopMember {
  id: string;
  display_name: string;
  profile_image_url?: string | null;
}

interface RawShop {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  address?: string | null;
  category?: string | null;
  tags?: string[] | null;
  x_account_id?: string | null;
  instagram_account_id?: string | null;
  owner_id?: string | null;
  contact_profile_id?: string | null;
  is_approved?: boolean;
  claim_status?: string;
  shift_cutoff_time?: string;
  media_assets?: MediaAsset[];
}

interface RawJobPost {
  id: string;
  shop_id: string;
  title: string;
  description: string;
  status: string;
  employment_type?: string | null;
  employmentType?: string | null;
  location?: string | null;
  published_at?: string | null;
  publishedAt?: string | null;
  media_assets?: MediaAsset[];
  shop?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

function normalizeShop(shop: RawShop): Shop {
  return {
    id: shop.id,
    name: shop.name,
    slug: shop.slug,
    category: shop.category || 'Shop',
    tags: Array.isArray(shop.tags) ? shop.tags : [],
    description: shop.description || '',
    address: shop.address || '',
    x_account_id: shop.x_account_id || undefined,
    instagram_account_id: shop.instagram_account_id || undefined,
    owner_id: shop.owner_id || undefined,
    contact_profile_id: shop.contact_profile_id || undefined,
    is_approved: shop.is_approved,
    claim_status: shop.claim_status,
    shift_cutoff_time: shop.shift_cutoff_time,
    media_assets: shop.media_assets || []
  };
}

function normalizeJob(job: RawJobPost): JobPost {
  return {
    id: job.id,
    shop_id: job.shop_id,
    title: job.title,
    description: job.description,
    status: job.status,
    employmentType: job.employment_type || job.employmentType || undefined,
    location: job.location || undefined,
    publishedAt: job.published_at || job.publishedAt || null,
    media_assets: job.media_assets || [],
    shop: job.shop || undefined,
  };
}

export async function getShops(options: ListOptions = {}): Promise<Shop[]> {
  try {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.skip) params.set('skip', String(options.skip));
    if (options.random) params.set('random', 'true');
    const query = params.toString();
    const shops = await callPublicReadApi<RawShop[]>(`/api/v1/shops/${query ? `?${query}` : ''}`);
    return (shops ?? []).map(normalizeShop);
  } catch (e) {
    console.error('Failed to get shops:', e);
    return [];
  }
}

export async function getShopBySlug(slug: string): Promise<Shop | null> {
  try {
    const shop = await callPublicReadApi<RawShop>(`/api/v1/shops/${slug}`);
    return shop ? normalizeShop(shop) : null;
  } catch (e) {
    console.error(`Failed to get shop by slug ${slug}:`, e);
    return null;
  }
}

export async function getShopById(id: string): Promise<Shop | null> {
  try {
    const shop = await callPublicReadApi<RawShop>(`/api/v1/shops/${id}`);
    return shop ? normalizeShop(shop) : null;
  } catch (e) {
    console.error(`Failed to get shop by id ${id}:`, e);
    return null;
  }
}

export async function getPublicShopMembers(shopIdOrSlug: string): Promise<PublicShopMember[]> {
  try {
    return await callPublicReadApi<PublicShopMember[]>(`/api/v1/shops/${shopIdOrSlug}/public-members`) || [];
  } catch (e) {
    console.error(`Failed to get public shop members for ${shopIdOrSlug}:`, e);
    return [];
  }
}

export async function getJobs(options: ListOptions = {}): Promise<JobPost[]> {
  try {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.skip) params.set('skip', String(options.skip));
    if (options.random) params.set('random', 'true');
    const query = params.toString();
    const jobs = await callPublicReadApi<RawJobPost[]>(`/api/v1/jobs/${query ? `?${query}` : ''}`) || [];
    return jobs.map(normalizeJob);
  } catch (e) {
    console.error('Failed to get jobs:', e);
    return [];
  }
}

export async function getJobById(id: string): Promise<JobPost | null> {
  try {
    const job = await callPublicReadApi<RawJobPost>(`/api/v1/jobs/${id}`);
    return job ? normalizeJob(job) : null;
  } catch (e) {
    console.error(`Failed to get job by id ${id}:`, e);
    return null;
  }
}

export async function getShopForJob(id: string) {
  const job = await getJobById(id);

  if (!job) {
    return null;
  }

  return getShopById(job.shop_id);
}
