import type {Metadata} from 'next';
import {getTranslations} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {getPublicShopMembers, getShopBySlug} from '@/lib/content';
import {buildAlternates, buildBreadcrumbJsonLd, buildLocaleUrl, serializeJsonLd} from '@/lib/seo';
import {ShopClaimButton} from '@/components/ShopClaimButton';
import {ShopMemberActionButtons} from '@/components/ShopMemberActionButtons';
import FavoriteButton from '@/components/FavoriteButton';
import {getMyFavorites} from '@/lib/api';
import { ShopSNSLinks } from '@/components/ShopSNSLinks';
import { getPrimaryMediaAsset } from '@/lib/media-assets';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {MarkdownContent} from '@/components/MarkdownContent';
import {TodayStaffSection} from '@/components/TodayStaffSection';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params
}: {
  params: Promise<{locale: string; slug: string}>;
}): Promise<Metadata> {
  const {locale, slug} = await params;
  const shop = await getShopBySlug(slug);
  if (!shop) return {title: 'Shop Not Found'};

  return {
    title: `${shop.name} | portal-job`,
    description: shop.description,
    alternates: buildAlternates(`/shop/${slug}`, locale),
    openGraph: {
      title: shop.name,
      description: shop.description,
      url: buildLocaleUrl(locale, `/shop/${slug}`)
    }
  };
}

export default async function ShopDetailPage({
  params
}: {
  params: Promise<{locale: string; slug: string}>;
}) {
  const {locale, slug} = await params;
  const t = await getTranslations({locale, namespace: 'Shop'});
  const tShopListing = await getTranslations({locale, namespace: 'ShopListing'});
  const tTags = await getTranslations({locale, namespace: 'Tags'});
  const shop = await getShopBySlug(slug);
  const publicMembers = await getPublicShopMembers(slug);

  if (!shop) {
    notFound();
  }

  let myFavorites: string[] = [];
  try {
     const favs = await getMyFavorites();
     myFavorites = favs.map(f => f.shop_id);
  } catch {
     // Not logged in or error
  }

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: shop.name,
    description: shop.description,
    address: shop.address,
    url: buildLocaleUrl(locale, `/shop/${shop.slug}`),
    keywords: shop.tags.join(', ')
  };
  const breadcrumbItems = [
    {label: 'portal-job', href: '/'},
    {label: tShopListing('title'), href: '/shop'},
    {label: shop.name}
  ];
  const breadcrumbData = buildBreadcrumbJsonLd(locale, breadcrumbItems);

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

      {getPrimaryMediaAsset(shop.media_assets, 'shop_image') && (
        <div className="mb-12 rounded-2xl overflow-hidden aspect-video bg-gray-100 shadow-sm border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getPrimaryMediaAsset(shop.media_assets, 'shop_image')?.url}
            alt={shop.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <header className="mb-12">
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            {shop.category}
          </span>
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 mb-6">{shop.name}</h1>
        <div className="bg-gradient-to-r from-brand-500 to-amber-500 h-1.5 w-24 rounded-full"></div>
      </header>

      <div className="mb-16">
        <MarkdownContent content={shop.description} />
      </div>

      <section className="bg-gray-100 rounded-2xl p-8 shadow-inner">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">{t('infoHeading')}</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div>
            <dt className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('addressLabel')}</dt>
            <dd className="text-lg text-gray-900 font-medium">{shop.address || t('addressFallback')}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('categoryLabel')}</dt>
            <dd className="text-lg text-gray-900 font-medium">{shop.category}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('tagsLabel')}</dt>
            <dd className="flex flex-wrap gap-2">
              {shop.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-white px-3 py-1 text-sm text-gray-600">
                  #{tTags.has(tag) ? tTags(tag) : tag}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </section>

      <ShopSNSLinks shop={shop} contactHeading={t('contactHeading')} />

      <TodayStaffSection shop={shop} />

      {publicMembers.length > 0 && (
        <section className="relative mt-12 overflow-hidden rounded-[2rem] border border-brand-100 bg-gradient-to-br from-white via-brand-50 to-amber-50/30 p-8 shadow-sm">
          <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-200/40 blur-3xl" />
          <div className="absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-amber-200/30 blur-3xl" />
          <div className="relative mb-8">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-brand-500">{t('membersEyebrow')}</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-gray-950">{t('membersHeading')}</h2>
            <p className="mt-2 text-sm text-gray-600">{t('membersDescription')}</p>
          </div>
          <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2">
            {publicMembers.map((member) => (
              <div
                key={member.id}
                className="group flex items-center gap-4 rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                {member.profile_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={member.profile_image_url}
                    alt={member.display_name}
                    className="h-16 w-16 rounded-2xl border-2 border-white bg-white object-cover shadow-md transition-transform duration-300 group-hover:rotate-2 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-white bg-gradient-to-br from-gray-100 to-gray-200 text-xl font-black text-gray-400 shadow-md">
                    {member.display_name.slice(0, 1)}
                  </div>
                )}
                <div>
                  <p className="text-lg font-black text-gray-950">{member.display_name}</p>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">{t('staffCardLabel')}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-4 mt-12">
        {shop.claim_status === 'unclaimed' && (
          <ShopClaimButton shopId={shop.id} shopName={shop.name} />
        )}
        <ShopMemberActionButtons shopId={shop.id} />
        <FavoriteButton shopId={shop.id} initialIsFavorited={myFavorites.includes(shop.id)} />
      </div>
    </article>
  );
}
