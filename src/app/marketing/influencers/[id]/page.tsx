'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import { canPerform } from '@/lib/permissions';
import type { Influencer, InfluencerContent, InfluencerQualityRating, MarketingSend } from '@/lib/types';
import { getTodayAd } from '@/lib/nepali-calendar';
import { contentBrandCodes, contentLinks, contentProductNames, influencerNicheNames, influencerSendStats, sendStatusLabel } from '@/lib/marketing';
import { displayDocumentId } from '@/lib/document-ids';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';
import { syncManager } from '@/lib/offline-sync';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import ConfirmModal from '@/components/common/ConfirmModal';
import { toast } from '@/components/common/Toast';
import InfluencerForm from '../../components/InfluencerForm';
import SendProductsForm from '../../components/SendProductsForm';
import ContentPieceForm from '../../components/ContentPieceForm';
import { AlertCircle, AlertTriangle, ArrowLeft, Archive, ExternalLink, Gift, HardDrive, MapPin, Pencil, Phone, Plus, Send, Trash2, Video } from 'lucide-react';

const STATUS_STYLE: Record<string, string> = {
  'Content received': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'Content overdue': 'bg-amber-100 text-amber-900 border-amber-300',
  'Awaiting content': 'bg-slate-100 text-slate-700 border-slate-200',
  Cancelled: 'bg-slate-50 text-slate-400 border-slate-200 line-through',
};
const POST_STATUS: Record<string, { label: string; style: string }> = {
  LIVE: { label: 'Live', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REMOVED: { label: 'Removed', style: 'bg-rose-50 text-rose-700 border-rose-200' },
  UNKNOWN: { label: 'Status unknown', style: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export default function InfluencerDetailPage() {
  const params = useParams();
  const influencerId = params?.id as string;
  const { formatDate } = useCalendarPreference();
  const [, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(() => db.isWorkspaceLoaded());
  const [showEdit, setShowEdit] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [contentForm, setContentForm] = useState<{ content?: InfluencerContent; sendId?: string } | null>(null);
  const [contentToDelete, setContentToDelete] = useState<InfluencerContent | null>(null);
  const [sendToCancel, setSendToCancel] = useState<MarketingSend | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => { setVersion((value) => value + 1); setLoaded(db.isWorkspaceLoaded()); };
    window.addEventListener('bb-db-updated', refresh);
    void db.syncWithSupabase().finally(refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);

  const user = db.getCurrentUser();
  const canCreate = canPerform(user, 'marketing', 'CREATE');
  const canEdit = canPerform(user, 'marketing', 'EDIT');
  const canDelete = canPerform(user, 'marketing', 'DELETE');
  const influencer: Influencer | undefined = db.getInfluencerById(influencerId);
  const sync = async () => { try { await syncManager.forceSyncNow(); } catch { /* Changes stay queued on this device. */ } };

  if (!influencer) {
    return (
      <PageGuard feature="marketing">
        {!loaded ? (
          <div className="flex min-h-[320px] items-center justify-center" role="status" aria-label="Loading influencer"><div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>
        ) : (
          <div className="mx-auto my-12 max-w-md space-y-4 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
            <h2 className="text-xl font-bold text-slate-900">Influencer not found</h2>
            <p className="text-xs text-slate-500">This profile does not exist, or it is outside your access.</p>
            <Link href="/marketing/influencers" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white"><ArrowLeft className="h-4 w-4" /> Back to the directory</Link>
          </div>
        )}
      </PageGuard>
    );
  }

  const today = getTodayAd();
  const allContent = db.getInfluencerContent();
  const content = allContent.filter((piece) => piece.influencerId === influencer.id).sort((a, b) => b.datePostedAd.localeCompare(a.datePostedAd));
  const sends = db.getMarketingSends({ influencerId: influencer.id });
  const stats = influencerSendStats(influencer.id, sends);
  const niches = influencerNicheNames(influencer, db.getInfluencerNiches(true));
  const overdueCount = sends.filter((send) => sendStatusLabel(send, allContent, today) === 'Content overdue').length;
  const receivedCount = sends.filter((send) => sendStatusLabel(send, allContent, today) === 'Content received').length;
  const brandName = (code: string) => db.getBrands('ALL').find((brand) => brand.code === code)?.name || code;
  const archived = influencer.isActive === false;

  const changeRating = async (rating: InfluencerQualityRating) => { db.updateInfluencer(influencer.id, { qualityRating: rating }); await sync(); toast.success('Rating updated'); };
  const saveNotes = async () => { if (notes === null) return; db.updateInfluencer(influencer.id, { notes: notes.trim() || undefined }); setNotes(null); await sync(); toast.success('Notes saved'); };

  return (
    <PageGuard feature="marketing">
      <div className="mx-auto max-w-6xl space-y-6 pb-24">
        <Breadcrumbs items={[{ label: 'Marketing', href: '/marketing/influencers' }, { label: 'Influencers', href: '/marketing/influencers' }, { label: influencer.name }]} />

        {archived && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-xs text-slate-700">
            <span className="flex items-center gap-2 font-semibold"><Archive className="h-4 w-4" /> This profile is archived. New sends are switched off; the history is kept.</span>
            {canEdit && <button type="button" onClick={async () => { db.updateInfluencer(influencer.id, { isActive: true }); await sync(); toast.success('Profile restored'); }} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-bold hover:bg-slate-50">Restore profile</button>}
          </div>
        )}

        {/* Profile header */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-2xl font-bold text-blue-700" aria-hidden>{influencer.name.charAt(0).toUpperCase()}</div>
              <div className="min-w-0 space-y-2">
                <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{influencer.name}</h1>
                <div className="flex flex-wrap gap-1.5">
                  {niches.length ? niches.map((niche) => <span key={niche} className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[11px] font-bold text-purple-700">{niche}</span>)
                    : <span className="text-[11px] text-slate-500">No niche categories yet</span>}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                  {influencer.phone && <span className="flex items-center gap-1 font-mono"><Phone className="h-3.5 w-3.5 text-slate-400" />{influencer.phone}</span>}
                  {(influencer.address || influencer.city) && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-slate-400" />{[influencer.address, influencer.city].filter(Boolean).join(', ')}</span>}
                  {!influencer.address && <span className="flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />No delivery address saved</span>}
                </div>
                {(influencer.platforms || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {influencer.platforms.map((platform, index) => (
                      <span key={index} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px]">
                        <span className="font-bold text-blue-700">{platform.platform}</span><span className="font-mono text-slate-800">{platform.handle}</span>
                        {!!platform.followers && <span className="text-slate-500">{platform.followers.toLocaleString()} followers</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col lg:items-stretch">
              {canCreate && !archived && (
                <button type="button" onClick={() => setShowSend(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-purple-500/20 transition hover:bg-purple-700 active:scale-[0.98]">
                  <Send className="h-4 w-4" /> Send products
                </button>
              )}
              <div className="flex gap-2">
                {canEdit && <button type="button" onClick={() => setShowEdit(true)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" /> Edit profile</button>}
                {canEdit && !archived && <button type="button" onClick={() => setConfirmArchive(true)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50"><Archive className="h-3.5 w-3.5" /> Archive</button>}
              </div>
              <label className="text-[11px] font-bold text-slate-500">Quality rating
                <select value={influencer.qualityRating} disabled={!canEdit} onChange={(event) => void changeRating(event.target.value as InfluencerQualityRating)} className="mt-1 block w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-500 disabled:opacity-60">
                  <option value="NOT_RATED">Not rated yet</option><option value="GREAT">Great</option><option value="AVERAGE">Average</option><option value="POOR">Poor</option>
                </select>
              </label>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><p className="text-[11px] font-medium text-slate-500">Total sends</p><p className="mt-0.5 text-xl font-black text-slate-900">{stats.totalSends}</p></div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><p className="text-[11px] font-medium text-slate-500">Last send</p><p className="mt-1 text-xs font-bold text-slate-800">{stats.lastSendDate ? formatDate(stats.lastSendDate, stats.lastSendDateBs) : 'No sends yet'}</p></div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><p className="text-[11px] font-medium text-slate-500">Content pieces</p><p className="mt-0.5 text-xl font-black text-slate-900">{content.length}</p></div>
            <div className={`rounded-2xl border p-3 ${overdueCount ? 'border-amber-300 bg-amber-50' : 'border-slate-100 bg-slate-50'}`}>
              <p className="text-[11px] font-medium text-slate-500">Sends with content</p>
              <p className="mt-0.5 text-xl font-black text-slate-900">{receivedCount}<span className="text-sm font-bold text-slate-500"> / {stats.totalSends}</span></p>
              {overdueCount > 0 && <p className="text-[11px] font-bold text-amber-800">{overdueCount} overdue</p>}
            </div>
          </div>
        </div>

        {/* Products sent */}
        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="sends-heading">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 id="sends-heading" className="flex items-center gap-2 text-base font-bold text-slate-900"><Gift className="h-4 w-4 text-slate-500" /> Products sent</h2>
              <p className="text-xs text-slate-500">Marketing sends to this influencer. These never count as orders or sales.</p>
            </div>
            {canCreate && !archived && <button type="button" onClick={() => setShowSend(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-800 hover:bg-purple-100"><Plus className="h-3.5 w-3.5" /> New send</button>}
          </div>
          {!sends.length ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <Gift className="mx-auto mb-2 h-7 w-7 text-slate-300" />
              <p className="text-sm font-bold text-slate-700">Nothing has been sent yet</p>
              <p className="mt-0.5 text-xs text-slate-500">{canCreate && !archived ? 'Use Send products to record the first parcel.' : 'Sends recorded for this influencer will appear here.'}</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {sends.map((send) => {
                const status = sendStatusLabel(send, allContent, today);
                const linked = content.filter((piece) => piece.sendId === send.id);
                return (
                  <li key={send.id} className={`rounded-2xl border p-4 text-xs ${status === 'Content overdue' ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-black text-slate-900">{displayDocumentId(send.sendNumber)}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[status]}`}>{status}</span>
                        {send.brandCodes.map((code) => <span key={code} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">{brandName(code)}</span>)}
                      </div>
                      <span className="text-[11px] text-slate-500">Sent {formatDate(send.sentDateAd, send.sentDateBs)}</span>
                    </div>
                    <p className="mt-2 font-medium text-slate-800">{send.items.map((item) => `${item.quantity}× ${item.productName}${item.isCombo ? " (combo)" : ""}`).join(', ')}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span>Reached out on <strong className="text-slate-700">{send.reachOutPlatform}</strong></span>
                      <span>Responsible <strong className="text-slate-700">{send.responsibleName || 'Not recorded'}</strong></span>
                      <span>Delivery <strong className="text-slate-700">{send.deliveryChannel}</strong></span>
                      <span>Content expected <strong className={status === 'Content overdue' ? 'text-amber-800' : 'text-slate-700'}>{send.expectedContentDateAd ? formatDate(send.expectedContentDateAd, send.expectedContentDateBs) : 'no date agreed'}</strong></span>
                    </div>
                    {send.notes && <p className="mt-1.5 text-[11px] italic text-slate-600">{send.notes}</p>}
                    {send.status !== 'CANCELLED' && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                        {linked.length > 0 && <span className="text-[11px] font-semibold text-emerald-700">{linked.length} content piece{linked.length === 1 ? '' : 's'} linked</span>}
                        {canCreate && <button type="button" onClick={() => setContentForm({ sendId: send.id })} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-800 hover:bg-blue-100"><Plus className="h-3 w-3" /> Add content for this send</button>}
                        {canEdit && !linked.length && <button type="button" onClick={() => setSendToCancel(send)} className="rounded-lg px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 hover:text-rose-600">Cancel send</button>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Content */}
        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="content-heading">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 id="content-heading" className="flex items-center gap-2 text-base font-bold text-slate-900"><Video className="h-4 w-4 text-blue-600" /> Content</h2>
              <p className="text-xs text-slate-500">One entry per piece of work. A reel posted on three platforms is one piece with three links.</p>
            </div>
            {canCreate && <button type="button" onClick={() => setContentForm({})} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700"><Plus className="h-3.5 w-3.5" /> Add content</button>}
          </div>
          {!content.length ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <Video className="mx-auto mb-2 h-7 w-7 text-slate-300" />
              <p className="text-sm font-bold text-slate-700">No content saved yet</p>
              <p className="mt-0.5 text-xs text-slate-500">Add reels, shorts and posts as this influencer publishes them.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {content.map((piece) => {
                const links = contentLinks(piece);
                const post = POST_STATUS[piece.postStatus || 'UNKNOWN'];
                const send = piece.sendId ? sends.find((entry) => entry.id === piece.sendId) : undefined;
                return (
                  <li key={piece.id} className="rounded-2xl border border-slate-200 p-4 text-xs">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800">{piece.contentType}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${post.style}`}>{post.label}{piece.postStatusCheckedAd ? ` · checked ${formatDate(piece.postStatusCheckedAd, piece.postStatusCheckedBs)}` : ''}</span>
                        {contentBrandCodes(piece).map((code) => <span key={code} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">{brandName(code)}</span>)}
                        {!piece.driveUrl && <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800"><HardDrive className="h-3 w-3" /> No backup saved</span>}
                        {send && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800">{displayDocumentId(send.sendNumber)}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="mr-1 text-[11px] text-slate-500">Posted {formatDate(piece.datePostedAd, piece.datePostedBs)}</span>
                        {canEdit && <button type="button" aria-label="Edit content" onClick={() => setContentForm({ content: piece })} className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /></button>}
                        {canDelete && <button type="button" aria-label="Delete content" onClick={() => setContentToDelete(piece)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                      </div>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {links.map((link, index) => (
                        <a key={index} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-bold text-blue-700 hover:border-blue-300 hover:bg-blue-50">
                          <span>{link.platform}</span>{link.datePostedAd && <span className="font-medium text-slate-500">· {formatDate(link.datePostedAd, link.datePostedBs)}</span>}<ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      ))}
                      {piece.driveUrl && <a href={piece.driveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 font-bold text-emerald-800 hover:bg-emerald-100"><HardDrive className="h-3 w-3" /> Backup clip <ExternalLink className="h-3 w-3" /></a>}
                    </div>
                    {contentProductNames(piece).length > 0 && <p className="mt-2 text-slate-700"><span className="text-slate-500">Products:</span> {contentProductNames(piece).join(', ')}</p>}
                    {piece.notes && <p className="mt-1 text-[11px] italic text-slate-600">{piece.notes}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Notes */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="notes-heading">
          <div className="flex items-center justify-between">
            <h2 id="notes-heading" className="text-base font-bold text-slate-900">Notes</h2>
            {canEdit && notes === null && <button type="button" onClick={() => setNotes(influencer.notes || '')} className="text-xs font-bold text-blue-700 hover:underline">{influencer.notes ? 'Edit' : 'Add a note'}</button>}
          </div>
          {notes === null ? <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{influencer.notes || <span className="text-slate-500">No notes yet.</span>}</p> : (
            <div className="mt-2 space-y-2">
              <textarea rows={3} autoFocus value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} aria-label="Notes" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setNotes(null)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">Cancel</button>
                <button type="button" onClick={() => void saveNotes()} className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700">Save notes</button>
              </div>
            </div>
          )}
        </section>
      </div>

      {showEdit && <InfluencerForm influencer={influencer} onClose={() => setShowEdit(false)} onSaved={() => setShowEdit(false)} />}
      {showSend && <SendProductsForm influencer={influencer} onClose={() => setShowSend(false)} onSaved={() => setShowSend(false)} />}
      {contentForm && <ContentPieceForm influencer={influencer} content={contentForm.content} sendId={contentForm.sendId} onClose={() => setContentForm(null)} onSaved={() => setContentForm(null)} />}

      <ConfirmModal isOpen={!!contentToDelete} isDestructive title="Delete this content piece?" confirmLabel="Delete content"
        message="Its links and backup link are removed from this profile." consequences={contentToDelete?.sendId ? ['The linked send goes back to Awaiting content if no other content is linked.'] : undefined}
        onCancel={() => setContentToDelete(null)}
        onConfirm={async () => { if (contentToDelete) { db.deleteInfluencerContent(contentToDelete.id); setContentToDelete(null); await sync(); toast.info('Content deleted'); } }} />
      <ConfirmModal isOpen={!!sendToCancel} variant="warning" title={`Cancel send ${displayDocumentId(sendToCancel?.sendNumber)}?`} confirmLabel="Cancel this send" cancelLabel="Keep it"
        message="Use this when a send was recorded by mistake or never went out. It stays in the history marked Cancelled and stops counting towards totals."
        onCancel={() => setSendToCancel(null)}
        onConfirm={async () => { if (sendToCancel) { db.cancelMarketingSend(sendToCancel.id); setSendToCancel(null); await sync(); toast.info('Send cancelled'); } }} />
      <ConfirmModal isOpen={confirmArchive} variant="warning" title={`Archive ${influencer.name}?`} confirmLabel="Archive profile"
        message="The profile leaves the active directory and cannot receive new sends. All sends and content stay on record, and you can restore it at any time."
        onCancel={() => setConfirmArchive(false)}
        onConfirm={async () => { db.updateInfluencer(influencer.id, { isActive: false }); setConfirmArchive(false); await sync(); toast.info('Profile archived'); }} />
    </PageGuard>
  );
}
