import type { ContentPlatformLink, Influencer, InfluencerContent, InfluencerNiche, MarketingSend } from './types';

/** Pure helpers for the marketing module, shared by screens, the server and tests. */

export const DEFAULT_REACH_OUT_PLATFORMS = ['Instagram DM', 'WhatsApp', 'Email', 'Phone call', 'Agency'];
export const DEFAULT_CONTENT_PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Facebook'];
export const DEFAULT_FAILURE_REASONS = ['Call not received', 'Address not found', 'Customer refused', 'Customer unavailable', 'Area not serviceable', 'Other'];

/** Stable ID from a name, so creating the same name twice cannot produce two records. */
export function lookupId(prefix: string, name: string): string {
  const slug = name.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${prefix}_${slug || 'item'}`;
}

export function sameName(a: unknown, b: unknown): boolean {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

/** Older content had one URL. Read every piece as one piece with a list of links. */
export function contentLinks(content: InfluencerContent): ContentPlatformLink[] {
  if (Array.isArray(content.links) && content.links.length) return content.links;
  return content.url ? [{ platform: content.platform || 'Other', url: content.url }] : [];
}

export function contentBrandCodes(content: InfluencerContent): string[] {
  if (Array.isArray(content.brandCodes) && content.brandCodes.length) return content.brandCodes;
  return content.brandCode ? [content.brandCode] : [];
}

export function contentProductNames(content: InfluencerContent): string[] {
  if (Array.isArray(content.productNames) && content.productNames.length) return content.productNames;
  return content.productName ? [content.productName] : [];
}

export function isDriveLink(url: string): boolean {
  try { return /(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/.test(new URL(url).hostname); } catch { return false; }
}

export function isHttpUrl(url: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; }
}

export function detectPlatform(url: string): string | null {
  const value = url.toLowerCase();
  if (value.includes('instagram.com') || value.includes('instagr.am')) return 'Instagram';
  if (value.includes('tiktok.com')) return 'TikTok';
  if (value.includes('youtube.com') || value.includes('youtu.be')) return 'YouTube';
  if (value.includes('facebook.com') || value.includes('fb.watch')) return 'Facebook';
  return null;
}

/** Content is overdue when the expected date has passed and nothing is linked to the send. */
export function sendIsOverdue(send: MarketingSend, content: InfluencerContent[], todayAd: string): boolean {
  if (send.status !== 'SENT' || !send.expectedContentDateAd) return false;
  if (content.some((piece) => piece.sendId === send.id)) return false;
  return send.expectedContentDateAd < todayAd;
}

export function sendStatusLabel(send: MarketingSend, content: InfluencerContent[], todayAd: string): 'Content received' | 'Content overdue' | 'Awaiting content' | 'Cancelled' {
  if (send.status === 'CANCELLED') return 'Cancelled';
  if (send.status === 'CONTENT_RECEIVED' || content.some((piece) => piece.sendId === send.id)) return 'Content received';
  return sendIsOverdue(send, content, todayAd) ? 'Content overdue' : 'Awaiting content';
}

export function influencerNicheNames(influencer: Influencer, niches: InfluencerNiche[]): string[] {
  if (Array.isArray(influencer.nicheIds)) {
    return influencer.nicheIds.map((id) => niches.find((niche) => niche.id === id)?.name).filter((name): name is string => !!name);
  }
  return influencer.category ? [influencer.category] : [];
}

/** Totals are derived from the saved sends, so they cannot drift from the history. */
export function influencerSendStats(influencerId: string, sends: MarketingSend[]) {
  const own = sends.filter((send) => send.influencerId === influencerId && send.status !== 'CANCELLED');
  const last = own.reduce<MarketingSend | null>((latest, send) => !latest || send.sentDateAd > latest.sentDateAd ? send : latest, null);
  return { totalSends: own.length, lastSendDate: last?.sentDateAd, lastSendDateBs: last?.sentDateBs };
}
