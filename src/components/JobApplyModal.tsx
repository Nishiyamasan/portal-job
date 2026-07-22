'use client';

import { useTranslations } from 'next-intl';
import { Shop } from '@/lib/api';
import { Notification } from './Notification';
import { useJobApplication } from '@/hooks/useJobApplication';

interface JobApplyModalProps {
  shop: Shop;
  onClose: () => void;
}

export function JobApplyModal({ shop, onClose }: JobApplyModalProps) {
  const t = useTranslations('Shop');
  const {
    notification,
    isAgeConfirmed,
    handleAgeConfirmationChange,
    handleApply,
    clearNotification
  } = useJobApplication(shop);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={clearNotification}
        />
      )}
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">{t('applyNow')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>

        <div className="p-6 space-y-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4 text-left">
            <input
              type="checkbox"
              checked={isAgeConfirmed}
              onChange={(event) => handleAgeConfirmationChange(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm leading-relaxed text-amber-950">
              私は18歳以上であり、求人応募にあたり年齢・勤務時間等の条件を確認します。
              <span className="mt-1 block text-xs text-amber-800">
                確認状態はこのブラウザに180日間保存されます。
              </span>
            </span>
          </label>
          <button
            onClick={handleApply}
            disabled={!isAgeConfirmed}
            className="w-full flex items-center justify-between p-4 border rounded-xl hover:bg-gray-50 transition-colors group disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
          >
            <div className="text-left">
              <p className="font-bold text-gray-900">{t('chatWithUs')}</p>
              <p className="text-sm text-gray-500">Apply via portal-job Chat</p>
            </div>
            <span className="text-gray-400 group-hover:translate-x-1 transition-transform">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
