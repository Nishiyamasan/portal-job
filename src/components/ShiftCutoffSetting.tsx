'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { updateShop, Shop } from '@/lib/api';
import { Notification } from '@/components/Notification';

interface ShiftCutoffSettingProps {
  shop: Shop;
  onUpdate: () => void;
}

export const ShiftCutoffSetting: React.FC<ShiftCutoffSettingProps> = ({ shop, onUpdate }) => {
  const t = useTranslations('ShopAdmin');
  const [cutoffTime, setCutoffTime] = useState(shop.shift_cutoff_time || '06:00');
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateShop(shop.id, { shift_cutoff_time: cutoffTime } as Parameters<typeof updateShop>[1]);
      setNotification({ message: t('updateSuccess'), type: 'success' });
      onUpdate();
    } catch (err) {
      console.error('Error updating cutoff time:', err);
      setNotification({ message: t('updateError'), type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white/5 p-6 rounded-2xl border border-white/10 space-y-4">
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      <div className="space-y-1">
        <h3 className="text-lg font-bold">{t('shiftCutoffTime')}</h3>
        <p className="text-sm text-white/50">{t('shiftCutoffHelp')}</p>
      </div>

      <div className="flex items-center space-x-4">
        <input
          type="time"
          value={cutoffTime}
          onChange={(e) => setCutoffTime(e.target.value)}
          className="bg-white/10 border border-white/10 rounded-lg px-4 py-2 text-lg focus:ring-2 focus:ring-brand-500 outline-none"
        />
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-lg transition-colors"
        >
          {isSaving ? '...' : t('save')}
        </button>
      </div>
    </div>
  );
};
