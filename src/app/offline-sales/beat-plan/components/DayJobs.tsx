'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Banknote, FileText, Truck, CheckSquare, Wallet } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { getTodayAd, getTodayBs } from '@/lib/nepali-calendar';
import { priorityColor } from '@/lib/ui-utils';
import type { Priority, Task } from '@/lib/types';
import { JOB_LABEL, PRIORITY_LABEL, TASK_KINDS, TASK_KIND_LABEL, type DayJob, type StopPriority } from '@/lib/weekly-beat';
import SlideOverPanel from '@/components/common/SlideOverPanel';
import SearchSelect from '@/components/common/SearchSelect';
import DualDateField from '@/components/common/DualDateField';
import { toast } from '@/components/common/Toast';
import { hasAccess } from '@/lib/permissions';

const ICON: Record<DayJob['kind'], React.ComponentType<{ className?: string }>> = {
  COLLECT_PAYMENT: Wallet, DELIVER_ORDER: Truck, CASH_CLEARING: Banknote, DOCUMENT_DEPOSIT: FileText, TASK: CheckSquare,
};

/** The day's jobs that are not at one of the route's stops, in priority order. */
export function DayJobsList({ jobs, onToggleTask, laterCount }: { jobs: DayJob[]; onToggleTask: (taskId: string) => void; laterCount: number }) {
  return (
    <div className="space-y-2">
      {jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-6 text-center text-xs text-slate-500">
          <p className="font-medium text-slate-600">No other jobs today.</p>
          <p className="mt-0.5 text-[11px]">Cash to clear, documents to deposit, orders to deliver and tasks show here in priority order.</p>
        </div>
      ) : jobs.map((job) => {
        const Icon = ICON[job.kind];
        const body = (
          <>
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-800">{job.label}</p>
              <p className="text-[11px] text-slate-500">{[job.kind !== 'TASK' ? JOB_LABEL[job.kind] : '', job.storeName, job.detail, job.amount ? `NPR ${Math.round(job.amount).toLocaleString()}` : ''].filter(Boolean).join(' · ')}</p>
            </div>
            <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-bold ${priorityColor(job.priority)}`}>{PRIORITY_LABEL[job.priority]}</span>
          </>
        );
        if (job.taskId) return (
          <label key={job.id} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300">
            <input type="checkbox" onChange={() => onToggleTask(job.taskId!)} className="mt-0.5 h-4 w-4 rounded border-slate-300" aria-label={`Mark done: ${job.label}`} />
            {body}
          </label>
        );
        return <Link key={job.id} href={job.href || '#'} className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300">{body}</Link>;
      })}
      {laterCount > 0 && <Link href="/opscore/tasks" className="block text-right text-[11px] font-semibold text-blue-700 hover:underline">{laterCount} more task{laterCount === 1 ? '' : 's'} due later</Link>}
    </div>
  );
}

const TO_TASK_PRIORITY: Record<StopPriority, Priority> = { HIGH: 'HIGH', MEDIUM: 'MEDIUM', ROUTINE: 'LOW' };

/** A manager gives a rider a job for a day: cash clearing, a document deposit, an order to dispatch, and so on. */
export function AssignJobPanel({ onClose, onSaved, defaultOfficerId }: { onClose: () => void; onSaved: (task: Task) => void; defaultOfficerId?: string }) {
  const me = db.getCurrentUser();
  const staff = db.getUsers().filter((user) => user.active !== false && (hasAccess(user, 'beat_plans') || user.role === 'SALES_OFFICER')).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const [officerId, setOfficerId] = useState(defaultOfficerId && staff.some((user) => user.id === defaultOfficerId) ? defaultOfficerId : (staff.find((user) => user.role === 'SALES_OFFICER') || staff[0])?.id || '');
  const [kind, setKind] = useState<NonNullable<Task['kind']>>('CASH_CLEARING');
  const [title, setTitle] = useState('');
  const [storeId, setStoreId] = useState('');
  const [priority, setPriority] = useState<StopPriority>('MEDIUM');
  const [dueAd, setDueAd] = useState(getTodayAd());
  const [dueBs, setDueBs] = useState(getTodayBs());
  const [note, setNote] = useState('');
  const stores = [...db.getRetailers().map((r) => ({ value: r.id, label: r.name, hint: r.area || r.city })), ...db.getBranches().map((b) => ({ value: b.id, label: b.name, hint: b.distributorName }))];
  const storeName = stores.find((store) => store.value === storeId)?.label;

  const save = () => {
    const officer = staff.find((user) => user.id === officerId);
    if (!officer) { toast.error('Choose who does this job.'); return; }
    const name = title.trim() || (storeName ? `${TASK_KIND_LABEL[kind]} at ${storeName}` : TASK_KIND_LABEL[kind]);
    try {
      const task = db.addTask({
        title: name.slice(0, 160), ...(note.trim() ? { description: note.trim().slice(0, 500) } : {}), assignedTo: officer.id, assignedToName: officer.fullName, createdBy: me.fullName,
        priority: TO_TASK_PRIORITY[priority], dueDateAd: dueAd, dueDateBs: dueBs, status: 'PENDING', autoCreated: false, autoTriggerType: 'MANUAL', kind,
        ...(storeId ? { storeId, storeName, relatedEntityType: 'STORE' as const, relatedId: storeId, relatedTo: storeName } : {}),
      });
      toast.success(`Job given to ${officer.fullName}`, `${name} · ${PRIORITY_LABEL[priority]} priority`);
      onSaved(task);
    } catch (problem) { toast.error(problem instanceof Error ? problem.message : 'The job was not saved.'); }
  };

  const field = 'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-normal';
  return (
    <SlideOverPanel isOpen onClose={onClose} title="Give a rider a job" subtitle="It joins their day plan in the priority you set. At a store on their route, it shows on that stop." width="md"
      footer={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button><button type="button" onClick={save} className="btn btn-primary">Assign job</button></div>}>
      <div className="space-y-4 p-5 text-xs">
        <div>
          <p className="mb-1.5 font-bold text-slate-700">Job</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Job type">
            {TASK_KINDS.map((entry) => (
              <button key={entry} type="button" role="radio" aria-checked={kind === entry} onClick={() => setKind(entry)} className={`rounded-xl border px-3 py-1.5 font-bold ${kind === entry ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'}`}>{TASK_KIND_LABEL[entry]}</button>
            ))}
          </div>
        </div>
        <label className="block font-bold text-slate-700">Rider
          <select value={officerId} onChange={(event) => setOfficerId(event.target.value)} className={field}>{staff.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select>
        </label>
        <div><p className="font-bold text-slate-700">Store <span className="font-normal text-slate-500">(optional: leave empty for the bank, office or courier)</span></p>
          <SearchSelect id="job-store" options={stores} value={storeId} onChange={setStoreId} allowClear clearLabel="No store" placeholder="Search stores" /></div>
        <label className="block font-bold text-slate-700">What to do
          <input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder={storeName ? `${TASK_KIND_LABEL[kind]} at ${storeName}` : 'e.g. deposit NPR 45,000 at the bank'} className={field} />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block font-bold text-slate-700">Priority
            <select value={priority} onChange={(event) => setPriority(event.target.value as StopPriority)} className={field}>{(['HIGH', 'MEDIUM', 'ROUTINE'] as StopPriority[]).map((entry) => <option key={entry} value={entry}>{PRIORITY_LABEL[entry]}</option>)}</select>
          </label>
          <DualDateField id="job-due" label="Day" required valueAd={dueAd} minAd={getTodayAd()} onChange={(ad, bs) => { if (ad) { setDueAd(ad); setDueBs(bs); } }} />
        </div>
        <label className="block font-bold text-slate-700">Note
          <input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} className={field} />
        </label>
      </div>
    </SlideOverPanel>
  );
}
