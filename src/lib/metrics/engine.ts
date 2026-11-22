/**
 * Works out any metric for a date range, optionally split by one dimension and/or over time.
 * Ratios and custom formulas combine two metrics group by group, so a split stays consistent.
 */
import { canSeeSensitive, hasAccess, isSuperAdmin, type UserWithPermissions } from '../permissions';
import { isRatio, metricByKey, METRICS, type MetricDef, type SimpleMetric, type Unit } from './catalog';
import { bucketOf, bucketsIn, type Bucket, type CalendarMode } from './dates';
import { SOURCES, type DimensionKey, type Group, type Prepared, type RecordLine, type SourceDef } from './sources';

/** A number someone builds from two library numbers. */
export interface FormulaMetric { label: string; a: string; op: 'divide' | 'percent' | 'minus' | 'plus' | 'per100'; b: string; unit?: Unit }
export type MetricRef = string | FormulaMetric;

export interface Query {
  metric: MetricRef;
  range?: { fromAd: string; toAd: string } | null;
  /** Only rows in these groups, per dimension. Dimensions a metric cannot be split by are ignored. */
  where?: Partial<Record<DimensionKey, string[]>>;
  split?: DimensionKey;
  bucket?: Bucket;
  calendar?: CalendarMode;
}

export interface Point { key: string; label: string; value: number | null }
export interface Result {
  value: number | null;
  groups: Point[];
  buckets: Point[];
  /** Per group, one value per bucket (same order as `buckets`). */
  grid: { group: Group; values: (number | null)[] }[];
  /** Filters that could not apply to this metric. */
  ignored: DimensionKey[];
}

const ALL = '*';
const OP_LABEL: Record<FormulaMetric['op'], string> = { divide: '÷', percent: '÷ (as %)', minus: '−', plus: '+', per100: 'per 100' };

export function resolveMetric(ref: MetricRef): MetricDef | null {
  if (typeof ref === 'string') return metricByKey(ref) || null;
  const a = metricByKey(ref.a), b = metricByKey(ref.b);
  if (!a || !b) return null;
  const unit: Unit = ref.unit || (ref.op === 'percent' ? 'pct' : ref.op === 'per100' ? 'per100' : ref.op === 'divide' ? (a.unit === 'npr' ? 'npr' : 'count') : a.unit);
  return {
    key: `formula:${ref.a}:${ref.op}:${ref.b}`, label: ref.label || `${a.label} ${OP_LABEL[ref.op]} ${b.label}`, area: a.area, unit, better: 'none',
    access: [...a.access], money: a.money || b.money, snapshot: a.snapshot && b.snapshot,
    description: `Your own number: ${a.label} ${OP_LABEL[ref.op]} ${b.label}.`,
    num: ref.a, den: ref.b, scale: ref.op === 'percent' || ref.op === 'per100' ? 100 : 1,
    ...(ref.op === 'minus' || ref.op === 'plus' ? { combine: ref.op } : {}),
  } as MetricDef & { combine?: 'minus' | 'plus' };
}

/** Whether a person may see a metric: the page it belongs to, and Money for money metrics. */
export function canSeeMetric(user: UserWithPermissions | null | undefined, metric: MetricDef | null): boolean {
  if (!user || !metric) return false;
  if (isSuperAdmin(user)) return true;
  if (isRatio(metric)) return canSeeMetric(user, metricByKey(metric.num) || null) && canSeeMetric(user, metricByKey(metric.den) || null) && (!metric.money || canSeeSensitive(user, 's.money'));
  return metric.access.some((key) => hasAccess(user, key)) && (!metric.money || canSeeSensitive(user, 's.money'));
}

export const visibleMetrics = (user: UserWithPermissions | null | undefined) => METRICS.filter((metric) => canSeeMetric(user, metric));

/** The dimensions a metric can be split or filtered by. */
export function metricDimensions(metric: MetricDef | null): DimensionKey[] {
  if (!metric) return [];
  if (isRatio(metric)) {
    const a = metricDimensions(metricByKey(metric.num) || null), b = new Set(metricDimensions(metricByKey(metric.den) || null));
    return a.filter((dim) => b.has(dim));
  }
  return Object.keys(SOURCES[metric.source].dims) as DimensionKey[];
}

/** Whether the metric can be shown over time. */
export function isDated(metric: MetricDef | null): boolean {
  if (!metric) return false;
  if (isRatio(metric)) return isDated(metricByKey(metric.num) || null) && isDated(metricByKey(metric.den) || null);
  return !metric.snapshot && (!!SOURCES[metric.source].date || !!metric.date);
}

