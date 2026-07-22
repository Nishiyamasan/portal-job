'use client';

import {ReactNode} from 'react';

type AdminDetailModalProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function AdminDetailModal({isOpen, title, onClose, children, footer}: AdminDetailModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-6">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="max-h-[calc(90vh-11rem)] overflow-y-auto p-8">
          {children}
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t bg-gray-50 p-6">
          {footer}
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-900 px-6 py-2.5 font-bold text-white transition-colors hover:bg-gray-800"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

