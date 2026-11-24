/**
 * Personal dashboards: what each person saved, checked the same way in the browser and on the server,
 * and the ready-made starting points for each kind of job.
 */
import { isSuperAdmin, hasAccess, getScope, type UserWithPermissions } from '../permissions';
import { metricByKey } from './catalog';
import { canSeeMetric, resolveMetric, type FormulaMetric, type MetricRef } from './engine';
import { DIMENSIONS, type DimensionKey } from './sources';
import type { Bucket, CalendarMode, CompareMode, RangePreset } from './dates';
import { RANGE_LABELS } from './dates';

export type ViewKind = 'number' | 'line' | 'bar' | 'stacked' | 'donut' | 'table' | 'top' | 'target';
export const VIEWS: { key: ViewKind; label: string; hint: string }[] = [
  { key: 'number', label: 'Number', hint: 'One number with the change against the earlier period' },
  { key: 'line', label: 'Line over time', hint: 'How it moved day by day, week by week or month by month' },
  { key: 'bar', label: 'Bars', hint: 'Compare groups side by side, or periods over time' },
  { key: 'stacked', label: 'Stacked bars', hint: 'Over time, with each bar split into groups' },
  { key: 'donut', label: 'Share (donut)', hint: 'How the total divides between groups' },
  { key: 'table', label: 'Table', hint: 'Groups as rows, up to four numbers as columns' },
  { key: 'top', label: 'Top list', hint: 'The best (or worst) few groups' },
  { key: 'target', label: 'Target', hint: 'Progress towards a goal you set' },
];
export type WidgetSize = 'S' | 'M' | 'L';

export interface Widget {
  id: string;
  title?: string;
  metric: MetricRef;
  /** Extra columns for tables. */
  columns?: string[];
  view: ViewKind;
  split?: DimensionKey;
  bucket?: Bucket | 'auto';
  where?: Partial<Record<DimensionKey, string[]>>;
  size: WidgetSize;
  target?: number;
  /** Rows shown in top lists and tables. */
  limit?: number;
  /** Top list order: highest first (default) or lowest first. */
  lowestFirst?: boolean;
}

export interface DashboardFilters { range: RangePreset; fromAd?: string; toAd?: string; brand?: string; compare: CompareMode; calendar: CalendarMode }
export interface Dashboard { id: string; name: string; filters: DashboardFilters; widgets: Widget[]; template?: string }
/** `seeded`: which set of starting dashboards this person has been given (see DEFAULTS_VERSION). */
export interface DashboardPrefs { list: Dashboard[]; activeId?: string; seeded?: number }
export interface PublishedTemplate { id: string; name: string; description?: string; dashboard: Dashboard; publishedBy?: string; publishedAt?: string }

export const LIMITS = { dashboards: 12, widgets: 30, name: 60, filterValues: 50, columns: 4, templates: 20 };
const ID = /^[A-Za-z0-9_-]{1,60}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const RANGES = Object.keys(RANGE_LABELS) as RangePreset[];

export const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

function cleanMetric(value: unknown): MetricRef {
  if (typeof value === 'string') {
    if (!metricByKey(value)) throw new Error('A chart uses a number that no longer exists. Remove it and add it again.');
    return value;
  }
  const raw = (value || {}) as Record<string, unknown>;
  const formula: FormulaMetric = {
    label: String(raw.label || '').trim().slice(0, LIMITS.name), a: String(raw.a || ''), b: String(raw.b || ''),
    op: (['divide', 'percent', 'minus', 'plus', 'per100'] as const).find((op) => op === raw.op) || 'divide',
  };
  if (!resolveMetric(formula)) throw new Error('Your own number needs two numbers from the list.');
  if (!formula.label) formula.label = resolveMetric(formula)!.label;
  return formula;
}

