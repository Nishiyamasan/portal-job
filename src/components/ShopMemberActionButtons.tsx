'use client';

import { useState, useEffect } from 'react';
import { callGoApi, getShopMembers } from '@/lib/api';
import { UserPlus, UserMinus, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Notification, NotificationType } from './Notification';
import { Modal } from './ui/Modal';

interface Props {
  shopId: string;
}

export function ShopMemberActionButtons({ shopId }: Props) {
  const { user } = useAuth();
  const [membership, setMembership] = useState<{ status: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{ type: NotificationType; message: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    async function checkMembership() {
      if (!user) {
        setIsLoading(false);
        return;
      }
      try {
        const members = await getShopMembers(shopId);
        const myMembership = members.find(m => m.profile_id === user.id);
        if (myMembership) {
          setMembership({ status: (myMembership as { status?: string }).status || 'approved' });
        } else {
          setMembership(null);
        }
      } catch (e) {
        console.error('Failed to fetch membership', e);
      } finally {
        setIsLoading(false);
      }
    }
    checkMembership();
  }, [shopId, user]);

  const handleApply = () => {
    setConfirmModal({
      title: 'スタッフ申請',
      message: 'スタッフ申請を送信しますか？承認後、店舗がスタッフ一覧を公開している場合は、プロフィール設定の表示名とプロフィール画像が店舗ページに表示されます。',
      onConfirm: async () => {
        setConfirmModal(null);
        setIsProcessing(true);
        try {
          await callGoApi(`/api/v1/shops/${shopId}/apply-membership`, { method: 'POST' });
          setMembership({ status: 'pending' });
          setNotification({ type: 'success', message: '申請を送信しました。管理者の承認をお待ちください。' });
        } catch (e) {
          console.error(e);
          setNotification({ type: 'error', message: '申請に失敗しました。' });
        } finally {
          setIsProcessing(false);
        }
      }
    });
  };

  const handleLeave = () => {
    setConfirmModal({
      title: 'スタッフ解除',
      message: 'スタッフ登録を解除しますか？',
      onConfirm: async () => {
        setConfirmModal(null);
        setIsProcessing(true);
        try {
          await callGoApi(`/api/v1/shops/${shopId}/membership`, { method: 'DELETE' });
          setMembership(null);
          setNotification({ type: 'success', message: 'スタッフ登録を解除しました。' });
        } catch (e) {
          console.error(e);
          setNotification({ type: 'error', message: '解除に失敗しました。' });
        } finally {
          setIsProcessing(false);
        }
      }
    });
  };

  if (isLoading || !user) return null;

  return (
    <>
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}
      {confirmModal && (
        <Modal
          isOpen={!!confirmModal}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel="はい"
          cancelLabel="いいえ"
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
          type={confirmModal.title.includes('解除') ? 'danger' : 'info'}
        />
      )}
      {membership ? (
        <div className="flex items-center gap-4">
        {membership.status === 'pending' ? (
          <span className="h-10 flex items-center justify-center bg-yellow-100 text-yellow-700 px-4 rounded-lg font-bold text-sm whitespace-nowrap">
            スタッフ申請中
          </span>
        ) : (
          <span className="h-10 flex items-center justify-center bg-green-100 text-green-700 px-4 rounded-lg font-bold text-sm whitespace-nowrap">
            スタッフ登録済み
          </span>
        )}
        <button
          onClick={handleLeave}
          disabled={isProcessing}
          className="h-10 flex items-center justify-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 px-4 rounded-lg font-bold text-sm transition-colors border border-red-200 whitespace-nowrap"
        >
          {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <UserMinus size={16} />}
          スタッフ解除
        </button>
      </div>
      ) : (
      <div className="space-y-2">
      <button
        onClick={handleApply}
        disabled={isProcessing}
        className="h-10 flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 px-6 rounded-lg font-bold text-sm transition-colors shadow-sm whitespace-nowrap"
      >
        {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <UserPlus size={16} />}
        スタッフ申請
      </button>
      </div>
      )}
    </>
  );
}
