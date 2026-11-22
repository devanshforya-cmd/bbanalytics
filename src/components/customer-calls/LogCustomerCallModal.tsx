'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, X } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { addDays, CALL_OUTCOMES, CALL_PURPOSES, phoneKey } from '@/lib/follow-ups';
import { getTodayAd } from '@/lib/nepali-calendar';
import { displayDocumentId, matchesDocumentId } from '@/lib/document-ids';
import type { CustomerCallOutcome, FollowUpStep, Order } from '@/lib/types';
import { toast } from '@/components/common/Toast';

export interface FollowUpTarget { step: FollowUpStep; stepNumber: number; stepCount: number; tries: number }

const TONE: Record<string, string> = {
  good: 'peer-checked:border-emerald-500 peer-checked:bg-emerald-50 peer-checked:text-emerald-800',
  warn: 'peer-checked:border-amber-500 peer-checked:bg-amber-50 peer-checked:text-amber-800',
  bad: 'peer-checked:border-rose-500 peer-checked:bg-rose-50 peer-checked:text-rose-800',
  neutral: 'peer-checked:border-blue-500 peer-checked:bg-blue-50 peer-checked:text-blue-800',
};

const itemsLine = (order: Order) => order.items.slice(0, 3).map((item) => `${item.quantity}× ${item.productName}`).join(', ') + (order.items.length > 3 ? ` and ${order.items.length - 3} more` : '');

/** Log a call to an online customer: a planned follow-up, or any other call. */
export default function LogCustomerCallModal({ order: givenOrder, followUp, onClose, onSaved }: {
  order?: Order; followUp?: FollowUpTarget; onClose: () => void; onSaved?: () => void;
}) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | undefined>(givenOrder);
  const [find, setFind] = useState('');
  const [name, setName] = useState(givenOrder?.customerName || '');
  const [phone, setPhone] = useState(givenOrder?.customerPhone || '');
  const [purpose, setPurpose] = useState<string>(followUp ? 'Follow-up' : 'Order confirmation');
  const [outcome, setOutcome] = useState<CustomerCallOutcome | ''>('');
  const [callbackDateAd, setCallbackDateAd] = useState(addDays(getTodayAd(), 1));
  const [minutes, setMinutes] = useState('');
  const [notes, setNotes] = useState('');

  const matches = useMemo(() => {
    const query = find.trim().toLowerCase();
    if (query.length < 3 || order) return [];
    const digits = phoneKey(query);
    return db.getOrders('ALL' as any).filter((entry) => matchesDocumentId(query, entry.orderNumber, entry.legacyOrderNumber)
      || (digits.length >= 4 && phoneKey(entry.customerPhone).includes(digits))
      || entry.customerName.toLowerCase().includes(query)).slice(0, 6);
  }, [find, order]);

  const choose = (entry: Order) => { setOrder(entry); setName(entry.customerName); setPhone(entry.customerPhone); setFind(''); };

  const save = () => {
    if (!outcome) { toast.error('Choose how the call went.'); return; }
    try {
      db.logCustomerCall({
        orderId: order?.id, orderNumber: order?.orderNumber, brandCode: order?.brandCode,
        customerName: name, customerPhone: phone, purpose, outcome,
        ...(followUp ? { followUpStepId: followUp.step.id, followUpStepLabel: followUp.step.label } : {}),
        ...(outcome === 'CALL_BACK' ? { callbackDateAd } : {}),
        ...(minutes ? { durationMinutes: Math.max(0, Math.min(600, Number(minutes) || 0)) } : {}),
        notes,
      });
      onSaved?.();
      onClose();
      if (outcome === 'ISSUE') toast.info('Call logged. Log the problem as a complaint so it gets fixed.', undefined, { label: 'Log complaint', onClick: () => router.push('/reviews/feedback') });
      else if (outcome === 'REORDER') toast.info('Call logged. Enter the new order now.', undefined, { label: 'New order', onClick: () => router.push('/orderflow/manual-entry') });
      else toast.success('Call logged.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'The call was not logged.'); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="log-call-title">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="log-call-title" className="text-base font-bold text-slate-900">{followUp ? `${followUp.step.label} call` : 'Log a customer call'}</h2>
            {followUp && <p className="text-xs text-slate-500">Follow-up {followUp.stepNumber} of {followUp.stepCount}{followUp.tries ? ` · tried ${followUp.tries} time${followUp.tries === 1 ? '' : 's'} before` : ''}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          {order ? (
            <div className="rounded-xl bg-slate-50 p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">{order.customerName}</p>
                  <a href={`tel:${order.customerPhone}`} className="mt-0.5 inline-flex items-center gap-1 font-semibold text-blue-700"><Phone className="h-3.5 w-3.5" /> {order.customerPhone}</a>
                </div>
                {!givenOrder && <button type="button" onClick={() => setOrder(undefined)} className="text-xs font-semibold text-slate-500 hover:underline">Change</button>}
              </div>
              <p className="mt-2 text-slate-600">Order {displayDocumentId(order.orderNumber)} · {order.orderDateAd} · {order.brandCode}</p>
              <p className="text-slate-600">{itemsLine(order)}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700">Find the order (optional)
                <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Order number, phone or name" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
              </label>
              {matches.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-xs">
                  {matches.map((entry) => (
                    <li key={entry.id}><button type="button" onClick={() => choose(entry)} className="w-full px-3 py-2 text-left hover:bg-slate-50">
                      <span className="font-semibold text-slate-900">{entry.customerName}</span> · {entry.customerPhone} · {displayDocumentId(entry.orderNumber)} · {entry.orderDateAd}
                    </button></li>
                  ))}
                </ul>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold text-slate-700">Customer name
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                </label>
                <label className="text-xs font-bold text-slate-700">Phone
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} inputMode="tel" placeholder="98XXXXXXXX" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                </label>
              </div>
            </div>
          )}

          {followUp?.step.script && <p className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900"><strong>Ask:</strong> {followUp.step.script}</p>}

          {!followUp && (
            <label className="block text-xs font-bold text-slate-700">What the call was about
              <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                {CALL_PURPOSES.filter((entry) => entry !== 'Follow-up').map((entry) => <option key={entry}>{entry}</option>)}
              </select>
            </label>
          )}

          <fieldset>
            <legend className="mb-1.5 text-xs font-bold text-slate-700">How did it go?</legend>
            <div className="grid grid-cols-2 gap-2">
              {CALL_OUTCOMES.map((entry) => (
                <label key={entry.key} className="relative cursor-pointer">
                  <input type="radio" name="outcome" value={entry.key} checked={outcome === entry.key} onChange={() => setOutcome(entry.key)} className="peer sr-only" />
                  <span className={`block rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 ${TONE[entry.tone]}`}>{entry.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {outcome === 'CALL_BACK' && (
            <label className="block text-xs font-bold text-slate-700">Call back on
              <input type="date" value={callbackDateAd} min={getTodayAd()} onChange={(e) => setCallbackDateAd(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
            </label>
          )}
          {outcome === 'DO_NOT_CALL' && <p className="text-xs text-rose-700">No more follow-up calls will be planned for this phone number.</p>}
          {outcome === 'WRONG_NUMBER' && <p className="text-xs text-rose-700">The other follow-ups for this order stop. Fix the number on the order if you find the right one.</p>}

          <div className="grid grid-cols-[6rem_1fr] gap-3">
            <label className="text-xs font-bold text-slate-700">Minutes
              <input type="number" min={0} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
            </label>
            <label className="text-xs font-bold text-slate-700">Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} placeholder="What they said" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={save} className="btn btn-primary">Save call</button>
        </div>
      </div>
    </div>
  );
}
