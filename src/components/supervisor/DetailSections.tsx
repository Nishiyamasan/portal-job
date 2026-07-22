'use client';

import {Inquiry, OwnerApplication} from '@/lib/api';

type ShopDetail = {
  id: string;
  name: string;
  slug?: string;
  category?: string;
  is_approved: boolean;
  owner_id?: string;
  owner_email?: string;
  address?: string;
  description?: string;
};

export function inquiryTypeLabel(type: string) {
  if (type === 'listing') return '掲載希望';
  if (type === 'removal') return '掲載取り下げ希望';
  return 'その他';
}

export function ownerApplicationStatusLabel(status: string) {
  if (status === 'approved') return '承認済み';
  if (status === 'rejected') return '却下';
  return '未承認';
}

export function OwnerApplicationDetail({application}: {application: OwnerApplication}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">表示名</p>
          <p className="font-medium text-gray-900">{application.profile?.display_name || '未設定'}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">メール</p>
          <p className="font-medium text-gray-900">{application.profile?.email || '-'}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">申請UUID</p>
          <p className="break-all font-medium text-gray-900">{application.id}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">ユーザーUUID</p>
          <p className="break-all font-medium text-gray-900">{application.profile_id}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">店舗UUID</p>
          <p className="break-all font-medium text-gray-900">{application.shop_id || '-'}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">対象店舗</p>
          <p className="font-medium text-gray-900">{application.shop?.name || '未指定'}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">対象店舗スラッグ</p>
          <p className="font-medium text-gray-900">{application.shop?.slug || '-'}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">ステータス</p>
          <p className="font-medium text-gray-900">{ownerApplicationStatusLabel(application.status)}</p>
        </div>
      </div>
      <div>
        <p className="text-xs font-bold uppercase text-gray-400">申請理由</p>
        <div className="mt-1 whitespace-pre-wrap rounded-lg border bg-gray-50 p-4 text-gray-700">
          {application.reason}
        </div>
      </div>
    </div>
  );
}

export function InquiryDetail({inquiry}: {inquiry: Inquiry}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">種別</p>
          <p className="font-medium text-gray-900">{inquiryTypeLabel(inquiry.inquiry_type)}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">受信日時</p>
          <p className="font-medium text-gray-900">{new Date(inquiry.created_at).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">名前</p>
          <p className="font-medium text-gray-900">{inquiry.name}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">メール</p>
          <p className="font-medium text-gray-900">{inquiry.email}</p>
        </div>
      </div>
      <div>
        <p className="text-xs font-bold uppercase text-gray-400">内容</p>
        <div className="mt-1 whitespace-pre-wrap rounded-lg border bg-gray-50 p-4 text-gray-700">
          {inquiry.content}
        </div>
      </div>
    </div>
  );
}

export function ShopDetail({shop}: {shop: ShopDetail}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">店舗名</p>
          <p className="font-medium text-gray-900">{shop.name}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">店舗UUID</p>
          <p className="break-all font-medium text-gray-900">{shop.id}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">スラッグ</p>
          <p className="font-medium text-gray-900">{shop.slug || '-'}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">カテゴリ</p>
          <p className="font-medium text-gray-900">{shop.category || '-'}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">承認状態</p>
          <p className="font-medium text-gray-900">{shop.is_approved ? '承認済み' : '未承認'}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">オーナーUUID</p>
          <p className="break-all font-medium text-gray-900">{shop.owner_id || '-'}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">オーナーメール</p>
          <p className="font-medium text-gray-900">{shop.owner_email || '-'}</p>
        </div>
      </div>
      <div>
        <p className="text-xs font-bold uppercase text-gray-400">住所</p>
        <p className="font-medium text-gray-900">{shop.address || '-'}</p>
      </div>
      <div>
        <p className="text-xs font-bold uppercase text-gray-400">説明</p>
        <div className="mt-1 whitespace-pre-wrap rounded-lg border bg-gray-50 p-4 text-gray-700">
          {shop.description || '-'}
        </div>
      </div>
    </div>
  );
}
