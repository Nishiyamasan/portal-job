import { routing } from '@/i18n/routing';

const LOCALES = routing.locales as readonly string[];

export function getLocalizedHomePath(pathname?: string) {
  const sourcePathname =
    pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  const [, maybeLocale] = sourcePathname.split('/');

  if (LOCALES.includes(maybeLocale)) {
    return `/${maybeLocale}`;
  }

  return `/${routing.defaultLocale}`;
}

export function getCurrentPathWithSearch() {
  if (typeof window === 'undefined') {
    return getLocalizedHomePath();
  }

  return `${window.location.pathname}${window.location.search}`;
}

export function getSignInHref(from = getCurrentPathWithSearch()) {
  if (isSignInPath(from)) {
    return '/signin';
  }

  return `/signin?from=${encodeURIComponent(from)}`;
}

export function getSafeAuthReturnPath(rawFrom: string | null, fallbackPathname?: string) {
  if (!rawFrom || !isSafeInternalPath(rawFrom) || isSignInPath(rawFrom)) {
    return getLocalizedHomePath(fallbackPathname);
  }

  return rawFrom;
}

function isSafeInternalPath(path: string) {
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('://');
}

function isSignInPath(path: string) {
  return /^\/(?:ja|en)?\/?signin(?:[/?#]|$)/.test(path);
}
