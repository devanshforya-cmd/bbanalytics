'use client';

import React from 'react';
import { AlertTriangle, X, Info, CheckCircle, AlertCircle } from 'lucide-react';

export interface ConfirmModalDetail {
  label: string;
  value: string;
}

export interface ConfirmModalConsequence {
  text: string;
}

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  variant?: 'warning' | 'danger' | 'info' | 'success';
  icon?: React.ReactNode;
  details?: ConfirmModalDetail[];
  consequences?: string[];
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = false,
  variant = 'warning',
  icon,
  details,
  consequences,
  children,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const variantConfig = {
    warning: { iconBg: 'bg-amber-100', iconColor: 'text-amber-600', defaultIcon: <AlertTriangle className="w-5 h-5" />, confirmCls: 'bg-amber-600 hover:bg-amber-700' },
    danger: { iconBg: 'bg-rose-100', iconColor: 'text-rose-600', defaultIcon: <AlertCircle className="w-5 h-5" />, confirmCls: 'bg-rose-600 hover:bg-rose-700' },
    info: { iconBg: 'bg-blue-100', iconColor: 'text-blue-600', defaultIcon: <Info className="w-5 h-5" />, confirmCls: 'bg-blue-600 hover:bg-blue-700' },
    success: { iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', defaultIcon: <CheckCircle className="w-5 h-5" />, confirmCls: 'bg-emerald-600 hover:bg-emerald-700' },
  };
  const cfg = variantConfig[isDestructive ? 'danger' : variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-4">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-xl ${cfg.iconBg} ${cfg.iconColor} shrink-0`}>
              {icon || cfg.defaultIcon}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base leading-tight">{title}</h3>
              {message && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{message}</p>}
            </div>
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Details Table */}
        {details && details.length > 0 && (
          <div className="mx-5 mb-4 rounded-xl border border-slate-200 overflow-hidden">
            {details.map((d, i) => (
              <div key={i} className={`flex items-center justify-between px-3.5 py-2.5 text-xs ${i < details.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <span className="text-slate-500 font-medium">{d.label}</span>
                <span className="font-semibold text-slate-800 text-right ml-4">{d.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Consequences */}
        {consequences && consequences.length > 0 && (
          <div className="mx-5 mb-4">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">This will:</p>
            <ul className="space-y-1.5">
              {consequences.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                  <span className="text-slate-400 mt-0.5">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Extra Children (inline fields, etc.) */}
        {children && <div className="mx-5 mb-4">{children}</div>}

        {/* Actions */}
        <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 px-4 py-2.5 font-semibold text-xs text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-xl px-5 py-2.5 font-bold text-xs text-white shadow transition cursor-pointer ${cfg.confirmCls}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
