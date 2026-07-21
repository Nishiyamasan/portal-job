import { redirect } from '@/i18n/routing';

export const runtime = 'edge';

export default async function OwnerStaffPublicSettingsPage({
  params
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;

  redirect({ href: `/owner/shops/${id}/staff`, locale });
}
