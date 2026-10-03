'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CreditCard, AlertTriangle } from 'lucide-react';
import { Cheque, OfficerScorecard } from '@/lib/types';
import DrillDownShell from './DrillDownShell';
import EmptyState from '../EmptyState';
import { statusColor as getStatusColor } from '@/lib/ui-utils';

interface ChequesDrillDownProps {
  cheques: Cheque[];
  scorecards: OfficerScorecard[];
  calendarMode: 'BS' | 'AD';
  onClose: () => void;
}

export default function ChequesDrillDown({
  cheques,
  scorecards,
  calendarMode,
  onClose,
}: ChequesDrillDownProps) {
  const [activeTab, setActiveTab] = useState<number>(1);

  const totalAmount = cheques.reduce((acc, c) => acc + c.amount, 0);
  const overdueCount = cheques.filter(
    (c) => c.status === 'DELAYED' || c.status === 'BOUNCED'
  ).length;
  const inFieldCount = cheques.filter(
    (c) => c.status === 'COLLECTED_IN_FIELD'
  ).length;

  const tabs = [
    { id: 1, label: 'Cheque Ledger', count: cheques.length },
    { id: 2, label: 'Custody & Handover Gap' },
    { id: 3, label: 'Officer Collection Metrics' },
  ];

  return (
    <DrillDownShell
      isOpen={true}
      title="Cheques & Two-Step Custody Tracker"
      subtitle="Physical cheque custody audit, maturity dates, and office handover compliance"
      icon={CreditCard}
      iconBgColor="bg-amber-50"
      iconColor="text-amber-600"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onClose={onClose}
    >
      <div className="space-y-6">
        {/* Metric Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Cheques
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">{cheques.length}</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Value
            </div>
            <div className="text-xl font-black text-blue-600 mt-1">
              NPR {(totalAmount / 1000).toFixed(0)}K
            </div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Held in Field
            </div>
            <div className="text-xl font-black text-amber-600 mt-1">{inFieldCount}</div>
          </div>
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Overdue / Delayed
            </div>
            <div className="text-xl font-black text-rose-600 mt-1">{overdueCount}</div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 1 && (
          <ChequesRegisterTab cheques={cheques} calendarMode={calendarMode} />
        )}
        {activeTab === 2 && <ChequesStatusSummaryTab cheques={cheques} />}
        {activeTab === 3 && (
          <ChequesByOfficerTab cheques={cheques} scorecards={scorecards} />
        )}
      </div>
    </DrillDownShell>
  );
}

function ChequesRegisterTab({
  cheques,
  calendarMode,
}: {
  cheques: Cheque[];
  calendarMode: 'BS' | 'AD';
}) {
  const sorted = [...cheques].sort((a, b) => {
    const aOverdue = a.status === 'DELAYED' || a.status === 'BOUNCED' ? -1 : 1;
    const bOverdue = b.status === 'DELAYED' || b.status === 'BOUNCED' ? -1 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    return a.cashDateAd.localeCompare(b.cashDateAd);
  });

  if (cheques.length === 0) {
    return <EmptyState type="cheques" />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
            <th className="p-2.5">Cheque #</th>
            <th className="p-2.5">Vendor / Store</th>
            <th className="p-2.5 text-right">Amount (NPR)</th>
            <th className="p-2.5">Bank</th>
            <th className="p-2.5">Collected By</th>
            <th className="p-2.5">Collected Date</th>
            <th className="p-2.5">Cash Date</th>
            <th className="p-2.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {sorted.map((c) => {
            const isOverdue = c.status === 'DELAYED' || c.status === 'BOUNCED';
            const pillColor = getStatusColor(c.status);

            return (
              <tr
                key={c.id}
                className={`hover:bg-slate-50 ${isOverdue ? 'bg-rose-50/50' : ''}`}
              >
                <td className="p-2.5 font-mono font-bold text-slate-900">
                  <Link
                    href={`/offline-sales/cheques?search=${encodeURIComponent(c.chequeNumber)}`}
                    className="text-blue-600 hover:underline"
                  >
                    {c.chequeNumber}
                  </Link>
                </td>
                <td className="p-2.5 font-bold text-slate-900">
                  <Link
                    href={`/offline-sales/stores/${c.entityId || encodeURIComponent(c.storeName)}`}
                    className="hover:text-blue-600 hover:underline"
                  >
                    {c.storeName}
                  </Link>
                </td>
                <td className="p-2.5 text-right font-black text-slate-900">
                  NPR {c.amount.toLocaleString()}
                </td>
                <td className="p-2.5 text-slate-600">{c.bankName}</td>
                <td className="p-2.5 font-medium text-slate-700">
                  <Link
                    href={`/offline-sales/scorecard?officer=${encodeURIComponent(c.officerName)}`}
                    className="hover:text-blue-600 hover:underline"
                  >
                    {c.officerName}
                  </Link>
                </td>
                <td className="p-2.5 text-slate-600">
                  {calendarMode === 'BS' ? c.receivedDateBs : c.receivedDateAd}
                </td>
                <td className="p-2.5 font-semibold text-slate-800">
                  {calendarMode === 'BS' ? c.cashDateBs : c.cashDateAd}
                </td>
                <td className="p-2.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pillColor}`}>
                    {c.status.replace(/_/g, ' ')}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChequesStatusSummaryTab({ cheques }: { cheques: Cheque[] }) {
  const heldInFieldAlerts = cheques.filter((c) => {
    if (c.status === 'COLLECTED_IN_FIELD') {
      const rec = new Date(c.receivedDateAd).getTime();
      const now = Date.now();
      const diffDays = Math.floor((now - rec) / (1000 * 60 * 60 * 24));
      return diffDays >= 2;
    }
    return false;
  });

  const statusMap: Record<string, { count: number; total: number }> = {};
  cheques.forEach((c) => {
    if (!statusMap[c.status]) {
      statusMap[c.status] = { count: 0, total: 0 };
    }
    statusMap[c.status].count += 1;
    statusMap[c.status].total += c.amount;
  });

  return (
    <div className="space-y-6">
      {heldInFieldAlerts.length > 0 && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-rose-900 font-bold text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>Handover Gap Alert: {heldInFieldAlerts.length} Cheque(s) Held &gt;2 Days in Field</span>
          </div>
          <p className="text-xs text-rose-700">
            Field sales reps must surrender physical cheques to head office within 48 hours of collection.
          </p>
          <div className="divide-y divide-rose-200/60 pt-1">
            {heldInFieldAlerts.map((c) => (
              <div key={c.id} className="py-2 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-rose-950">{c.chequeNumber}</span> —{' '}
                  <span>{c.storeName}</span> (NPR {c.amount.toLocaleString()})
                </div>
                <div className="text-rose-800 font-semibold">
                  Held by <strong>{c.officerName}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="p-2.5">Cheque Status</th>
              <th className="p-2.5 text-right">Count</th>
              <th className="p-2.5 text-right">Total Amount (NPR)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {Object.entries(statusMap).map(([status, d]) => (
              <tr key={status} className="hover:bg-slate-50">
                <td className="p-2.5 font-bold text-slate-900">{status.replace(/_/g, ' ')}</td>
                <td className="p-2.5 text-right font-bold text-blue-600">{d.count}</td>
                <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                  NPR {d.total.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChequesByOfficerTab({
  cheques,
  scorecards,
}: {
  cheques: Cheque[];
  scorecards: OfficerScorecard[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
            <th className="p-2.5">Officer</th>
            <th className="p-2.5 text-right">Cheques Collected</th>
            <th className="p-2.5 text-right">Avg Handover Gap</th>
            <th className="p-2.5 text-right">Overdue Count</th>
            <th className="p-2.5 text-right">Bounced Count</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {scorecards.map((sc) => (
            <tr key={sc.officerId} className="hover:bg-slate-50">
              <td className="p-2.5 font-bold text-slate-900">{sc.officerName}</td>
              <td className="p-2.5 text-right font-bold">{sc.chequesCollected}</td>
              <td className="p-2.5 text-right font-semibold text-amber-700">
                {sc.avgChequeHandoverDays} days
              </td>
              <td className="p-2.5 text-right font-bold text-rose-600">{sc.chequesOverdue}</td>
              <td className="p-2.5 text-right font-medium text-slate-500">0</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
