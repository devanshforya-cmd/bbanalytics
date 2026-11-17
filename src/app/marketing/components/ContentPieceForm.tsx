'use client';

import React, { useState } from 'react';
import { AlertTriangle, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { canAccessBrand } from '@/lib/permissions';
import type { ContentPlatformLink, ContentPostStatus, Influencer, InfluencerContent, InfluencerContentType } from '@/lib/types';
import { getTodayAd, getTodayBs } from '@/lib/nepali-calendar';
import { contentBrandCodes, contentLinks, detectPlatform, isDriveLink, isHttpUrl } from '@/lib/marketing';
import { displayDocumentId } from '@/lib/document-ids';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';
import { syncManager } from '@/lib/offline-sync';
import SlideOverPanel from '@/components/common/SlideOverPanel';
import CreatableSelect from '@/components/common/CreatableSelect';
import DualDateField, { bsLabel } from '@/components/common/DualDateField';
import { toast } from '@/components/common/Toast';

interface ContentPieceFormProps {
  influencer: Influencer;
  /** Pass a piece to edit; omit to add. */
  content?: InfluencerContent;
  /** Pre-select the send this content is for. */
  sendId?: string;
  onClose: () => void;
  onSaved: (content: InfluencerContent) => void;
}

interface LinkRow { platformId: string[]; url: string; ownDate: boolean; dateAd: string; dateBs: string }
const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const TYPES: [InfluencerContentType, string][] = [['REEL', 'Reel'], ['STORY', 'Story'], ['POST', 'Feed post'], ['VIDEO', 'Full video'], ['SHORT', 'Short'], ['BLOG', 'Blog or article'], ['OTHER', 'Other']];

/**
 * One content piece is one piece of work, such as a single reel. It can carry
 * several platform links because the same reel is often posted in several places.
 */
export default function ContentPieceForm({ influencer, content, sendId, onClose, onSaved }: ContentPieceFormProps) {
  const user = db.getCurrentUser();
  const { formatDate } = useCalendarPreference();
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const [, refresh] = useState(0);
  const platforms = db.getMarketingOptions('CONTENT_PLATFORM');
  const platformId = (name: string) => platforms.find((option) => option.name.toLowerCase() === name.toLowerCase())?.id;
  const products = db.getProducts('ALL').filter((product) => canAccessBrand(user, product.brandCode));
  const sends = db.getMarketingSends({ influencerId: influencer.id }).filter((send) => send.status !== 'CANCELLED');
  const brandName = (code: string) => db.getBrands('ALL').find((brand) => brand.code === code)?.name || code;

  const [links, setLinks] = useState<LinkRow[]>(() => {
    const existing = content ? contentLinks(content) : [];
    if (!existing.length) return [{ platformId: [], url: '', ownDate: false, dateAd: '', dateBs: '' }];
    return existing.map((link) => ({ platformId: platformId(link.platform) ? [platformId(link.platform)!] : [], url: link.url, ownDate: !!link.datePostedAd, dateAd: link.datePostedAd || '', dateBs: link.datePostedBs || '' }));
  });
  const [driveUrl, setDriveUrl] = useState(content?.driveUrl || '');
  const [postedAd, setPostedAd] = useState(content?.datePostedAd || getTodayAd());
  const [postedBs, setPostedBs] = useState(content?.datePostedBs || (content?.datePostedAd ? bsLabel(content.datePostedAd) : getTodayBs()));
  const [productIds, setProductIds] = useState<string[]>(content?.productIds || []);
  const [linkedSend, setLinkedSend] = useState(content?.sendId || sendId || '');
  const [notes, setNotes] = useState(content?.notes || '');
  const [type, setType] = useState<InfluencerContentType>(content?.contentType || 'REEL');
  const [status, setStatus] = useState<ContentPostStatus>(content?.postStatus || 'LIVE');
  const [checkedAd, setCheckedAd] = useState(content?.postStatusCheckedAd || getTodayAd());
  const [checkedBs, setCheckedBs] = useState(content?.postStatusCheckedBs || getTodayBs());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const chosenProducts = productIds.map((id) => products.find((product) => product.id === id)).filter((product): product is NonNullable<typeof product> => !!product);
  const legacyBrands = content && !content.productIds?.length ? contentBrandCodes(content) : [];
  const derivedBrands = [...new Set([...chosenProducts.map((product) => product.brandCode), ...legacyBrands])];
  const driveWarning = driveUrl.trim() && isHttpUrl(driveUrl.trim()) && !isDriveLink(driveUrl.trim());

  const updateLink = (index: number, patch: Partial<LinkRow>) => setLinks((rows) => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  const onUrl = (index: number, url: string) => {
    const detected = detectPlatform(url);
    const id = detected ? platformId(detected) : undefined;
    updateLink(index, { url, ...(id && !links[index].platformId.length ? { platformId: [id] } : {}) });
    setErrors((current) => ({ ...current, links: '' }));
  };

  const save = () => guardedSubmit(async () => {
    const next: Record<string, string> = {};
    const filled = links.filter((row) => row.url.trim() || row.platformId.length);
    if (!filled.length) next.links = 'Add at least one platform link.';
    else if (filled.some((row) => !row.platformId.length)) next.links = 'Choose the platform for every link.';
    else if (filled.some((row) => !isHttpUrl(row.url.trim()))) next.links = 'Every link needs a full web address starting with https://';
    if (driveUrl.trim() && !isHttpUrl(driveUrl.trim())) next.drive = 'Paste the full link, starting with https://';
    if (!postedAd) next.posted = 'Choose the date posted.';
    setErrors(next);
    if (Object.keys(next).length) { toast.error('Check the highlighted fields', Object.values(next)[0]); return; }
    const cleanLinks: ContentPlatformLink[] = filled.map((row) => ({
      platform: platforms.find((option) => option.id === row.platformId[0])?.name || 'Other', url: row.url.trim(),
      ...(row.ownDate && row.dateAd ? { datePostedAd: row.dateAd, datePostedBs: row.dateBs } : {}),
    }));
    try {
      const saved = db.saveInfluencerContent({
        ...(content ? { id: content.id } : {}), influencerId: influencer.id, contentType: type, links: cleanLinks,
        driveUrl: driveUrl.trim() || undefined, datePostedAd: postedAd, datePostedBs: postedBs,
        productIds: chosenProducts.map((product) => product.id), productNames: chosenProducts.length ? chosenProducts.map((product) => product.name) : content?.productNames,
        brandCodes: derivedBrands, sendId: linkedSend || undefined, notes: notes.trim() || undefined,
        postStatus: status, postStatusCheckedAd: checkedAd || undefined, postStatusCheckedBs: checkedAd ? checkedBs : undefined,
      });
      try { await syncManager.forceSyncNow(); } catch { /* The content stays in the sync queue. */ }
      toast.success(content ? 'Content updated' : 'Content saved', linkedSend ? 'The linked send is now marked Content received.' : `${cleanLinks.length} link${cleanLinks.length === 1 ? '' : 's'} saved.`);
      onSaved(saved);
    } catch (problem) { toast.error(problem instanceof Error ? problem.message : 'The content could not be saved.'); }
  });

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
      <button type="button" onClick={save} disabled={isSubmitting} className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300">
        {isSubmitting ? 'Saving…' : content ? 'Save changes' : 'Save content'}
      </button>
    </div>
  );

  return (
    <SlideOverPanel isOpen onClose={isSubmitting ? () => {} : onClose} width="lg" title={content ? 'Edit content piece' : 'Add content piece'} subtitle={`${influencer.name} · one piece of work, such as a single reel`} footer={footer}>
      <div className="space-y-5 p-5 text-xs">
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-bold text-slate-700">Platform links <span className="text-rose-500">*</span></span>
            <button type="button" onClick={() => setLinks((rows) => [...rows, { platformId: [], url: '', ownDate: false, dateAd: '', dateBs: '' }])} className="inline-flex items-center gap-1 font-bold text-blue-700 hover:underline"><Plus className="h-3 w-3" /> Add another platform</button>
          </div>
          <div className="space-y-2">
            {links.map((row, index) => (
              <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/50 p-2.5">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.8fr_auto] sm:items-end">
                  <CreatableSelect label="Platform" noun="platform" value={row.platformId} onChange={(ids) => { updateLink(index, { platformId: ids }); setErrors((current) => ({ ...current, links: '' })); }}
                    options={platforms.map((option) => ({ id: option.id, name: option.name }))} placeholder="Choose or add"
                    onCreate={(text) => { const made = db.addMarketingOption('CONTENT_PLATFORM', text); refresh((n) => n + 1); return { id: made.id, name: made.name }; }} />
                  <div>
                    <label htmlFor={`content-url-${index}`} className="mb-1 block font-bold text-slate-700">Link</label>
                    <input id={`content-url-${index}`} type="url" inputMode="url" value={row.url} onChange={(event) => onUrl(index, event.target.value)} placeholder="https://www.instagram.com/reel/…" className={`${field} font-mono`} />
                  </div>
                  <button type="button" aria-label="Remove this link" disabled={links.length === 1} onClick={() => setLinks((rows) => rows.filter((_, i) => i !== index))} className="mb-0.5 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-slate-600">
                  <input type="checkbox" checked={row.ownDate} onChange={(event) => updateLink(index, { ownDate: event.target.checked, ...(event.target.checked && !row.dateAd ? { dateAd: postedAd, dateBs: postedBs } : {}) })} className="h-3.5 w-3.5 rounded border-slate-300" />
                  This platform went up on a different day
                </label>
                {row.ownDate && <div className="mt-2 max-w-xs"><DualDateField id={`content-link-date-${index}`} label="Posted on this platform" valueAd={row.dateAd} maxAd={getTodayAd()} onChange={(ad, bs) => updateLink(index, { dateAd: ad, dateBs: bs })} /></div>}
              </div>
            ))}
          </div>
          {errors.links && <p className="mt-1 text-[11px] font-medium text-rose-600">{errors.links}</p>}
        </section>

        <section>
          <label htmlFor="content-drive" className="mb-1 block font-bold text-slate-700">Backup clip (Google Drive link)</label>
          <div className="flex gap-2">
            <input id="content-drive" type="url" inputMode="url" value={driveUrl} onChange={(event) => { setDriveUrl(event.target.value); setErrors((current) => ({ ...current, drive: '' })); }} placeholder="https://drive.google.com/file/d/…"
              className={`${field} font-mono ${errors.drive ? 'border-rose-400 bg-rose-50/30' : ''}`} />
            <a href={isHttpUrl(driveUrl.trim()) ? driveUrl.trim() : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!isHttpUrl(driveUrl.trim())} aria-label="Open the backup link in a new tab"
              className={`inline-flex shrink-0 items-center gap-1 rounded-xl border px-3 py-2 font-bold ${isHttpUrl(driveUrl.trim()) ? 'border-slate-300 text-slate-700 hover:bg-slate-50' : 'pointer-events-none border-slate-200 text-slate-300'}`}>
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Upload the clip to Drive in case the influencer deletes the post, then paste the link here.</p>
          {errors.drive && <p className="text-[11px] font-medium text-rose-600">{errors.drive}</p>}
          {driveWarning && <p className="mt-1 flex items-start gap-1 text-[11px] font-medium text-amber-700"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />This does not look like a Google Drive link. You can still save it.</p>}
        </section>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DualDateField id="content-posted" label="Date posted" required valueAd={postedAd} maxAd={getTodayAd()} error={errors.posted} onChange={(ad, bs) => { setPostedAd(ad); setPostedBs(bs); }} />
          <div>
            <label htmlFor="content-type" className="mb-1 block font-bold text-slate-700">Content type</label>
            <select id="content-type" value={type} onChange={(event) => setType(event.target.value as InfluencerContentType)} className={field}>
              {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>

        <section>
          <CreatableSelect label="Products featured" multiple value={productIds} onChange={setProductIds} placeholder="Search the catalogue"
            options={[...products].sort((a, b) => brandName(a.brandCode).localeCompare(brandName(b.brandCode)) || a.name.localeCompare(b.name)).map((product) => ({ id: product.id, name: product.name, group: brandName(product.brandCode) }))} />
          <p className="mt-1 text-[11px] text-slate-500">
            {derivedBrands.length ? <>Brand{derivedBrands.length === 1 ? '' : 's'}: <strong className="text-slate-800">{derivedBrands.map(brandName).join(', ')}</strong> (taken from the products)</> : 'Brands are filled in from the products you choose.'}
          </p>
        </section>

        <section>
          <label htmlFor="content-send" className="mb-1 block font-bold text-slate-700">Linked send</label>
          <select id="content-send" value={linkedSend} onChange={(event) => setLinkedSend(event.target.value)} className={field}>
            <option value="">Not linked to a send</option>
            {sends.map((send) => <option key={send.id} value={send.id}>{displayDocumentId(send.sendNumber)} · {formatDate(send.sentDateAd, send.sentDateBs)} · {send.items.map((item) => `${item.quantity}× ${item.productName}`).join(', ').slice(0, 70)}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-slate-500">{sends.length ? 'Optional. Linking marks that send as Content received and clears any overdue reminder.' : 'This influencer has no sends yet.'}</p>
        </section>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="content-status" className="mb-1 block font-bold text-slate-700">Post status</label>
            <select id="content-status" value={status} onChange={(event) => setStatus(event.target.value as ContentPostStatus)} className={field}>
              <option value="LIVE">Live</option>
              <option value="REMOVED">Removed by the influencer</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </div>
          <DualDateField id="content-checked" label="Last checked" valueAd={checkedAd} maxAd={getTodayAd()} allowClear onChange={(ad, bs) => { setCheckedAd(ad); setCheckedBs(bs); }} />
        </div>

        <div>
          <label htmlFor="content-notes" className="mb-1 block font-bold text-slate-700">Notes</label>
          <textarea id="content-notes" rows={2} value={notes} maxLength={1000} onChange={(event) => setNotes(event.target.value)} placeholder="What the content shows, how it performed" className={field} />
        </div>
      </div>
    </SlideOverPanel>
  );
}
