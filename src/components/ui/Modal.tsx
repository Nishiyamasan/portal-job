'use client';

import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'info';
}

export function Modal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  type = 'info',
}: ModalProps) {
  if (!isOpen) return null;

  const confirmButtonClass = type === 'danger'
    ? 'bg-red-600 hover:bg-red-700 shadow-red-500/30'
    : 'bg-gray-900 hover:bg-brand-600 shadow-brand-500/30';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full overflow-hidden animate-slide-in-bottom">
        <div className="px-8 pt-8 pb-4 flex justify-between items-start">
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">{title}</h2>
          <button
            onClick={onCancel}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-all active:scale-90"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-8 py-4">
          <p className="text-gray-500 leading-relaxed font-medium">{message}</p>
        </div>

        <div className="p-8 flex flex-col sm:flex-row-reverse gap-3">
          <button
            onClick={onConfirm}
            className={`w-full sm:w-auto px-8 py-4 text-white font-black text-sm rounded-2xl transition-all shadow-lg active:scale-95 ${confirmButtonClass}`}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="w-full sm:w-auto px-8 py-4 bg-gray-50 text-gray-600 font-bold text-sm rounded-2xl hover:bg-gray-100 transition-all active:scale-95"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
