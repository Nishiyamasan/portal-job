'use client';

import { useState, useEffect, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter, usePathname } from '@/i18n/routing';
import { callPublicReadApi } from '@/lib/api';
import { Shop } from '@/lib/content';
import { useSearchParams } from 'next/navigation';
import { Search, Filter, X, ChevronDown } from 'lucide-react';
import { SHOP_TAGS } from '@/constants/tags';
import { getMediaAssetUrl, getPrimaryMediaAsset } from '@/lib/media-assets';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import FavoriteButton from '@/components/FavoriteButton';

export const runtime = 'edge';

const CATEGORIES = ['shokudo', 'restaurant', 'izakaya', 'cafe', 'office', 'apparel', 'zakka'];
const PAGE_SIZE = 20;

function ShopListingContent() {
  const t = useTranslations('ShopListing');
  const tTags = useTranslations('Tags');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState('');

  // Filter state
  const currentCategory = searchParams.get('category') || '';
  const currentTagsString = searchParams.get('tags') || '';
  const currentTags = currentTagsString.split(',').filter(Boolean);
  const searchQuery = searchParams.get('q') || '';
  const currentPage = Math.max(1, Number(searchParams.get('page') || '1') || 1);
  const hasPreviousPage = currentPage > 1;
  const [hasNextPage, setHasNextPage] = useState(false);

  useEffect(() => {
    setSearchDraft(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    async function fetchShops() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('limit', String(PAGE_SIZE + 1));
        params.set('skip', String((currentPage - 1) * PAGE_SIZE));
        if (currentCategory) params.set('category', currentCategory);
        if (currentTagsString) params.set('tags', currentTagsString);
        if (searchQuery) params.set('q', searchQuery);

        const data = await callPublicReadApi<Shop[]>(`/api/v1/shops/?${params.toString()}`);
        const nextHasMore = data.length > PAGE_SIZE;
        setHasNextPage(nextHasMore);
        setShops(nextHasMore ? data.slice(0, PAGE_SIZE) : data);
      } catch (error) {
        console.error(error);
        setHasNextPage(false);
      } finally {
        setIsLoading(false);
      }
    }
    fetchShops();
  }, [currentCategory, currentPage, currentTagsString, searchQuery]);

  const updateFilters = (updates: Record<string, string | string[] | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        params.delete(key);
      } else {
        params.set(key, Array.isArray(value) ? value.join(',') : value);
      }
    });
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleTagToggle = (tag: string) => {
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];
    updateFilters({ tags: newTags });
  };

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) {
      params.delete('page');
    } else {
      params.set('page', String(page));
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const commitSearch = () => {
    const nextQuery = searchDraft.trim();
    if (nextQuery === searchQuery) return;
    updateFilters({ q: nextQuery || null });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-10">
      <Breadcrumbs
        items={[
          {label: 'portal-job', href: '/'},
          {label: t('title')}
        ]}
      />
      <h1 className="text-4xl font-extrabold text-gray-900 mb-10">{t('title')}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
        {/* Filters Sidebar */}
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white p-6 rounded-xl border shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <Filter size={18} className="text-brand-500" />
              <h2 className="font-bold text-gray-900">{t('filters')}</h2>
            </div>

            {/* Search */}
            <div className="mb-8">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">{t('search')}</label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('searchPlaceholder')}
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onBlur={commitSearch}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    }
                  }}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                />
              </div>
            </div>

            {/* Category */}
            <div className="mb-8">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">{t('category')}</label>
              <div className="relative group">
                <select
                  value={currentCategory || ''}
                  onChange={(e) => updateFilters({ category: e.target.value || null })}
                  className="w-full appearance-none pl-4 pr-10 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-700 font-medium focus:ring-2 focus:ring-brand-500 outline-none transition-all cursor-pointer shadow-sm"
                >
                  <option value="">{t('allCategories')}</option>
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>
                      {t(`categories.${cat}`)}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 group-hover:text-brand-500 transition-colors">
                  <ChevronDown size={16} />
                </div>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">{t('tags')}</label>
              <div className="flex flex-wrap gap-2">
                {SHOP_TAGS.map(tag => (
                  <button
                    key={tag}
                    onClick={() => handleTagToggle(tag)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${currentTags.includes(tag)
                        ? 'bg-gray-900 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                  >
                    {tTags(tag)}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear All */}
            {(currentCategory || currentTags.length > 0 || searchQuery) && (
              <button
                onClick={() => router.push(pathname)}
                className="mt-8 w-full flex items-center justify-center gap-2 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={14} />
                {t('clearAll')}
              </button>
            )}
          </div>
        </div>

        {/* Shop Grid */}
        <div className="lg:col-span-3">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white rounded-xl border h-[400px] animate-pulse" />
              ))}
            </div>
          ) : shops.length === 0 ? (
            <div className="bg-white rounded-xl border p-20 text-center">
              <p className="text-gray-400">{t('noResults')}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {shops.map((shop) => (
                  <article
                    key={shop.id}
                    className="group relative flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                  >
                    <Link
                      href={`/shop/${shop.slug}`}
                      aria-label={`${shop.name}の詳細を見る`}
                      className="absolute inset-0 z-10"
                    />
                    <div className="relative z-0 aspect-video overflow-hidden bg-gray-100">
                      {getMediaAssetUrl(getPrimaryMediaAsset(shop.media_assets, 'shop_image'), 'f_auto,q_auto,c_fill,w_640,h_360') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={getMediaAssetUrl(getPrimaryMediaAsset(shop.media_assets, 'shop_image'), 'f_auto,q_auto,c_fill,w_640,h_360')}
                          alt={shop.name}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl font-black uppercase tracking-tighter text-gray-300">
                          {shop.name}
                        </div>
                      )}
                      <div className="absolute left-4 top-4">
                        <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-gray-900 shadow-sm backdrop-blur">
                          {shop.category}
                        </span>
                      </div>
                    </div>
                    <div className="relative z-0 flex flex-1 flex-col p-6">
                      <h3 className="mb-2 text-xl font-bold text-gray-900 transition-colors group-hover:text-brand-600">{shop.name}</h3>
                      <div className="mb-4 flex flex-wrap gap-1.5">
                        {shop.tags?.slice(0, 3).map(tag => (
                          <span key={tag} className="text-[10px] font-bold text-gray-400">
                            #{tTags.has(tag) ? tTags(tag) : tag}
                          </span>
                        ))}
                      </div>
                      <p className="text-gray-500 text-sm line-clamp-2 flex-1">{shop.address || '-'}</p>
                      <div className="relative z-20 mt-6 flex items-center justify-start">
                        <FavoriteButton shopId={shop.id} initialIsFavorited={false} />
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-10 flex items-center justify-center gap-3">
                <button
                  type="button"
                  disabled={!hasPreviousPage}
                  onClick={() => goToPage(currentPage - 1)}
                  className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-300"
                >
                  {t('previousPage')}
                </button>
                <span className="rounded-full bg-gray-900 px-4 py-2 text-sm font-bold text-white">
                  {t('pageLabel', {page: currentPage})}
                </span>
                <button
                  type="button"
                  disabled={!hasNextPage}
                  onClick={() => goToPage(currentPage + 1)}
                  className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-300"
                >
                  {t('nextPage')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ShopListingPage() {
  return (
    <Suspense fallback={<div className="p-20 text-center text-gray-500">Loading...</div>}>
      <ShopListingContent />
    </Suspense>
  );
}
