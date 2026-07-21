'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { getShifts, StaffShift, Shop } from '@/lib/api';

interface TodayStaffSectionProps {
  shop: Shop;
}

export const TodayStaffSection: React.FC<TodayStaffSectionProps> = ({ shop }) => {
  const t = useTranslations('Shop');
  const [todayStaff, setTodayStaff] = useState<StaffShift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const cutoff = shop.shift_cutoff_time || '06:00';
        const [cutoffH, cutoffM] = cutoff.split(':').map(Number);
        const now = new Date();
        const cutoffToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), cutoffH, cutoffM);

        let businessDate = now;
        if (now < cutoffToday) {
          businessDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        }

        const year = businessDate.getFullYear();
        const month = String(businessDate.getMonth() + 1).padStart(2, '0');
        const day = String(businessDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        const data = await getShifts(shop.id, dateStr, dateStr);
        setTodayStaff(data.filter(s => s.status === 'approved'));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [shop.id, shop.shift_cutoff_time]);

  if (loading) return null;
  if (todayStaff.length === 0) return null;

  return (
    <section className="mt-12 bg-white/5 rounded-3xl p-8 border border-white/10">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-950 dark:text-white">{t('todayStaffHeading')}</h2>
        <p className="text-sm text-gray-600 dark:text-white/50">{t('todayStaffDescription')}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {todayStaff.map((shift) => (
          <div key={shift.id} className="flex items-center space-x-3 bg-white dark:bg-white/5 p-3 rounded-2xl border border-gray-100 dark:border-white/10">
            <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center text-pink-500 font-bold">
              {shift.profile?.display_name ? shift.profile.display_name.slice(0, 1) : '?'}
            </div>
            <div>
              <div className="font-bold text-sm">{shift.profile?.display_name}</div>
              <div className="text-[10px] text-gray-500 dark:text-white/40 uppercase font-black tracking-tighter">
                Scheduled
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
