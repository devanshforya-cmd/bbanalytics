'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import { Customer } from '@/lib/types';
import SlideOverPanel from '@/components/common/SlideOverPanel';
import { toast } from '@/components/common/Toast';
import {
  User,
  Phone,
  MapPin,
  ShoppingBag,
  RotateCcw,
  MessageSquareWarning,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

interface CustomerQuickViewPanelProps {
  customer: Customer | null;
  isOpen: boolean;
  onClose: () => void;
  level?: 1 | 2;
}

export default function CustomerQuickViewPanel({
  customer,
  isOpen,
  onClose,
  level = 1,
}: CustomerQuickViewPanelProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'interactions'>('overview');

  if (!customer) return null;

  const orders = db.getOrders().filter((o) => o.customerPhone === customer.phone);
  const returns = db.getReturns().filter((r) => r.customerPhone === customer.phone);
  const feedback = db.getFeedback().filter((f) => f.customerPhone === customer.phone);
  const totalSpend = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  const karmaColor =
    customer.karmaScore >= 70
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : customer.karmaScore >= 40
      ? 'bg-amber-100 text-amber-800 border-amber-200'
      : 'bg-rose-100 text-rose-800 border-rose-200';

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={onClose}
      title={customer.name}
      subtitle={`Customer 360 · ${customer.phone}`}
      width="lg"
      level={level}
      footer={
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/customers/${customer.phone}`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition"
          >
            <span>View Full 360 Profile</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => {
              toast.info('Customer Flagged', `${customer.name} flagged for supervisory review`);
              onClose();
            }}
            className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition"
          >
            Flag Account
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-5 text-xs">
        {/* Karma Header Card */}
        <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-base">{customer.name}</h3>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${karmaColor}`}>
                Karma: {customer.karmaScore}
              </span>
            </div>
            <p className="text-white/60 text-xs mt-1 flex items-center gap-1.5">
              <Phone className="w-3 h-3" />
              {customer.phone}
              <span>·</span>
              <MapPin className="w-3 h-3" />
              {customer.city || customer.province || 'Nepal'}
            </p>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-white/50 block">Segment</span>
            <span className="text-sm font-bold text-blue-400">{customer.segment}</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200">
          {(['overview', 'orders', 'interactions'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`pb-2.5 px-3 font-bold text-xs uppercase tracking-wider transition border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Orders</span>
                <span className="text-lg font-black text-slate-900">{customer.totalOrders}</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Spend</span>
                <span className="text-lg font-black text-emerald-700">₹{totalSpend.toLocaleString()}</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Returns</span>
                <span className="text-lg font-black text-rose-700">{customer.totalReturns}</span>
              </div>
            </div>

            {customer.activeFlags && customer.activeFlags.length > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                <p className="text-[11px] font-bold text-rose-900 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Active Flags
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {customer.activeFlags.map((flag, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-rose-200 text-rose-900 text-[10px] font-bold">
                      {flag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab Content: Orders */}
        {activeTab === 'orders' && (
          <div className="space-y-2">
            {orders.length === 0 ? (
              <p className="text-slate-400 text-center py-6">No orders found for this customer.</p>
            ) : (
              orders.map((o) => (
                <div key={o.id} className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-900 text-xs">#{o.orderNumber}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{o.orderDateBs} · {o.platform}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-slate-900 text-xs">₹{o.totalAmount.toLocaleString()}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 font-bold text-slate-700">
                      {o.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab Content: Interactions */}
        {activeTab === 'interactions' && (
          <div className="space-y-2">
            {feedback.length === 0 && returns.length === 0 ? (
              <p className="text-slate-400 text-center py-6">No logged feedback or return incidents.</p>
            ) : (
              <>
                {feedback.map((f) => (
                  <div key={f.id} className="p-3 rounded-xl border border-slate-200 bg-white space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">
                        {f.type}
                      </span>
                      <span className="text-[10px] text-slate-400">{f.dateReceivedBs}</span>
                    </div>
                    <p className="text-slate-700 text-xs leading-relaxed">&ldquo;{f.fullText}&rdquo;</p>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </SlideOverPanel>
  );
}
