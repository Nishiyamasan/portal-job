'use client';

import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

export type NotificationType = 'success' | 'error';

interface NotificationProps {
  type: NotificationType;
  message: string;
  onClose: () => void;
  duration?: number;
}

export const Notification: React.FC<NotificationProps> = ({
  type,
  message,
  onClose,
  duration = 5000,
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const bgColor = type === 'success' ? 'bg-green-600' : 'bg-red-600';
  const Icon = type === 'success' ? CheckCircle : AlertCircle;

  return (
    <div className="fixed top-6 right-6 z-[100] animate-slide-in-right pointer-events-none">
      <div className={`flex items-center gap-4 p-5 pr-6 rounded-[2rem] shadow-2xl shadow-black/10 pointer-events-auto border border-white/10 ${bgColor}`} role="alert">
        <div className="flex-shrink-0 bg-white/20 p-2 rounded-xl">
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="text-sm font-bold text-white tracking-wide pr-4">
          {message}
        </div>
        <button
          onClick={onClose}
          className="ml-auto p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all active:scale-90"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
