'use client';

import {ReactNode} from 'react';

type AdminListCardProps = {
  title: string;
  subtitle?: string;
  controls?: ReactNode;
  children: ReactNode;
};

export function AdminListCard({title, subtitle, controls, children}: AdminListCardProps) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-white p-8 shadow-xl">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
          {subtitle ? <p className="mt-2 text-sm text-gray-500">{subtitle}</p> : null}
        </div>
        {controls}
      </div>
      {children}
    </section>
  );
}

