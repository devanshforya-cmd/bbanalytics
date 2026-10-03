'use client';

import React, { useEffect, useState } from 'react';
import { BarChart2, Camera, ShoppingBag, FileText, Phone, StickyNote, DollarSign, X, Zap } from 'lucide-react';
import { BeatItem } from '@/lib/types';

interface ActionCard {
  id: string;
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  done: boolean;
  onClick: () => void;
}

interface StoreActionDashboardProps {
  beat: BeatItem;
  checkInTime: string;
  onCheckOut: () => void;
  onAction: (action: string) => void;
  completedActions: Set<string>;
}

function LiveTimer({ startTime }: { startTime: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(startTime).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime]);
  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  return <span className="font-mono text-sm font-bold text-blue-600">{min}:{sec.toString().padStart(2, '0')}</span>;
}

export default function StoreActionDashboard({ beat, checkInTime, onCheckOut, onAction, completedActions }: StoreActionDashboardProps) {
  const actions: ActionCard[] = [
    { id: 'STOCK_COUNT',   icon: <BarChart2 className="w-6 h-6" />,    label: 'Stock Count',     sublabel: 'Count shelf units',      done: completedActions.has('STOCK_COUNT'),   onClick: () => onAction('STOCK_COUNT') },
    { id: 'SHELF_PHOTOS',  icon: <Camera className="w-6 h-6" />,       label: 'Shelf Photos',    sublabel: 'Before & after capture', done: completedActions.has('SHELF_PHOTOS'),  onClick: () => onAction('SHELF_PHOTOS') },
    { id: 'SECONDARY_ORDER', icon: <ShoppingBag className="w-6 h-6" />, label: 'Collect Order',  sublabel: 'Secondary booking',      done: completedActions.has('SECONDARY_ORDER'), onClick: () => onAction('SECONDARY_ORDER') },
    { id: 'COLLECT_DOC',   icon: <FileText className="w-6 h-6" />,     label: 'Upload Doc',      sublabel: 'PO / delivery receipt',  done: completedActions.has('COLLECT_DOC'),   onClick: () => onAction('COLLECT_DOC') },
    { id: 'LOG_CALL',      icon: <Phone className="w-6 h-6" />,        label: 'Log Call',        sublabel: 'Record interaction',     done: completedActions.has('LOG_CALL'),      onClick: () => onAction('LOG_CALL') },
    { id: 'ADD_NOTE',      icon: <StickyNote className="w-6 h-6" />,   label: 'Add Note',        sublabel: 'Quick store note',       done: completedActions.has('ADD_NOTE'),      onClick: () => onAction('ADD_NOTE') },
    { id: 'PAYMENT',       icon: <DollarSign className="w-6 h-6" />,   label: 'Payment Follow',  sublabel: 'Log payment status',     done: completedActions.has('PAYMENT'),       onClick: () => onAction('PAYMENT') },
  ];

  const hasUpsells = beat.urgencySignals?.some((s) => s.type === 'LOW_STOCK' || s.type === 'OFFER');

  return (
    <div className="fixed inset-0 z-40 bg-slate-50 flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="font-bold text-slate-900 text-sm truncate">{beat.storeName}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <LiveTimer startTime={checkInTime} />
          <button
            type="button"
            onClick={onCheckOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition shadow-sm"
          >
            <X className="w-3.5 h-3.5" />
            Check Out
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Sales Assist Banner */}
        {hasUpsells && (
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-3.5 flex items-center justify-between text-white">
            <div className="flex items-center gap-2.5">
              <Zap className="w-5 h-5 text-yellow-300 shrink-0" />
              <div>
                <p className="text-xs font-bold">Sales Assist</p>
                <p className="text-[11px] text-blue-200">
                  {beat.urgencySignals?.filter(s => s.type === 'LOW_STOCK').length || 0} restocks ·{' '}
                  {beat.urgencySignals?.filter(s => s.type === 'OFFER').length || 0} promotions active
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onAction('SALES_ASSIST')}
              className="text-[11px] font-bold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition"
            >
              View Details →
            </button>
          </div>
        )}

        {/* Action Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={a.onClick}
              className={`
                relative flex flex-col items-start gap-1 p-4 rounded-2xl border text-left
                transition-all active:scale-[0.97] shadow-xs
                ${a.done
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'
                }
              `}
            >
              <div className={`p-2 rounded-xl mb-1 ${a.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                {a.icon}
              </div>
              <span className={`text-xs font-bold ${a.done ? 'text-emerald-800' : 'text-slate-900'}`}>{a.label}</span>
              <span className="text-[10px] text-slate-400">{a.sublabel}</span>
              {a.done && (
                <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
              {!a.done && beat.pendingTasks?.some(t => t.toLowerCase().includes(a.label.toLowerCase().slice(0, 5))) && (
                <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-amber-500" />
              )}
            </button>
          ))}
        </div>

        {/* Manager Note */}
        {beat.managerNotes && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider mb-1.5">Manager Note</p>
            <p className="text-xs text-slate-700 leading-relaxed">&ldquo;{beat.managerNotes}&rdquo;</p>
          </div>
        )}

        {/* Completion Progress */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-600">Visit Progress</p>
            <p className="text-xs font-bold text-slate-900">{completedActions.size} / {actions.length} done</p>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${(completedActions.size / actions.length) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
