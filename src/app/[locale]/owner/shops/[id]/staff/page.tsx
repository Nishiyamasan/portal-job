'use client';

import { use } from 'react';
import { ShopStaffManagement } from '@/components/ShopStaffManagement';

export const runtime = 'edge';

export default function OwnerShopStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: shopId } = use(params);

  return <ShopStaffManagement shopId={shopId} />;
}
