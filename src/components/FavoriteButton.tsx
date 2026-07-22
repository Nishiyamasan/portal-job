'use client';

import { useEffect, useState } from 'react';
import { favoriteShop, getMyFavorites, unfavoriteShop } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Heart } from 'lucide-react';

let cachedFavoriteUserId: string | null = null;
let cachedFavoriteShopIds: Set<string> | null = null;
let favoriteShopIdsPromise: Promise<Set<string>> | null = null;

async function loadFavoriteShopIds(userId: string) {
  if (cachedFavoriteUserId === userId && cachedFavoriteShopIds) {
    return cachedFavoriteShopIds;
  }

  if (cachedFavoriteUserId !== userId) {
    cachedFavoriteUserId = userId;
    cachedFavoriteShopIds = null;
    favoriteShopIdsPromise = null;
  }

  favoriteShopIdsPromise ??= getMyFavorites()
    .then((favorites) => {
      const ids = new Set(favorites.map((favorite) => favorite.shop_id));
      cachedFavoriteShopIds = ids;
      return ids;
    })
    .catch((error) => {
      favoriteShopIdsPromise = null;
      throw error;
    });

  return favoriteShopIdsPromise;
}

function updateFavoriteCache(userId: string, shopId: string, isFavorited: boolean) {
  if (cachedFavoriteUserId !== userId || !cachedFavoriteShopIds) return;
  if (isFavorited) {
    cachedFavoriteShopIds.add(shopId);
  } else {
    cachedFavoriteShopIds.delete(shopId);
  }
}

export default function FavoriteButton({ shopId, initialIsFavorited }: { shopId: string, initialIsFavorited: boolean }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const userId = user?.id;
  const [isFavorited, setIsFavorited] = useState(initialIsFavorited);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsFavorited(initialIsFavorited);
  }, [initialIsFavorited]);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!userId) {
      setIsFavorited(false);
      return;
    }

    let isMounted = true;
    loadFavoriteShopIds(userId)
      .then((favoriteShopIds) => {
        if (isMounted) {
          setIsFavorited(favoriteShopIds.has(shopId));
        }
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      isMounted = false;
    };
  }, [initialIsFavorited, isAuthLoading, shopId, userId]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user || isLoading) return;

    const nextIsFavorited = !isFavorited;
    setIsLoading(true);
    try {
      if (isFavorited) {
        await unfavoriteShop(shopId);
      } else {
        await favoriteShop(shopId);
      }
      updateFavoriteCache(user.id, shopId, nextIsFavorited);
      setIsFavorited(nextIsFavorited);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading || isAuthLoading || !user}
      className={`h-10 w-10 flex items-center justify-center border rounded-lg transition-colors ${isFavorited ? 'bg-brand-50 border-brand-200 text-brand-600' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50'}`}
      title={!user ? 'Login required' : isFavorited ? 'Unfavorite' : 'Favorite'}
    >
      <Heart size={20} fill={isFavorited ? 'currentColor' : 'none'} className={isLoading ? 'animate-pulse' : ''} />
    </button>
  );
}
