import { useState, useCallback } from 'react';
import { useRouter } from '@/i18n/routing';
import { useAuth } from '@/lib/auth';
import { getSignInHref } from '@/lib/auth-redirects';
import { hasJobAgeConfirmation, saveJobAgeConfirmation } from '@/lib/age-confirmation';
import { NotificationType } from '@/components/Notification';
import { Shop } from '@/lib/api';

export function useJobApplication(shop: Shop) {
  const router = useRouter();
  const { user } = useAuth();
  const [notification, setNotification] = useState<{ type: NotificationType; message: string } | null>(null);
  const [isAgeConfirmed, setIsAgeConfirmed] = useState(() => hasJobAgeConfirmation());

  const handleAgeConfirmationChange = useCallback((confirmed: boolean) => {
    setIsAgeConfirmed(confirmed);
    if (confirmed) {
      saveJobAgeConfirmation();
    }
  }, []);

  const clearNotification = useCallback(() => setNotification(null), []);

  const handleApply = useCallback(() => {
    if (!user) {
      router.push(getSignInHref());
      return;
    }
    if (!isAgeConfirmed) {
      setNotification({ type: 'error', message: '求人応募には18歳以上であることの確認が必要です。' });
      return;
    }

    saveJobAgeConfirmation();
    const shopWithContact = shop as Shop & { owner_id?: string; contact_profile_id?: string };
    const contactProfileId = shopWithContact.contact_profile_id || shopWithContact.owner_id;

    if (contactProfileId) {
        router.push(`/chat/${shop.id}/${contactProfileId}`);
    } else {
        setNotification({ type: 'error', message: "この店舗は現在チャット応募の受付先が設定されていません。" });
    }
  }, [user, isAgeConfirmed, shop, router]);

  return {
    notification,
    isAgeConfirmed,
    handleAgeConfirmationChange,
    handleApply,
    clearNotification
  };
}
