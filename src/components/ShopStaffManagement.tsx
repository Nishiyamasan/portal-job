'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  deleteShopMember,
  getShopById,
  getShopMembers,
  getShopPublicSettings,
  updateShopMember,
  updateShopPublicSettings,
} from '@/lib/api';
import { Shop } from '@/lib/content';
import { Link } from '@/i18n/routing';
import { Notification, NotificationType } from '@/components/Notification';
import { Modal } from '@/components/ui/Modal';

interface Member {
  id: string;
  display_name: string;
  role: string;
  employment_status: string;
  status: string;
  profile_id: string;
  display_order: number;
}

interface Props {
  shopId: string;
}

const ROLE_OPTIONS = ['owner', 'manager', 'staff', 'cast'];

function normalizeOrder(items: Member[]): Member[] {
  return items.map((item, index) => ({ ...item, display_order: index + 1 }));
}

function swap<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const copied = [...items];
  const tmp = copied[fromIndex];
  copied[fromIndex] = copied[toIndex];
  copied[toIndex] = tmp;
  return copied;
}

export function ShopStaffManagement({ shopId }: Props) {
  const t = useTranslations('ShopAdmin');
  const [shop, setShop] = useState<Shop | null>(null);
  const [publicSettings, setPublicSettings] = useState({ show_today_staff: false });
  const [members, setMembers] = useState<Member[]>([]);
  const [initialMembers, setInitialMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingStaffVisibility, setIsSavingStaffVisibility] = useState(false);
  const [isSavingMemberChanges, setIsSavingMemberChanges] = useState(false);
  const [notification, setNotification] = useState<{ type: NotificationType; message: string } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [shopData, settingsData, membersData] = await Promise.all([
          getShopById(shopId),
          getShopPublicSettings(shopId),
          getShopMembers(shopId) as Promise<Member[]>
        ]);
        const normalized = normalizeOrder(
          [...membersData].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
        );
        setShop(shopData);
        setPublicSettings(settingsData);
        setMembers(normalized);
        setInitialMembers(normalized);
      } catch (error) {
        console.error(error);
        setNotification({ type: 'error', message: t('updateError') });
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [shopId, t]);

  const dirtyMemberIds = useMemo(() => {
    const initialMap = new Map(initialMembers.map((member) => [member.id, member]));
    return members
      .filter((member) => {
        const before = initialMap.get(member.id);
        if (!before) return true;
        return (
          before.role !== member.role ||
          before.employment_status !== member.employment_status ||
          before.display_order !== member.display_order
        );
      })
      .map((member) => member.id);
  }, [initialMembers, members]);

  const hasDirtyChanges = dirtyMemberIds.length > 0;

  const statusLabel = (member: Member): string => {
    if (member.status === 'pending') return t('statusPending');
    if (member.status === 'rejected') return t('statusRejected');
    return member.employment_status === 'active' ? t('statusVisible') : t('statusHidden');
  };

  const roleLabel = (role: string): string => {
    if (role === 'owner') return t('roleOwner');
    if (role === 'manager') return t('roleManager');
    if (role === 'staff') return t('roleStaff');
    if (role === 'cast') return t('roleCast');
    return role;
  };

  const handleStaffVisibilityToggle = async (checked: boolean) => {
    const previous = publicSettings.show_today_staff;
    setPublicSettings({ show_today_staff: checked });
    setIsSavingStaffVisibility(true);
    setNotification(null);
    try {
      await updateShopPublicSettings(shopId, { show_today_staff: checked });
      setNotification({ type: 'success', message: checked ? t('staffListEnabled') : t('staffListDisabled') });
    } catch (e) {
      console.error(e);
      setPublicSettings({ show_today_staff: previous });
      setNotification({ type: 'error', message: t('updateError') });
    } finally {
      setIsSavingStaffVisibility(false);
    }
  };

  const updateMemberLocal = (memberId: string, updater: (member: Member) => Member) => {
    setMembers((current) => current.map((member) => (member.id === memberId ? updater(member) : member)));
  };

  const moveMember = (memberId: string, direction: 'up' | 'down') => {
    setMembers((current) => {
      const index = current.findIndex((member) => member.id === memberId);
      if (index < 0) return current;
      if (direction === 'up' && index === 0) return current;
      if (direction === 'down' && index === current.length - 1) return current;

      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      return normalizeOrder(swap(current, index, targetIndex));
    });
  };

  const refreshMembers = async () => {
    const membersData = await getShopMembers(shopId) as Member[];
    const normalized = normalizeOrder(
      [...membersData].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    );
    setMembers(normalized);
    setInitialMembers(normalized);
  };

  const handleApproveOrReject = async (memberId: string, status: 'approved' | 'rejected') => {
    try {
      await updateShopMember(shopId, memberId, {
        status,
        employment_status: status === 'approved' ? 'active' : 'inactive',
      });
      await refreshMembers();
      setNotification({ type: 'success', message: t('updateSuccess') });
    } catch (e) {
      console.error(e);
      setNotification({ type: 'error', message: t('updateError') });
    }
  };

  const handleSaveChanges = async () => {
    if (!hasDirtyChanges) {
      setNotification({ type: 'success', message: t('noChanges') });
      return;
    }

    setIsSavingMemberChanges(true);
    setNotification(null);
    try {
      const initialMap = new Map(initialMembers.map((member) => [member.id, member]));
      const dirtyMembers = members.filter((member) => {
        const before = initialMap.get(member.id);
        if (!before) return true;
        return (
          before.role !== member.role ||
          before.employment_status !== member.employment_status ||
          before.display_order !== member.display_order
        );
      });

      await Promise.all(
        dirtyMembers.map((member) =>
          updateShopMember(shopId, member.id, {
            role: member.role,
            employment_status: member.employment_status,
            display_order: member.display_order,
          })
        )
      );

      await refreshMembers();
      setNotification({ type: 'success', message: t('updateSuccess') });
    } catch (e) {
      console.error(e);
      setNotification({ type: 'error', message: t('updateError') });
    } finally {
      setIsSavingMemberChanges(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!removeTarget) return;
    try {
      await deleteShopMember(shopId, removeTarget.id);
      setRemoveTarget(null);
      await refreshMembers();
      setNotification({ type: 'success', message: t('updateSuccess') });
    } catch (e) {
      console.error(e);
      setNotification({ type: 'error', message: t('updateError') });
    }
  };

  if (isLoading) {
    return <div className="max-w-6xl mx-auto p-8 text-center text-gray-500">{t('loading')}</div>;
  }

  if (!shop) {
    return <div className="max-w-6xl mx-auto p-8 text-center text-gray-500">{t('shopNotFound')}</div>;
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
        isOpen={Boolean(removeTarget)}
        title={t('removeMemberTitle')}
        message={t('removeMemberConfirm')}
        confirmLabel={t('remove')}
        cancelLabel={t('cancel')}
        onConfirm={handleRemoveMember}
        onCancel={() => setRemoveTarget(null)}
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
          <h1 className="text-4xl font-bold text-gray-900">{shop.name}</h1>
          <p className="text-gray-500 mt-2">{t('title')}</p>
        </div>
      </div>

      <div className="space-y-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-pink-500">{t('staffVisibilityLabel')}</p>
              <h2 className="mt-2 text-2xl font-black text-gray-900">{t('staffVisibilityTitle')}</h2>
              <p className="mt-2 text-sm text-gray-500">{t('staffVisibilityDescription')}</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-3 rounded-full border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="text-sm font-bold text-gray-700">
                {publicSettings.show_today_staff ? t('visible') : t('hidden')}
              </span>
              <input
                type="checkbox"
                checked={publicSettings.show_today_staff}
                onChange={(e) => handleStaffVisibilityToggle(e.target.checked)}
                disabled={isSavingStaffVisibility}
                className="sr-only peer"
              />
              <span className="h-7 w-12 rounded-full bg-gray-300 after:block after:h-6 after:w-6 after:translate-x-0.5 after:translate-y-0.5 after:rounded-full after:bg-white after:shadow transition-colors peer-checked:bg-pink-500 peer-checked:after:translate-x-5 after:transition-transform" />
            </label>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm md:p-6">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-bold text-gray-800">{t('members')}</h2>
            <button
              onClick={handleSaveChanges}
              disabled={!hasDirtyChanges || isSavingMemberChanges}
              className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400 sm:w-auto"
            >
              {isSavingMemberChanges ? '...' : t('save')}
            </button>
          </div>

          <div className="space-y-4 md:hidden">
            {members.map((member, index) => (
              <div key={member.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-gray-900">{member.display_name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        member.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-700'
                          : member.status === 'rejected'
                            ? 'bg-gray-100 text-gray-700'
                            : member.employment_status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-700'
                      }`}>
                        {statusLabel(member)}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-gray-500">
                        {t('order')}: {member.display_order}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setRemoveTarget(member)}
                    disabled={member.role === 'owner'}
                    className="shrink-0 text-xs font-bold text-red-600 hover:underline disabled:text-gray-400 disabled:no-underline"
                  >
                    {t('remove')}
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-500">{t('role')}</label>
                    <select
                      value={member.role}
                      onChange={(e) => updateMemberLocal(member.id, (prev) => ({ ...prev, role: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {roleLabel(role)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-500">{t('status')}</label>
                    {member.status === 'approved' ? (
                      <select
                        value={member.employment_status}
                        onChange={(e) => updateMemberLocal(member.id, (prev) => ({ ...prev, employment_status: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="active">{t('statusVisible')}</option>
                        <option value="inactive">{t('statusHidden')}</option>
                      </select>
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-sm text-gray-600">
                        {statusLabel(member)}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold text-gray-500">{t('order')}</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => moveMember(member.id, 'up')}
                        disabled={index === 0}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 disabled:opacity-40"
                      >
                        {t('moveUp')}
                      </button>
                      <button
                        onClick={() => moveMember(member.id, 'down')}
                        disabled={index === members.length - 1}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 disabled:opacity-40"
                      >
                        {t('moveDown')}
                      </button>
                    </div>
                  </div>

                  {member.status === 'pending' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleApproveOrReject(member.id, 'approved')}
                        className="rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white"
                      >
                        {t('approve')}
                      </button>
                      <button
                        onClick={() => handleApproveOrReject(member.id, 'rejected')}
                        className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white"
                      >
                        {t('reject')}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="pb-4 font-semibold text-gray-600 text-sm">{t('memberName')}</th>
                  <th className="pb-4 font-semibold text-gray-600 text-sm">{t('role')}</th>
                  <th className="pb-4 font-semibold text-gray-600 text-sm">{t('status')}</th>
                  <th className="pb-4 font-semibold text-gray-600 text-sm">{t('order')}</th>
                  <th className="pb-4 font-semibold text-gray-600 text-sm">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member, index) => (
                  <tr key={member.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="py-4 text-sm font-medium text-gray-900">{member.display_name}</td>
                    <td className="py-4">
                      <select
                        value={member.role}
                        onChange={(e) => updateMemberLocal(member.id, (prev) => ({ ...prev, role: e.target.value }))}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {roleLabel(role)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-1 rounded ${
                          member.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : member.status === 'rejected'
                              ? 'bg-gray-100 text-gray-700'
                              : member.employment_status === 'active'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-slate-100 text-slate-700'
                        }`}>
                          {statusLabel(member)}
                        </span>
                        {member.status === 'approved' ? (
                          <select
                            value={member.employment_status}
                            onChange={(e) => updateMemberLocal(member.id, (prev) => ({ ...prev, employment_status: e.target.value }))}
                            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                          >
                            <option value="active">{t('statusVisible')}</option>
                            <option value="inactive">{t('statusHidden')}</option>
                          </select>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => moveMember(member.id, 'up')}
                          disabled={index === 0}
                          className="rounded border border-gray-300 px-2 py-1 text-xs font-bold text-gray-700 disabled:opacity-40"
                        >
                          {t('moveUp')}
                        </button>
                        <button
                          onClick={() => moveMember(member.id, 'down')}
                          disabled={index === members.length - 1}
                          className="rounded border border-gray-300 px-2 py-1 text-xs font-bold text-gray-700 disabled:opacity-40"
                        >
                          {t('moveDown')}
                        </button>
                      </div>
                    </td>
                    <td className="py-4 space-x-3">
                      {member.status === 'pending' ? (
                        <>
                          <button
                            onClick={() => handleApproveOrReject(member.id, 'approved')}
                            className="text-xs font-bold text-green-600 hover:underline"
                          >
                            {t('approve')}
                          </button>
                          <button
                            onClick={() => handleApproveOrReject(member.id, 'rejected')}
                            className="text-xs font-bold text-red-600 hover:underline"
                          >
                            {t('reject')}
                          </button>
                        </>
                      ) : null}
                      <button
                        onClick={() => setRemoveTarget(member)}
                        disabled={member.role === 'owner'}
                        className="text-xs font-bold text-red-600 hover:underline disabled:text-gray-400 disabled:no-underline"
                      >
                        {t('remove')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
