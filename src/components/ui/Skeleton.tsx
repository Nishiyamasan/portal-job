import React from 'react';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={`animate-pulse rounded-2xl bg-gray-200 ${className}`} />
  );
}

export function ShopSkeleton() {
  return (
    <div className="bg-white rounded-3xl border border-gray-100 p-8 flex flex-col gap-6">
      <Skeleton className="aspect-[16/10] w-full" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-lg" />
        <Skeleton className="h-5 w-16 rounded-lg" />
      </div>
      <div className="flex gap-3 mt-4">
        <Skeleton className="h-12 flex-1 rounded-2xl" />
        <Skeleton className="h-12 w-12 rounded-2xl" />
      </div>
    </div>
  );
}
