'use client';

export const runtime = 'edge';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { getMyMemberships, getShifts, StaffShift, ShopMemberResponse } from '@/lib/api';
import { ShiftCalendar } from '@/components/ShiftCalendar';
import { Breadcrumbs } from '@/components/Breadcrumbs';

export default function ProfileShiftsPage() {
  const t = useTranslations('Shifts');
  const [memberships, setMemberships] = useState<ShopMemberResponse[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>('');
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getMyMemberships();
        setMemberships(data);
        if (data.length > 0) {
          setSelectedShopId(data[0].shop_id);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const loadShifts = useCallback(async () => {
    try {
      const data = await getShifts(selectedShopId);
      setShifts(data);
    } catch (err) {
      console.error(err);
    }
  }, [selectedShopId]);

  useEffect(() => {
    if (selectedShopId) {
      loadShifts();
    }
  }, [selectedShopId, loadShifts]);

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 pb-32">
      <Breadcrumbs
        items={[
          { label: 'Profile', href: '/profile' },
          { label: t('title') }
        ]}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-3xl font-black italic tracking-tighter uppercase">
          {t('title')}
        </h1>

        {memberships.length > 0 && (
          <select
            value={selectedShopId}
            onChange={(e) => setSelectedShopId(e.target.value)}
            className="bg-white/10 border border-white/10 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-brand-500"
          >
            {memberships.map(m => (
              <option key={m.shop_id} value={m.shop_id}>
                {m.shop?.name || m.shop_id}
              </option>
            ))}
          </select>
        )}
      </div>

      {memberships.length === 0 ? (
        <div className="bg-white/5 p-12 rounded-3xl border border-white/10 text-center">
          <p className="text-white/50">{t('noShifts')}</p>
        </div>
      ) : (
        <ShiftCalendar
          shopId={selectedShopId}
          initialShifts={shifts}
          onRefresh={loadShifts}
        />
      )}
    </div>
  );
}
