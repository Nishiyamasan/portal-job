'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import {
  deleteAccount,
  getMe,
  getMyFavorites,
  getMyMemberships,
  getMyOwnerApplications,
  getMyShops,
  leaveShopMembership,
  updateMe,
  type FavoriteShop,
  type MediaAsset,
  type OwnerApplication,
  type Profile,
} from '@/lib/api';
import { type Shop } from '@/lib/content';
import { useAuth } from '@/lib/auth';
import { ImageUpload } from '@/components/ImageUpload';
import { Modal } from '@/components/ui/Modal';
import { Notification, NotificationType } from '@/components/Notification';
import { getPrimaryMediaAsset } from '@/lib/media-assets';

export const runtime = 'edge';

type OwnerState = 'none' | 'pending' | 'approved';
type Membership = {
  id: string;
  shop_id: string;
  role: string;
  status: string;
  shop?: { name?: string; slug?: string };
};

export default function ProfilePage() {
  const t = useTranslations('Profile');
  const { signOut } = useAuth();
  const [profile, setProfile] = useState<Profile & { media_assets?: MediaAsset[] } | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [ownerState, setOwnerState] = useState<OwnerState>('none');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: NotificationType; message: string } | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteShop[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [leaveShopModal, setLeaveShopModal] = useState<{ shopId: string } | null>(null);

  const ownerStatusLabel = useMemo(() => {
    if (ownerState === 'approved') return t('ownerStateApproved');
    if (ownerState === 'pending') return t('ownerStatePending');
    return t('ownerStateNone');
  }, [ownerState, t]);

  const ownerStatusClassName = useMemo(() => {
    if (ownerState === 'approved') return 'bg-green-100 text-green-700';
    if (ownerState === 'pending') return 'bg-orange-100 text-orange-700';
    return 'bg-gray-100 text-gray-600';
  }, [ownerState]);

  const getMembershipStatusLabel = (status: string) => {
    if (status === 'approved') return '承認済み';
    if (status === 'pending') return '申請中';
    if (status === 'rejected') return '却下';
    return status;
  };

  useEffect(() => {
    async function loadMyPageData() {
      try {
        const [me, applications, shops, favoritesData, membershipsData] = await Promise.all([
          getMe(),
          getMyOwnerApplications().catch(() => [] as OwnerApplication[]),
          getMyShops().catch(() => [] as Shop[]),
          getMyFavorites().catch(() => [] as FavoriteShop[]),
          getMyMemberships().catch(() => [] as Membership[]),
        ]);

        const latestApplication = [...applications].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];

        let nextOwnerState: OwnerState = 'none';
        if (shops.length > 0 || me.role === 'admin' || me.role === 'supervisor' || latestApplication?.status === 'approved') {
          nextOwnerState = 'approved';
        } else if (latestApplication?.status === 'pending') {
          nextOwnerState = 'pending';
        }

        setProfile(me);
        setDisplayName(me.display_name || '');
        setOwnerState(nextOwnerState);
        setFavorites(favoritesData);
        setMemberships(membershipsData);
      } catch (error) {
        console.error(error);
        setNotification({ type: 'error', message: t('loadError') });
      }
    }
    loadMyPageData();
  }, [t]);

  const loadProfileData = async () => {
    const data = await getMe();
    setProfile(data);
    setDisplayName(data.display_name || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setNotification(null);
    try {
      await updateMe({ display_name: displayName });
      setNotification({ type: 'success', message: t('updateSuccess') });
    } catch (error) {
      console.error(error);
      setNotification({ type: 'error', message: t('updateError') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeDeleteAccount = async () => {
    setIsDeleteModalOpen(false);
    setIsSubmitting(true);
    try {
      await deleteAccount();
      await signOut();
    } catch (error) {
      console.error(error);
      setNotification({ type: 'error', message: t('updateError') });
      setIsSubmitting(false);
    }
  };

  const executeLeaveShop = async () => {
    if (!leaveShopModal) return;
    const { shopId } = leaveShopModal;
    setLeaveShopModal(null);
    setIsSubmitting(true);
    try {
      await leaveShopMembership(shopId);
      const membershipsData = await getMyMemberships();
      setMemberships(membershipsData);
      setNotification({ type: 'success', message: t('leaveShopSuccess') });
    } catch (error) {
      console.error(error);
      setNotification({ type: 'error', message: t('updateError') });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!profile) {
    return <div className="max-w-2xl mx-auto p-8 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}
      <Modal
        isOpen={isDeleteModalOpen}
        title={t('deleteAccount')}
        message={t('deleteConfirm')}
        confirmLabel={t('deleteAccount')}
        cancelLabel={t('cancel')}
        onConfirm={executeDeleteAccount}
        onCancel={() => setIsDeleteModalOpen(false)}
        type="danger"
      />
      <Modal
        isOpen={!!leaveShopModal}
        title={t('leaveShopTitle')}
        message={t('leaveShopConfirm')}
        confirmLabel={t('leave')}
        cancelLabel={t('cancel')}
        onConfirm={executeLeaveShop}
        onCancel={() => setLeaveShopModal(null)}
        type="danger"
      />

      <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-bold text-gray-900">{t('title')}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-gray-600">{t('ownerStatus')}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${ownerStatusClassName}`}>
              {ownerStatusLabel}
            </span>
          </div>
        </div>
        <Link
          href="/owner"
          className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
        >
          {t('shopManagementTop')}
        </Link>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm md:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="mb-8 border-b pb-8">
            <label className="mb-4 block text-sm font-semibold text-gray-700">{t('profileImage')}</label>
            <div className="flex items-center space-x-6">
              <div className="h-24 w-24 overflow-hidden rounded-full border bg-gray-100">
                {getPrimaryMediaAsset(profile.media_assets, 'profile_image') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getPrimaryMediaAsset(profile.media_assets, 'profile_image')?.url}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-400">{t('noImage')}</div>
                )}
              </div>
              <div className="flex-1">
                <p className="mb-2 text-xs text-gray-500">
                  プロフィール画像は、チャット相手にあなたを識別しやすくする目的で表示されます。
                </p>
                <ImageUpload assetType="profile_image" onSuccess={() => loadProfileData()} />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">{t('email')}</label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-sm text-gray-500"
            />
          </div>

          <div>
            <label htmlFor="displayName" className="mb-2 block text-sm font-semibold text-gray-700">
              {t('displayName')}
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="block w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-gray-900 py-3 font-bold text-white transition-colors hover:bg-gray-800 disabled:bg-gray-400"
          >
            {isSubmitting ? '...' : t('save')}
          </button>

          <div className="border-t pt-6">
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(true)}
              disabled={isSubmitting}
              className="text-sm font-medium text-red-600 hover:underline"
            >
              {t('deleteAccount')}
            </button>
          </div>
        </form>
      </div>

      <div className="mt-8 rounded-xl border bg-white p-6 shadow-sm md:p-8">
        <div className="mt-0">
          <h2 className="text-xl font-bold text-gray-900 mb-6">{t('favoriteShops')}</h2>
          {favorites.length === 0 ? (
            <p className="text-gray-500 text-sm italic">{t('noFavoriteShops')}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {favorites.map((fav) => (
                <Link
                  key={fav.id}
                  href={fav.shop?.slug ? `/shop/${fav.shop.slug}` : '/shop'}
                  className="p-4 border rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-4"
                >
                  <div className="h-12 w-12 bg-gray-100 rounded flex-shrink-0 flex items-center justify-center text-xs font-bold text-gray-400">
                    {t('logoPlaceholder')}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{fav.shop?.name}</h3>
                    <p className="text-xs text-gray-500 line-clamp-1">{fav.shop?.address}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="mt-12 pt-10 border-t">
          <h2 className="text-xl font-bold text-gray-900 mb-6">{t('affiliatedShops')}</h2>
          {memberships.length === 0 ? (
            <p className="text-gray-500 text-sm italic">{t('noAffiliatedShops')}</p>
          ) : (
            <div className="space-y-4">
              {memberships.map((membership) => (
                <div key={membership.id} className="p-4 border rounded-lg flex justify-between items-center bg-gray-50">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-gray-200 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-500">
                      SHOP
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{membership.shop?.name || t('unknownShop')}</h3>
                      <div className="flex gap-2">
                        <span className="text-[10px] uppercase font-bold text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">
                          {membership.role}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${membership.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {getMembershipStatusLabel(membership.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setLeaveShopModal({ shopId: membership.shop_id })}
                    disabled={isSubmitting}
                    className="text-xs font-bold text-red-600 hover:underline disabled:text-gray-400 disabled:no-underline"
                  >
                    {t('leave')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {ownerState !== 'approved' && (
        <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
          {t('shopManagementDisabled')}
        </div>
      )}
    </div>
  );
}
