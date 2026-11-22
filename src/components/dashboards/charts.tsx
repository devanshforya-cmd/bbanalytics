'use client';

/**
 * Small, dependency-free charts drawn as SVG. Every mark can be clicked to see the records behind it,
 * and each chart carries a text summary for screen readers.
 */
import { useId } from 'react';
import { formatValue, type Point } from '@/lib/metrics/engine';
import type { Unit } from '@/lib/metrics/catalog';

// The BB logo blue leads; the rest are clear, distinct hues so every series reads at a glance.
export const PALETTE = ['#0c79b5', '#f2a12e', '#17a95c', '#e5484d', '#7a5ce0', '#12a5b4', '#d9559b', '#8b8b92'];
const useSvgId = () => useId().replace(/[^a-zA-Z0-9_-]/g, '');
const delay = (i: number, n: number) => ({ animationDelay: `${Math.round((Math.min(i, 30) / Math.max(1, Math.min(n, 30))) * 420)}ms` });
const OTHER = '#d4d4d8';

type Pick = (key: string) => void;

const finite = (values: (number | null | undefined)[]) => values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
function niceMax(max: number) {
  // Never below 2, so the half-way gridline is a whole number and labels never repeat.
  if (max <= 2) return 2;
  const step = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (max <= m * step) return m * step;
  return 10 * step;
}
const short = (value: number, unit: Unit) => formatValue(value, unit, { compact: true }).replace('NPR ', '');
const summary = (points: Point[], unit: Unit) => points.slice(0, 12).map((p) => `${p.label}: ${formatValue(p.value, unit)}`).join('; ');

