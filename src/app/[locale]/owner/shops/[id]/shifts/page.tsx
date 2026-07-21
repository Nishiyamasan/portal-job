'use client';

export const runtime = 'edge';

import React, { useState, useEffect, use, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { getShopById, getShifts, StaffShift, Shop } from '@/lib/api';
import { ShiftCalendar } from '@/components/ShiftCalendar';
import { ShiftCutoffSetting } from '@/components/ShiftCutoffSetting';
import { Breadcrumbs } from '@/components/Breadcrumbs';

export default function OwnerShiftsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('Shifts');
  const [shop, setShop] = useState<Shop | null>(null);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [loading, setLoading] = useState(true);

  const loadShop = useCallback(async () => {
    try {
      const data = await getShopById(id);
      setShop(data);
    } catch (err) {
      console.error(err);
    }
  }, [id]);

  const loadShifts = useCallback(async () => {
    try {
      const data = await getShifts(id);
      setShifts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadShop();
    loadShifts();
  }, [id, loadShop, loadShifts]);

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!shop) return <div className="p-8 text-center">Shop not found</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8 pb-32">
      <Breadcrumbs
        items={[
          { label: 'Owner Dashboard', href: '/owner' },
          { label: shop.name, href: `/owner/shops/${id}` },
          { label: t('title') }
        ]}
      />

      <h1 className="text-3xl font-black italic tracking-tighter uppercase">
        {shop.name} - {t('title')}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <ShiftCalendar
            shopId={id}
            initialShifts={shifts}
            isOwner={true}
            onRefresh={loadShifts}
          />
        </div>

        <div className="space-y-6">
          <ShiftCutoffSetting shop={shop} onUpdate={loadShop} />

          <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
            <h3 className="text-lg font-bold mb-4">Legend</h3>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-gray-500/20 border border-gray-500 rounded" />
                <span className="text-sm text-white/70">{t('draft')}</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-500/20 border border-blue-500 rounded" />
                <span className="text-sm text-white/70">{t('submitted')}</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500/20 border border-green-500 rounded" />
                <span className="text-sm text-white/70">{t('approved')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
