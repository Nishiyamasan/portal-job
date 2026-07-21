'use client';

import {useEffect, useMemo, useState} from 'react';
import {useAuth} from '@/lib/auth';
import {useRouter} from 'next/navigation';
import {Link} from '@/i18n/routing';
import {getAllOwnerApplications, OwnerApplication, processOwnerApplication} from '@/lib/api';
import {AdminDetailModal} from '@/components/supervisor/AdminDetailModal';
import {AdminListCard} from '@/components/supervisor/AdminListCard';
import {OwnerApplicationDetail, ownerApplicationStatusLabel} from '@/components/supervisor/DetailSections';

export const runtime = 'edge';

export default function OwnerAdminPage() {
  const {user, role, isLoading} = useAuth();
  const router = useRouter();
  const [applications, setApplications] = useState<OwnerApplication[]>([]);
  const [selectedApplication, setSelectedApplication] = useState<OwnerApplication | null>(null);
  const [showAll, setShowAll] = useState(true);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(`/signin?from=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    const load = async () => {
      if (!user || isLoading) return;
      if (role !== 'supervisor' && role !== 'admin') {
        setLoadingData(false);
        return;
      }
      try {
        const data = await getAllOwnerApplications();
        setApplications(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('Failed to load owner applications:', e);
        setApplications([]);
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, [isLoading, role, user]);

  const filtered = useMemo(
    () => showAll ? applications : applications.filter((app) => app.status === 'pending'),
    [applications, showAll]
  );

  const refresh = async () => {
    const data = await getAllOwnerApplications();
    setApplications(data);
    return data;
  };

  const updateStatus = async (status: 'approved' | 'rejected' | 'pending') => {
    if (!selectedApplication) return;
    await processOwnerApplication(selectedApplication.id, {
      status,
      review_comment: status === 'pending' ? '承認を取り消し' : `オーナーアドミン画面で${status === 'approved' ? '承認' : '却下'}`,
    });
    const data = await refresh();
    const latest = data.find((app) => app.id === selectedApplication.id);
    setSelectedApplication(latest ?? null);
  };

  if (isLoading || loadingData) {
    return <div className="flex min-h-screen items-center justify-center text-gray-500">読み込み中...</div>;
  }

  if (role !== 'supervisor' && role !== 'admin') {
    return <div className="mx-auto max-w-4xl px-4 py-16 text-center text-gray-700">アクセス権限がありません。</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="mb-8">
        <Link href="/n2-supervisor-portal-xyz" className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          ← スーパーバイザーポータルに戻る
        </Link>
        <h1 className="mt-4 text-4xl font-bold text-gray-900">オーナーアドミン</h1>
      </div>

      <AdminListCard
        title="オーナー申請一覧"
        controls={(
          <label className="flex items-center gap-2 text-sm font-bold text-gray-600">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            全件表示
          </label>
        )}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b">
                <th className="pb-4 font-semibold text-gray-600">表示名</th>
                <th className="pb-4 font-semibold text-gray-600">対象店舗</th>
                <th className="pb-4 font-semibold text-gray-600">ステータス</th>
                <th className="pb-4 font-semibold text-gray-600">申請日</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((app) => (
                <tr
                  key={app.id}
                  className="cursor-pointer border-b last:border-0 hover:bg-gray-50"
                  onClick={() => setSelectedApplication(app)}
                >
                  <td className="py-4 font-medium text-gray-900">{app.profile?.display_name || '未設定'}</td>
                  <td className="py-4 text-sm text-gray-600">{app.shop?.name || '未指定'}</td>
                  <td className="py-4 text-sm text-gray-600">{ownerApplicationStatusLabel(app.status)}</td>
                  <td className="py-4 text-sm text-gray-500">{new Date(app.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminListCard>

      <AdminDetailModal
        isOpen={Boolean(selectedApplication)}
        title="オーナー申請詳細"
        onClose={() => setSelectedApplication(null)}
        footer={selectedApplication ? (
          <>
            {selectedApplication.status !== 'approved' ? (
              <button onClick={() => updateStatus('approved')} className="rounded-lg bg-green-600 px-5 py-2.5 font-bold text-white hover:bg-green-700">
                承認
              </button>
            ) : null}
            {selectedApplication.status !== 'rejected' ? (
              <button onClick={() => updateStatus('rejected')} className="rounded-lg bg-red-600 px-5 py-2.5 font-bold text-white hover:bg-red-700">
                却下
              </button>
            ) : null}
            {selectedApplication.status === 'approved' ? (
              <button onClick={() => updateStatus('pending')} className="rounded-lg bg-orange-500 px-5 py-2.5 font-bold text-white hover:bg-orange-600">
                承認取り消し
              </button>
            ) : null}
          </>
        ) : null}
      >
        {selectedApplication ? <OwnerApplicationDetail application={selectedApplication} /> : null}
      </AdminDetailModal>
    </div>
  );
}
