import {Link} from '@/i18n/routing';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({items}: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="mb-8 overflow-x-auto">
      <ol className="flex min-w-0 items-center gap-2 whitespace-nowrap text-sm text-gray-500">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-2">
              {index > 0 && <span className="text-gray-300">/</span>}
              {item.href && !isLast ? (
                <Link href={item.href} className="font-semibold text-gray-500 hover:text-brand-600">
                  {item.label}
                </Link>
              ) : (
                <span className={isLast ? 'truncate font-bold text-gray-900' : 'font-semibold text-gray-500'}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
