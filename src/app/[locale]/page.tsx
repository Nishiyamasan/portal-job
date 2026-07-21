import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/routing';
import {getJobs, getShopById, getShops} from '@/lib/content';
import {buildAlternates, buildLocaleUrl, serializeJsonLd} from '@/lib/seo';
import {getMediaAssetUrl, getPrimaryMediaAsset} from '@/lib/media-assets';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

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
  const t = await getTranslations({locale, namespace: 'Index'});

  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: buildAlternates('', locale)
  };
}

export default async function Home({
  params
}: {
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Index'});
  const tTags = await getTranslations({locale, namespace: 'Tags'});
  const jobs = await getJobs({limit: 12, random: true});
  const shops = await getShops({limit: 12, random: true});
  const jobsWithShop = await Promise.all(
    jobs.map(async (job) => ({
      job,
      shop: await getShopById(job.shop_id)
    }))
  );
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'portal-job jobs',
    itemListElement: jobs.map((job, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: buildLocaleUrl(locale, `/jobs/${job.id}`),
      name: job.title
    }))
  };

  return (
    <div className="bg-gray-50/50 min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: serializeJsonLd(structuredData)}}
      />

      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gray-900 py-24 md:py-32">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600/20 via-orange-600/10 to-amber-600/20 opacity-50" />
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-brand-500/10 blur-3xl animate-float" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl animate-float" style={{ animationDelay: '1s' }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-6xl font-black text-white mb-6 tracking-tight leading-tight">
            <span className="text-gradient drop-shadow-sm">{t('title')}</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed">
            {t('subtitle')}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight">{t('latestJobs')}</h2>
            <div className="h-1.5 w-20 bg-brand-500 rounded-full mt-2" />
          </div>
          <Link
            href="/jobs"
            className="inline-flex items-center text-brand-600 font-bold hover:text-brand-700 transition-colors group"
          >
            {t('viewAll')}
            <span className="ml-2 transform group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>

        {jobs.length === 0 ? (
          <div className="text-center py-32 bg-white rounded-3xl shadow-sm border border-gray-100">
            <div className="text-5xl mb-4">🔍</div>
            <p className="text-gray-400 font-medium">{t('emptyJobs')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
            {jobsWithShop.map(({job, shop}) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="group bg-white rounded-[2rem] overflow-hidden border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-brand-500/10 transition-all duration-500 hover:-translate-y-2 flex flex-col"
              >
                <div className="relative aspect-video overflow-hidden border-b border-gray-100 bg-gray-100">
                  {getMediaAssetUrl(getPrimaryMediaAsset(job.media_assets, 'job_image'), 'f_auto,q_auto,c_fill,w_640,h_360') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={getMediaAssetUrl(getPrimaryMediaAsset(job.media_assets, 'job_image'), 'f_auto,q_auto,c_fill,w_640,h_360')}
                      alt={job.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-50 via-white to-amber-50/50 text-sm font-semibold text-gray-500">
                      {shop?.name ?? 'portal-job'}
                    </div>
                  )}
                </div>

                <div className="p-8 flex-1 flex flex-col">
                  <p className="mb-3 text-sm font-semibold text-gray-500">{shop?.name ?? 'portal-job'}</p>
                  <h3 className="mb-6 text-2xl font-black text-gray-900 transition-colors group-hover:text-brand-600">
                    {job.title}
                  </h3>

                  {formatDateLabel(job.publishedAt, locale) ? (
                    <p className="mb-8 mt-auto text-sm text-gray-500">
                      {formatDateLabel(job.publishedAt, locale)} 掲載開始
                    </p>
                  ) : <div className="mb-8 mt-auto" />}

                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
            <div>
              <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight">{t('publishedShops')}</h2>
              <div className="h-1.5 w-20 bg-brand-500 rounded-full mt-2" />
            </div>
            <Link
              href="/shop"
              className="inline-flex items-center text-brand-600 font-bold hover:text-brand-700 transition-colors group"
            >
              {t('viewAllShops')}
              <span className="ml-2 transform group-hover:translate-x-1 transition-transform">→→</span>
            </Link>
          </div>

          {shops.length === 0 ? (
            <div className="text-center py-32 bg-white rounded-3xl shadow-sm border border-gray-100">
              <div className="text-5xl mb-4">🏪</div>
              <p className="text-gray-400 font-medium">{t('emptyShops')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
              {shops.map((shop) => (
                <Link
                key={shop.id}
                href={`/shop/${shop.slug}`}
                className="group bg-white rounded-[2rem] overflow-hidden border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-brand-500/10 transition-all duration-500 hover:-translate-y-2 flex flex-col"
              >
                <div className="relative aspect-video overflow-hidden border-b border-gray-100 bg-gray-100">
                  {getMediaAssetUrl(getPrimaryMediaAsset(shop.media_assets, 'shop_image'), 'f_auto,q_auto,c_fill,w_640,h_360') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={getMediaAssetUrl(getPrimaryMediaAsset(shop.media_assets, 'shop_image'), 'f_auto,q_auto,c_fill,w_640,h_360')}
                      alt={shop.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-50 via-white to-amber-50/50 text-xl font-black text-gray-400">
                      {shop.name}
                    </div>
                  )}
                </div>

                  <div className="p-8 flex-1 flex flex-col">
                    <h3 className="text-2xl font-black text-gray-900 mb-3 group-hover:text-brand-600 transition-colors">
                      {shop.name}
                    </h3>
                    <div className="mb-4 grid grid-cols-1 gap-2 text-sm text-gray-600">
                      <p className="line-clamp-1">
                        {shop.tags?.length
                          ? shop.tags.map((tag) => tTags.has(tag) ? tTags(tag) : tag).join(' / ')
                          : '-'}
                      </p>
                    </div>
                    <p className="mt-auto line-clamp-2 text-sm text-gray-500">{shop.address || '-'}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
