import type { AuthError } from '@supabase/supabase-js';

type TranslateFn = (key: string) => string;

function normalize(message: string): string {
  return message.trim().toLowerCase();
}

export function mapSupabaseAuthError(error: unknown, t: TranslateFn): string {
  const defaultMessage = t('genericAuthError');

  if (!error || typeof error !== 'object') {
    return defaultMessage;
  }

  const authError = error as Partial<AuthError> & { message?: string; status?: number };
  const message = normalize(authError.message ?? '');
  const status = authError.status;

  if (message.includes('invalid login credentials')) {
    return t('invalidCredentials');
  }
  if (message.includes('email not confirmed')) {
    return t('emailNotConfirmed');
  }
  if (message.includes('user already registered')) {
    return t('userAlreadyRegistered');
  }
  if (message.includes('password should be at least')) {
    return t('passwordTooShort');
  }
  if (message.includes('security purposes') || message.includes('rate limit')) {
    return t('tooManyRequests');
  }
  if (message.includes('expired') || message.includes('invalid') || message.includes('refresh token')) {
    return t('invalidOrExpiredLink');
  }

  if (status === 400) return t('invalidRequest');
  if (status === 401) return t('unauthorizedError');
  if (status === 422) return t('validationError');
  if (status === 429) return t('tooManyRequests');

  return defaultMessage;
}
