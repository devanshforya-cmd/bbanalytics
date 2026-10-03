'use client';

import React, { useState } from 'react';
import { Share2, Truck, Plus, Check, ExternalLink } from 'lucide-react';
import { toast } from '@/components/common/Toast';

export default function ChannelSettings() {
  const [channels, setChannels] = useState([
    { id: 'insta', name: 'Instagram DM', type: 'Social Commerce', active: true, ordersShare: '55%' },
    { id: 'wa', name: 'WhatsApp Catalog', type: 'Direct Chat', active: true, ordersShare: '22%' },
    { id: 'tt', name: 'TikTok Shop / Comments', type: 'Social Commerce', active: true, ordersShare: '12%' },
    { id: 'web', name: 'E-commerce Website', type: 'Direct D2C', active: true, ordersShare: '8%' },
    { id: 'msg', name: 'Facebook Messenger', type: 'Social Commerce', active: true, ordersShare: '3%' },
  ]);

  const [deliveryPartners, setDeliveryPartners] = useState([
    { name: 'Pathao Logistics Express', coverage: 'Inside Valley (Kathmandu, Lalitpur, Bhaktapur)', avgDeliveryTime: '24 Hours', active: true },
    { name: 'Nepal Express Courier', coverage: 'Outside Valley Hubs (Pokhara, Butwal, Biratnagar, Narayangarh)', avgDeliveryTime: '48-72 Hours', active: true },
    { name: 'In-House Field Rider', coverage: 'Direct Urgent Store Restocking', avgDeliveryTime: 'Same Day', active: true },
  ]);

  const toggleChannel = (id: string) => {
    setChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c))
    );
    toast.info('Channel settings updated.');
  };

  return (
    <div className="space-y-6">
      {/* Sales Channels */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Active Sales Platforms</h3>
            <p className="text-xs text-slate-500">
              Integrations for WhatsApp Extractor, manual order bookings, and social attribution.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {channels.map((c) => (
            <div
              key={c.id}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-3 text-xs"
            >
              <div>
                <span className="font-bold text-slate-900">{c.name}</span>
                <p className="text-[11px] text-slate-500">{c.type} • {c.ordersShare} volume</p>
              </div>
              <button
                type="button"
                onClick={() => toggleChannel(c.id)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                  c.active
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-slate-200 text-slate-600 border-slate-300'
                }`}
              >
                {c.active ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Delivery Logistics */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Logistics &amp; Delivery Partners</h3>
            <p className="text-xs text-slate-500">
              Courier services configured for door-to-door delivery failure tracking and dispatch SLA monitoring.
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {deliveryPartners.map((dp) => (
            <div
              key={dp.name}
              className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
            >
              <div>
                <span className="font-bold text-slate-900">{dp.name}</span>
                <p className="text-[11px] text-slate-500 mt-0.5">{dp.coverage}</p>
              </div>
              <div className="flex items-center gap-3 self-end sm:self-center">
                <span className="text-slate-600 font-medium">SLA: {dp.avgDeliveryTime}</span>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded text-[10px]">
                  Active
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
