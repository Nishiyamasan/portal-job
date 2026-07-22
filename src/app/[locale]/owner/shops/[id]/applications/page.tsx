'use client';

import { useState, useEffect, use } from 'react';
import { useTranslations } from 'next-intl';
import { getJobApplications, updateApplicationStatus, JobApplication, getShopById } from '@/lib/api';
import { Link } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';

export const runtime = 'edge';

export default function ShopApplicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: shopId } = use(params);
  const searchParams = useSearchParams();
  const jobId = searchParams.get('job_id');
  const t = useTranslations('ShopApplications');
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [shopName, setShopName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [shop, apps] = await Promise.all([
          getShopById(shopId),
          jobId ? getJobApplications(jobId) : Promise.resolve([])
        ]);
        if (shop) {
          setShopName(shop.name);
        }
        setApplications(apps);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [shopId, jobId]);

  const handleStatusUpdate = async (appId: string, newStatus: string) => {
    try {
      await updateApplicationStatus(appId, newStatus);
      setApplications(applications.map(a => a.id === appId ? { ...a, status: newStatus } : a));
    } catch (error) {
      console.error(error);
    }
  };

  if (isLoading) {
    return <div className="max-w-6xl mx-auto p-8 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      <div className="mb-10">
        <Link href={`/owner/shops/${shopId}/jobs`} className="text-gray-500 hover:text-gray-700 block mb-2">← {t('backToJobs')}</Link>
        <h1 className="text-3xl font-bold text-gray-900">{shopName} - {t('title')}</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {applications.length === 0 ? (
          <div className="p-20 text-center text-gray-500">
            {t('noApplications')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">{t('applicant')}</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">{t('message')}</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">{t('status')}</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr key={app.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-6">
                      <div className="font-bold text-gray-900">{app.profile?.display_name || 'Anonymous'}</div>
                      <div className="text-xs text-gray-500">{app.profile?.email}</div>
                    </td>
                    <td className="px-6 py-6">
                      <p className="text-sm text-gray-600 max-w-md line-clamp-2" title={app.message}>
                        {app.message || '-'}
                      </p>
                    </td>
                    <td className="px-6 py-6">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase ${
                        app.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        app.status === 'accepted' ? 'bg-green-100 text-green-700' :
                        app.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {app.status}
                      </span>
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleStatusUpdate(app.id, 'accepted')}
                          disabled={app.status === 'accepted'}
                          className="px-3 py-1 text-xs font-bold bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          {t('accept')}
                        </button>
                        <button
                          onClick={() => handleStatusUpdate(app.id, 'rejected')}
                          disabled={app.status === 'rejected'}
                          className="px-3 py-1 text-xs font-bold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                        >
                          {t('reject')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
