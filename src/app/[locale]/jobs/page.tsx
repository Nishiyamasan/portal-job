import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/routing';
import {getJobs, getShopById} from '@/lib/content';
import {buildAlternates, buildBreadcrumbJsonLd, buildLocaleUrl, serializeJsonLd} from '@/lib/seo';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {getMediaAssetUrl, getPrimaryMediaAsset} from '@/lib/media-assets';

export const runtime = 'edge';
const PAGE_SIZE = 20;

function formatDateLabel(value?: string | null, locale?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const formatterLocale = locale === 'ja' ? 'ja-JP' : 'en-CA';
  return new Intl.DateTimeFormat(formatterLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replaceAll('-', '/');
}

export async function generateMetadata({
  params
}: {
  params: Promise<{locale: string}>;
}): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Jobs'});

  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: buildAlternates('/jobs', locale)
  };
}

export default async function JobsPage({
  params,
  searchParams
}: {
  params: Promise<{locale: string}>;
  searchParams: Promise<{page?: string}>;
}) {
  const {locale} = await params;
  const resolvedSearchParams = await searchParams;
  const t = await getTranslations({locale, namespace: 'Jobs'});
  const currentPage = Math.max(1, Number(resolvedSearchParams.page || '1') || 1);
  const skip = (currentPage - 1) * PAGE_SIZE;
  const jobs = await getJobs({limit: PAGE_SIZE + 1, skip});
  const hasNextPage = jobs.length > PAGE_SIZE;
  const visibleJobs = hasNextPage ? jobs.slice(0, PAGE_SIZE) : jobs;
  const breadcrumbItems = [
    {label: 'portal-job', href: '/'},
    {label: t('title')}
  ];

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'portal-job jobs',
    itemListElement: visibleJobs.map((job, index) => ({
      '@type': 'ListItem',
      position: skip + index + 1,
      url: buildLocaleUrl(locale, `/jobs/${job.id}`),
      name: job.title
    }))
  };
  const breadcrumbData = buildBreadcrumbJsonLd(locale, breadcrumbItems);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: serializeJsonLd(structuredData)}}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: serializeJsonLd(breadcrumbData)}}
      />
      <Breadcrumbs items={breadcrumbItems} />
      <header className="mb-16 text-center max-w-3xl mx-auto">
        <h1 className="text-5xl font-extrabold text-gray-900 mb-6">{t('title')}</h1>
        <p className="text-xl text-gray-600">{t('subtitle')}</p>
      </header>

      {visibleJobs.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-xl border overflow-hidden">
          <div className="p-12 text-center text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-6 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p className="text-lg">{t('empty')}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {visibleJobs.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`} className="group bg-white rounded-xl overflow-hidden shadow-sm border hover:shadow-md transition-shadow">
              <div className="aspect-video bg-gray-100">
                {getMediaAssetUrl(getPrimaryMediaAsset(job.media_assets, 'job_image'), 'f_auto,q_auto,c_fill,w_640,h_360') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getMediaAssetUrl(getPrimaryMediaAsset(job.media_assets, 'job_image'), 'f_auto,q_auto,c_fill,w_640,h_360')}
                    alt={job.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-50 via-white to-amber-50/50 text-sm font-semibold text-gray-400">
                    {job.shop?.name ?? 'portal-job'}
                  </div>
                )}
              </div>
              <div className="p-6">
                <p className="mb-3 text-sm font-semibold text-gray-500">{job.shop?.name ?? 'portal-job'}</p>
                <h3 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-brand-600 transition-colors">{job.title}</h3>
                <div className="mb-4 flex flex-wrap gap-3 text-sm text-gray-500">
                  <span>{t('employmentType')}: {job.employmentType || '-'}</span>
                  <span>{t('location')}: {job.location || '-'}</span>
                </div>
                {formatDateLabel(job.publishedAt, locale) ? (
                  <p className="text-sm text-gray-500">
                    {formatDateLabel(job.publishedAt, locale)} 掲載開始
                  </p>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}

      {visibleJobs.length > 0 ? (
        <div className="mt-10 flex items-center justify-center gap-3">
          {currentPage > 1 ? (
            <Link
              href={`/jobs?page=${currentPage - 1}`}
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
            >
              {t('previousPage')}
            </Link>
          ) : (
            <span className="rounded-full border border-gray-100 bg-gray-50 px-4 py-2 text-sm font-bold text-gray-300">
              {t('previousPage')}
            </span>
          )}
          <span className="rounded-full bg-gray-900 px-4 py-2 text-sm font-bold text-white">
            {t('pageLabel', {page: currentPage})}
          </span>
          {hasNextPage ? (
            <Link
              href={`/jobs?page=${currentPage + 1}`}
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
            >
              {t('nextPage')}
            </Link>
          ) : (
            <span className="rounded-full border border-gray-100 bg-gray-50 px-4 py-2 text-sm font-bold text-gray-300">
              {t('nextPage')}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
