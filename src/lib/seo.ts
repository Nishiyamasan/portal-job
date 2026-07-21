import {getBaseUrl} from './site';
import type {BreadcrumbItem} from '@/components/Breadcrumbs';

export function buildLocaleUrl(locale: string, pathname = '') {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${getBaseUrl()}/${locale}${normalizedPath === '/' ? '' : normalizedPath}`;
}

export function buildAlternates(pathname = '', canonicalLocale = 'ja') {
  return {
    canonical: buildLocaleUrl(canonicalLocale, pathname),
    languages: {
      ja: buildLocaleUrl('ja', pathname),
      en: buildLocaleUrl('en', pathname)
    }
  };
}

export function buildBreadcrumbJsonLd(locale: string, items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: buildLocaleUrl(locale, item.href || '')
    }))
  };
}

export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
