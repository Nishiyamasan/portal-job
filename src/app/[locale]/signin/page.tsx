'use client';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Notification, NotificationType } from '@/components/Notification';
import { mapSupabaseAuthError } from '@/lib/supabase-auth-errors';
import { getPublicSystemSetting } from '@/lib/api';
import { MarkdownContent } from '@/components/MarkdownContent';
import { getLocalizedHomePath, getSafeAuthReturnPath } from '@/lib/auth-redirects';

export const runtime = 'edge';

export default function SignInPage() {
  const t = useTranslations('Navbar');
  const tAuth = useTranslations('Auth');
  const { user, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToLegal, setAgreedToLegal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [legalModalTitle, setLegalModalTitle] = useState('');
  const [legalContent, setLegalContent] = useState('');
  const [isLegalLoading, setIsLegalLoading] = useState(false);
  const [legalError, setLegalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: NotificationType; message: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (user) {
      const searchParams = new URLSearchParams(window.location.search);
      const from = getSafeAuthReturnPath(searchParams.get('from'), window.location.pathname);
      router.push(from);
    }
  }, [user, router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setNotification(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      const searchParams = new URLSearchParams(window.location.search);
      const from = getSafeAuthReturnPath(searchParams.get('from'), window.location.pathname);
      router.push(from);
    } catch (err: unknown) {
      setNotification({ type: 'error', message: mapSupabaseAuthError(err, tAuth) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreedToLegal) {
      setNotification({ type: 'error', message: tAuth('agreeToLegalRequired') });
      return;
    }
    if (password !== confirmPassword) {
      setNotification({ type: 'error', message: tAuth('passwordMismatch') });
      return;
    }
    setIsSubmitting(true);
    setNotification(null);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;
      setNotification({ type: 'success', message: tAuth('signupEmailSent') });
    } catch (err: unknown) {
      setNotification({ type: 'error', message: mapSupabaseAuthError(err, tAuth) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setNotification({ type: 'error', message: tAuth('enterEmailFirst') });
      return;
    }
    setIsSubmitting(true);
    setNotification(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${getLocalizedHomePath(window.location.pathname)}/reset-password`,
      });
      if (error) throw error;
      setNotification({ type: 'success', message: tAuth('resetEmailSent') });
    } catch (err: unknown) {
      setNotification({ type: 'error', message: mapSupabaseAuthError(err, tAuth) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openLegalModal = async (type: 'terms' | 'privacy') => {
    const key = `${type}_ja`;
    setIsLegalModalOpen(true);
    setIsLegalLoading(true);
    setLegalError(null);
    setLegalContent('');
    setLegalModalTitle(type === 'terms' ? tAuth('terms') : tAuth('privacy'));

    try {
      const setting = await getPublicSystemSetting(key);
      setLegalContent(setting.value || '');
    } catch {
      setLegalError(tAuth('legalLoadFailed'));
    } finally {
      setIsLegalLoading(false);
    }
  };

  if (isLoading) return null;

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
        {isSignUp ? tAuth('createAccount') : t('signin')}
      </h1>
      <div className="bg-white rounded-xl shadow-sm border p-8">
        <form className="space-y-4" onSubmit={isSignUp ? handleSignUp : handleSignIn}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tAuth('emailLabel')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gray-900 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tAuth('passwordLabel')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gray-900 focus:outline-none"
              required={!isSignUp || (isSignUp && !!password)}
            />
          </div>
          {isSignUp && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tAuth('confirmPasswordLabel')}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-gray-900 focus:outline-none"
                  required
                />
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={agreedToLegal}
                  onChange={(e) => setAgreedToLegal(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                <span>
                  {tAuth('agreeToLegalPrefix')}{' '}
                  <button
                    type="button"
                    onClick={() => openLegalModal('terms')}
                    className="font-semibold text-gray-900 underline underline-offset-2 hover:text-gray-700"
                  >
                    {tAuth('terms')}
                  </button>{' '}
                  {tAuth('and')}{' '}
                  <button
                    type="button"
                    onClick={() => openLegalModal('privacy')}
                    className="font-semibold text-gray-900 underline underline-offset-2 hover:text-gray-700"
                  >
                    {tAuth('privacy')}
                  </button>{' '}
                  {tAuth('agreeToLegalSuffix')}
                </span>
              </label>
              <div className="flex items-center gap-4 text-xs">
                <button type="button" onClick={() => openLegalModal('terms')} className="font-semibold text-gray-700 underline underline-offset-2 hover:text-gray-900">
                  {tAuth('openTermsModal')}
                </button>
                <button type="button" onClick={() => openLegalModal('privacy')} className="font-semibold text-gray-700 underline underline-offset-2 hover:text-gray-900">
                  {tAuth('openPrivacyModal')}
                </button>
              </div>
            </>
          )}
          <div className="pt-4 space-y-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gray-900 text-white font-bold py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {isSignUp ? tAuth('signUp') : tAuth('signIn')}
            </button>
            
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setNotification(null);
                }}
                className="text-sm text-gray-600 hover:underline"
              >
                {isSignUp ? tAuth('alreadyHaveAccount') : tAuth('dontHaveAccount')}
              </button>
              
              {!isSignUp && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {tAuth('forgotPassword')}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {isLegalModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-lg font-black text-gray-900">{legalModalTitle}</h2>
              <button
                type="button"
                onClick={() => setIsLegalModalOpen(false)}
                className="rounded-lg border border-gray-200 px-3 py-1 text-sm font-bold text-gray-600 hover:bg-gray-50"
              >
                {tAuth('close')}
              </button>
            </div>
            <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
              {isLegalLoading ? (
                <p className="text-sm text-gray-500">{tAuth('legalLoading')}</p>
              ) : legalError ? (
                <p className="text-sm text-red-600">{legalError}</p>
              ) : (
                <MarkdownContent content={legalContent} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