export function cleanWidget(value: unknown): Widget {
  const raw = (value || {}) as Record<string, any>;
  if (!ID.test(String(raw.id || ''))) throw new Error('A chart has no valid id.');
  const where: Widget['where'] = {};
  for (const [dim, keys] of Object.entries(raw.where || {})) {
    if (!(dim in DIMENSIONS) || !Array.isArray(keys)) continue;
    const list = keys.filter((key): key is string => typeof key === 'string' && key.length <= 120).slice(0, LIMITS.filterValues);
    if (list.length) where[dim as DimensionKey] = list;
  }
  const widget: Widget = {
    id: raw.id, metric: cleanMetric(raw.metric),
    view: VIEWS.some((v) => v.key === raw.view) ? raw.view : 'number',
    size: raw.size === 'L' || raw.size === 'M' ? raw.size : 'S',
  };
  if (typeof raw.title === 'string' && raw.title.trim()) widget.title = raw.title.trim().slice(0, LIMITS.name);
  if (Array.isArray(raw.columns)) { const cols = raw.columns.filter((key: unknown) => typeof key === 'string' && metricByKey(key)).slice(0, LIMITS.columns); if (cols.length) widget.columns = cols; }
  if (raw.split && raw.split in DIMENSIONS) widget.split = raw.split;
  if (['day', 'week', 'month', 'auto'].includes(raw.bucket)) widget.bucket = raw.bucket;
  if (Object.keys(where).length) widget.where = where;
  if (Number.isFinite(raw.target) && raw.target > 0 && raw.target < 1e12) widget.target = Number(raw.target);
  if (Number.isInteger(raw.limit) && raw.limit >= 3 && raw.limit <= 50) widget.limit = raw.limit;
  if (raw.lowestFirst === true) widget.lowestFirst = true;
  return widget;
}

export function cleanDashboard(value: unknown): Dashboard {
  const raw = (value || {}) as Record<string, any>;
  if (!ID.test(String(raw.id || ''))) throw new Error('A dashboard has no valid id.');
  const name = String(raw.name || '').trim().replace(/\s+/g, ' ').slice(0, LIMITS.name);
  if (!name) throw new Error('Give the dashboard a name.');
  const f = (raw.filters || {}) as Record<string, any>;
  const filters: DashboardFilters = {
    range: RANGES.includes(f.range) ? f.range : 'thisMonth',
    compare: f.compare === 'year' || f.compare === 'off' ? f.compare : 'previous',
    calendar: f.calendar === 'AD' ? 'AD' : 'BS',
  };
  if (filters.range === 'custom') {
    if (DAY.test(f.fromAd || '')) filters.fromAd = f.fromAd;
    if (DAY.test(f.toAd || '')) filters.toAd = f.toAd;
  }
  if (typeof f.brand === 'string' && /^[A-Za-z0-9_-]{1,20}$/.test(f.brand) && f.brand !== 'ALL') filters.brand = f.brand.toUpperCase();
  const widgets = Array.isArray(raw.widgets) ? raw.widgets : [];
  if (widgets.length > LIMITS.widgets) throw new Error(`A dashboard can hold up to ${LIMITS.widgets} charts.`);
  const dashboard: Dashboard = { id: raw.id, name, filters, widgets: widgets.map(cleanWidget) };
  if (typeof raw.template === 'string' && raw.template.length <= 60) dashboard.template = raw.template;
  return dashboard;
}

export function cleanPrefs(value: unknown): DashboardPrefs {
  const raw = (value || {}) as Record<string, any>;
  const list = Array.isArray(raw.list) ? raw.list : [];
  if (list.length > LIMITS.dashboards) throw new Error(`Keep up to ${LIMITS.dashboards} dashboards.`);
  const clean = list.map(cleanDashboard);
  if (new Set(clean.map((d) => d.id)).size !== clean.length) throw new Error('Two dashboards share an id.');
  const prefs: DashboardPrefs = { list: clean };
  if (typeof raw.activeId === 'string' && clean.some((d) => d.id === raw.activeId)) prefs.activeId = raw.activeId;
  if (Number.isInteger(raw.seeded) && raw.seeded > 0 && raw.seeded < 100) prefs.seeded = raw.seeded;
  if (JSON.stringify(prefs).length > 120000) throw new Error('These dashboards are too large to save. Remove some charts.');
  return prefs;
}

export function cleanTemplates(value: unknown): PublishedTemplate[] {
  const list = Array.isArray(value) ? value : [];
  if (list.length > LIMITS.templates) throw new Error(`Keep up to ${LIMITS.templates} shared dashboards.`);
  return list.map((raw: any) => {
    if (!ID.test(String(raw?.id || ''))) throw new Error('A shared dashboard has no valid id.');
    const name = String(raw.name || '').trim().slice(0, LIMITS.name);
    if (!name) throw new Error('Give the shared dashboard a name.');
    const template: PublishedTemplate = { id: raw.id, name, dashboard: cleanDashboard(raw.dashboard) };
    if (typeof raw.description === 'string' && raw.description.trim()) template.description = raw.description.trim().slice(0, 200);
    if (typeof raw.publishedBy === 'string') template.publishedBy = raw.publishedBy.slice(0, 120);
    if (typeof raw.publishedAt === 'string') template.publishedAt = raw.publishedAt.slice(0, 40);
    return template;
  });
}

