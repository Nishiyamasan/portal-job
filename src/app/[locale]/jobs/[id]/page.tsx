import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {getJobById, getShopById} from '@/lib/content';
import {buildAlternates, buildBreadcrumbJsonLd, buildLocaleUrl, serializeJsonLd} from '@/lib/seo';
import { JobApplyButton } from '@/components/JobApplyButton';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {MarkdownContent} from '@/components/MarkdownContent';
import {Link} from '@/i18n/routing';
import {getMediaAssetUrl, getPrimaryMediaAsset} from '@/lib/media-assets';

export const runtime = 'edge';

export async function generateMetadata({
  params
}: {
  params: Promise<{locale: string; id: string}>;
}): Promise<Metadata> {
  const {locale, id} = await params;
  const job = await getJobById(id);

  if (!job) {
    return {title: 'Job Not Found'};
  }

  return {
    title: `${job.title} | portal-job`,
    description: job.description,
    alternates: buildAlternates(`/jobs/${id}`, locale),
    openGraph: {
      title: job.title,
      description: job.description,
      url: buildLocaleUrl(locale, `/jobs/${id}`)
    }
  };
}

export default async function JobDetailPage({
  params
}: {
  params: Promise<{locale: string; id: string}>;
}) {
  const {locale, id} = await params;
  const t = await getTranslations({locale, namespace: 'Jobs'});
  const job = await getJobById(id);

  if (!job) {
    notFound();
  }

  const shop = await getShopById(job.shop_id);
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    employmentType: job.employmentType,
    hiringOrganization: shop
      ? {
          '@type': 'Organization',
          name: shop.name
        }
      : undefined,
    jobLocation: {
      '@type': 'Place',
      address: job.location
    },
    url: buildLocaleUrl(locale, `/jobs/${job.id}`)
  };
  const breadcrumbItems = [
    {label: 'portal-job', href: '/'},
    {label: t('title'), href: '/jobs'},
    {label: job.title}
  ];
  const breadcrumbData = buildBreadcrumbJsonLd(locale, breadcrumbItems);
  const jobImageUrl = getMediaAssetUrl(getPrimaryMediaAsset(job.media_assets, 'job_image'), 'f_auto,q_auto,c_fill,w_1280,h_720');

  return (
    <article className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: serializeJsonLd(structuredData)}}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: serializeJsonLd(breadcrumbData)}}
      />
      <Breadcrumbs items={breadcrumbItems} />

      {jobImageUrl ? (
        <div className="mb-10 aspect-video overflow-hidden rounded-2xl border bg-gray-100 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={jobImageUrl} alt={job.title} className="h-full w-full object-cover" />
        </div>
      ) : null}

      <header className="mb-10">
        <span className="mb-4 inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
          {t('openStatus')}
        </span>
        <h1 className="mb-4 text-4xl font-extrabold text-gray-900">{job.title}</h1>
        <div className="space-y-1 text-sm text-gray-500">
          <p>Job ID: {job.id}</p>
          <p>{t('employmentType')}: {job.employmentType}</p>
          <p>{t('location')}: {job.location}</p>
          {shop ? <p>{t('shop')}: {shop.name}</p> : null}
        </div>
      </header>

      <section className="rounded-2xl border bg-white p-8 shadow-sm mb-12">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">{t('descriptionHeading')}</h2>
        <MarkdownContent content={job.description} />
      </section>

      {shop && (
        <div className="flex flex-col items-center gap-4">
           <JobApplyButton shop={shop} />
           <Link
             href={`/shop/${shop.slug}`}
             className="text-sm font-semibold text-blue-600 hover:underline"
           >
             {t('shopPage')}
           </Link>
        </div>
      )}
    </article>
  );
}
