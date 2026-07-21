import { ShopSkeleton } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="bg-gray-50/50 min-h-screen">
      {/* Hero Skeleton */}
      <div className="relative overflow-hidden bg-gray-900 py-24 md:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
          <div className="h-16 w-3/4 md:w-1/2 bg-white/10 rounded-2xl animate-pulse mb-6" />
          <div className="h-6 w-1/2 md:w-1/3 bg-white/5 rounded-xl animate-pulse" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="flex justify-between items-end mb-12">
          <div className="space-y-4">
            <div className="h-10 w-64 bg-gray-200 rounded-xl animate-pulse" />
            <div className="h-1.5 w-20 bg-gray-200 rounded-full" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
          <ShopSkeleton />
          <ShopSkeleton />
          <ShopSkeleton />
          <ShopSkeleton />
          <ShopSkeleton />
          <ShopSkeleton />
        </div>
      </div>
    </div>
  );
}
