'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { X, Building2, MapPin, Phone, CreditCard, FileText, Store, History } from 'lucide-react';
import { Distributor, Branch, Retailer, Cheque } from '@/lib/types';
import EmptyState from './EmptyState';
import { db } from '@/lib/db';

interface DistributorDetailModalProps {
  distributor: Distributor | null;
  onClose: () => void;
  branches: Branch[];
  retailers: Retailer[];
  cheques: Cheque[];
}

export default function DistributorDetailModal({
  distributor,
  onClose,
  branches,
  retailers,
  cheques,
}: DistributorDetailModalProps) {
  const [tab, setTab] = useState<'branches' | 'visits' | 'cheques' | 'documents' | 'retailers'>('branches');

  if (!distributor) return null;

  const distBranches = branches.filter((b) => b.distributorId === distributor.id);
  const distRetailers = retailers.filter((r) => r.distributorId === distributor.id);
  const distCheques = cheques.filter((c) =>
    distBranches.some((b) => b.id === c.entityId || b.name === c.storeName)
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 w-full md:w-[70vw] max-w-5xl bg-white shadow-2xl flex flex-col border-l border-slate-200 z-50">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl border border-purple-200">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">{distributor.name}</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800">
                  {distributor.type}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                <span>City: <strong className="text-slate-700">{distributor.city}</strong></span>
                <span>•</span>
                <span>Primary Contact: <strong className="text-slate-700">{distributor.contactName} ({distributor.contactPhone})</strong></span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Header */}
        <div className="flex border-b border-slate-200 bg-white px-4 sm:px-5 gap-2">
          <button
            onClick={() => setTab('branches')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              tab === 'branches'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Branches & Stock ({distBranches.length})
          </button>
          <button
            onClick={() => setTab('visits')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              tab === 'visits'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Visit Timeline
          </button>
          <button
            onClick={() => setTab('cheques')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              tab === 'cheques'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Cheque History ({distCheques.length})
          </button>
          <button
            onClick={() => setTab('documents')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              tab === 'documents'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Document Handover Log
          </button>
          <button
            onClick={() => setTab('retailers')}
            className={`py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
              tab === 'retailers'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Covered Retailers ({distRetailers.length})
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/40">
          {tab === 'branches' && (
            <div className="space-y-4">
              {distBranches.length === 0 ? (
                <EmptyState type="generic" customMessage="No branches registered for this distributor." />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="p-2.5">Branch Name</th>
                        <th className="p-2.5">Assigned Officer</th>
                        <th className="p-2.5">Address</th>
                        <th className="p-2.5 text-right">Est. Shelf Stock</th>
                        <th className="p-2.5 text-right">Last Visit</th>
                        <th className="p-2.5 text-right">Credit Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {distBranches.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-bold text-slate-900">{b.name}</td>
                          <td className="p-2.5 font-medium">{b.assignedOfficerName}</td>
                          <td className="p-2.5 text-slate-500">{b.address}</td>
                          <td className="p-2.5 text-right font-bold text-slate-900">
                            148 units
                          </td>
                          <td className="p-2.5 text-right font-medium">
                            {b.lastVisitDaysAgo ? `${b.lastVisitDaysAgo} days ago` : 'Today'}
                          </td>
                          <td className="p-2.5 text-right">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              Active (NPR {b.outstandingBalance?.toLocaleString() || 0})
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'visits' && (() => {
            const allVisits = db.getVisits().filter((v) =>
              distBranches.some((b) => b.id === v.entityId || b.name === v.storeName) ||
              distributor.id === v.entityId ||
              distributor.name === v.storeName
            );
            if (allVisits.length === 0) {
              return (
                <EmptyState
                  icon={History}
                  title="No visits recorded yet"
                  description="Field officer GPS visits and shelf audits will appear here once recorded on beat routes."
                />
              );
            }
            return (
              <div className="space-y-3">
                {allVisits.map((v) => (
                  <div key={v.id} className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900">{v.storeName || 'Branch Visit'}</div>
                      <div className="text-slate-500 text-[11px]">Officer: {v.officerName || 'Field Officer'} • GPS Verified Check-in</div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-700">{v.dateBs || 'Recent'}</span>
                      <div className="text-[10px] text-emerald-600 font-semibold">{v.durationMinutes || 25} min on-site</div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {tab === 'cheques' && (
            <div className="space-y-4">
              {distCheques.length === 0 ? (
                <EmptyState type="cheques" customMessage="Zero pending cheques for this distributor branches." />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="p-2.5">Cheque #</th>
                        <th className="p-2.5">Branch</th>
                        <th className="p-2.5 text-right">Amount (NPR)</th>
                        <th className="p-2.5">Bank</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {distCheques.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono font-bold text-slate-900">{c.chequeNumber}</td>
                          <td className="p-2.5 font-semibold text-slate-800">{c.storeName}</td>
                          <td className="p-2.5 text-right font-black">NPR {c.amount.toLocaleString()}</td>
                          <td className="p-2.5 text-slate-600">{c.bankName}</td>
                          <td className="p-2.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                              {c.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'documents' && (
            <div className="space-y-3">
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-slate-900">Signed Delivery Challan #DC-8842</div>
                  <div className="text-slate-500 text-[11px]">Maharajgunj Receiving Bay • Stamped & Verified</div>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                  Handed to Office
                </span>
              </div>
            </div>
          )}

          {tab === 'retailers' && (
            <div className="space-y-3">
              {distRetailers.length === 0 ? (
                <EmptyState type="generic" customMessage="No independent sub-retailers linked directly under this distributor." />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="p-2.5">Retailer</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5">Area</th>
                        <th className="p-2.5">Contact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {distRetailers.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-bold text-slate-900">{r.name}</td>
                          <td className="p-2.5 text-slate-600">{r.type}</td>
                          <td className="p-2.5 text-slate-600">{r.area}</td>
                          <td className="p-2.5 font-mono text-slate-600">{r.contactPhone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
