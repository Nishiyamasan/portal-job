import {useTranslations} from 'next-intl';
import {Link} from '@/i18n/routing';

export default function Footer() {
  const t = useTranslations('Footer');
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t mt-auto">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">portal-job</h3>
            <p className="mt-4 text-base text-gray-500">
              {t('description')}
            </p>
          </div>
          <div>
            <ul className="mt-4 space-y-4">
              <li><Link href="/terms" className="text-base text-gray-500 hover:text-gray-900">{t('terms')}</Link></li>
              <li><Link href="/privacy" className="text-base text-gray-500 hover:text-gray-900">{t('privacy')}</Link></li>
            </ul>
          </div>
          <div className="md:justify-self-end">
            <Link href="/contact" className="text-base font-semibold text-gray-600 hover:text-gray-900">
              {t('contactForm')}
            </Link>
          </div>
        </div>
        <div className="mt-8 border-t border-gray-200 pt-8 flex justify-between items-center">
          <p className="text-base text-gray-400">&copy; {currentYear} portal-job. {t('allRightsReserved')}</p>
        </div>
      </div>
    </footer>
  );
}
