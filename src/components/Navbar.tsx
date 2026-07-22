'use client';

import {Link, usePathname} from '@/i18n/routing';
import {useTranslations} from 'next-intl';
import {useAuth} from '@/lib/auth';
import { MessageSquare } from 'lucide-react';
import MessageNotificationPromptLink from '@/components/MessageNotificationPromptLink';
import {useUnreadMessageCount} from '@/lib/useUnreadMessageCount';
import {useOwnerAccess} from '@/lib/useOwnerAccess';
import {getSignInHref} from '@/lib/auth-redirects';

export default function Navbar() {
  const t = useTranslations('Navbar');
  const {user, signOut} = useAuth();
  const {hasUnread, displayUnreadCount} = useUnreadMessageCount();
  const {hasOwnerAccess} = useOwnerAccess();
  const pathname = usePathname();
  const settingsHref = hasOwnerAccess ? '/owner' : '/profile';
  const signInHref = getSignInHref(pathname);

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const navLinkClass = (href: string) => {
    const active = isActive(href);
    return `relative px-1 text-sm transition-all duration-300 h-full flex items-center group ${
      active
        ? 'font-bold text-gray-900'
        : 'font-medium text-gray-500 hover:text-gray-900'
    }`;
  };

  return (
    <nav className="glass sticky top-0 z-50 shadow-sm border-b transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-4 md:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex-shrink-0 flex items-center">
            <Link href="/" className="text-2xl font-black text-gradient hover:scale-105 transition-transform duration-300">
              portal-job
            </Link>
          </div>

          <div className="hidden md:ml-6 md:flex md:space-x-8 items-center h-full">
            <Link href="/" className={navLinkClass('/')}>
              {t('home')}
              <span className={`absolute bottom-0 left-0 h-0.5 bg-brand-500 transition-all duration-300 ${isActive('/') ? 'w-full' : 'w-0 group-hover:w-full'}`} />
            </Link>
            <Link href="/jobs" className={navLinkClass('/jobs')}>
              {t('jobs')}
              <span className={`absolute bottom-0 left-0 h-0.5 bg-brand-500 transition-all duration-300 ${isActive('/jobs') ? 'w-full' : 'w-0 group-hover:w-full'}`} />
            </Link>

            {user ? (
              <div className="flex items-center space-x-6 border-l pl-8 ml-4 h-full">
                <MessageNotificationPromptLink className="flex items-center space-x-1 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors cursor-pointer">
                  <span className="relative inline-flex">
                    <MessageSquare size={16} />
                    {hasUnread && (
                      <span className="absolute -right-3 -top-2 inline-flex min-w-[1.05rem] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                        {displayUnreadCount}
                      </span>
                    )}
                  </span>
                  <span>{t('messages')}</span>
                </MessageNotificationPromptLink>
                <Link href={settingsHref} className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
                  {t('settings')}
                </Link>
                <button
                  onClick={() => signOut()}
                  className="px-4 py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded-full hover:bg-red-50 transition-all duration-200 cursor-pointer"
                >
                  {t('logout')}
                </button>
              </div>
            ) : (
              <Link href={signInHref} className="px-5 py-2 text-sm font-bold text-white bg-gray-900 rounded-full hover:bg-gray-800 hover:shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0">
                {t('signin')}
              </Link>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <Link href="/" locale="ja" className="text-xs text-gray-500 font-medium hover:text-brand-500 transition-colors">JP</Link>
            <span className="text-gray-200">|</span>
            <Link href="/" locale="en" className="text-xs text-gray-500 font-medium hover:text-brand-500 transition-colors">EN</Link>
            {!user ? (
              <Link
                href={signInHref}
                className="rounded-full bg-gray-900 px-4 py-2 text-xs font-bold text-white hover:bg-gray-800 md:hidden transition-all shadow-sm active:scale-95"
              >
                {t('signin')}
              </Link>
            ) : (
              <button
                onClick={() => signOut()}
                className="rounded-full border border-red-200 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 md:hidden transition-all active:scale-95"
              >
                {t('logout')}
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
