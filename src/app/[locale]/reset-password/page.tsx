'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Notification, NotificationType } from '@/components/Notification';
import { mapSupabaseAuthError } from '@/lib/supabase-auth-errors';
import { getLocalizedHomePath } from '@/lib/auth-redirects';

export const runtime = 'edge';

export default function ResetPasswordPage() {
  const tAuth = useTranslations('Auth');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: NotificationType; message: string } | null>(null);
  const router = useRouter();

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setNotification(null);
    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });
      if (error) throw error;
      setNotification({ type: 'success', message: tAuth('updatePasswordSuccess') });
      setTimeout(() => router.push(`${getLocalizedHomePath(window.location.pathname)}/signin`), 1500);
    } catch (err: unknown) {
      setNotification({ type: 'error', message: mapSupabaseAuthError(err, tAuth) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-24">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}
      <h1 className="text-3xl font-bold mb-8 text-center text-gray-900">
        {tAuth('resetPasswordTitle')}
      </h1>
      <div className="bg-white rounded-xl shadow-sm border p-8">
        <form className="space-y-4" onSubmit={handleUpdatePassword}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {tAuth('newPassword')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gray-900 focus:outline-none"
              required
              minLength={6}
            />
          </div>


          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gray-900 text-white font-bold py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? '...' : tAuth('updatePassword')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
