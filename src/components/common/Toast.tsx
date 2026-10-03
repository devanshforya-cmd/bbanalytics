'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X, RotateCcw } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastProps {
  type: ToastType;
  message: string;
  subtitle?: string;
  autoDismiss?: number;
  onClose?: () => void;
  id?: string;
  action?: ToastAction;
  undoable?: boolean;
  onUndo?: () => void;
  undoDurationMs?: number;
}

export interface ToastItem extends ToastProps {
  id: string;
}

// Global Event Bus
type ToastListener = (toasts: ToastItem[]) => void;
let activeToasts: ToastItem[] = [];
const listeners: Set<ToastListener> = new Set();

function notifyListeners() {
  listeners.forEach((l) => l([...activeToasts]));
}

function addToast(item: Omit<ToastItem, 'id'>): string {
  const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  activeToasts = [...activeToasts, { ...item, id }];
  notifyListeners();
  return id;
}

export const toast = {
  success: (message: string, subtitle?: string, action?: ToastAction) =>
    addToast({ type: 'success', message, subtitle, autoDismiss: 4000, action }),
  error: (message: string, subtitle?: string, action?: ToastAction) =>
    addToast({ type: 'error', message, subtitle, action }),
  info: (message: string, subtitle?: string, action?: ToastAction) =>
    addToast({ type: 'info', message, subtitle, autoDismiss: 5000, action }),
  warning: (message: string, subtitle?: string, action?: ToastAction) =>
    addToast({ type: 'warning', message, subtitle, autoDismiss: 6000, action }),
  undoable: (message: string, onUndo: () => void, subtitle?: string, undoDurationMs = 8000) =>
    addToast({ type: 'success', message, subtitle, autoDismiss: undoDurationMs, undoable: true, onUndo, undoDurationMs }),
  dismiss: (id: string) => {
    activeToasts = activeToasts.filter((t) => t.id !== id);
    notifyListeners();
  },
  clear: () => {
    activeToasts = [];
    notifyListeners();
  },
};

function ProgressBar({ durationMs, type }: { durationMs: number; type: ToastType }) {
  const [width, setWidth] = useState(100);
  const startRef = useRef(Date.now());
  const rafRef = useRef<number | null>(null);
  const barColors: Record<ToastType, string> = {
    success: 'bg-emerald-500',
    error: 'bg-rose-500',
    info: 'bg-blue-500',
    warning: 'bg-amber-500',
  };
  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const remaining = Math.max(0, 100 - (elapsed / durationMs) * 100);
      setWidth(remaining);
      if (remaining > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [durationMs]);
  return (
    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/10 rounded-b-2xl overflow-hidden">
      <div className={`h-full ${barColors[type]} transition-none`} style={{ width: `${width}%` }} />
    </div>
  );
}

function ToastNotification({ type, message, subtitle, autoDismiss, onClose, action, undoable, onUndo, undoDurationMs = 8000 }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 10); return () => clearTimeout(t); }, []);
  const dismiss = useCallback(() => { setLeaving(true); setTimeout(() => onClose?.(), 300); }, [onClose]);
  useEffect(() => {
    if (!autoDismiss || autoDismiss <= 0) return;
    const timer = setTimeout(dismiss, autoDismiss);
    return () => clearTimeout(timer);
  }, [autoDismiss, dismiss]);
  const handleUndo = () => { onUndo?.(); dismiss(); };
  const config: Record<ToastType, { bg: string; border: string; iconBg: string; icon: React.ReactNode; textColor: string }> = {
    success: { bg: 'bg-emerald-50', border: 'border-l-4 border-l-emerald-500 border border-emerald-200', iconBg: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle className="w-4 h-4" />, textColor: 'text-emerald-900' },
    error: { bg: 'bg-rose-50', border: 'border-l-4 border-l-rose-500 border border-rose-200', iconBg: 'bg-rose-100 text-rose-700', icon: <AlertCircle className="w-4 h-4" />, textColor: 'text-rose-900' },
    info: { bg: 'bg-blue-50', border: 'border-l-4 border-l-blue-500 border border-blue-200', iconBg: 'bg-blue-100 text-blue-700', icon: <Info className="w-4 h-4" />, textColor: 'text-blue-900' },
    warning: { bg: 'bg-amber-50', border: 'border-l-4 border-l-amber-500 border border-amber-200', iconBg: 'bg-amber-100 text-amber-700', icon: <AlertTriangle className="w-4 h-4" />, textColor: 'text-amber-900' },
  };
  const c = config[type];
  return (
    <div role="alert" className={`relative pointer-events-auto w-80 sm:w-96 rounded-2xl shadow-xl overflow-hidden ${c.bg} ${c.border} transition-all duration-300 ease-out ${visible && !leaving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
      <div className="flex items-start gap-3 p-3.5 pb-4">
        <div className={`p-1.5 rounded-lg shrink-0 ${c.iconBg}`}>{c.icon}</div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold leading-snug ${c.textColor}`}>{message}</p>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{subtitle}</p>}
          {(action || undoable) && (
            <div className="flex items-center gap-2 mt-2">
              {undoable && (
                <button type="button" onClick={handleUndo} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs">
                  <RotateCcw className="w-3 h-3" /> Undo
                </button>
              )}
              {action && (
                <button type="button" onClick={() => { action.onClick(); dismiss(); }} className={`text-[11px] font-bold underline underline-offset-2 transition ${c.textColor} hover:opacity-70`}>
                  {action.label}
                </button>
              )}
            </div>
          )}
        </div>
        <button type="button" onClick={dismiss} className="p-1 rounded-lg hover:bg-black/5 text-slate-400 hover:text-slate-600 transition shrink-0 -mt-0.5 -mr-0.5" title="Dismiss">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {autoDismiss && autoDismiss > 0 && <ProgressBar durationMs={undoable ? undoDurationMs : autoDismiss} type={type} />}
    </div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  useEffect(() => {
    const handler = (updated: ToastItem[]) => setToasts(updated);
    listeners.add(handler);
    setToasts([...activeToasts]);
    return () => { listeners.delete(handler); };
  }, []);
  if (toasts.length === 0) return null;
  return (
    <div aria-live="polite" className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 pointer-events-none max-w-[calc(100vw-2rem)]">
      {toasts.map((item) => (
        <ToastNotification key={item.id} {...item} onClose={() => toast.dismiss(item.id)} />
      ))}
    </div>
  );
}

export default ToastNotification;