export function LineChart({ buckets, series, unit, onPick }: { buckets: Point[]; series?: { key: string; label: string; values: (number | null)[] }[]; unit: Unit; onPick?: (bucket: string, group?: string) => void }) {
  const lines = series?.length ? series : [{ key: '__all__', label: 'Total', values: buckets.map((b) => b.value) }];
  const W = 600, H = 200, L = 44, B = 22, T = 8;
  const max = niceMax(Math.max(0, ...finite(lines.flatMap((l) => l.values))));
  const x = (i: number) => L + (buckets.length <= 1 ? (W - L) / 2 : (i / (buckets.length - 1)) * (W - L - 8));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 6));
  const uid = useSvgId();
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full" role="img" aria-label={`Line chart. ${summary(buckets, unit)}`}>
        <defs>
          <linearGradient id={`${uid}-stroke`} x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#233f70" /><stop offset="0.55" stopColor="#0c79b5" /><stop offset="1" stopColor="#3ea4dd" /></linearGradient>
          <linearGradient id={`${uid}-area`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#0c79b5" stopOpacity="0.22" /><stop offset="1" stopColor="#0c79b5" stopOpacity="0" /></linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="#ececee" /><text x={L - 6} y={y(max * f) + 4} textAnchor="end" className="fill-slate-500 font-mono text-[11px]">{short(max * f, unit)}</text></g>)}
        {buckets.map((b, i) => i % labelEvery === 0 || i === buckets.length - 1 ? <text key={b.key} x={x(i)} y={H - 6} textAnchor="middle" className="fill-slate-500 font-mono text-[11px]">{b.label.replace('Week of ', '')}</text> : null)}
        {lines.map((line, li) => {
          const color = line.key === '__other__' ? OTHER : PALETTE[li % PALETTE.length];
          const pts = line.values.map((v, i) => (v === null ? null : [x(i), y(v)] as const));
          const d = pts.reduce((acc, pt, i) => (pt ? `${acc}${acc && pts[i - 1] ? 'L' : 'M'}${pt[0]},${pt[1]}` : acc), '');
          const lead = lines.length === 1;
          const solid = pts.filter((pt): pt is readonly [number, number] => !!pt);
          const area = lead && solid.length > 1 && solid.length === pts.length ? `${d}L${solid[solid.length - 1][0]},${H - B}L${solid[0][0]},${H - B}Z` : '';
          return (
            <g key={line.key}>
              {area && <path d={area} fill={`url(#${uid}-area)`} className="bb-fade" />}
              <path d={d} pathLength={1} fill="none" stroke={lead ? `url(#${uid}-stroke)` : color} strokeWidth={lead ? 2.5 : 2} strokeLinejoin="round" strokeLinecap="round" className="bb-draw" style={{ animationDelay: `${120 + li * 120}ms` }} />
              {pts.map((pt, i) => pt && (
                <circle key={i} cx={pt[0]} cy={pt[1]} r={buckets.length > 40 ? 2 : 3.5} fill="#fff" stroke={color} strokeWidth="2" style={{ animationDelay: `${300 + (i / Math.max(1, pts.length)) * 900}ms` }} className={`bb-dot ${onPick ? 'cursor-pointer' : ''}`}
                  onClick={() => onPick?.(buckets[i].key, line.key === '__all__' || line.key === '__other__' ? undefined : line.key)}>
                  <title>{`${line.label} · ${buckets[i].label}: ${formatValue(line.values[i], unit)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {lines.length > 1 && <Legend items={lines.map((l, i) => ({ label: l.label, color: l.key === '__other__' ? OTHER : PALETTE[i % PALETTE.length] }))} />}
    </figure>
  );
}

/** Columns over time. */
export function ColumnChart({ buckets, unit, onPick }: { buckets: Point[]; unit: Unit; onPick?: (bucket: string) => void }) {
  const W = 600, H = 200, L = 44, B = 22, T = 8;
  const max = niceMax(Math.max(0, ...finite(buckets.map((b) => b.value))));
  const slot = (W - L) / Math.max(1, buckets.length);
  const bw = Math.max(2, Math.min(40, slot * 0.7));
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 6));
  const uid = useSvgId();
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="bb-marks h-48 w-full" role="img" aria-label={`Column chart. ${summary(buckets, unit)}`}>
      <defs><linearGradient id={`${uid}-bar`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3ea4dd" /><stop offset="1" stopColor="#0c79b5" /></linearGradient></defs>
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W} y1={T + (H - T - B) * (1 - f)} y2={T + (H - T - B) * (1 - f)} stroke="#ececee" /><text x={L - 6} y={T + (H - T - B) * (1 - f) + 4} textAnchor="end" className="fill-slate-500 font-mono text-[11px]">{short(max * f, unit)}</text></g>)}
      {buckets.map((b, i) => {
        const h = ((b.value || 0) / max) * (H - T - B);
        const cx = L + slot * i + slot / 2;
        return (
          <g key={b.key} className={onPick ? 'cursor-pointer' : ''} onClick={() => onPick?.(b.key)}>
            <rect x={cx - bw / 2} y={H - B - h} width={bw} height={Math.max(0, h)} rx="3" fill={`url(#${uid}-bar)`} className="bb-grow bb-mark" style={delay(i, buckets.length)}><title>{`${b.label}: ${formatValue(b.value, unit)}`}</title></rect>
            {(i % labelEvery === 0 || i === buckets.length - 1) && <text x={cx} y={H - 6} textAnchor="middle" className="fill-slate-500 font-mono text-[11px]">{b.label.replace('Week of ', '')}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** Columns over time, each split into groups. */
export function StackedChart({ buckets, series, unit, onPick }: { buckets: Point[]; series: { key: string; label: string; values: (number | null)[] }[]; unit: Unit; onPick?: (bucket: string, group?: string) => void }) {
  const W = 600, H = 200, L = 44, B = 22, T = 8;
  const totals = buckets.map((_, i) => series.reduce((s, line) => s + (line.values[i] || 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  const slot = (W - L) / Math.max(1, buckets.length);
  const bw = Math.max(2, Math.min(40, slot * 0.7));
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 6));
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="bb-marks h-48 w-full" role="img" aria-label={`Stacked column chart of ${series.map((s) => s.label).join(', ')}`}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W} y1={T + (H - T - B) * (1 - f)} y2={T + (H - T - B) * (1 - f)} stroke="#ececee" /><text x={L - 6} y={T + (H - T - B) * (1 - f) + 4} textAnchor="end" className="fill-slate-500 font-mono text-[11px]">{short(max * f, unit)}</text></g>)}
        {buckets.map((b, i) => {
          let base = H - B;
          const cx = L + slot * i + slot / 2;
          return (
            <g key={b.key} className="bb-grow" style={delay(i, buckets.length)}>
              {series.map((line, li) => {
                const h = ((line.values[i] || 0) / max) * (H - T - B);
                base -= h;
                return h > 0 ? (
                  <rect key={line.key} x={cx - bw / 2} y={base} width={bw} height={h} fill={line.key === '__other__' ? OTHER : PALETTE[li % PALETTE.length]} className={`bb-mark ${onPick ? 'cursor-pointer' : ''}`}
                    onClick={() => onPick?.(b.key, line.key === '__other__' ? undefined : line.key)}>
                    <title>{`${line.label} · ${b.label}: ${formatValue(line.values[i], unit)}`}</title>
                  </rect>
                ) : null;
              })}
              {(i % labelEvery === 0 || i === buckets.length - 1) && <text x={cx} y={H - 6} textAnchor="middle" className="fill-slate-500 font-mono text-[11px]">{b.label.replace('Week of ', '')}</text>}
            </g>
          );
        })}
      </svg>
      <Legend items={series.map((s, i) => ({ label: s.label, color: s.key === '__other__' ? OTHER : PALETTE[i % PALETTE.length] }))} />
    </figure>
  );
}

/** Groups as horizontal bars, biggest first. Also used for top lists. */
export function BarList({ points, unit, onPick, ranked = false, compare }: { points: Point[]; unit: Unit; onPick?: Pick; ranked?: boolean; compare?: Map<string, number | null> }) {
  const max = Math.max(0, ...finite(points.map((p) => p.value)));
  if (!points.length) return <p className="py-6 text-center text-xs text-slate-400">Nothing in this period.</p>;
  return (
    <ol className="space-y-2">
      {points.map((p, i) => {
        const before = compare?.get(p.key);
        return (
          <li key={p.key}>
            <button type="button" disabled={!onPick || p.key === '__other__'} onClick={() => onPick?.(p.key)} className="group w-full rounded-md py-0.5 text-left text-xs transition-colors enabled:hover:bg-slate-50">
              <div className="flex items-baseline justify-between gap-2 px-1">
                <span className="min-w-0 truncate text-slate-700">{ranked && <span className="mr-1.5 tabular-nums text-slate-400">{i + 1}.</span>}{p.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatValue(p.value, unit)}{before !== undefined && before !== null && p.value !== null && <span className="ml-1 font-normal text-slate-400">(was {formatValue(before, unit)})</span>}</span>
              </div>
              <div className="mx-1 mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="bb-grow-x h-2 rounded-full transition-[filter] group-hover:brightness-110" style={{ width: `${max ? Math.max(2, ((p.value || 0) / max) * 100) : 0}%`, background: p.key === '__other__' ? OTHER : 'linear-gradient(90deg, #233f70, #0c79b5 60%, #3ea4dd)', animationDelay: `${Math.min(i, 12) * 50}ms` }} /></div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function Donut({ points, unit, onPick }: { points: Point[]; unit: Unit; onPick?: Pick }) {
  const uid = useSvgId();
  const total = points.reduce((s, p) => s + Math.max(0, p.value || 0), 0);
  if (!total) return <p className="py-6 text-center text-xs text-slate-400">Nothing in this period.</p>;
  let angle = -Math.PI / 2;
  const arcs = points.map((p, i) => {
    const share = Math.max(0, p.value || 0) / total;
    const start = angle; angle += share * Math.PI * 2;
    const large = share > 0.5 ? 1 : 0;
    const r = 40, ri = 24, cx = 50, cy = 50;
    const pt = (a: number, rad: number) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
    const d = share >= 0.9999
      ? `M${cx},${cy - r} A${r},${r} 0 1 1 ${cx - 0.01},${cy - r} L${cx - 0.01},${cy - ri} A${ri},${ri} 0 1 0 ${cx},${cy - ri} Z`
      : `M${pt(start, r)} A${r},${r} 0 ${large} 1 ${pt(angle, r)} L${pt(angle, ri)} A${ri},${ri} 0 ${large} 0 ${pt(start, ri)} Z`;
    return { p, d, color: p.key === '__other__' ? OTHER : PALETTE[i % PALETTE.length], share };
  });
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 100 100" className="bb-marks h-32 w-32 shrink-0" role="img" aria-label={`Share chart. ${summary(points, unit)}`}>
        <defs><mask id={`${uid}-sweep`}><circle cx="50" cy="50" r="32" fill="none" stroke="#fff" strokeWidth="20" pathLength={1} transform="rotate(-90 50 50)" className="bb-sweep" /></mask></defs>
        <g mask={`url(#${uid}-sweep)`}>
        {arcs.map((a) => <path key={a.p.key} d={a.d} fill={a.color} stroke="#fff" strokeWidth="0.8" className={`bb-mark ${onPick && a.p.key !== '__other__' ? 'cursor-pointer' : ''}`} onClick={() => a.p.key !== '__other__' && onPick?.(a.p.key)}><title>{`${a.p.label}: ${formatValue(a.p.value, unit)} (${Math.round(a.share * 100)}%)`}</title></path>)}
        </g>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-xs">
        {arcs.map((a) => (
          <li key={a.p.key}><button type="button" disabled={!onPick || a.p.key === '__other__'} onClick={() => onPick?.(a.p.key)} className="flex w-full items-center gap-2 rounded px-1 text-left enabled:hover:bg-slate-50">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: a.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-slate-700">{a.p.label}</span>
            <span className="tabular-nums text-slate-500">{Math.round(a.share * 100)}%</span>
            <span className="w-20 text-right font-semibold tabular-nums text-slate-900">{formatValue(a.p.value, unit, { compact: true })}</span>
          </button></li>
        ))}
      </ul>
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
      {items.map((item) => <li key={item.label} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: item.color }} aria-hidden="true" />{item.label}</li>)}
    </ul>
  );
}
