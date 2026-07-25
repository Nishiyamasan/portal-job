'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { getMyShops } from '@/lib/api';
import { Shop } from '@/lib/content';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/lib/auth'; // ← パスは実際の場所に合わせてください

export const runtime = 'edge';

export default function OwnerDashboardPage() {
  const t = useTranslations('OwnerDashboard');
  const { isLoading: authLoading, session } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;        // ← 認証確定前は何もしない
    if (!session) {
      setIsLoading(false);
      return;
    }

    async function loadShops() {
      try {
        const data = await getMyShops();
        setShops(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load shops:', err);
        setError('Failed to load shops. Please try again later.');
        setShops([]);
      } finally {
        setIsLoading(false);
      }
    }
    loadShops();
  }, [authLoading, session]);

  if (isLoading) {
    return <div className="max-w-6xl mx-auto p-8 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600 border border-red-200">
          {error}
        </div>
      )}
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold text-gray-900">{t('title')}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/profile"
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {t('profileSettings')}
          </Link>
          <Link
            href="/owner/register"
            className="inline-flex items-center rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-gray-800 transition-colors"
          >
            {t('registerShop')}
          </Link>
        </div>
      </div>

      {shops.length === 0 && !error ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <p className="text-gray-500">{t('noShops')}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/owner/onboarding"
              className="inline-block rounded-lg border border-gray-300 px-6 py-3 font-bold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('requestListing')}
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {shops.map((shop) => (
            <div key={shop.id} className="bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col">
              <div className="p-8 flex-1">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{shop.name}</h2>
                <p className="text-gray-500 text-sm mb-6">{shop.address}</p>
                <div className="flex flex-wrap gap-2 mb-8">
                   <span className={`px-3 py-1 rounded-full text-xs font-bold ${shop.is_approved ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {shop.is_approved ? t('approved') : t('pending')}
                   </span>
                </div>
              </div>
              <div className="bg-gray-50 border-t p-4 grid grid-cols-3 gap-2">
                <Link
                  href={`/owner/shops/${shop.id}/edit`}
                  className="text-center py-2 px-3 bg-white border border-gray-200 rounded text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  {t('editShop')}
                </Link>
                {shop.is_approved ? (
                  <Link
                    href={`/owner/shops/${shop.id}/jobs`}
                    className="text-center py-2 px-3 bg-white border border-gray-200 rounded text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    {t('manageJobs')}
                  </Link>
                ) : (
                  <span
                    className="text-center py-2 px-3 bg-gray-100 border border-gray-200 rounded text-sm font-semibold text-gray-400 cursor-not-allowed"
                    title={t('manageJobsLocked')}
                  >
                    {t('manageJobs')}
                  </span>
                )}
                <Link
                   href={`/owner/shops/${shop.id}/staff`}
                   className="text-center py-2 px-3 bg-white border border-gray-200 rounded text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  {t('members')}
                </Link>

              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
