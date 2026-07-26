'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Shop } from '@/lib/api';
import { JobApplyModal } from './JobApplyModal';
import { useJobApplication } from '@/hooks/useJobApplication';
import { Notification } from './Notification';

interface JobApplyButtonProps {
  shop: Shop;
}

export function JobApplyButton({ shop }: JobApplyButtonProps) {
  const t = useTranslations('Shop');
  const [showModal, setShowModal] = useState(false);
  const {
    notification,
    isAgeConfirmed,
    handleApply,
    clearNotification
  } = useJobApplication(shop);

  const handleButtonClick = () => {
    if (isAgeConfirmed) {
      handleApply();
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={clearNotification}
        />
      )}

      <button
        onClick={handleButtonClick}
        className="bg-brand-600 text-white px-12 py-4 rounded-full font-bold text-lg hover:bg-brand-700 transition-colors shadow-lg shadow-brand-100"
      >
        {t('applyNow')}
      </button>

      {showModal && (
        <JobApplyModal
          shop={shop}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
