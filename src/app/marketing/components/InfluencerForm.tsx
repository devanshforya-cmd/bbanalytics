'use client';

import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { canPerform } from '@/lib/permissions';
import type { Influencer, InfluencerPlatform, InfluencerQualityRating } from '@/lib/types';
import CreatableSelect from '@/components/common/CreatableSelect';
import { toast } from '@/components/common/Toast';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { syncManager } from '@/lib/offline-sync';

interface InfluencerFormProps {
  /** Pass an influencer to edit; omit to create. */
  influencer?: Influencer;
  onClose: () => void;
  onSaved: (influencer: Influencer) => void;
}

const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

/** Create or edit an influencer. Only the name is required. */
export default function InfluencerForm({ influencer, onClose, onSaved }: InfluencerFormProps) {
  const user = db.getCurrentUser();
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const [name, setName] = useState(influencer?.name || '');
  const [phone, setPhone] = useState(influencer?.phone || '');
  const [address, setAddress] = useState(influencer?.address || '');
  const [city, setCity] = useState(influencer?.city || '');
  const [nicheIds, setNicheIds] = useState<string[]>(influencer?.nicheIds || []);
  const [rating, setRating] = useState<InfluencerQualityRating>(influencer?.qualityRating || 'NOT_RATED');
  const [notes, setNotes] = useState(influencer?.notes || '');
  const [platforms, setPlatforms] = useState<{ platform: string; handle: string; followers: string }[]>(
    (influencer?.platforms || []).map((entry) => ({ platform: entry.platform, handle: entry.handle, followers: entry.followers ? String(entry.followers) : '' })));
  const [nameError, setNameError] = useState('');
  const [, refresh] = useState(0);

  const niches = db.getInfluencerNiches();
  const platformNames = db.getMarketingOptions('CONTENT_PLATFORM').map((option) => option.name);
  const canCreateNiche = canPerform(user, 'marketing', 'CREATE');

  const save = () => guardedSubmit(async () => {
    if (!name.trim()) { setNameError('Enter the influencer’s name.'); return; }
    const cleanPlatforms: InfluencerPlatform[] = platforms.filter((row) => row.handle.trim()).map((row) => ({
      platform: (row.platform || platformNames[0] || 'Other') as InfluencerPlatform['platform'],
      handle: row.handle.trim().startsWith('@') ? row.handle.trim() : `@${row.handle.trim()}`,
      ...(Number(row.followers) > 0 ? { followers: Math.round(Number(row.followers)) } : {}),
    }));
    const payload = { name: name.trim(), phone: phone.trim() || undefined, address: address.trim() || undefined, city: city.trim() || undefined,
      nicheIds, qualityRating: rating, notes: notes.trim() || undefined, platforms: cleanPlatforms };
    try {
      const saved = influencer ? db.updateInfluencer(influencer.id, payload) : db.createInfluencer(payload);
      if (!saved) throw new Error('This influencer no longer exists. Refresh and try again.');
      try { await syncManager.forceSyncNow(); } catch { /* The change stays in the sync queue. */ }
      toast.success(influencer ? 'Influencer updated' : 'Influencer added', saved.name);
      onSaved(saved);
    } catch (problem) { toast.error(problem instanceof Error ? problem.message : 'The influencer could not be saved.'); }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-xs sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="influencer-form-title">
      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="influencer-form-title" className="text-base font-bold text-slate-900">{influencer ? 'Edit influencer' : 'Add influencer'}</h2>
            <p className="text-xs text-slate-500">Only the name is required. Add the rest when you have it.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4 text-xs">
          <div>
            <label htmlFor="inf-name" className="mb-1 block font-bold text-slate-700">Name <span className="text-rose-500">*</span></label>
            <input id="inf-name" autoFocus value={name} maxLength={120} onChange={(event) => { setName(event.target.value); setNameError(''); }} placeholder="e.g. Aashika Shrestha"
              className={`${field} ${nameError ? 'border-rose-400 bg-rose-50/30' : ''}`} />
            {nameError && <p className="mt-1 text-[11px] font-medium text-rose-600">{nameError}</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="inf-phone" className="mb-1 block font-bold text-slate-700">Phone</label>
              <input id="inf-phone" type="tel" value={phone} maxLength={20} onChange={(event) => setPhone(event.target.value)} placeholder="98XXXXXXXX" className={`${field} font-mono`} />
            </div>
            <div>
              <label htmlFor="inf-city" className="mb-1 block font-bold text-slate-700">City</label>
              <input id="inf-city" value={city} maxLength={80} onChange={(event) => setCity(event.target.value)} placeholder="e.g. Kathmandu" className={field} />
            </div>
          </div>
          <div>
            <label htmlFor="inf-address" className="mb-1 block font-bold text-slate-700">Delivery address</label>
            <input id="inf-address" value={address} maxLength={300} onChange={(event) => setAddress(event.target.value)} placeholder="Street, area, landmark" className={field} />
            <p className="mt-1 text-[11px] text-slate-500">Parcels need this. It fills in automatically on every send.</p>
          </div>

          <CreatableSelect label="Niche categories" multiple noun="niche" value={nicheIds} onChange={setNicheIds}
            options={niches.map((niche) => ({ id: niche.id, name: niche.name }))}
            onCreate={canCreateNiche ? (text) => { const made = db.addInfluencerNiche(text); refresh((n) => n + 1); return { id: made.id, name: made.name }; } : undefined}
            placeholder="Search, or type a new niche such as Skincare" helper="Pick as many as apply. A new niche is saved for every influencer." />

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="font-bold text-slate-700">Platforms</span>
              <button type="button" onClick={() => setPlatforms((rows) => [...rows, { platform: platformNames[0] || 'Instagram', handle: '', followers: '' }])} className="inline-flex items-center gap-1 font-bold text-blue-700 hover:underline">
                <Plus className="h-3 w-3" /> Add platform
              </button>
            </div>
            {!platforms.length && <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-500">No platforms added yet.</p>}
            <div className="space-y-2">
              {platforms.map((row, index) => (
                <div key={index} className="grid grid-cols-[1.1fr_1.4fr_1fr_auto] items-center gap-2">
                  <select aria-label="Platform" value={row.platform} onChange={(event) => setPlatforms((rows) => rows.map((entry, i) => i === index ? { ...entry, platform: event.target.value } : entry))} className={field}>
                    {[...new Set([...platformNames, row.platform])].filter(Boolean).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                  <input aria-label="Handle" value={row.handle} maxLength={80} placeholder="@handle" onChange={(event) => setPlatforms((rows) => rows.map((entry, i) => i === index ? { ...entry, handle: event.target.value } : entry))} className={`${field} font-mono`} />
                  <input aria-label="Followers" type="number" min={0} value={row.followers} placeholder="Followers" onChange={(event) => setPlatforms((rows) => rows.map((entry, i) => i === index ? { ...entry, followers: event.target.value } : entry))} className={field} />
                  <button type="button" aria-label="Remove platform" onClick={() => setPlatforms((rows) => rows.filter((_, i) => i !== index))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="inf-rating" className="mb-1 block font-bold text-slate-700">Quality rating</label>
              <select id="inf-rating" value={rating} onChange={(event) => setRating(event.target.value as InfluencerQualityRating)} className={field}>
                <option value="NOT_RATED">Not rated yet</option>
                <option value="GREAT">Great — prioritise for launches</option>
                <option value="AVERAGE">Average — content delivered</option>
                <option value="POOR">Poor — late or no content</option>
              </select>
            </div>
            <div>
              <label htmlFor="inf-notes" className="mb-1 block font-bold text-slate-700">Notes</label>
              <input id="inf-notes" value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} placeholder="Anything the team should know" className={field} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={save} disabled={isSubmitting} className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300">
            {isSubmitting ? <><span className="bb-spinner mr-1.5" aria-hidden="true" />Saving…</> : influencer ? 'Save changes' : 'Add influencer'}
          </button>
        </div>
      </div>
    </div>
  );
}
