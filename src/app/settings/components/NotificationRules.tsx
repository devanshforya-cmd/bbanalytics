'use client';

import React, { useState, useEffect } from 'react';
import { Bell, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { toast } from '@/components/common/Toast';
import { db } from '@/lib/db/db-service';
import { syncManager } from '@/lib/offline-sync';

export default function NotificationRules() {
  const [chequeOverdueDays, setChequeOverdueDays] = useState(1);
  const [handoverGapDays, setHandoverGapDays] = useState(2);
  const [unvisitedStoreAlertDays, setUnvisitedStoreAlertDays] = useState(10);
  const [failureRateThreshold, setFailureRateThreshold] = useState(15);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const load = () => { if (dirty) return; const rules = db.getAlertRules(); setChequeOverdueDays(rules.chequeOverdueDays); setHandoverGapDays(rules.handoverGapDays); setUnvisitedStoreAlertDays(rules.unvisitedStoreAlertDays); setFailureRateThreshold(rules.failureRateThreshold); };
    load(); window.addEventListener('bb-db-updated', load); return () => window.removeEventListener('bb-db-updated', load);
  }, [dirty]);

  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      db.setAlertRules({ chequeOverdueDays, handoverGapDays, unvisitedStoreAlertDays, failureRateThreshold });
      await syncManager.forceSyncNow();
      if (syncManager.getWorkspaceMutations().some(mutation => mutation.collection === 'workspaceConfig')) throw new Error('Rules remain pending. Check Sync status and retry when connected.');
      setDirty(false); toast.success('Daily in-app alert thresholds saved.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Alert rules were not saved.'); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSaveRules} onChange={() => setDirty(true)} className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-900">Alert Tiers &amp; Smart Triggers</h3>
          <p className="text-xs text-slate-500">
            Configure daily operations alerts for Super Admin notification bells and registered push devices. Each user enables push in their profile; email delivery is not configured.
          </p>
        </div>

        <div className="space-y-4 text-xs">
          {/* RED Tier */}
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 space-y-2">
            <div className="flex items-center gap-2 text-rose-900 font-bold">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>🔴 Red Tier — Priority operations alerts</span>
            </div>
            <p className="text-slate-600">
              Daily checks cover bounced cheques, customer karma below 20, urgent unassigned complaints and the thresholds below. Task assignments also send a push when saved. Device settings control lock-screen display.
            </p>
          </div>

          {/* AMBER Tier Inputs */}
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-3">
            <div className="flex items-center gap-2 text-amber-900 font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>🟡 Amber Tier — App Open Warning &amp; Digest</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Cheque Overdue Alert Threshold (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={chequeOverdueDays}
                  onChange={(e) => setChequeOverdueDays(parseInt(e.target.value) || 1)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Field Cheque Handover Gap Alert (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="7"
                  value={handoverGapDays}
                  onChange={(e) => setHandoverGapDays(parseInt(e.target.value) || 2)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Store Unvisited Alert Threshold (Days)
                </label>
                <input
                  type="number"
                  min="5"
                  max="30"
                  value={unvisitedStoreAlertDays}
                  onChange={(e) => setUnvisitedStoreAlertDays(parseInt(e.target.value) || 10)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Weekly Delivery Failure Rate Trigger (%)
                </label>
                <input
                  type="number"
                  min="5"
                  max="50"
                  value={failureRateThreshold}
                  onChange={(e) => setFailureRateThreshold(parseInt(e.target.value) || 15)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100">
          <button
            type="submit" disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition"
          >
            {saving ? 'Saving…' : 'Save Notification Thresholds'}
          </button>
        </div>
      </div>
    </form>
  );
}
