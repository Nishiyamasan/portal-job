'use client';

import {useEffect, useMemo, useState} from 'react';
import {useAuth} from '@/lib/auth';
import {useRouter} from 'next/navigation';
import {Link} from '@/i18n/routing';
import {getInquiries, Inquiry, updateInquiry} from '@/lib/api';
import {AdminDetailModal} from '@/components/supervisor/AdminDetailModal';
import {AdminListCard} from '@/components/supervisor/AdminListCard';
import {InquiryDetail, inquiryTypeLabel} from '@/components/supervisor/DetailSections';

export const runtime = 'edge';

export default function InquiryAdminPage() {
  const {user, role, isLoading} = useAuth();
  const router = useRouter();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
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
        const data = await getInquiries();
        setInquiries(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('Failed to load inquiries:', e);
        setInquiries([]);
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, [isLoading, role, user]);

  const filtered = useMemo(
    () => showAll ? inquiries : inquiries.filter((inquiry) => !inquiry.is_resolved),
    [inquiries, showAll]
  );

  const toggleResolved = async (inquiry: Inquiry, resolved: boolean) => {
    const updated = await updateInquiry(inquiry.id, {is_resolved: resolved});
    setInquiries((current) => current.map((item) => item.id === inquiry.id ? updated : item));
    setSelectedInquiry(updated);
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
        <h1 className="mt-4 text-4xl font-bold text-gray-900">お問い合わせアドミン</h1>
      </div>

      <AdminListCard
        title="お問い合わせ一覧"
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
                <th className="pb-4 font-semibold text-gray-600">日時</th>
                <th className="pb-4 font-semibold text-gray-600">名前</th>
                <th className="pb-4 font-semibold text-gray-600">種別</th>
                <th className="pb-4 font-semibold text-gray-600">対応状況</th>
                <th className="pb-4 font-semibold text-gray-600">内容</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inquiry) => (
                <tr
                  key={inquiry.id}
                  className="cursor-pointer border-b last:border-0 hover:bg-gray-50"
                  onClick={() => setSelectedInquiry(inquiry)}
                >
                  <td className="py-4 text-sm text-gray-500">{new Date(inquiry.created_at).toLocaleDateString()}</td>
                  <td className="py-4 font-medium text-gray-900">{inquiry.name}</td>
                  <td className="py-4 text-sm text-gray-600">{inquiryTypeLabel(inquiry.inquiry_type)}</td>
                  <td className="py-4 text-sm text-gray-600">{inquiry.is_resolved ? '対応済み' : '未対応'}</td>
                  <td className="max-w-xs py-4 text-sm text-gray-500">
                    <div className="truncate">{inquiry.content}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminListCard>

      <AdminDetailModal
        isOpen={Boolean(selectedInquiry)}
        title="お問い合わせ詳細"
        onClose={() => setSelectedInquiry(null)}
        footer={selectedInquiry ? (
          selectedInquiry.is_resolved ? (
            <button onClick={() => toggleResolved(selectedInquiry, false)} className="rounded-lg bg-orange-500 px-5 py-2.5 font-bold text-white hover:bg-orange-600">
              対応取り消し
            </button>
          ) : (
            <button onClick={() => toggleResolved(selectedInquiry, true)} className="rounded-lg bg-green-600 px-5 py-2.5 font-bold text-white hover:bg-green-700">
              対応済みにする
            </button>
          )
        ) : null}
      >
        {selectedInquiry ? <InquiryDetail inquiry={selectedInquiry} /> : null}
      </AdminDetailModal>
    </div>
  );
}

