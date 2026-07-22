'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { submitOwnerApplication } from '@/lib/api';

interface ShopClaimButtonProps {
  shopId: string;
  shopName: string;
}

export function ShopClaimButton({ shopId, shopName }: ShopClaimButtonProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await submitOwnerApplication({
        shop_id: shopId,
        reason: reason,
      });
      setSuccess(true);
      setTimeout(() => setIsOpen(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={isOpen ? 'w-full' : ''}>
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="h-10 px-6 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors text-sm whitespace-nowrap"
        >
          この店舗のオーナーですか？（オーナー申請）
        </button>
      ) : (
        <div className="bg-white border rounded-xl p-6 shadow-sm">
          {success ? (
            <div className="text-green-600 font-bold">
              申請を送信しました。管理者の承認をお待ちください。
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h3 className="text-xl font-bold mb-4">{shopName} のオーナー申請</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  申請理由・確認情報（電話番号や関係性など）
                </label>
                <textarea
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full border rounded-lg p-3 h-32"
                  placeholder="例：この店舗の店長です。電話番号は 03-xxxx-xxxx です。"
                />
              </div>
              {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50"
                >
                  {isSubmitting ? '送信中...' : '申請を送信する'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-gray-600 py-2 px-6"
                >
                  キャンセル
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
