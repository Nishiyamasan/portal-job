'use client';

import { useState, useEffect, use } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { getShopById, Shop, updateShop } from '@/lib/api';
import { Link, useRouter } from '@/i18n/routing';
import { shopEditSchema, ShopEditInput } from '@/lib/schemas';
import { SHOP_TAGS } from '@/constants/tags';
import { Notification, NotificationType } from '@/components/Notification';
import { ImageUpload } from '@/components/ImageUpload';
import { getPrimaryMediaAsset } from '@/lib/media-assets';

export const runtime = 'edge';

export default function EditShopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: shopId } = use(params);
  const t = useTranslations('OwnerEditShop');
  const tTags = useTranslations('Tags');
  const router = useRouter();
  const [shop, setShop] = useState<Shop | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notification, setNotification] = useState<{ type: NotificationType; message: string } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<ShopEditInput>({
    resolver: zodResolver(shopEditSchema),
    defaultValues: {
      tags: []
    }
  });

  const selectedTags = watch('tags') || [];

  useEffect(() => {
    async function loadShop() {
      try {
        const data = await getShopById(shopId);
        if (data) {
          const shopData = data as unknown as Shop;
          setShop(shopData);
          reset({
            name: shopData.name,
            description: shopData.description || '',
            address: shopData.address,
            category: shopData.category || '',
            tags: Array.isArray(shopData.tags) ? shopData.tags : [],
            x_account_id: shopData.x_account_id || '',
            instagram_account_id: shopData.instagram_account_id || '',
          });
        }
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    }
    loadShop();
  }, [shopId, reset]);

  const onSubmit = async (data: ShopEditInput) => {
    try {
      await updateShop(shopId, {
        ...data,
        description: data.description?.trim() || '',
        category: data.category?.trim() || undefined,
        tags: Array.from(new Set(data.tags ?? [])),
        x_account_id: data.x_account_id?.trim() || undefined,
        instagram_account_id: data.instagram_account_id?.trim() || undefined,
      });
      setNotification({ type: 'success', message: t('updateSuccess') });
      setTimeout(() => router.push('/owner'), 1500);
    } catch (error) {
      console.error(error);
      setNotification({ type: 'error', message: t('updateError') });
    }
  };

  if (isLoading) {
    return <div className="max-w-4xl mx-auto p-8 text-center text-gray-500">Loading...</div>;
  }

  const currentShopImage = getPrimaryMediaAsset(shop?.media_assets, 'shop_image');

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
        <div className="mb-4">
          <Link
            href="/owner"
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ← {t('backToDashboard')}
          </Link>
        </div>
        <h1 className="text-4xl font-bold text-gray-900">{shop?.name || t('title')}</h1>
        <p className="text-gray-500 mt-2">{t('title')}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-8 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-2">{t('shopImage')}</h2>
        <p className="text-sm text-gray-500 mb-6">{t('shopImageHelp')}</p>
        <div className="grid gap-6 md:grid-cols-[240px_1fr] md:items-start">
          <div className="aspect-video rounded-xl overflow-hidden border bg-gray-100">
            {currentShopImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentShopImage.url}
                alt={shop?.name || t('shopImage')}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-sm text-gray-400">
                {t('noShopImage')}
              </div>
            )}
          </div>
          <ImageUpload
            assetType="shop_image"
            shopId={shopId}
            label={currentShopImage ? t('replaceShopImage') : t('uploadShopImage')}
            description={t('replaceShopImageDescription')}
            onSuccess={async () => {
              const updatedShop = await getShopById(shopId);
              setShop(updatedShop as unknown as Shop);
            }}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t('name')} <span className="text-red-500">＊</span>
            </label>
            <input
              {...register('name')}
              className={`w-full border rounded-lg p-2.5 ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t('category')} <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded ml-2">{t('optional')}</span>
            </label>
            <input
              {...register('category')}
              className="w-full border border-gray-300 rounded-lg p-2.5"
              placeholder="e.g. cafe, restaurant, shop"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t('description')} <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded ml-2">{t('optional')}</span>
            </label>
            <p className="mb-2 text-xs text-gray-500">
              {t('markdownHelp')}{' '}
              <Link href="/markdown-guide" target="_blank" rel="noopener noreferrer" className="font-bold text-blue-600 hover:underline">
                {t('markdownHelpMore')}
              </Link>
            </p>
            <textarea
              {...register('description')}
              rows={6}
              className="w-full border border-gray-300 rounded-lg p-2.5"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t('address')} <span className="text-red-500">＊</span>
            </label>
            <input
              {...register('address')}
              className={`w-full border rounded-lg p-2.5 ${errors.address ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.address && <p className="mt-1 text-xs text-red-500">{errors.address.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t('xAccountId')} <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded ml-2">{t('optional')}</span>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">@</span>
              <input
                {...register('x_account_id')}
                placeholder="username"
                className="w-full border border-gray-300 rounded-lg p-2.5 pl-8"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t('instagramAccountId')} <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded ml-2">{t('optional')}</span>
            </label>
            <input
              {...register('instagram_account_id')}
              placeholder="username"
              className="w-full border border-gray-300 rounded-lg p-2.5"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">{t('tags')}</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
              {SHOP_TAGS.map((tag) => (
                <label key={tag} className="flex items-center space-x-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    value={tag}
                    checked={selectedTags.includes(tag)}
                    onChange={(e) => {
                      const newTags = e.target.checked
                        ? [...selectedTags, tag]
                        : selectedTags.filter((t) => t !== tag);
                      setValue('tags', Array.from(new Set(newTags)), { shouldDirty: true, shouldValidate: true });
                    }}
                    className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                    {tTags(tag)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gray-900 text-white font-bold py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400"
            >
              {isSubmitting ? '...' : t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