// ------------------------------------------------------------------ Ready-made starting points

const w = (metric: MetricRef, view: ViewKind = 'number', extra: Partial<Widget> = {}): Omit<Widget, 'id'> => ({ metric, view, size: view === 'number' || view === 'target' ? 'S' : 'M', ...extra });

export const TEMPLATES: { key: string; name: string; description: string; widgets: Omit<Widget, 'id'>[]; range?: RangePreset }[] = [
  {
    key: 'owner', name: 'Business overview', description: 'Online and store sales, delivery, customers and money owed, at a glance.',
    widgets: [
      w('online_revenue'), w('online_orders'), w('store_order_value'), w('store_orders'),
      w('online_revenue', 'line', { size: 'L', bucket: 'auto', title: 'Online sales over time' }),
      w('online_orders', 'table', { split: 'brand', columns: ['online_revenue', 'return_rate', 'complaints_per_100'], title: 'Brands side by side', size: 'L' }),
      w('online_aov'), w('repeat_customer_rate'), w('return_rate'), w('delivery_success_rate'),
      w('online_orders', 'stacked', { split: 'channel', bucket: 'auto', title: 'Orders by channel' }),
      w('store_order_value', 'donut', { split: 'storeType', title: 'Store sales by store type' }),
      w('online_units', 'top', { split: 'product', limit: 8, title: 'Best-selling products online' }),
      w('money_overdue', 'bar', { split: 'aging', title: 'Money overdue from stores, by how late' }),
      w('cheques_overdue_value'), w('followups_overdue'), w('open_complaints'), w('dormant_stores'),
    ],
  },
  {
    key: 'online', name: 'Online', description: 'Online sales, orders, deliveries to chase, returns, complaints, customers and follow-up calls.',
    range: 'last30',
    widgets: [
      w('online_revenue'), w('online_orders'), w('online_aov'), w('online_unconfirmed'),
      w('online_revenue', 'line', { size: 'L', bucket: 'auto', title: 'Online sales over time' }),
      w('online_orders', 'table', { split: 'brand', columns: ['online_revenue', 'return_rate', 'complaints_per_100'], title: 'Brands side by side', size: 'L' }),
      w('delivery_success_rate'), w('return_rate'), w('repeat_customer_rate'), w('followups_due'),
      w('online_orders', 'stacked', { split: 'channel', bucket: 'auto', title: 'Orders by channel' }),
      w('online_units', 'donut', { split: 'subBrand', title: 'Units sold by sub-brand' }),
      w('delivery_failures', 'bar', { split: 'reason', title: 'Why deliveries fail' }),
      w('returns', 'bar', { split: 'reason', title: 'Why customers return' }),
      w('rto_rate'), w('rto_not_back'), w('packing_error_rate'), w('tickets_awaiting_goods'),
      w('rto_parcels', 'bar', { split: 'courier', title: 'RTO parcels by courier' }),
      w('online_units', 'top', { split: 'product', limit: 8, title: 'Best-selling products' }),
      w('online_orders', 'bar', { split: 'hour', title: 'When orders come in' }),
      w('open_complaints'), w('avg_rating'), w('customer_reach_rate'), w('online_cod_share'),
      w('online_orders', 'bar', { split: 'staff', title: 'Orders handled per person' }),
      w('online_orders', 'donut', { split: 'payment', title: 'How customers pay' }),
    ],
  },
  {
    key: 'field_manager', name: 'Offline', description: 'Store sales, beats, dispatch, money to collect and stock on shelves.',
    widgets: [
      w('store_order_value'), w('store_orders'), w('ordering_stores'), w('beat_compliance'),
      w('store_order_value', 'line', { size: 'L', bucket: 'auto', title: 'Store sales over time' }),
      w('store_visits', 'table', { split: 'staff', columns: ['beat_compliance', 'store_orders', 'store_order_value'], title: 'Field staff side by side', size: 'L' }),
      w('money_due'), w('money_overdue'), w('cheques_overdue_value'), w('dispatches_open'),
      w('store_order_value', 'stacked', { split: 'brand', bucket: 'auto', title: 'Store sales by brand' }),
      w('store_order_value', 'donut', { split: 'storeType', title: 'Store sales by store type' }),
      w('money_overdue', 'bar', { split: 'aging', title: 'Money overdue, by how late' }),
      w('store_order_value', 'top', { split: 'store', limit: 10, title: 'Top stores' }),
      w('out_of_stock'), w('low_stock'), w('dormant_stores'), w('store_call_conversion'),
      w('out_of_stock', 'top', { split: 'product', limit: 8, title: 'Most often out of stock' }),
      w('visits_skipped', 'bar', { split: 'skipReason', title: 'Why visits were skipped' }),
    ],
  },
  {
    key: 'field_officer', name: 'Offline: my day', description: 'Your visits, store orders, cheques and stock to fix.',
    range: 'thisMonth',
    widgets: [
      w('store_visits'), w('beat_compliance'), w('store_orders'), w('store_units'),
      w('store_visits', 'line', { size: 'L', bucket: 'day', title: 'Visits per day' }),
      w('cheques_overdue'), w('out_of_stock'), w('low_stock'), w('dormant_stores'),
      w('store_units', 'top', { split: 'product', limit: 8, title: 'What stores ordered most' }),
      w('visits_skipped', 'bar', { split: 'skipReason', title: 'Why visits were skipped' }),
    ],
  },
  {
    key: 'marketing', name: 'Marketing', description: 'Influencer sends, content coming back, offers and what customers say.',
    widgets: [
      w('marketing_sends'), w('marketing_content_rate'), w('marketing_content_late'), w('marketing_units'),
      w('marketing_sends', 'bar', { split: 'influencer', title: 'Sends per influencer' }),
      w('marketing_sends', 'stacked', { split: 'status', bucket: 'month', title: 'Sends and content by month' }),
      w('online_offer_orders'), w('online_discount_rate'), w('reviews_positive'), w('complaints'),
      w('online_orders', 'donut', { split: 'channel', title: 'Orders by channel' }),
    ],
  },
];