const asArray = (value: Group | Group[] | null): Group[] => (value ? (Array.isArray(value) ? value : [value]) : []);

interface Acc { n: number; sum: number; set: Set<string>; label: string }
const newAcc = (label: string): Acc => ({ n: 0, sum: 0, set: new Set(), label });

function finish(metric: SimpleMetric, acc: Acc | undefined): number | null {
  if (metric.agg === 'count') return acc ? acc.n : 0;
  if (metric.agg === 'sum') return acc ? acc.sum : 0;
  if (metric.agg === 'distinct') return acc ? acc.set.size : 0;
  return acc && acc.n ? acc.sum / acc.n : null;
}

/** Rows of a simple metric that pass its rule, the date range and the filters. */
function matchingRows(metric: SimpleMetric, p: Prepared, query: Query): { row: any; date?: string }[] {
  const source = SOURCES[metric.source] as SourceDef;
  const dateOf = metric.date || source.date;
  const out: { row: any; date?: string }[] = [];
  const filters = Object.entries(query.where || {}).filter(([dim, keys]) => keys?.length && source.dims[dim as DimensionKey]) as [DimensionKey, string[]][];
  for (const row of source.rows(p)) {
    if (metric.where && !metric.where(row, p)) continue;
    const date = dateOf ? dateOf(row, p)?.slice(0, 10) : undefined;
    if (!metric.snapshot && query.range) {
      if (!date || date < query.range.fromAd || date > query.range.toAd) continue;
    }
    if (filters.length && !filters.every(([dim, keys]) => asArray(source.dims[dim]!(row, p)).some((group) => keys.includes(group.key)))) continue;
    out.push({ row, date });
  }
  return out;
}

function runSimple(metric: SimpleMetric, p: Prepared, query: Query) {
  const source = SOURCES[metric.source] as SourceDef;
  const splitter = query.split ? source.dims[query.split] : undefined;
  const bucket = query.bucket && isDated(metric) ? query.bucket : undefined;
  const cells = new Map<string, Acc>();
  const groups = new Map<string, string>();
  const add = (key: string, label: string, row: any) => {
    let acc = cells.get(key);
    if (!acc) { acc = newAcc(label); cells.set(key, acc); }
    if (metric.agg === 'count') acc.n++;
    else if (metric.agg === 'distinct') { const id = metric.distinct?.(row, p); if (id) acc.set.add(id); }
    else {
      const value = metric.value?.(row, p);
      if (value === null || value === undefined || !Number.isFinite(value)) return;
      acc.sum += value; acc.n++;
    }
  };
  for (const { row, date } of matchingRows(metric, p, query)) {
    const b = bucket && date ? bucketOf(date, bucket, query.calendar || 'BS').key : null;
    add(`${ALL}|${ALL}`, 'All', row);
    if (b) add(`${b}|${ALL}`, b, row);
    if (splitter) for (const group of asArray(splitter(row, p))) {
      groups.set(group.key, group.label);
      add(`${ALL}|${group.key}`, group.label, row);
      if (b) add(`${b}|${group.key}`, group.label, row);
    }
  }
  return { get: (b: string, gk: string) => finish(metric, cells.get(`${b}|${gk}`)), groups };
}

type Runner = { get: (bucket: string, group: string) => number | null; groups: Map<string, string> };

function runner(metric: MetricDef & { combine?: 'minus' | 'plus' }, p: Prepared, query: Query): Runner {
  if (!isRatio(metric)) return runSimple(metric, p, query);
  const num = metricByKey(metric.num), den = metricByKey(metric.den);
  if (!num || !den) return { get: () => null, groups: new Map() };
  const a = runner(num, p, query), b = runner(den, p, query);
  const scale = metric.scale || 1;
  return {
    groups: new Map([...a.groups, ...b.groups]),
    get: (bucket, group) => {
      const x = a.get(bucket, group), y = b.get(bucket, group);
      if (metric.combine === 'minus') return x === null || y === null ? null : x - y;
      if (metric.combine === 'plus') return x === null || y === null ? null : x + y;
      return x === null || y === null || y === 0 ? null : (x / y) * scale;
    },
  };
}

