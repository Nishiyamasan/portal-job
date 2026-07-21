'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { getJobSeekerProfile, updateJobSeekerProfile, MediaAsset } from '@/lib/api';
import { Link } from '@/i18n/routing';
import { Notification, NotificationType } from '@/components/Notification';

export const runtime = 'edge';

const SKILL_OPTIONS = [
  '接客スタッフ',
  'マネジメント代行',
  '調理スタッフ',
  'イベントスタッフ',
  'パフォーマー',
  'DJ',
  'Dancer',
  'MC',
  'エントランス対応',
  '語学サポート',
];

export default function JobSeekerProfilePage() {
  const t = useTranslations('JobSeeker');
  const [formData, setFormData] = useState<{
    bio: string;
    desired_roles: string[];
    availability_note: string;
    is_open_to_work: boolean;
    media_assets?: MediaAsset[];
  }>({
    bio: '',
    desired_roles: [],
    availability_note: '',
    is_open_to_work: true,
    media_assets: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: NotificationType; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfileData = async () => {
    try {
      const data = await getJobSeekerProfile();

      if (data) {
        setFormData({
          bio: data.bio || '',
          desired_roles: data.desired_roles || [],
          availability_note: data.availability_note || '',
          is_open_to_work: data.is_open_to_work ?? true,
          media_assets: data.media_assets || [],
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProfileData();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleRoleToggle = (role: string) => {
    setFormData(prev => ({
      ...prev,
      desired_roles: prev.desired_roles.includes(role)
        ? prev.desired_roles.filter(r => r !== role)
        : [...prev.desired_roles, role],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await updateJobSeekerProfile(formData);
      setNotification({ type: 'success', message: t('updateSuccess') });
    } catch (error) {
      console.error(error);
      setNotification({ type: 'error', message: t('updateError') });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="max-w-2xl mx-auto p-8 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}
      <div className="mb-10">
        <Link
          href="/profile"
          className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          ← {t('backToProfile')}
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">{t('title')}</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-8">


        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center">
            <input
              id="isOpenToWork"
              name="is_open_to_work"
              type="checkbox"
              checked={formData.is_open_to_work}
              onChange={handleChange}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
            />
            <label htmlFor="isOpenToWork" className="ml-2 block text-sm font-semibold text-gray-700 cursor-pointer">
              {t('isOpenToWork')}
            </label>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              {t('desiredRoles')}
            </label>
            <div className="grid grid-cols-2 gap-3">
              {SKILL_OPTIONS.map((skill) => (
                <div key={skill} className="flex items-center">
                  <input
                    id={`skill-${skill}`}
                    type="checkbox"
                    checked={formData.desired_roles.includes(skill)}
                    onChange={() => handleRoleToggle(skill)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                  />
                  <label htmlFor={`skill-${skill}`} className="ml-2 block text-sm text-gray-700 cursor-pointer">
                    {skill}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="bio" className="block text-sm font-semibold text-gray-700 mb-2">
              {t('bio')}
            </label>
            <textarea
              id="bio"
              name="bio"
              value={formData.bio}
              onChange={handleChange}
              rows={5}
              className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
            />
          </div>

          <div>
            <label htmlFor="availability" className="block text-sm font-semibold text-gray-700 mb-2">
              {t('availability')}
            </label>
            <textarea
              id="availability"
              name="availability_note"
              value={formData.availability_note}
              onChange={handleChange}
              rows={3}
              className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
            />
          </div>

          <div className="pt-6">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gray-900 text-white font-bold py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400"
            >
              {isSubmitting ? '...' : t('save')}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
