'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from '@/i18n/routing';
import { shopRegistrationSchema, ShopRegistrationInput } from '@/lib/schemas';
import { registerShop } from '@/lib/api';
import { SHOP_TAGS } from '@/constants/tags';
import { Notification, NotificationType } from '@/components/Notification';
import { useAuth } from '@/lib/auth';
import { getSignInHref } from '@/lib/auth-redirects';

export const runtime = 'edge';

export default function RegisterShopPage() {
  const t = useTranslations('ShopRegistration');
  const tTags = useTranslations('Tags');
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [notification, setNotification] = useState<{ type: NotificationType; message: string } | null>(null);

  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push(getSignInHref());
    }
  }, [isAuthLoading, router, user]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ShopRegistrationInput>({
    resolver: zodResolver(shopRegistrationSchema),
    defaultValues: { tags: [] },
  });

  const selectedTags = watch('tags') || [];

  const onSubmit = async (data: ShopRegistrationInput) => {
    try {
      await registerShop({
        name: data.name,
        description: data.description?.trim() || null,
        address: data.address?.trim() || null,
        category: data.category?.trim() || null,
        tags: Array.from(new Set(data.tags ?? [])),
        custom_description: data.custom_description?.trim() || null,
        x_account_id: data.x_account_id?.trim() || null,
        instagram_account_id: data.instagram_account_id?.trim() || null,
      });

      setNotification({ type: 'success', message: t('registerSuccess') });
      setTimeout(() => router.push('/owner'), 1000);
    } catch (error) {
      console.error(error);
      setNotification({ type: 'error', message: t('registerError') });
    }
  };

  if (isAuthLoading || !user) {
    return <div className="max-w-4xl mx-auto p-8 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}
      <div className="mb-10">
        <Link
          href="/owner"
          className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          ← {t('backToOwner')}
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">{t('title')}</h1>
        <p className="mt-2 text-sm text-gray-600">{t('description')}</p>
      </div>

      <div className="rounded-xl border bg-white p-8 shadow-sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              {t('shopName')} <span className="text-red-500">*</span>
            </label>
            <input
              {...register('name')}
              required
              className={`w-full rounded-lg border p-2.5 ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              {t('address')} <span className="text-red-500">*</span>
            </label>
            <input
              {...register('address')}
              required
              className={`w-full rounded-lg border p-2.5 ${errors.address ? 'border-red-500' : 'border-gray-300'}`}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">{t('category')}</label>
            <select {...register('category')} className="w-full rounded-lg border border-gray-300 bg-white p-2.5">
              <option value="">-</option>
              <option value="restaurant">restaurant</option>
              <option value="restaurant">restaurant</option>
              <option value="restaurant">restaurant</option>
              <option value="club">club</option>
              <option value="snack">snack</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">{t('descriptionLabel')}</label>
            <textarea {...register('description')} rows={5} className="w-full rounded-lg border border-gray-300 p-2.5" />
          </div>

          <div>
            <label className="mb-3 block text-sm font-semibold text-gray-700">{t('tags')}</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              {SHOP_TAGS.map((tag) => (
                <label key={tag} className="flex items-center space-x-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    value={tag}
                    checked={selectedTags.includes(tag)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selectedTags, tag]
                        : selectedTags.filter((currentTag) => currentTag !== tag);
                      setValue('tags', Array.from(new Set(next)), { shouldDirty: true, shouldValidate: true });
                    }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span>{tTags(tag)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">{t('xAccountId')}</label>
              <input {...register('x_account_id')} className="w-full rounded-lg border border-gray-300 p-2.5" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">{t('instagramAccountId')}</label>
              <input {...register('instagram_account_id')} className="w-full rounded-lg border border-gray-300 p-2.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-gray-900 py-3 font-bold text-white transition-colors hover:bg-gray-800 disabled:bg-gray-400"
          >
            {isSubmitting ? '...' : t('submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
