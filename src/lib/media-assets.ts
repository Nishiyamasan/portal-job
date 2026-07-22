import { type MediaAsset } from './api';

export type MediaAssetType = 'shop_image' | 'profile_image' | 'job_image';

export function getPrimaryMediaAsset(
  assets: MediaAsset[] | undefined | null,
  assetType: MediaAssetType
): MediaAsset | undefined {
  if (!assets?.length) {
    return undefined;
  }

  return assets
    .filter((asset) => asset.asset_type === assetType)
    .filter((asset) => asset.active !== false && !asset.deleted_at)
    .sort((a, b) => {
      const aTime = a.created_at ? Date.parse(a.created_at) : 0;
      const bTime = b.created_at ? Date.parse(b.created_at) : 0;
      return bTime - aTime;
    })[0];
}

export function getMediaAssetUrl(
  asset: MediaAsset | undefined | null,
  transformation = 'f_auto,q_auto,c_fill,w_640,h_360'
): string | undefined {
  if (!asset?.url) {
    return undefined;
  }

  if (asset.provider === 'cloudinary' || asset.url.includes('res.cloudinary.com')) {
    return asset.url.replace('/upload/', `/upload/${transformation}/`);
  }

  return asset.url;
}
