'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Info, Maximize2, Pencil, Trash2, GripVertical } from 'lucide-react';
import { formatValue, change as changeOf, isDated } from '@/lib/metrics/engine';
import { computeWidget, hasNoBase, type WidgetData } from '@/lib/metrics/widget-data';
import type { DashboardFilters, Widget } from '@/lib/metrics/dashboards';
import { DIMENSIONS, type DimensionKey, type Prepared } from '@/lib/metrics/sources';
import { BarList, ColumnChart, Donut, LineChart, StackedChart } from './charts';
import RecordsDialog from './RecordsDialog';

const SPAN: Record<Widget['size'], string> = { S: 'col-span-1', M: 'col-span-1 md:col-span-2', L: 'col-span-1 md:col-span-2 xl:col-span-4' };
const TONE = { good: 'bg-emerald-50 text-emerald-700', bad: 'bg-rose-50 text-rose-700', flat: 'text-slate-500' };

/** A number that counts up to its value when it first appears or changes. */
function CountUp({ value, render }: { value: number | null; render: (v: number | null) => string }) {
  const [shown, setShown] = useState<number | null>(value === null ? null : 0);
  const from = useRef(0);
  useEffect(() => {
    if (value === null || !Number.isFinite(value)) { setShown(value); return; }
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(value); from.current = value; return; }
    const start = performance.now(), a = from.current, b = value, ms = 900;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(t >= 1 ? b : a + (b - a) * eased);
      if (t < 1) frame = requestAnimationFrame(tick); else from.current = b;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  // While counting, whole numbers stay whole so the figure never flickers through decimals.
  const display = shown !== null && value !== null && shown !== value && Number.isInteger(value) ? Math.round(shown) : shown;
  return <>{render(display)}</>;
}

export interface CardActions { onEdit: () => void; onDuplicate: () => void; onRemove: () => void; onMove: (step: -1 | 1) => void; onResize: () => void }

/** One chart on a dashboard. Clicking a number, bar or row lists the records behind it. */
export default function WidgetCard({ prepared, widget, filters, extraWhere, editing, actions, dragProps, preview = false }: {
  prepared: Prepared; widget: Widget; filters: DashboardFilters; extraWhere?: Partial<Record<DimensionKey, string[]>>;
  editing?: boolean; actions?: CardActions; dragProps?: React.HTMLAttributes<HTMLElement>; preview?: boolean;
}) {
  const data = useMemo(() => computeWidget(prepared, widget, filters, extraWhere), [prepared, widget, filters, extraWhere]);
  const [records, setRecords] = useState<{ group?: string; bucket?: string; label: string } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const pickGroup = (key: string) => setRecords({ group: key, label: data.groups.find((g) => g.key === key)?.label || key });
  const pickBucket = (bucket: string, group?: string) => setRecords({ bucket, group, label: [data.buckets.find((b) => b.key === bucket)?.label, group && data.series.find((s) => s.key === group)?.label].filter(Boolean).join(' · ') });
  const where = Object.entries(widget.where || {}).filter(([, keys]) => keys?.length).map(([dim]) => DIMENSIONS[dim as DimensionKey]);
  const isSnapshot = !!data.metric && !isDated(data.metric);
  const subtitle = isSnapshot ? 'Right now' : data.range.label;

  return (
    <section className={`${preview ? '' : SPAN[widget.size]} bb-card flex min-w-0 flex-col rounded-2xl border border-black/[0.08] bg-white p-4 ${editing ? 'ring-1 ring-blue-200' : ''}`} aria-label={data.title} {...dragProps}>
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1 text-[13px] font-semibold leading-snug text-slate-800">
            {editing && <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-slate-400" aria-hidden="true" />}
            <span className="truncate">{data.title}</span>
            {data.metric && (
              <button type="button" onClick={() => setShowInfo((v) => !v)} aria-expanded={showInfo} aria-label={`How ${data.title} is worked out`} className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700"><Info className="h-3.5 w-3.5" /></button>
            )}
          </h3>
          <p className="text-[11px] text-slate-500">{subtitle}{widget.split && data.metric ? ` · by ${DIMENSIONS[widget.split].toLowerCase()}` : ''}{where.length ? ` · filtered by ${where.join(', ').toLowerCase()}` : ''}</p>
        </div>
        {editing && actions && (
          <div className="flex shrink-0 items-center gap-0.5 print:hidden">
            <IconButton label="Move earlier" onClick={() => actions.onMove(-1)}><ArrowUp className="h-3.5 w-3.5" /></IconButton>
            <IconButton label="Move later" onClick={() => actions.onMove(1)}><ArrowDown className="h-3.5 w-3.5" /></IconButton>
            <IconButton label={`Size: ${widget.size === 'S' ? 'small' : widget.size === 'M' ? 'medium' : 'large'}. Change size`} onClick={actions.onResize}><Maximize2 className="h-3.5 w-3.5" /></IconButton>
            <IconButton label="Edit chart" onClick={actions.onEdit}><Pencil className="h-3.5 w-3.5" /></IconButton>
            <IconButton label="Duplicate chart" onClick={actions.onDuplicate}><Copy className="h-3.5 w-3.5" /></IconButton>
            <IconButton label="Remove chart" onClick={actions.onRemove} danger><Trash2 className="h-3.5 w-3.5" /></IconButton>
          </div>
        )}
      </header>
      {showInfo && data.metric && <p className="mb-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-600">{data.metric.description}{data.previousRange ? ` Compared with: ${data.previousRange.label.toLowerCase()} (${data.previousRange.fromAd} to ${data.previousRange.toAd}).` : ''}</p>}
      {!data.metric ? <p className="py-6 text-center text-xs text-slate-500">This number is no longer available. Edit or remove this chart.</p> : <Body data={data} widget={widget} onAll={() => setRecords({ label: subtitle })} onGroup={pickGroup} onBucket={pickBucket} />}
      {data.ignored.length > 0 && <p className="mt-2 text-[11px] text-amber-700">Not filtered by {data.ignored.map((d) => DIMENSIONS[d].toLowerCase()).join(', ')}: this number can’t be split that way.</p>}
      {records && !preview && (
        <RecordsDialog prepared={prepared} query={data.query} title={data.title} subtitle={`${records.label}${records.label === subtitle ? '' : ` · ${subtitle}`}`} only={{ group: records.group, bucket: records.bucket }} onClose={() => setRecords(null)} />
      )}
    </section>
  );
}

function IconButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className={`rounded-md p-1.5 ${danger ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}>{children}</button>;
}

function Body({ data, widget, onAll, onGroup, onBucket }: { data: WidgetData; widget: Widget; onAll: () => void; onGroup: (key: string) => void; onBucket: (bucket: string, group?: string) => void }) {
  const { unit } = data;
  if (hasNoBase(data) && !data.groups.length && !data.buckets.length) return <p className="py-6 text-center text-xs text-slate-400">Not enough data in this period to work this out.</p>;

  if (widget.view === 'number') {
    return (
      <div className="flex flex-1 flex-col justify-end">
        <button type="button" onClick={onAll} className="w-fit rounded text-left text-[28px] leading-none font-medium tabular-nums text-slate-900 hover:text-blue-700" title="See the records behind this number"><CountUp value={data.value} render={(v) => formatValue(v, unit, { compact: true })} /></button>
        <div className="mt-1 flex min-h-[20px] items-center gap-2 text-[11px]">
          {data.delta && <span className={`inline-flex items-center rounded-full px-1.5 py-px font-medium tabular-nums ${TONE[data.delta.tone]}`}>{data.delta.text}</span>}
          {data.previousRange && <span className="text-slate-500">vs {formatValue(data.previous, unit, { compact: true })}</span>}
        </div>
      </div>
    );
  }

  if (widget.view === 'target') {
    const target = widget.target || 0;
    const share = target ? Math.max(0, (data.value || 0) / target) : 0;
    const lower = data.metric?.better === 'down';
    const onPace = data.elapsed !== null && target ? (lower ? (data.value || 0) <= target * data.elapsed : share >= data.elapsed * 0.95) : null;
    return (
      <div className="flex flex-1 flex-col justify-end">
        <div className="flex items-baseline justify-between gap-2">
          <button type="button" onClick={onAll} className="text-[28px] leading-none font-medium tabular-nums text-slate-900 hover:text-blue-700"><CountUp value={data.value} render={(v) => formatValue(v, unit, { compact: true })} /></button>
          <span className="text-xs text-slate-500">{target ? `${lower ? 'limit' : 'target'} ${formatValue(target, unit, { compact: true })}` : 'No target set'}</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, share) * 100)} aria-label="Progress towards the target">
          <div className={`bb-grow-x h-2.5 rounded-full ${lower ? (share > 1 ? 'bg-rose-500' : 'bg-emerald-500') : share >= 1 ? 'bg-emerald-500' : onPace === false ? 'bg-amber-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(100, share * 100)}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-600">
          {!target ? 'Edit the chart to set a target.' : lower ? (share > 1 ? 'Over the limit.' : `${Math.round(share * 100)}% of the limit used.`)
            : share >= 1 ? 'Target reached.' : `${Math.round(share * 100)}% done${onPace === null ? '' : onPace ? ', on pace.' : `, behind pace (${Math.round((data.elapsed || 0) * 100)}% of the period gone).`}`}
        </p>
      </div>
    );
  }

  if (widget.view === 'line') return data.buckets.length ? <LineChart buckets={data.buckets} series={data.series} unit={unit} onPick={onBucket} /> : <SnapshotNote />;
  if (widget.view === 'stacked') return data.buckets.length ? (data.series.length ? <StackedChart buckets={data.buckets} series={data.series} unit={unit} onPick={onBucket} /> : <ColumnChart buckets={data.buckets} unit={unit} onPick={(b) => onBucket(b)} />) : <SnapshotNote />;
  if (widget.view === 'bar' && !widget.split) return data.buckets.length ? <ColumnChart buckets={data.buckets} unit={unit} onPick={(b) => onBucket(b)} /> : <SnapshotNote />;
  if (!widget.split) return <p className="py-6 text-center text-xs text-slate-500">Choose how to split this chart.</p>;
  if (widget.view === 'donut') return <Donut points={data.groups} unit={unit} onPick={onGroup} />;
  if (widget.view === 'table') return <Table data={data} onGroup={onGroup} />;
  return <BarList points={data.groups} unit={unit} onPick={onGroup} ranked={widget.view === 'top'} compare={widget.view === 'top' && data.previousRange ? data.previousGroups : undefined} />;
}

function SnapshotNote() {
  return <p className="py-6 text-center text-xs text-slate-500">This number shows how things stand right now, so it has no history to chart. Show it as a number or split it into groups instead.</p>;
}

function Table({ data, onGroup }: { data: WidgetData; onGroup: (key: string) => void }) {
  if (!data.groups.length) return <p className="py-6 text-center text-xs text-slate-400">Nothing in this period.</p>;
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[420px] text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
            <th scope="col" className="px-1 py-1.5 font-semibold">{DIMENSIONS[data.query.split!]}</th>
            <th scope="col" className="px-1 py-1.5 text-right font-semibold">{data.metric?.label}</th>
            {data.previousRange && <th scope="col" className="px-1 py-1.5 text-right font-semibold">Change</th>}
            {data.columns.map((col) => <th key={col.metric.key} scope="col" className="px-1 py-1.5 text-right font-semibold">{col.metric.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.groups.map((row) => {
            const delta = data.metric ? changeOf(row.value, data.previousGroups.get(row.key) ?? null, data.unit, data.metric.better) : null;
            return (
              <tr key={row.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <th scope="row" className="max-w-[180px] truncate px-1 py-1.5 text-left font-medium text-slate-800">
                  {row.key === '__other__' ? row.label : <button type="button" onClick={() => onGroup(row.key)} className="truncate text-left hover:text-blue-700 hover:underline">{row.label}</button>}
                </th>
                <td className="px-1 py-1.5 text-right font-semibold tabular-nums text-slate-900">{formatValue(row.value, data.unit)}</td>
                {data.previousRange && <td className={`px-1 py-1.5 text-right tabular-nums ${delta?.tone === 'good' ? 'text-emerald-700' : delta?.tone === 'bad' ? 'text-rose-700' : 'text-slate-500'}`}>{delta?.text || '—'}</td>}
                {data.columns.map((col) => <td key={col.metric.key} className="px-1 py-1.5 text-right tabular-nums text-slate-700">{formatValue(col.values.get(row.key), col.metric.unit)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