/** Work out a metric. Results never throw: an unknown metric gives empty results. */
export function evaluate(p: Prepared, query: Query): Result {
  const metric = resolveMetric(query.metric);
  const empty: Result = { value: null, groups: [], buckets: [], grid: [], ignored: [] };
  if (!metric) return empty;
  const dims = new Set(metricDimensions(metric));
  const ignored = (Object.keys(query.where || {}) as DimensionKey[]).filter((dim) => query.where?.[dim]?.length && !dims.has(dim));
  const split = query.split && dims.has(query.split) ? query.split : undefined;
  const bucket = query.bucket && isDated(metric) && query.range ? query.bucket : undefined;
  const run = runner(metric, p, { ...query, split, bucket });
  const groups: Point[] = split ? [...run.groups].map(([key, label]) => ({ key, label, value: run.get(ALL, key) })) : [];
  const bucketList = bucket && query.range ? bucketsIn(query.range, bucket, query.calendar || 'BS') : [];
  const isCountLike = (v: number | null) => v ?? (metric.unit === 'pct' || metric.unit === 'days' || metric.unit === 'minutes' || metric.unit === 'rating' || isRatio(metric) ? null : 0);
  const buckets: Point[] = bucketList.map((b) => ({ key: b.key, label: b.label, value: isCountLike(run.get(b.key, ALL)) }));
  const grid = split && bucket ? groups.map((group) => ({ group: { key: group.key, label: group.label }, values: bucketList.map((b) => isCountLike(run.get(b.key, group.key))) })) : [];
  return { value: run.get(ALL, ALL), groups, buckets, grid, ignored };
}

/** The records behind a number, optionally only one group or one bucket. Ratios show the records of the top number. */
export function recordsBehind(p: Prepared, query: Query, only?: { group?: string; bucket?: string }): { lines: RecordLine[]; noun: string; money: boolean } {
  let metric = resolveMetric(query.metric);
  while (metric && isRatio(metric)) metric = metricByKey(metric.num) || null;
  if (!metric) return { lines: [], noun: 'records', money: false };
  const source = SOURCES[metric.source] as SourceDef;
  const splitter = only?.group && query.split ? source.dims[query.split] : undefined;
  const lines = matchingRows(metric, p, query)
    .filter(({ row, date }) => (!splitter || asArray(splitter(row, p)).some((group) => group.key === only!.group))
      && (!only?.bucket || !query.bucket || (date && bucketOf(date, query.bucket, query.calendar || 'BS').key === only.bucket)))
    .map(({ row }) => source.describe(row, p));
  const seen = new Set<string>();
  return { lines: lines.filter((line) => (seen.has(line.id) ? false : (seen.add(line.id), true))).sort((a, b) => b.date.localeCompare(a.date)), noun: source.noun, money: !!source.money };
}

/** Every group a dimension can take for a metric, for filter pickers. */
export function dimensionOptions(p: Prepared, metric: MetricDef | null, dim: DimensionKey): Group[] {
  if (!metric) return [];
  const sources = isRatio(metric) ? [metricByKey(metric.num), metricByKey(metric.den)] : [metric];
  const seen = new Map<string, string>();
  for (const m of sources) {
    let base: MetricDef | undefined | null = m;
    while (base && isRatio(base)) base = metricByKey(base.num);
    if (!base || isRatio(base)) continue;
    const source = SOURCES[base.source] as SourceDef;
    const accessor = source.dims[dim];
    if (!accessor) continue;
    for (const row of source.rows(p)) for (const group of asArray(accessor(row, p))) if (!seen.has(group.key)) seen.set(group.key, group.label);
  }
  return [...seen].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
}

/** A number in the metric's unit, for screens. */
export function formatValue(value: number | null | undefined, unit: Unit, options: { compact?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (unit === 'pct') return `${value.toFixed(value < 10 ? 1 : 0)}%`;
  if (unit === 'per100') return value.toFixed(1);
  if (unit === 'rating') return `${value.toFixed(1)} / 5`;
  if (unit === 'days') return `${value.toFixed(1)} days`;
  if (unit === 'minutes') return `${Math.round(value)} min`;
  if (unit === 'npr') {
    if (options.compact && Math.abs(value) >= 100000) return `NPR ${(value / 100000).toFixed(value >= 1000000 ? 1 : 2)}L`;
    return `NPR ${Math.round(value).toLocaleString('en-IN')}`;
  }
  return Math.round(value).toLocaleString('en-IN');
}

/** Change against an earlier value, and whether it is good news for this metric. */
export function change(current: number | null, previous: number | null, unit: Unit, better: MetricDef['better']): { text: string; tone: 'good' | 'bad' | 'flat' } | null {
  if (current === null || previous === null) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 1e-9) return { text: 'No change', tone: 'flat' };
  const text = unit === 'pct' ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)} pts` : previous === 0 ? `${diff > 0 ? '+' : ''}${formatValue(diff, unit)}` : `${diff > 0 ? '+' : ''}${Math.round((diff / Math.abs(previous)) * 100)}%`;
  const tone = better === 'none' ? 'flat' : (diff > 0) === (better === 'up') ? 'good' : 'bad';
  return { text, tone };
}
