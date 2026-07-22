'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { submitOwnerApplication, getMyOwnerApplications } from '@/lib/api';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/lib/auth';
import { Notification, NotificationType } from '@/components/Notification';

export const runtime = 'edge';

interface OwnerApplication {
  id: string;
  status: string;
  reason: string;
  created_at: string;
  review_comment?: string;
}

export default function OwnerOnboardingPage() {
  const t = useTranslations('Onboarding');
  const { user, isLoading: isAuthLoading } = useAuth();
  const [shopName, setShopName] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [relationship, setRelationship] = useState('');
  const [applications, setApplications] = useState<OwnerApplication[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: NotificationType; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!user) {
      setApplications([]);
      setIsLoading(false);
      return;
    }

    async function loadApplications() {
      try {
        const data = await getMyOwnerApplications() as OwnerApplication[];
        setApplications(data);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    loadApplications();
  }, [isAuthLoading, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setNotification({ type: 'error', message: t('signInRequired') });
      return;
    }
    setIsSubmitting(true);
    setNotification(null);
    try {
      const reason = [
        `店名: ${shopName.trim()}`,
        `住所: ${shopAddress.trim()}`,
        '店舗との関係:',
        relationship.trim() || '未記入',
      ].join('\n');

      await submitOwnerApplication({ reason });
      setNotification({ type: 'success', message: t('submitSuccess') });
      setShopName('');
      setShopAddress('');
      setRelationship('');
      const data = await getMyOwnerApplications() as OwnerApplication[];
      setApplications(data);
    } catch (error) {
      console.error(error);
      setNotification({ type: 'error', message: t('submitError') });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthLoading || isLoading) {
    return <div className="max-w-2xl mx-auto p-8 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
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
          ← {t('backToDashboard')}
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">{t('ownerTitle')}</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-8 mb-8">
        {!user && (
          <div className="mb-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            {t('signInRequired')}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            {t('reason')}
          </p>
          <div>
            <label htmlFor="shopName" className="block text-sm font-semibold text-gray-700 mb-2">
              {t('shopName')}
            </label>
            <input
              id="shopName"
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              required
              disabled={!user}
              placeholder={t('shopNamePlaceholder')}
              className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
            />
          </div>

          <div>
            <label htmlFor="shopAddress" className="block text-sm font-semibold text-gray-700 mb-2">
              {t('shopAddress')}
            </label>
            <input
              id="shopAddress"
              type="text"
              value={shopAddress}
              onChange={(e) => setShopAddress(e.target.value)}
              required
              disabled={!user}
              placeholder={t('shopAddressPlaceholder')}
              className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
            />
          </div>

          <div>
            <label htmlFor="relationship" className="block text-sm font-semibold text-gray-700 mb-2">
              {t('relationship')}
            </label>
            <textarea
              id="relationship"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              disabled={!user}
              rows={4}
              placeholder={t('relationshipPlaceholder')}
              className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
            />
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting || !user}
              className="w-full bg-gray-900 text-white font-bold py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400"
            >
              {isSubmitting ? '...' : t('submit')}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-8">
        <h2 className="text-xl font-bold mb-6 text-gray-800">{t('status')}</h2>
        {applications.length === 0 ? (
          <p className="text-gray-500 text-sm">過去の申請はありません。</p>
        ) : (
          <div className="space-y-4">
            {applications.map((app) => (
              <div key={app.id} className="border-b last:border-0 pb-4 last:pb-0">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs text-gray-400">
                    {new Date(app.created_at).toLocaleDateString()}
                  </span>
                  <span className={`text-xs font-bold px-2 py-1 rounded uppercase ${
                    app.status === 'approved' ? 'bg-green-100 text-green-700' :
                    app.status === 'rejected' ? 'bg-red-100 text-red-700' :
                    'bg-orange-100 text-orange-700'
                  }`}>
                    {t(app.status)}
                  </span>
                </div>
                <p className="text-sm text-gray-600 line-clamp-2">{app.reason}</p>
                {app.review_comment && (
                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-500">
                    <strong>審査コメント:</strong> {app.review_comment}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
