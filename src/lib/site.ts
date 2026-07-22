export const siteConfig = {
  name: 'portal-job',
  shortDescription: '店舗と人を繋ぐ地域密着型ポータルサイト。',
  url: 'https://portal-job.example.com'
};

export function getBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url;
}
