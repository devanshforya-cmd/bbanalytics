/**
 * Shared UI styling and color utility functions for Brand Bucket Command Center
 * Fix 58d: Unified color mapping across statuses, brands, and priorities.
 */

export function statusColor(status: string): string {
  const normalized = (status || '').toUpperCase().trim();
  const map: Record<string, string> = {
    // Positive / Success
    DELIVERED: 'bg-green-50 text-green-700 border-green-200',
    CASHED: 'bg-green-50 text-green-700 border-green-200',
    RESOLVED: 'bg-green-50 text-green-700 border-green-200',
    VISITED: 'bg-green-50 text-green-700 border-green-200',
    COMPLETED: 'bg-green-50 text-green-700 border-green-200',
    ACTIVE: 'bg-green-50 text-green-700 border-green-200',
    PAID: 'bg-green-50 text-green-700 border-green-200',
    ON_TIME: 'bg-green-50 text-green-700 border-green-200',

    // Warning / In-flight
    PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
    IN_PROGRESS: 'bg-amber-50 text-amber-700 border-amber-200',
    DELAYED: 'bg-amber-50 text-amber-700 border-amber-200',
    HANDED_OVER: 'bg-amber-50 text-amber-700 border-amber-200',
    HANDED_OVER_AT_OFFICE: 'bg-amber-50 text-amber-700 border-amber-200',
    REATTEMPT_SCHEDULED: 'bg-amber-50 text-amber-700 border-amber-200',
    PARTIALLY_DELIVERED: 'bg-amber-50 text-amber-700 border-amber-200',

    // Danger / Critical
    OVERDUE: 'bg-red-50 text-red-700 border-red-200',
    BOUNCED: 'bg-red-50 text-red-700 border-red-200',
    FAILED: 'bg-red-50 text-red-700 border-red-200',
    OPEN: 'bg-red-50 text-red-700 border-red-200',
    LOST: 'bg-red-50 text-red-700 border-red-200',
    CANCELLED: 'bg-red-50 text-red-700 border-red-200',
    URGENT: 'bg-red-100 text-red-800 border-red-300',
    DAMAGED: 'bg-red-50 text-red-700 border-red-200',

    // Neutral / Operational
    COLLECTED_IN_FIELD: 'bg-blue-50 text-blue-700 border-blue-200',
    COLLECTED: 'bg-blue-50 text-blue-700 border-blue-200',
    SKIPPED: 'bg-slate-100 text-slate-600 border-slate-200',
    CLOSED: 'bg-slate-100 text-slate-600 border-slate-200',
    ARCHIVED: 'bg-slate-100 text-slate-600 border-slate-200',
    OFFLINE: 'bg-slate-100 text-slate-500 border-slate-200',
  };

  return map[normalized] || 'bg-slate-100 text-slate-600 border-slate-200';
}

export function brandColor(brandCode: string): string {
  const normalized = (brandCode || '').toUpperCase().trim();
  if (normalized === 'ALL') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (!normalized) return 'bg-slate-100 text-slate-600 border-slate-200';

  const palette = [
    'bg-emerald-50 text-emerald-700 border-emerald-200',
    'bg-cyan-50 text-cyan-700 border-cyan-200',
    'bg-violet-50 text-violet-700 border-violet-200',
    'bg-pink-50 text-pink-700 border-pink-200',
    'bg-amber-50 text-amber-700 border-amber-200',
    'bg-indigo-50 text-indigo-700 border-indigo-200',
    'bg-teal-50 text-teal-700 border-teal-200',
    'bg-rose-50 text-rose-700 border-rose-200',
  ];
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
  }
  return palette[Math.abs(hash) % palette.length];
}

export function priorityColor(priority: string): string {
  const normalized = (priority || '').toUpperCase().trim();
  const map: Record<string, string> = {
    HIGH: 'bg-red-50 text-red-700 border-red-200',
    URGENT: 'bg-red-100 text-red-800 border-red-300',
    MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
    LOW: 'bg-blue-50 text-blue-700 border-blue-200',
    ROUTINE: 'bg-slate-50 text-slate-600 border-slate-200',
  };

  return map[normalized] || 'bg-slate-50 text-slate-600 border-slate-200';
}
