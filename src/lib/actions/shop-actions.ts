'use server';

import { revalidatePath } from 'next/cache';
import { updateShop, createJob, updateJob, deleteJob, updateApplicationStatus, favoriteShop, unfavoriteShop } from '@/lib/api';
import { shopSchema, jobPostSchema, applicationStatusSchema, ShopInput, JobPostInput } from '@/lib/schemas';

export async function updateShopAction(shopId: string, data: ShopInput) {
  const validated = shopSchema.parse(data);
  const result = await updateShop(shopId, {
    ...validated,
    description: validated.description?.trim() || '',
    category: validated.category?.trim() || undefined,
    tags: Array.from(new Set(validated.tags ?? [])),
    custom_description: validated.custom_description?.trim() || undefined,
    x_account_id: validated.x_account_id?.trim() || undefined,
    instagram_account_id: validated.instagram_account_id?.trim() || undefined,
  });
  revalidatePath('/[locale]/owner', 'layout');
  revalidatePath('/[locale]/shop/[slug]', 'page');
  return result;
}

export async function createJobAction(data: JobPostInput) {
  const validated = jobPostSchema.parse(data);
  const result = await createJob(validated);
  revalidatePath('/[locale]/owner', 'layout');
  revalidatePath('/[locale]/jobs', 'page');
  return result;
}

export async function updateJobAction(jobId: string, data: JobPostInput) {
  const validated = jobPostSchema.parse(data);
  const result = await updateJob(jobId, validated);
  revalidatePath('/[locale]/owner', 'layout');
  return result;
}

export async function deleteJobAction(jobId: string) {
  await deleteJob(jobId);
  revalidatePath('/[locale]/owner', 'layout');
}

export async function updateApplicationStatusAction(applicationId: string, status: string) {
  const validated = applicationStatusSchema.parse({ status });
  const result = await updateApplicationStatus(applicationId, validated.status);
  revalidatePath('/[locale]/owner', 'layout');
  return result;
}

export async function toggleFavoriteAction(shopId: string, isFavorited: boolean) {
  if (isFavorited) {
    await unfavoriteShop(shopId);
  } else {
    await favoriteShop(shopId);
  }
  revalidatePath('/[locale]/shop', 'page');
  revalidatePath('/[locale]/profile/job-seeker', 'page');
}
