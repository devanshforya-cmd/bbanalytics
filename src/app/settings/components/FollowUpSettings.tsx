'use client';

import { useMemo, useState } from 'react';
import { PhoneCall, Plus, Trash2 } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { canPerform, isSuperAdmin } from '@/lib/permissions';
import { addDays, validateFollowUpPlan } from '@/lib/follow-ups';
import { getTodayAd } from '@/lib/nepali-calendar';
import type { FollowUpPlan, FollowUpStep } from '@/lib/types';
import { toast } from '@/components/common/Toast';

const newId = () => `fu_${Math.random().toString(36).slice(2, 10)}`;
const niceDate = (ad: string) => new Date(`${ad}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * How many follow-up calls each online order gets, and when. Changes apply straight away to every
 * order still being followed up; calls already logged stay as they are.
 */
export default function FollowUpSettings() {
  const user = db.getCurrentUser();
  const canEdit = isSuperAdmin(user) || canPerform(user, 'p.settings_follow_ups', 'EDIT') || (!db.isFollowUpPlanSaved() && canPerform(user, 'p.settings_follow_ups', 'CREATE'));
  const brands = useMemo(() => db.getBrands().filter((brand) => brand.isActive !== false), []);
  const [plan, setPlan] = useState<FollowUpPlan>(() => db.getFollowUpPlan());
  const [dirty, setDirty] = useState(false);
  const update = (change: (draft: FollowUpPlan) => void) => {
    setPlan((current) => { const draft = structuredClone(current); change(draft); return draft; });
    setDirty(true);
  };
  const setStep = (id: string, patch: Partial<FollowUpStep>) => update((draft) => { draft.steps = draft.steps.map((step) => step.id === id ? { ...step, ...patch } : step); });

  const save = () => {
    try {
      const clean = validateFollowUpPlan({ ...plan, steps: [...plan.steps].sort((a, b) => (a.from === b.from ? 0 : a.from === 'ORDER' ? -1 : 1) || a.daysAfter - b.daysAfter) });
      db.setFollowUpPlan(clean);
      setPlan(clean); setDirty(false);
      toast.success('Follow-up calls saved. The call list uses them now.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Not saved.'); }
  };

  const example = getTodayAd();
  const orderSteps = plan.steps.filter((step) => step.from === 'ORDER').sort((a, b) => a.daysAfter - b.daysAfter);
  const deliverySteps = plan.steps.filter((step) => step.from === 'DELIVERY').sort((a, b) => a.daysAfter - b.daysAfter);

  return (
    <div className="space-y-6 text-sm">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><PhoneCall className="h-4 w-4 text-teal-600" /> Follow-up calls after an online order</h3>
            <p className="mt-1 text-xs text-slate-500">Each online order gets these calls. They show up on <strong>Follow-up calls</strong> on the day they are due. Change them any time: open follow-ups move to the new days straight away, and calls already made stay in the call log.</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={plan.enabled} disabled={!canEdit} onChange={(e) => update((draft) => { draft.enabled = e.target.checked; })} className="h-4 w-4" />
            {plan.enabled ? 'On' : 'Off'}
          </label>
        </div>

        <ol className="mt-5 space-y-3">
          {plan.steps.map((step, index) => (
            <li key={step.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <span className="mb-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700" aria-hidden="true">{index + 1}</span>
                <label className="min-w-[10rem] flex-1 text-xs font-semibold text-slate-700">Call name
                  <input value={step.label} maxLength={60} disabled={!canEdit} onChange={(e) => setStep(step.id, { label: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                </label>
                <label className="w-24 text-xs font-semibold text-slate-700">Days after
                  <input type="number" min={0} max={365} value={step.daysAfter} disabled={!canEdit} onChange={(e) => setStep(step.id, { daysAfter: Math.max(0, Math.min(365, Math.round(Number(e.target.value) || 0))) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                </label>
                <label className="w-44 text-xs font-semibold text-slate-700">Counted from
                  <select value={step.from} disabled={!canEdit} onChange={(e) => setStep(step.id, { from: e.target.value as FollowUpStep['from'] })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                    <option value="ORDER">the order date</option>
                    <option value="DELIVERY">the delivery date</option>
                  </select>
                </label>
                {canEdit && (
                  <button type="button" onClick={() => update((draft) => { draft.steps = draft.steps.filter((entry) => entry.id !== step.id); })} aria-label={`Remove ${step.label || `call ${index + 1}`}`} className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
              <label className="mt-2 block text-xs font-semibold text-slate-700">What to ask (shown to the caller)
                <input value={step.script || ''} maxLength={300} disabled={!canEdit} onChange={(e) => setStep(step.id, { script: e.target.value })} placeholder="e.g. Did the order arrive? Was everything right?" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
              </label>
            </li>
          ))}
        </ol>
        {canEdit && plan.steps.length < 12 && (
          <button type="button" onClick={() => update((draft) => { const last = draft.steps[draft.steps.length - 1]; draft.steps.push({ id: newId(), label: `Call ${draft.steps.length + 1}`, daysAfter: (last?.daysAfter || 0) + 7, from: last?.from || 'ORDER' }); })}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-teal-400 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50">
            <Plus className="h-3.5 w-3.5" /> Add a call
          </button>
        )}
        {!plan.steps.length && <p className="mt-3 text-xs text-amber-700">No calls set. Add at least one, or turn follow-ups off.</p>}

        {plan.steps.length > 0 && (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            For an order placed on {niceDate(example)}: {orderSteps.map((step) => `${step.label || 'call'} on ${niceDate(addDays(example, step.daysAfter))}`).join(', ')}
            {deliverySteps.length ? `${orderSteps.length ? ', and ' : ''}${deliverySteps.map((step) => `${step.label || 'call'} ${step.daysAfter} day${step.daysAfter === 1 ? '' : 's'} after it is delivered`).join(', ')}` : ''}.
            {' '}A customer gets one call at a time: the next one waits until the earlier one is done.
          </p>
        )}
      </section>

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-700">Tries before giving up
          <input type="number" min={1} max={10} value={plan.maxTries} disabled={!canEdit} onChange={(e) => update((draft) => { draft.maxTries = Math.max(1, Math.min(10, Math.round(Number(e.target.value) || 1))); })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
          <span className="mt-1 block font-normal text-slate-500">After this many unanswered tries (no answer, switched off) a call is marked not reached. An unanswered call comes back the next day.</span>
        </label>
        <label className="text-xs font-semibold text-slate-700">Follow up orders placed from
          <input type="date" value={plan.startFromAd} disabled={!canEdit} onChange={(e) => update((draft) => { draft.startFromAd = e.target.value; })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
          <span className="mt-1 block font-normal text-slate-500">Older orders are left out, so switching this on does not bring a backlog.</span>
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="text-xs font-semibold text-slate-700">Brands</legend>
          <p className="text-xs text-slate-500">Leave all unticked to follow up every brand.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {brands.map((brand) => (
              <label key={brand.code} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${plan.brandCodes.includes(brand.code.toUpperCase()) ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}>
                <input type="checkbox" className="sr-only" disabled={!canEdit} checked={plan.brandCodes.includes(brand.code.toUpperCase())}
                  onChange={(e) => update((draft) => { const code = brand.code.toUpperCase(); draft.brandCodes = e.target.checked ? [...draft.brandCodes, code] : draft.brandCodes.filter((entry) => entry !== code); })} />
                {brand.name}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      {canEdit ? (
        <div className="flex items-center justify-end gap-3">
          {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          <button type="button" onClick={save} disabled={!dirty} className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40">Save follow-up calls</button>
        </div>
      ) : <p className="text-xs text-slate-500">You can see these settings but not change them.</p>}
    </div>
  );
}
