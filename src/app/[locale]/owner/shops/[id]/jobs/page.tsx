'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createJob, deleteJob, getShopById, getShopJobs, JobPost, updateJob } from '@/lib/api';
import { Link } from '@/i18n/routing';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { jobPostSchema, JobPostInput } from '@/lib/schemas';
import { Modal } from '@/components/ui/Modal';
import { Notification, NotificationType } from '@/components/Notification';
import { getMediaAssetUrl, getPrimaryMediaAsset } from '@/lib/media-assets';
import { uploadMediaImage } from '@/lib/media-upload';

export const runtime = 'edge';

function formatDateForInput(value?: string | null) {
  if (!value) return '';
  return value.slice(0, 10);
}

export default function ManageJobsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: shopId } = use(params);
  const t = useTranslations('ManageJobs');
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [shopName, setShopName] = useState('');
  const [shopApproved, setShopApproved] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImagePreviewUrl, setSelectedImagePreviewUrl] = useState<string | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: NotificationType; message: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<JobPostInput>({
    resolver: zodResolver(jobPostSchema),
    defaultValues: { status: 'open' }
  });

  const loadData = useCallback(async () => {
    try {
      const shop = await getShopById(shopId);
      if (shop) {
        setShopName(shop.name);
        setShopApproved(Boolean(shop.is_approved));
      }

      if (!shop?.is_approved) {
        setJobs([]);
        return;
      }

      const shopJobs = await getShopJobs(shopId);
      setJobs(shopJobs);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onSubmit = async (data: JobPostInput) => {
    const payload = {
      ...data,
      published_at: data.published_at || null,
    };

    try {
      const savedJob = currentJobId
        ? await updateJob(currentJobId, payload)
        : await createJob({ ...payload, shop_id: shopId });

      if (selectedImageFile) {
        await uploadMediaImage({
          file: selectedImageFile,
          assetType: 'job_image',
          shopId,
          jobPostId: savedJob.id,
        });
      }

      if (currentJobId) {
        setNotification({ type: 'success', message: t('updateSuccess') });
      } else {
        setNotification({ type: 'success', message: t('createSuccess') });
      }
      setIsModalOpen(false);
      setSelectedImageFile(null);
      setSelectedImagePreviewUrl(null);
      setCurrentImageUrl(null);
      loadData();
    } catch (error) {
      console.error(error);
      setNotification({ type: 'error', message: '保存に失敗しました。' });
    }
  };

  const handleDelete = (jobId: string) => {
    setDeleteModal(jobId);
  };

  const executeDelete = async () => {
    if (!deleteModal) return;
    const jobId = deleteModal;
    setDeleteModal(null);
    try {
      await deleteJob(jobId);
      setJobs(jobs.filter(j => j.id !== jobId));
      setNotification({ type: 'success', message: t('deleteSuccess') || '求人を削除しました。' });
    } catch (error) {
      console.error(error);
      setNotification({ type: 'error', message: '削除に失敗しました。' });
    }
  };

  const openModal = (job?: JobPost) => {
    setSelectedImageFile(null);
    setSelectedImagePreviewUrl(null);
    if (job) {
      setCurrentJobId(job.id);
      setCurrentImageUrl(getMediaAssetUrl(getPrimaryMediaAsset(job.media_assets, 'job_image')) || null);
      reset({
        title: job.title,
        description: job.description,
        employment_type: job.employment_type || '',
        location: job.location || '',
        status: job.status as 'open' | 'draft' | 'closed' | 'archived',
        published_at: formatDateForInput(job.published_at)
      });
    } else {
      setCurrentJobId(null);
      setCurrentImageUrl(null);
      reset({
        title: '',
        description: '',
        employment_type: '',
        location: '',
        status: 'open',
        published_at: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedImageFile(file);
    setSelectedImagePreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  if (isLoading) {
    return <div className="max-w-6xl mx-auto p-8 text-center text-gray-500">Loading...</div>;
  }

  if (!shopApproved) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="mb-4">
          <Link
            href="/owner"
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ← {t('backToDashboard')}
          </Link>
        </div>
        <div className="rounded-xl border bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">{shopName}</h1>
          <p className="mt-4 text-sm text-gray-600">{t('requiresApprovedShop')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}
      <Modal
        isOpen={!!deleteModal}
        title={t('confirmDelete')}
        message={t('confirmDeleteMessage') || 'この求人を削除してもよろしいですか？'}
        confirmLabel={t('delete') || '削除'}
        cancelLabel={t('cancel')}
        onConfirm={executeDelete}
        onCancel={() => setDeleteModal(null)}
        type="danger"
      />
      <div className="mb-10">
        <div>
          <div className="mb-4">
            <Link
              href="/owner"
              className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ← {t('backToDashboard')}
            </Link>
          </div>
          <h1 className="text-4xl font-bold text-gray-900">{shopName}</h1>
          <p className="text-gray-500 mt-2">{t('title')}</p>
        </div>
        <button
          onClick={() => openModal()}
          className="mt-6 bg-gray-900 text-white px-6 py-3 rounded-lg font-bold inline-flex items-center gap-2 hover:bg-gray-800 transition-colors"
        >
          <Plus size={20} />
          {t('createNew')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {jobs.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center text-gray-500">
            {t('noJobs')}
          </div>
        ) : (
          jobs.map((job) => {
            const jobImageUrl = getMediaAssetUrl(getPrimaryMediaAsset(job.media_assets, 'job_image'), 'f_auto,q_auto,c_fill,w_320,h_180');
            return (
            <div key={job.id} className="bg-white rounded-xl border p-4 md:p-6 flex flex-col gap-4 shadow-sm md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="aspect-video w-full overflow-hidden rounded-lg border bg-gray-100 md:w-40">
                  {jobImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={jobImageUrl} alt={job.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-gray-400">
                      求人画像なし
                    </div>
                  )}
                </div>
                <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-xl font-bold text-gray-900">{job.title}</h2>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${job.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {job.status}
                  </span>
                </div>
                <p className="text-gray-500 text-sm line-clamp-1">{job.description}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                  <span>{t('employmentType')}: {job.employment_type || '-'}</span>
                  <span>{t('location')}: {job.location || '-'}</span>
                </div>
              </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => openModal(job)}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Edit2 size={20} />
                </button>
                <button
                  onClick={() => handleDelete(job.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          )})
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 py-6 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[calc(100dvh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="shrink-0 border-b px-5 py-4 sm:px-8 sm:py-6">
              <h2 className="text-2xl font-bold">{currentJobId ? t('editTitle') : t('createTitle')}</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">求人画像</label>
                <div className="grid gap-4 md:grid-cols-[220px_1fr] md:items-start">
                  <div className="aspect-video overflow-hidden rounded-xl border bg-gray-100">
                    {selectedImagePreviewUrl || currentImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedImagePreviewUrl || currentImageUrl || ''}
                        alt="求人画像プレビュー"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
                        画像未設定
                      </div>
                    )}
                  </div>
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      disabled={isSubmitting}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-full file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
                    />
                    <p className="mt-2 text-xs text-gray-500">一覧・詳細と同じ16:9比率で表示します。URLは画面に表示されません。</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">{t('jobTitle')}</label>
                <input
                  {...register('title')}
                  className={`w-full border rounded-lg p-2.5 ${errors.title ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">{t('jobDescription')}</label>
                <p className="mb-2 text-xs text-gray-500">
                  {t('markdownHelp')}{' '}
                  <Link href="/markdown-guide" target="_blank" rel="noopener noreferrer" className="font-bold text-blue-600 hover:underline">
                    {t('markdownHelpMore')}
                  </Link>
                </p>
                <textarea
                  {...register('description')}
                  rows={8}
                  className={`w-full border rounded-lg p-2.5 ${errors.description ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.description && <p className="mt-1 text-xs text-red-500">{errors.description.message}</p>}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">{t('employmentType')}</label>
                  <input
                    {...register('employment_type')}
                    className={`w-full border rounded-lg p-2.5 ${errors.employment_type ? 'border-red-500' : 'border-gray-300'}`}
                    placeholder={t('employmentTypePlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">{t('location')}</label>
                  <input
                    {...register('location')}
                    className={`w-full border rounded-lg p-2.5 ${errors.location ? 'border-red-500' : 'border-gray-300'}`}
                    placeholder={t('locationPlaceholder')}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">{t('publishedAt')}</label>
                <input
                  type="date"
                  {...register('published_at')}
                  className={`w-full border rounded-lg p-2.5 ${errors.published_at ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.published_at && <p className="mt-1 text-xs text-red-500">{errors.published_at.message}</p>}
                <p className="mt-1 text-xs text-gray-500">{t('publishedAtHelp')}</p>
              </div>
              <div className="flex justify-end gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2 rounded-lg font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-8 py-2 bg-gray-900 text-white rounded-lg font-bold hover:bg-gray-800 transition-colors disabled:bg-gray-400"
                >
                  {isSubmitting ? '...' : t('save')}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
