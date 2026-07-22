'use client';

import {useEffect, useMemo, useState} from 'react';
import {useAuth} from '@/lib/auth';
import {useRouter} from 'next/navigation';
import {Link} from '@/i18n/routing';
import {
  approveShopBySupervisor,
  getAllOwnerApplications,
  getInquiries,
  getSupervisorShops,
  getSupervisorStats,
  Inquiry,
  OwnerApplication,
  processOwnerApplication,
} from '@/lib/api';
import {AdminDetailModal} from '@/components/supervisor/AdminDetailModal';
import {AdminListCard} from '@/components/supervisor/AdminListCard';
import {
  InquiryDetail,
  inquiryTypeLabel,
  OwnerApplicationDetail,
  ownerApplicationStatusLabel,
  ShopDetail,
} from '@/components/supervisor/DetailSections';

export const runtime = 'edge';

interface Stats {
  total_shops: number;
  approved_shops: number;
  pending_shops: number;
  total_users: number;
  total_applications: number;
  pending_applications: number;
}

interface Shop {
  id: string;
  name: string;
  slug?: string;
  category?: string;
  is_approved: boolean;
  owner_id?: string;
  owner_email?: string;
  address?: string;
  description?: string;
}

export default function SupervisorPortalPage() {
  const {user, role, isLoading} = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [applications, setApplications] = useState<OwnerApplication[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<OwnerApplication | null>(null);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [showAllApplications, setShowAllApplications] = useState(false);
  const [showAllInquiries, setShowAllInquiries] = useState(false);
  const [showAllShops, setShowAllShops] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(`/signin?from=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user || isLoading) return;

      if (role !== 'supervisor' && role !== 'admin') {
        if (role) {
          setError('アクセス権限がありません。');
          setIsDataLoading(false);
        }
        return;
      }

      try {
        const [statsData, shopsData, appsData, inquiriesData] = await Promise.all([
          getSupervisorStats() as Promise<Stats>,
          getSupervisorShops() as Promise<Shop[]>,
          getAllOwnerApplications(),
          getInquiries(),
        ]);
        setStats(statsData);
        setShops(shopsData);
        setApplications(appsData);
        setInquiries(inquiriesData);
        setError(null);
      } catch (e) {
        console.error('Failed to fetch supervisor data', e);
        setError('エラーが発生しました。');
      } finally {
        setIsDataLoading(false);
      }
    };

    fetchData();
  }, [isLoading, role, user]);

  const filteredApplications = useMemo(
    () => showAllApplications ? applications : applications.filter((app) => app.status === 'pending'),
    [applications, showAllApplications]
  );
  const filteredShops = useMemo(
    () => showAllShops ? shops : shops.filter((shop) => !shop.is_approved),
    [shops, showAllShops]
  );
  const filteredInquiries = useMemo(
    () => showAllInquiries ? inquiries : inquiries.filter((inquiry) => !inquiry.is_resolved),
    [inquiries, showAllInquiries]
  );

  const refreshApplications = async () => {
    const nextApps = await getAllOwnerApplications();
    setApplications(nextApps);
  };

  const handleApproveApplication = async (appId: string) => {
    try {
      await processOwnerApplication(appId, {status: 'approved', review_comment: 'スーパーバイザー画面で承認'});
      await refreshApplications();
      setSelectedApplication(null);
    } catch (e) {
      console.error('Approve application failed', e);
    }
  };

  const handleRejectApplication = async (appId: string) => {
    try {
      await processOwnerApplication(appId, {status: 'rejected', review_comment: 'スーパーバイザー画面で却下'});
      await refreshApplications();
      setSelectedApplication(null);
    } catch (e) {
      console.error('Reject application failed', e);
    }
  };

  const handleApproveShop = async (shopId: string) => {
    try {
      await approveShopBySupervisor(shopId);
      setShops((current) => current.map((shop) => shop.id === shopId ? {...shop, is_approved: true} : shop));
      if (stats) {
        setStats({
          ...stats,
          approved_shops: stats.approved_shops + 1,
          pending_shops: Math.max(0, stats.pending_shops - 1),
        });
      }
      if (selectedShop?.id === shopId) {
        setSelectedShop({...selectedShop, is_approved: true});
      }
    } catch (e) {
      console.error('Approve shop failed', e);
    }
  };

  if (isLoading || (isDataLoading && !error)) {
    return <div className="flex min-h-screen items-center justify-center text-gray-500">読み込み中...</div>;
  }

  if (error || (role !== 'supervisor' && role !== 'admin')) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-gray-700">
        {error || 'アクセス権限がありません。'}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="mb-10 text-4xl font-bold text-gray-900">スーパーバイザーポータル</h1>

      <div className="mb-12 grid grid-cols-1 gap-4 md:grid-cols-4">
        <Link href="/n2-supervisor-portal-xyz/owner-admin" className="rounded-xl border bg-white p-5 font-bold text-gray-800 shadow-sm hover:bg-gray-50">
          オーナーアドミン
        </Link>
        <Link href="/n2-supervisor-portal-xyz/shop-admin" className="rounded-xl border bg-white p-5 font-bold text-gray-800 shadow-sm hover:bg-gray-50">
          店舗アドミン
        </Link>
        <Link href="/n2-supervisor-portal-xyz/inquiry-admin" className="rounded-xl border bg-white p-5 font-bold text-gray-800 shadow-sm hover:bg-gray-50">
          お問い合わせアドミン
        </Link>
        <Link href="/n2-supervisor-portal-xyz/legal-admin" className="rounded-xl border bg-white p-5 font-bold text-gray-800 shadow-sm hover:bg-gray-50">
          規約アドミン
        </Link>
      </div>

      {stats && (
        <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-xl border bg-white p-6 shadow">
            <h3 className="text-sm font-semibold uppercase text-gray-500">店舗数</h3>
            <p className="text-3xl font-bold text-gray-900">{stats.total_shops}</p>
            <p className="mt-2 text-sm text-gray-600">承認済み {stats.approved_shops} / 未承認 {stats.pending_shops}</p>
          </div>
          <div className="rounded-xl border bg-white p-6 shadow">
            <h3 className="text-sm font-semibold uppercase text-gray-500">ユーザー数</h3>
            <p className="text-3xl font-bold text-gray-900">{stats.total_users}</p>
          </div>
          <div className="rounded-xl border bg-white p-6 shadow">
            <h3 className="text-sm font-semibold uppercase text-gray-500">オーナー申請</h3>
            <p className="text-3xl font-bold text-gray-900">{stats.total_applications}</p>
            <p className="mt-2 text-sm text-orange-500">未承認 {stats.pending_applications}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-12">
        <AdminListCard
          title="オーナー申請一覧"
          controls={(
            <label className="flex items-center gap-2 text-sm font-bold text-gray-600">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={showAllApplications} onChange={(e) => setShowAllApplications(e.target.checked)} />
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
                {filteredApplications.map((app) => (
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

        <AdminListCard
          title="全店舗リスト"
          controls={(
            <label className="flex items-center gap-2 text-sm font-bold text-gray-600">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={showAllShops} onChange={(e) => setShowAllShops(e.target.checked)} />
              全件表示
            </label>
          )}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b">
                  <th className="pb-4 font-semibold text-gray-600">店舗名</th>
                  <th className="pb-4 font-semibold text-gray-600">カテゴリ</th>
                  <th className="pb-4 font-semibold text-gray-600">ステータス</th>
                  <th className="pb-4 font-semibold text-gray-600">更新</th>
                </tr>
              </thead>
              <tbody>
                {filteredShops.map((shop) => (
                  <tr
                    key={shop.id}
                    className="cursor-pointer border-b last:border-0 hover:bg-gray-50"
                    onClick={() => setSelectedShop(shop)}
                  >
                    <td className="py-4 font-medium text-gray-900">{shop.name}</td>
                    <td className="py-4 text-sm text-gray-600">{shop.category || '-'}</td>
                    <td className="py-4 text-sm text-gray-600">{shop.is_approved ? '承認済み' : '未承認'}</td>
                    <td className="py-4 text-sm text-gray-500">{shop.slug || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminListCard>

        <AdminListCard
          title="お問い合わせ一覧"
          controls={(
            <label className="flex items-center gap-2 text-sm font-bold text-gray-600">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={showAllInquiries} onChange={(e) => setShowAllInquiries(e.target.checked)} />
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
                {filteredInquiries.map((inquiry) => (
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
      </div>

      <AdminDetailModal
        isOpen={Boolean(selectedApplication)}
        title="オーナー申請詳細"
        onClose={() => setSelectedApplication(null)}
        footer={selectedApplication?.status === 'pending' ? (
          <>
            <button
              onClick={() => handleRejectApplication(selectedApplication.id)}
              className="rounded-lg bg-red-600 px-5 py-2.5 font-bold text-white hover:bg-red-700"
            >
              却下
            </button>
            <button
              onClick={() => handleApproveApplication(selectedApplication.id)}
              className="rounded-lg bg-green-600 px-5 py-2.5 font-bold text-white hover:bg-green-700"
            >
              承認
            </button>
          </>
        ) : null}
      >
        {selectedApplication ? <OwnerApplicationDetail application={selectedApplication} /> : null}
      </AdminDetailModal>

      <AdminDetailModal
        isOpen={Boolean(selectedShop)}
        title="店舗詳細"
        onClose={() => setSelectedShop(null)}
        footer={selectedShop && !selectedShop.is_approved ? (
          <button
            onClick={() => handleApproveShop(selectedShop.id)}
            className="rounded-lg bg-green-600 px-5 py-2.5 font-bold text-white hover:bg-green-700"
          >
            承認
          </button>
        ) : null}
      >
        {selectedShop ? <ShopDetail shop={selectedShop} /> : null}
      </AdminDetailModal>

      <AdminDetailModal
        isOpen={Boolean(selectedInquiry)}
        title="お問い合わせ詳細"
        onClose={() => setSelectedInquiry(null)}
      >
        {selectedInquiry ? <InquiryDetail inquiry={selectedInquiry} /> : null}
      </AdminDetailModal>
    </div>
  );
}
