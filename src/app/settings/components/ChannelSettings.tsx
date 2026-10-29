'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/db/db-service';
import { averageDeliveryTime } from '@/lib/dashboard-metrics';

export default function ChannelSettings() {
  const [, refresh] = useState(0);
  useEffect(() => { const update = () => refresh(value => value + 1); window.addEventListener('bb-db-updated', update); return () => window.removeEventListener('bb-db-updated', update); }, []);
  const orders = db.getOrders();
  const platforms = [...new Set(['Instagram', 'WhatsApp', 'Messenger', 'TikTok', 'Website', 'Walk-in', 'Phone Call', 'Pathao Bazaar', 'Field Order', ...orders.map(order => order.platform)])];
  const methods = [...new Set(['Standard', 'Pathao', 'InDrive', 'Yango', 'Pick-up', ...orders.map(order => order.deliveryMethod)])];
  return <div className="space-y-6">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <h3 className="text-base font-bold text-slate-900">Sales channel usage</h3>
      <p className="text-xs text-slate-500">Channels used for order attribution. Messaging accounts are not connected automatically.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{platforms.map(platform => {
        const count = orders.filter(order => order.platform === platform).length;
        return <div key={platform} className="rounded-xl border border-slate-200 p-4 text-xs"><strong>{platform}</strong><p className="text-slate-500 mt-1">{count} orders · {orders.length ? (count / orders.length * 100).toFixed(1) : '0.0'}% of recorded orders</p></div>;
      })}</div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <h3 className="text-base font-bold text-slate-900">Delivery methods</h3>
      <p className="text-xs text-slate-500">Delivery times use completed orders with a recorded delivery date. Courier accounts are managed separately.</p>
      <div className="space-y-2">{methods.map(method => {
        const matching = orders.filter(order => order.deliveryMethod === method);
        return <div key={method} className="rounded-xl border border-slate-200 p-4 text-xs flex flex-wrap justify-between gap-2"><strong>{method}</strong><span>{matching.length} orders · {averageDeliveryTime(matching)}</span></div>;
      })}</div>
    </section>
  </div>;
}
