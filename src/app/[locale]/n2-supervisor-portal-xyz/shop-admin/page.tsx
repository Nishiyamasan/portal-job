'use client';

import {useEffect, useMemo, useState} from 'react';
import {useAuth} from '@/lib/auth';
import {useRouter} from 'next/navigation';
import {Link} from '@/i18n/routing';
import {approveShopBySupervisor, getSupervisorShops, updateShop} from '@/lib/api';
import {AdminDetailModal} from '@/components/supervisor/AdminDetailModal';
import {AdminListCard} from '@/components/supervisor/AdminListCard';
import {ShopDetail} from '@/components/supervisor/DetailSections';

export const runtime = 'edge';

type Shop = {
  id: string;
  name: string;
  slug?: string;
  category?: string;
  is_approved: boolean;
  owner_id?: string;
  owner_email?: string;
  address?: string;
  description?: string;
};

export default function ShopAdminPage() {
  const {user, role, isLoading} = useAuth();
  const router = useRouter();
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [slugDraft, setSlugDraft] = useState('');
  const [editDraft, setEditDraft] = useState({
    name: '',
    slug: '',
    category: '',
    owner_id: '',
  });
  const [slugError, setSlugError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showAll, setShowAll] = useState(true);
  const [loadingData, setLoadingData] = useState(true);

  const slugPattern = /^[a-z0-9-]+$/;

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
        const data = await getSupervisorShops();
        setShops(Array.isArray(data) ? data as Shop[] : []);
      } catch (e) {
        console.error('Failed to load supervisor shops:', e);
        setShops([]);
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, [isLoading, role, user]);

  const filtered = useMemo(
    () => showAll ? shops : shops.filter((shop) => !shop.is_approved),
    [shops, showAll]
  );

  useEffect(() => {
    setSlugDraft(selectedShop?.slug || '');
    setEditDraft({
      name: selectedShop?.name || '',
      slug: selectedShop?.slug || '',
      category: selectedShop?.category || '',
      owner_id: selectedShop?.owner_id || '',
    });
    setSlugError(null);
    setEditError(null);
  }, [selectedShop]);

  const refresh = async () => {
    const data = await getSupervisorShops() as Shop[];
    setShops(data);
    return data;
  };

  const approve = async (shop: Shop) => {
    const normalizedSlug = slugDraft.trim().toLowerCase();
    if (!normalizedSlug) {
      setSlugError('承認前にスラッグを入力してください。');
      return;
    }
    if (!slugPattern.test(normalizedSlug)) {
      setSlugError('スラッグは半角小文字・数字・ハイフンのみ使用できます。');
      return;
    }

    setIsSaving(true);
    try {
      await updateShop(shop.id, {slug: normalizedSlug});
      await approveShopBySupervisor(shop.id);
      const data = await refresh();
      setSelectedShop(data.find((item) => item.id === shop.id) || null);
    } finally {
      setIsSaving(false);
    }
  };

  const revokeApproval = async (shop: Shop) => {
    setIsSaving(true);
    try {
      await updateShop(shop.id, {is_approved: false});
      const data = await refresh();
      setSelectedShop(data.find((item) => item.id === shop.id) || null);
    } finally {
      setIsSaving(false);
    }
  };

  const saveShopInfo = async (shop: Shop) => {
    const normalizedSlug = editDraft.slug.trim().toLowerCase();
    const normalizedOwnerId = editDraft.owner_id.trim();

    if (!editDraft.name.trim()) {
      setEditError('店名を入力してください。');
      return;
    }
    if (normalizedSlug && !slugPattern.test(normalizedSlug)) {
      setEditError('スラッグは半角小文字・数字・ハイフンのみ使用できます。');
      return;
    }
    if (normalizedOwnerId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedOwnerId)) {
      setEditError('オーナーUUIDの形式を確認してください。');
      return;
    }

    setIsSaving(true);
    setEditError(null);
    try {
      await updateShop(shop.id, {
        name: editDraft.name.trim(),
        slug: normalizedSlug,
        category: editDraft.category.trim(),
        owner_id: normalizedOwnerId || undefined,
      });
      const data = await refresh();
      const updated = data.find((item) => item.id === shop.id) || null;
      setSelectedShop(updated);
    } finally {
      setIsSaving(false);
    }
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
        <h1 className="mt-4 text-4xl font-bold text-gray-900">店舗アドミン</h1>
      </div>

      <AdminListCard
        title="全店舗リスト"
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
                <th className="pb-4 font-semibold text-gray-600">店舗名</th>
                <th className="pb-4 font-semibold text-gray-600">カテゴリ</th>
                <th className="pb-4 font-semibold text-gray-600">ステータス</th>
                <th className="pb-4 font-semibold text-gray-600">スラッグ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((shop) => (
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

      <AdminDetailModal
        isOpen={Boolean(selectedShop)}
        title="店舗詳細"
        onClose={() => setSelectedShop(null)}
        footer={selectedShop ? (
          selectedShop.is_approved ? (
            <button disabled={isSaving} onClick={() => revokeApproval(selectedShop)} className="rounded-lg bg-orange-500 px-5 py-2.5 font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-300">
              承認取り消し
            </button>
          ) : (
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-bold uppercase text-gray-500">スラッグ</label>
                <input
                  value={slugDraft}
                  onChange={(e) => {
                    setSlugDraft(e.target.value);
                    if (slugError) setSlugError(null);
                  }}
                  placeholder="example-shop"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
                <p className="mt-1 text-xs text-gray-500">承認前に必須です。半角小文字・数字・ハイフンのみ使用できます。</p>
                {slugError ? <p className="mt-1 text-xs text-red-600">{slugError}</p> : null}
              </div>
              <button disabled={isSaving} onClick={() => approve(selectedShop)} className="rounded-lg bg-green-600 px-5 py-2.5 font-bold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300">
                承認
              </button>
            </div>
          )
        ) : null}
      >
        {selectedShop ? (
          <div className="space-y-8">
            <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h2 className="text-sm font-bold text-gray-900">店舗情報を修正</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase text-gray-500">店名</span>
                  <input
                    value={editDraft.name}
                    onChange={(e) => setEditDraft((current) => ({...current, name: e.target.value}))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase text-gray-500">スラッグ</span>
                  <input
                    value={editDraft.slug}
                    onChange={(e) => setEditDraft((current) => ({...current, slug: e.target.value}))}
                    placeholder="example-shop"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase text-gray-500">カテゴリ</span>
                  <input
                    value={editDraft.category}
                    onChange={(e) => setEditDraft((current) => ({...current, category: e.target.value}))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase text-gray-500">オーナーUUID</span>
                  <input
                    value={editDraft.owner_id}
                    onChange={(e) => setEditDraft((current) => ({...current, owner_id: e.target.value}))}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                </label>
              </div>
              <p className="mt-3 text-xs text-gray-500">
                スラッグは半角小文字・数字・ハイフンのみ。オーナーUUIDは空欄の場合、現在の値を維持します。
              </p>
              {editError ? <p className="mt-2 text-xs font-semibold text-red-600">{editError}</p> : null}
              <div className="mt-4 flex justify-end">
                <button
                  disabled={isSaving}
                  onClick={() => saveShopInfo(selectedShop)}
                  className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  店舗情報を保存
                </button>
              </div>
            </section>
            <ShopDetail shop={selectedShop} />
          </div>
        ) : null}
      </AdminDetailModal>
    </div>
  );
}