/** Bump when the set of starting dashboards changes, so people who already saved theirs get the new ones once. */
export const DEFAULTS_VERSION = 2;

/** The starting dashboards for a person: Online and Offline, each only if their access covers it. */
export function defaultTemplates(user: UserWithPermissions | null | undefined): string[] {
  if (!user || isSuperAdmin(user)) return ['online', 'field_manager'];
  const keys: string[] = [];
  if (hasAccess(user, 'orderflow') || hasAccess(user, 'order_desk')) keys.push('online');
  if (hasAccess(user, 'beat_plans')) keys.push(getScope(user, 'beat_plans') === 'OWN' ? 'field_officer' : 'field_manager');
  else if (hasAccess(user, 'dispatches') || hasAccess(user, 'stores')) keys.push('field_manager');
  if (!keys.length) keys.push(hasAccess(user, 'marketing') ? 'marketing' : 'owner');
  return keys;
}

/** The starting point that fits a person's job best (the first of their defaults). */
export function templateFor(user: UserWithPermissions | null | undefined): string {
  return defaultTemplates(user)[0];
}

/** Saved dashboards plus any starting ones added since this person last saved. Returns null if nothing changed. */
export function withDefaults(prefs: DashboardPrefs, user: UserWithPermissions | null | undefined, calendar: CalendarMode = 'BS'): DashboardPrefs | null {
  if ((prefs.seeded || 0) >= DEFAULTS_VERSION) return null;
  const have = new Set(prefs.list.map((d) => d.template).filter(Boolean));
  const add = defaultTemplates(user).filter((key) => !have.has(key)).map((key) => fromTemplate(key, user, calendar)).filter((d) => d.widgets.length);
  const list = [...prefs.list, ...add].slice(0, LIMITS.dashboards);
  return { ...prefs, list, seeded: DEFAULTS_VERSION };
}

/** A new dashboard from a template, keeping only the charts this person is allowed to see. */
export function fromTemplate(key: string, user: UserWithPermissions | null | undefined, calendar: CalendarMode = 'BS'): Dashboard {
  const template = TEMPLATES.find((entry) => entry.key === key) || TEMPLATES[0];
  const widgets = template.widgets
    .filter((widget) => canSeeMetric(user, resolveMetric(widget.metric)) && (widget.columns || []).every((col) => canSeeMetric(user, metricByKey(col) || null)))
    .map((widget) => ({ ...widget, id: newId('w') }));
  return { id: newId('dash'), name: template.name, template: template.key, widgets, filters: { range: template.range || 'thisMonth', compare: 'previous', calendar } };
}

/** A copy of a shared dashboard for one person, keeping only what they may see. */
export function fromPublished(template: PublishedTemplate, user: UserWithPermissions | null | undefined): Dashboard {
  return {
    ...structuredClone(template.dashboard), id: newId('dash'), name: template.name, template: `published:${template.id}`,
    widgets: template.dashboard.widgets.filter((widget) => canSeeMetric(user, resolveMetric(widget.metric))).map((widget) => ({ ...widget, id: newId('w') })),
  };
}
