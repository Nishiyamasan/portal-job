'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { StaffShift, upsertShift, updateShiftStatus, getShopMembers, ShopMemberResponse } from '@/lib/api';
import { Notification } from '@/components/Notification';

interface ShiftCalendarProps {
  shopId: string;
  initialShifts: StaffShift[];
  isOwner?: boolean;
  onRefresh: () => void;
}

export const ShiftCalendar: React.FC<ShiftCalendarProps> = ({
  shopId,
  initialShifts,
  isOwner = false,
  onRefresh
}) => {
  const t = useTranslations('Shifts');
  const [view, setView] = useState<'monthly' | 'weekly'>('monthly');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedShift, setSelectedShift] = useState<Partial<StaffShift> | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [members, setMembers] = useState<ShopMemberResponse[]>([]);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Time options: 0.0 to 32.0 (8:00 AM next day) in 0.5 steps
  const timeOptions = Array.from({ length: 65 }, (_, i) => i * 0.5);

  useEffect(() => {
    if (isOwner) {
      getShopMembers(shopId).then(setMembers).catch(console.error);
    }
  }, [shopId, isOwner]);

    const formatDateLocal = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatTime = (val: number) => {
    const h = Math.floor(val);
    const m = (val % 1) * 60;
    const displayH = h >= 24 ? h - 24 : h;
    const prefix = h >= 24 ? '+1d ' : '';
    return `${prefix}${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const handlePrev = () => {
    if (view === 'monthly') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    }
  };

  const handleNext = () => {
    if (view === 'monthly') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    }
  };

  const getShiftsForDate = useCallback((dateStr: string) => {
    return initialShifts.filter(s => s.business_date === dateStr);
  }, [initialShifts]);

  const handleDateClick = (date: Date) => {
    const dateStr = formatDateLocal(date);
    const shifts = getShiftsForDate(dateStr);

    if (isOwner) {
       // Owner just sees the day, they will select staff in the list or modal
       setSelectedShift({ business_date: dateStr, start_time: 21.0, end_time: 29.0, status: 'draft' });
    } else {
       const myShift = shifts.find(s => s.profile_id); // In real app, we'd check against current user ID
       setSelectedShift(myShift || { business_date: dateStr, start_time: 21.0, end_time: 29.0, status: 'draft' });
    }
  };

  const performSave = useCallback(async (shift: Partial<StaffShift>, isSubmit: boolean = false) => {
    if (!shift.business_date) return;
    setIsSaving(true);
    try {
      const status = isSubmit ? 'submitted' : (shift.status || 'draft');
      await upsertShift(shopId, {
        profile_id: shift.profile_id,
        business_date: shift.business_date,
        start_time: shift.start_time || 0,
        end_time: shift.end_time || 0,
        note: shift.note || '',
        status: status
      });
      if (isSubmit) {
        setNotification({ message: t('submitSuccess'), type: 'success' });
        setSelectedShift(null);
      }
      onRefresh();
    } catch (err) {
      console.error('Error auto-saving shift:', err);
      // Don't show error notification for background auto-saves unless critical
    } finally {
      setIsSaving(false);
    }
  }, [shopId, onRefresh, t]);

  const triggerAutoSave = useCallback((updatedShift: Partial<StaffShift>) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    // Only auto-save if it's a draft
    if (updatedShift.status !== 'draft' && !isOwner) return;

    autoSaveTimerRef.current = setTimeout(() => {
      performSave(updatedShift);
    }, 1000); // 1 second debounce
  }, [isOwner, performSave]);

  const handleShiftChange = (updates: Partial<StaffShift>) => {
    const newShift = { ...selectedShift, ...updates };
    setSelectedShift(newShift);
    triggerAutoSave(newShift);
  };

  const handleApprove = async (shift: StaffShift) => {
    try {
      await updateShiftStatus(shopId, shift.id, 'approved');
      setNotification({ message: t('approveSuccess'), type: 'success' });
      onRefresh();
    } catch (err) {
      console.error('Error approving shift:', err);
      setNotification({ message: 'Error approving shift', type: 'error' });
    }
  };

  const renderWeekly = () => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    return (
      <div className="grid grid-cols-7 gap-2 p-2">
        {Array.from({ length: 7 }).map((_, i) => {
          const d = new Date(startOfWeek);
          d.setDate(startOfWeek.getDate() + i);
          const dateStr = formatDateLocal(d);
          const shifts = getShiftsForDate(dateStr);
          const isToday = formatDateLocal(new Date()) === dateStr;

          return (
            <div
              key={i}
              onClick={() => handleDateClick(d)}
              className={`p-2 border rounded-lg cursor-pointer transition-colors min-h-[100px] ${
                isToday ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 hover:bg-white/5'
              }`}
            >
              <div className="text-xs text-white/50">{d.toLocaleDateString('ja-JP', { weekday: 'short' })}</div>
              <div className="text-lg font-bold">{d.getDate()}</div>
              <div className="mt-1 space-y-1">
                {shifts.map(s => (
                  <div key={s.id} className={`text-[9px] px-1 rounded truncate ${
                    s.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                    s.status === 'submitted' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {isOwner && <span className="font-bold mr-1">{s.profile?.display_name}:</span>}
                    {formatTime(s.start_time)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderMonthly = () => {
    const days = daysInMonth(currentDate);
    const firstDay = firstDayOfMonth(currentDate);
    const cells = [];

    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="p-4" />);
    }

    for (let d = 1; d <= days; d++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), d);
      const dateStr = formatDateLocal(date);
      const shifts = getShiftsForDate(dateStr);
      const isToday = formatDateLocal(new Date()) === dateStr;

      cells.push(
        <div
          key={d}
          onClick={() => handleDateClick(date)}
          className={`p-2 border h-24 md:h-32 cursor-pointer transition-colors overflow-hidden ${
            isToday ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 hover:bg-white/5'
          }`}
        >
          <div className="text-sm font-medium mb-1">{d}</div>
          <div className="space-y-1">
            {shifts.slice(0, 3).map(s => (
              <div key={s.id} className={`text-[9px] p-0.5 rounded truncate ${
                s.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                s.status === 'submitted' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
              }`}>
                {isOwner && <span className="font-bold mr-1">{s.profile?.display_name}:</span>}
                {formatTime(s.start_time)}
              </div>
            ))}
            {shifts.length > 3 && <div className="text-[8px] text-white/30">+{shifts.length - 3} more</div>}
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-7 border-t border-l border-white/10">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="p-2 border-r border-b border-white/10 text-center text-xs font-bold text-white/50 bg-white/5">
            {day}
          </div>
        ))}
        {cells.map((cell, idx) => (
          <div key={idx} className="border-r border-b border-white/10">
            {cell}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold">
            {currentDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' })}
          </h2>
          <div className="flex bg-white/10 p-1 rounded-lg">
            <button
              onClick={() => setView('monthly')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${view === 'monthly' ? 'bg-white/20' : 'hover:bg-white/5'}`}
            >
              {t('monthly')}
            </button>
            <button
              onClick={() => setView('weekly')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${view === 'weekly' ? 'bg-white/20' : 'hover:bg-white/5'}`}
            >
              {t('weekly')}
            </button>
          </div>
          {isSaving && <span className="text-xs text-brand-500 animate-pulse">Saving...</span>}
        </div>
        <div className="flex space-x-2">
          <button onClick={handlePrev} className="p-2 bg-white/10 rounded-full hover:bg-white/20">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 bg-white/10 rounded-md text-xs hover:bg-white/20">
            {t('today')}
          </button>
          <button onClick={handleNext} className="p-2 bg-white/10 rounded-full hover:bg-white/20">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        {view === 'monthly' ? renderMonthly() : renderWeekly()}
      </div>

      {/* Entry Modal */}
      {selectedShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/20 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold">{selectedShift.business_date}</h3>
              <button onClick={() => setSelectedShift(null)} className="text-white/50 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-4">
              {isOwner && (
                <div className="space-y-1">
                  <label className="text-xs text-white/50 font-bold uppercase">Staff Member</label>
                  <select
                    value={selectedShift.profile_id || ''}
                    onChange={(e) => {
                      const pid = e.target.value;
                      const existing = getShiftsForDate(selectedShift.business_date!).find(s => s.profile_id === pid);
                      setSelectedShift(existing || { ...selectedShift, profile_id: pid, id: undefined, status: 'draft' });
                    }}
                    className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    <option value="">Select Staff...</option>
                    {members.map(m => <option key={m.profile_id} value={m.profile_id}>{m.display_name}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-white/50 font-bold uppercase">{t('startTime')}</label>
                  <select
                    value={selectedShift.start_time}
                    onChange={(e) => handleShiftChange({start_time: parseFloat(e.target.value)})}
                    className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
                    disabled={selectedShift.status !== 'draft' && !isOwner}
                  >
                    {timeOptions.map(timeVal => <option key={timeVal} value={timeVal}>{formatTime(timeVal)}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-white/50 font-bold uppercase">{t('endTime')}</label>
                  <select
                    value={selectedShift.end_time}
                    onChange={(e) => handleShiftChange({end_time: parseFloat(e.target.value)})}
                    className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
                    disabled={selectedShift.status !== 'draft' && !isOwner}
                  >
                    {timeOptions.map(timeVal => <option key={timeVal} value={timeVal}>{formatTime(timeVal)}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-white/50 font-bold uppercase">{t('note')}</label>
                <textarea
                  value={selectedShift.note || ''}
                  onChange={(e) => handleShiftChange({note: e.target.value})}
                  className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none h-20"
                  disabled={selectedShift.status !== 'draft' && !isOwner}
                />
              </div>

              <div className="flex items-center space-x-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
                  selectedShift.status === 'approved' ? 'bg-green-500 text-black' :
                  selectedShift.status === 'submitted' ? 'bg-blue-500 text-white' : 'bg-white/20 text-white/50'
                }`}>
                  {selectedShift.status ? t(selectedShift.status as 'draft' | 'submitted' | 'approved') : t('draft')}
                </span>
                {isSaving && <span className="text-[10px] text-brand-500 animate-pulse">Auto-saving...</span>}
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              {selectedShift.status === 'draft' && (
                <button
                  onClick={() => performSave(selectedShift, true)}
                  className="flex-1 py-3 rounded-xl font-bold bg-gradient-to-r from-brand-500 to-amber-500 text-white shadow-lg shadow-brand-500/25 transition-all active:scale-[0.98]"
                >
                  {t('submit')}
                </button>
              )}
              {isOwner && selectedShift.id && selectedShift.status === 'submitted' && (
                <button
                  onClick={() => handleApprove(selectedShift as StaffShift)}
                  className="flex-1 py-3 rounded-xl font-bold bg-green-600 hover:bg-green-500 text-white transition-all shadow-lg shadow-green-500/25"
                >
                  {t('approve')}
                </button>
              )}
              {isOwner && selectedShift.id && selectedShift.status === 'approved' && (
                <button
                  onClick={() => handleShiftChange({status: 'draft'})}
                  className="flex-1 py-3 rounded-xl font-bold bg-white/10 hover:bg-white/20 text-white border border-white/10"
                >
                  {t('backToDraft')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
