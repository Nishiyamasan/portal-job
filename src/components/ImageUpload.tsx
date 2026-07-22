'use client';

import { useState } from 'react';
import { uploadMediaImage } from '@/lib/media-upload';
import { type MediaAssetType } from '@/lib/media-assets';

interface ImageUploadProps {
  assetType: MediaAssetType;
  shopId?: string;
  jobPostId?: string;
  onSuccess?: (url: string) => void;
  label?: string;
  description?: string;
}

export function ImageUpload({ assetType, shopId, jobPostId, onSuccess, label = '画像をアップロード', description }: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const uploadedUrl = await uploadMediaImage({ file, assetType, shopId, jobPostId });

      if (onSuccess) {
        onSuccess(uploadedUrl);
      }
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="mt-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      {description && <p className="mb-2 text-xs text-gray-500">{description}</p>}
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={isUploading}
        className="block w-full text-sm text-gray-500
          file:mr-4 file:py-2 file:px-4
          file:rounded-full file:border-0
          file:text-sm file:font-semibold
          file:bg-brand-50 file:text-brand-700
          hover:file:bg-brand-100"
      />
      {isUploading && <p className="mt-2 text-sm text-gray-500">アップロード中...</p>}
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
