import { callGoApi } from './api';
import { type MediaAssetType } from './media-assets';

interface CloudinaryUploadIntent {
  provider: 'cloudinary';
  cloud_name: string;
  api_key: string;
  timestamp: number;
  signature: string;
  folder: string;
  context: string;
  tags: string;
}

type UploadIntent = CloudinaryUploadIntent;

interface UploadMediaImageInput {
  file: File;
  assetType: MediaAssetType;
  shopId?: string;
  jobPostId?: string;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export async function uploadMediaImage({
  file,
  assetType,
  shopId,
  jobPostId,
}: UploadMediaImageInput): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('JPEG、PNG、WebP、HEIC形式の画像を選択してください。');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('画像サイズは5MB以下にしてください。');
  }

  const intent = await callGoApi<UploadIntent>('/api/v1/media/upload-intent', {
    method: 'POST',
    body: JSON.stringify({
      asset_type: assetType,
      shop_id: shopId,
      job_post_id: jobPostId,
    }),
  });

  if (intent.provider !== 'cloudinary') {
    throw new Error(`Unsupported media provider: ${intent.provider}`);
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', intent.api_key);
  formData.append('timestamp', intent.timestamp.toString());
  formData.append('signature', intent.signature);
  formData.append('folder', intent.folder);
  formData.append('context', intent.context);
  formData.append('tags', intent.tags);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${intent.cloud_name}/image/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error('Failed to upload image');
  }

  const uploaded = await response.json();
  const secureUrl = String(uploaded.secure_url ?? '');

  if (!secureUrl) {
    throw new Error('Upload response did not include an image URL');
  }

  await callGoApi('/api/v1/media/assets', {
    method: 'POST',
    body: JSON.stringify({
      asset_type: assetType,
      provider: intent.provider,
      url: secureUrl,
      shop_id: shopId,
      job_post_id: jobPostId,
      storage_path: uploaded.public_id,
      mime_type: uploaded.resource_type && uploaded.format
        ? `${uploaded.resource_type}/${uploaded.format}`
        : undefined,
      bytes: uploaded.bytes ? String(uploaded.bytes) : undefined,
      width: uploaded.width ? String(uploaded.width) : undefined,
      height: uploaded.height ? String(uploaded.height) : undefined,
      cloudinary_public_id: uploaded.public_id,
      asset_metadata: uploaded,
    }),
  });

  return secureUrl;
}
