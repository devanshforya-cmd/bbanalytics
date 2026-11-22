/**
 * Turns a saved chart plus the dashboard's filters into what the chart draws. Kept apart from the
 * screen so the same numbers can be tested and downloaded.
 */
import { metricByKey, isRatio, type MetricDef, type Unit } from './catalog';
import { change, evaluate, isDated, metricDimensions, resolveMetric, type Point, type Query } from './engine';
import { autoBucket, compareRange, resolveRange, type Bucket, type DateRange } from './dates';
import type { DashboardFilters, Widget } from './dashboards';
import type { DimensionKey, Prepared } from './sources';

export interface Series { key: string; label: string; values: (number | null)[] }
export interface WidgetData {
  metric: MetricDef | null;
  title: string;
  unit: Unit;
  value: number | null;
  previous: number | null;
  delta: ReturnType<typeof change>;
  range: DateRange;
  previousRange: DateRange | null;
  groups: Point[];
  previousGroups: Map<string, number | null>;
  buckets: Point[];
  series: Series[];
  columns: { metric: MetricDef; values: Map<string, number | null> }[];
  /** Filters this chart cannot use. */
  ignored: DimensionKey[];
  /** The query behind the chart, for "see the records". */
  query: Query;
  /** For targets: how far along the period is (0–1), when the period is still running. */
  elapsed: number | null;
}

const ORDERED = new Set<DimensionKey>(['aging', 'hour', 'weekday', 'orderSize', 'rating']);
const additive = (unit: Unit) => unit === 'count' || unit === 'npr' || unit === 'units';

export function widgetQueryBase(widget: Widget, filters: DashboardFilters, extraWhere: Partial<Record<DimensionKey, string[]>> = {}) {
  const range = resolveRange(filters.range, filters.calendar, { fromAd: filters.fromAd, toAd: filters.toAd });
  const where: Partial<Record<DimensionKey, string[]>> = { ...(widget.where || {}) };
  for (const [dim, keys] of Object.entries(extraWhere) as [DimensionKey, string[]][]) {
    if (!keys?.length) continue;
    where[dim] = where[dim]?.length ? where[dim]!.filter((key) => keys.includes(key)) : keys;
    if (!where[dim]!.length) where[dim] = ['__none__'];
  }
  return { range, where };
}

export function computeWidget(p: Prepared, widget: Widget, filters: DashboardFilters, extraWhere: Partial<Record<DimensionKey, string[]>> = {}, today = p.data.today): WidgetData {
  const metric = resolveMetric(widget.metric);
  const { range, where } = widgetQueryBase(widget, filters, extraWhere);
  const dated = isDated(metric);
  const snapshot = !!metric && !dated;
  const dims = new Set(metricDimensions(metric));
  const split = widget.split && dims.has(widget.split) ? widget.split : undefined;
  const wantsTime = widget.view === 'line' || widget.view === 'stacked' || (widget.view === 'bar' && !split) || widget.view === 'number';
  const bucket: Bucket | undefined = dated && wantsTime ? (widget.bucket && widget.bucket !== 'auto' ? widget.bucket : autoBucket(range)) : undefined;
  const query: Query = { metric: widget.metric, range: snapshot ? null : range, where, split, bucket, calendar: filters.calendar };
  const main = evaluate(p, query);
  const previousRange = snapshot ? null : compareRange(range, filters.compare, filters.range, filters.calendar);
  const unit = metric?.unit || 'count';
  const prev = previousRange && metric ? evaluate(p, { ...query, range: previousRange, bucket: undefined }) : null;

  let groups = main.groups;
  if (split) {
    const dir = widget.lowestFirst ? 1 : -1;
    // Groups with a natural order (hours, days, how late, order size, stars) keep it, except in top lists.
    const ordered = ORDERED.has(split) && widget.view !== 'top';
    groups = [...groups].filter((g) => g.value !== null).sort((a, b) => ordered ? a.key.localeCompare(b.key, undefined, { numeric: true }) : dir * ((a.value || 0) - (b.value || 0)) || a.label.localeCompare(b.label));
    const limit = widget.view === 'top' ? widget.limit || 8 : widget.view === 'donut' ? 6 : widget.view === 'table' ? widget.limit || 15 : widget.view === 'bar' ? widget.limit || 10 : groups.length;
    if (groups.length > limit) {
      const head = groups.slice(0, additive(unit) && widget.view !== 'top' && widget.view !== 'table' ? limit - 1 : limit);
      const rest = groups.slice(head.length);
      groups = additive(unit) && widget.view !== 'top' && widget.view !== 'table' ? [...head, { key: '__other__', label: `Other (${rest.length})`, value: rest.reduce((s, g) => s + (g.value || 0), 0) }] : head;
    }
  }

  let series: Series[] = [];
  if (split && bucket && main.grid.length) {
    const ranked = [...main.grid].sort((a, b) => (main.groups.find((g) => g.key === b.group.key)?.value || 0) - (main.groups.find((g) => g.key === a.group.key)?.value || 0));
    const keep = widget.view === 'line' ? 5 : 6;
    series = ranked.slice(0, keep).map((row) => ({ key: row.group.key, label: row.group.label, values: row.values }));
    const rest = ranked.slice(keep);
    if (rest.length && additive(unit)) series.push({ key: '__other__', label: `Other (${rest.length})`, values: main.buckets.map((_, i) => rest.reduce((s, row) => s + (row.values[i] || 0), 0)) });
  }

  const columns = (widget.view === 'table' ? widget.columns || [] : []).map((key) => metricByKey(key)).filter((m): m is MetricDef => !!m).map((col) => {
    const result = evaluate(p, { ...query, metric: col.key, bucket: undefined, range: isDated(col) ? range : null });
    return { metric: col, values: new Map(result.groups.map((g) => [g.key, g.value])) };
  });

  let elapsed: number | null = null;
  if (widget.view === 'target' && !snapshot && range.fromAd <= today && range.toAd >= today) {
    const total = (Date.parse(range.toAd) - Date.parse(range.fromAd)) / 86400000 + 1;
    elapsed = Math.min(1, ((Date.parse(today) - Date.parse(range.fromAd)) / 86400000 + 1) / total);
  }

  return {
    metric, title: widget.title || (typeof widget.metric === 'string' ? metric?.label || 'Removed number' : widget.metric.label), unit,
    value: main.value, previous: prev?.value ?? null, delta: metric && prev ? change(main.value, prev.value, unit, metric.better) : null,
    range, previousRange, groups, previousGroups: new Map((prev?.groups || []).map((g) => [g.key, g.value])), buckets: main.buckets, series, columns,
    ignored: main.ignored, query, elapsed,
  };
}

/** True when a ratio's bottom number is zero, so the chart says "no data" rather than 0. */
export const hasNoBase = (data: WidgetData) => data.value === null && !!data.metric && isRatio(data.metric);
