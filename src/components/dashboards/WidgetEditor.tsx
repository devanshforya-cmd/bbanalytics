'use client';

import NumberInput from '@/components/common/NumberInput';
import Portal from '@/components/common/Portal';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { AREAS, metricByKey, type MetricDef } from '@/lib/metrics/catalog';
import { dimensionOptions, isDated, metricDimensions, resolveMetric, visibleMetrics, type FormulaMetric } from '@/lib/metrics/engine';
import { VIEWS, newId, type DashboardFilters, type ViewKind, type Widget } from '@/lib/metrics/dashboards';
import { DIMENSIONS, type DimensionKey, type Prepared } from '@/lib/metrics/sources';
import WidgetCard from './WidgetCard';

const OPS: { key: FormulaMetric['op']; label: string }[] = [
  { key: 'percent', label: 'as a % of' }, { key: 'divide', label: 'divided by' }, { key: 'per100', label: 'per 100' }, { key: 'minus', label: 'minus' }, { key: 'plus', label: 'plus' },
];

/** Add or change a chart in three steps, with a live preview. */
export default function WidgetEditor({ prepared, filters, initial, onSave, onClose }: {
  prepared: Prepared; filters: DashboardFilters; initial?: Widget; onSave: (widget: Widget) => void; onClose: () => void;
}) {
  const user = db.getCurrentUser();
  const metrics = useMemo(() => visibleMetrics(user), [user]);
  const [widget, setWidget] = useState<Widget>(() => initial ? structuredClone(initial) : { id: newId('w'), metric: metrics[0]?.key || 'online_orders', view: 'number', size: 'S' });
  const [mode, setMode] = useState<'library' | 'formula'>(typeof widget.metric === 'string' ? 'library' : 'formula');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [filterDim, setFilterDim] = useState<DimensionKey | ''>('');
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('input, button')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const metric = resolveMetric(widget.metric);
  const dims = metricDimensions(metric);
  const dated = isDated(metric);
  const set = (patch: Partial<Widget>) => { setError(''); setWidget((current) => ({ ...current, ...patch })); };
  const formula: FormulaMetric = typeof widget.metric === 'string' ? { label: '', a: metrics[0]?.key || '', op: 'percent', b: metrics[1]?.key || '' } : widget.metric;

  const viewOk = (view: ViewKind) => {
    if (view === 'line' || view === 'stacked') return dated;
    if (view === 'donut' || view === 'table' || view === 'top') return dims.length > 0;
    return true;
  };
  const needsSplit = ['donut', 'table', 'top', 'stacked'].includes(widget.view) || (widget.view === 'bar' && !dated);
  const canSplit = widget.view !== 'number' && widget.view !== 'target';

  const chooseMetric = (key: string) => {
    const next = metricByKey(key);
    const nextDims = metricDimensions(next || null);
    set({ metric: key, title: undefined, split: widget.split && nextDims.includes(widget.split) ? widget.split : undefined, columns: undefined, view: next && !isDated(next) && (widget.view === 'line' || widget.view === 'stacked') ? 'number' : widget.view });
  };
  const setFormula = (patch: Partial<FormulaMetric>) => set({ metric: { ...formula, ...patch }, split: undefined, columns: undefined });

  const save = () => {
    if (!metric) { setError('Choose a number to show.'); return; }
    if (needsSplit && !widget.split) { setError('Choose how to split this chart (step 3).'); return; }
    if (widget.view === 'target' && !(widget.target && widget.target > 0)) { setError('Enter the target (step 3).'); return; }
    if (typeof widget.metric !== 'string' && !widget.metric.label.trim()) { setError('Name your number.'); return; }
    const clean: Widget = { ...widget };
    if (!canSplit) delete clean.split;
    if (clean.view !== 'table') delete clean.columns;
    if (clean.view !== 'target') delete clean.target;
    if (!(clean.view === 'line' || clean.view === 'stacked' || (clean.view === 'bar' && !clean.split))) delete clean.bucket;
    onSave(clean);
  };

  const term = search.trim().toLowerCase();
  const filtered = metrics.filter((m) => !term || `${m.label} ${m.area} ${m.description}`.toLowerCase().includes(term));
  const tableColumns = metrics.filter((m) => m.key !== (typeof widget.metric === 'string' ? widget.metric : '') && metricDimensions(m).includes(widget.split as DimensionKey));

  return (
    <Portal><div className="fixed inset-0 z-[70] flex justify-end bg-slate-900/40" role="dialog" aria-modal="true" aria-labelledby="editor-title" onClick={onClose}>
      <div ref={panelRef} className="flex h-full w-full max-w-5xl flex-col bg-slate-50 shadow-2xl lg:flex-row" onClick={(event) => event.stopPropagation()}>
        <div className="flex min-h-0 flex-1 flex-col bg-white lg:max-w-md">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 id="editor-title" className="text-base font-bold text-slate-900">{initial ? 'Change chart' : 'Add a chart'}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4 text-sm">
            <fieldset>
              <legend className="mb-2 text-xs font-bold text-slate-800">1. What to measure</legend>
              <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-1 text-xs" role="tablist">
                <button type="button" role="tab" aria-selected={mode === 'library'} onClick={() => { setMode('library'); if (typeof widget.metric !== 'string') chooseMetric(metrics[0]?.key || 'online_orders'); }} className={`flex-1 rounded-md px-2 py-1.5 font-semibold ${mode === 'library' ? 'bg-white shadow-sm' : 'text-slate-600'}`}>From the list</button>
                <button type="button" role="tab" aria-selected={mode === 'formula'} onClick={() => { setMode('formula'); setFormula({}); }} className={`flex-1 rounded-md px-2 py-1.5 font-semibold ${mode === 'formula' ? 'bg-white shadow-sm' : 'text-slate-600'}`}>Your own number</button>
              </div>
              {mode === 'library' ? (
                <>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3">
                    <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    <span className="sr-only">Find a number</span>
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a number, e.g. return rate" className="w-full py-2 text-sm outline-none" />
                  </label>
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                    {AREAS.map((area) => {
                      const list = filtered.filter((m) => m.area === area);
                      if (!list.length) return null;
                      return (
                        <div key={area}>
                          <p className="sticky top-0 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500">{area}</p>
                          {list.map((m) => (
                            <label key={m.key} className={`flex cursor-pointer gap-2 px-3 py-1.5 text-xs hover:bg-blue-50 ${widget.metric === m.key ? 'bg-blue-50' : ''}`}>
                              <input type="radio" name="metric" checked={widget.metric === m.key} onChange={() => chooseMetric(m.key)} className="mt-0.5" />
                              <span><span className="font-semibold text-slate-900">{m.label}</span>{m.snapshot && <span className="ml-1 text-[11px] text-slate-500">(right now)</span>}<span className="block text-slate-500">{m.description}</span></span>
                            </label>
                          ))}
                        </div>
                      );
                    })}
                    {!filtered.length && <p className="px-3 py-4 text-xs text-slate-500">No number matches. Try another word.</p>}
                  </div>
                </>
              ) : (
                <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-xs">
                  <MetricSelect label="Take" value={formula.a} metrics={metrics} onChange={(a) => setFormula({ a })} />
                  <label className="block font-semibold text-slate-700">and show it
                    <select value={formula.op} onChange={(e) => setFormula({ op: e.target.value as FormulaMetric['op'] })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 font-normal">
                      {OPS.map((op) => <option key={op.key} value={op.key}>{op.label}</option>)}
                    </select>
                  </label>
                  <MetricSelect label="this number" value={formula.b} metrics={metrics} onChange={(b) => setFormula({ b })} />
                  <label className="block font-semibold text-slate-700">Name
                    <input value={formula.label} maxLength={60} onChange={(e) => setFormula({ label: e.target.value })} placeholder="e.g. Complaints per delivered order" className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 font-normal" />
                  </label>
                  <p className="text-slate-500">Both numbers use the same dates and filters. Splits work for groups both numbers share.</p>
                </div>
              )}
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-xs font-bold text-slate-800">2. Show it as</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {VIEWS.map((view) => {
                  const ok = viewOk(view.key);
                  return (
                    <label key={view.key} className={`rounded-lg border px-2.5 py-2 text-xs ${widget.view === view.key ? 'border-blue-500 bg-blue-50' : 'border-slate-200'} ${ok ? 'cursor-pointer hover:border-blue-300' : 'cursor-not-allowed opacity-50'}`} title={ok ? view.hint : 'Not available for this number'}>
                      <input type="radio" name="view" className="sr-only" disabled={!ok} checked={widget.view === view.key} onChange={() => set({ view: view.key, size: view.key === 'number' || view.key === 'target' ? 'S' : widget.size === 'S' ? 'M' : widget.size })} />
                      <span className="block font-semibold text-slate-900">{view.label}</span><span className="text-[11px] text-slate-500">{view.hint}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="mb-2 text-xs font-bold text-slate-800">3. Split, filter and finish</legend>
              {canSplit && (
                <label className="block text-xs font-semibold text-slate-700">Split by{needsSplit ? '' : ' (optional)'}
                  <select value={widget.split || ''} onChange={(e) => set({ split: (e.target.value || undefined) as DimensionKey | undefined, columns: undefined })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 font-normal">
                    <option value="">{needsSplit ? 'Choose…' : 'Don’t split'}</option>
                    {dims.map((dim) => <option key={dim} value={dim}>{DIMENSIONS[dim]}</option>)}
                  </select>
                </label>
              )}
              {dated && (widget.view === 'line' || widget.view === 'stacked' || (widget.view === 'bar' && !widget.split)) && (
                <label className="block text-xs font-semibold text-slate-700">Each point is a
                  <select value={widget.bucket || 'auto'} onChange={(e) => set({ bucket: e.target.value as Widget['bucket'] })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 font-normal">
                    <option value="auto">Picked from the dates (day, week or month)</option><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option>
                  </select>
                </label>
              )}
              {widget.view === 'table' && widget.split && (
                <fieldset className="text-xs">
                  <legend className="font-semibold text-slate-700">More columns (up to 4)</legend>
                  <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-200 p-2">
                    {tableColumns.map((m) => (
                      <label key={m.key} className="flex items-center gap-2 py-0.5">
                        <input type="checkbox" checked={!!widget.columns?.includes(m.key)} disabled={!widget.columns?.includes(m.key) && (widget.columns?.length || 0) >= 4}
                          onChange={(e) => set({ columns: e.target.checked ? [...(widget.columns || []), m.key] : (widget.columns || []).filter((k) => k !== m.key) })} />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {(widget.view === 'top' || widget.view === 'table' || widget.view === 'bar') && widget.split && (
                <div className="flex gap-3 text-xs">
                  <label className="font-semibold text-slate-700">Rows
                    <NumberInput type="number" min={3} max={50} value={widget.limit || (widget.view === 'top' ? 8 : widget.view === 'table' ? 15 : 10)} onChange={(e) => set({ limit: Math.max(3, Math.min(50, Math.round(Number(e.target.value) || 8))) })} className="ml-2 w-16 rounded-lg border border-slate-300 px-2 py-1 font-normal" />
                  </label>
                  <label className="flex items-center gap-1.5 font-semibold text-slate-700"><input type="checkbox" checked={!!widget.lowestFirst} onChange={(e) => set({ lowestFirst: e.target.checked || undefined })} /> Lowest first</label>
                </div>
              )}
              {widget.view === 'target' && (
                <label className="block text-xs font-semibold text-slate-700">{metric?.better === 'down' ? 'Limit for the period' : 'Target for the period'}
                  <NumberInput type="number" min={0} step="any" value={widget.target ?? ''} onChange={(e) => set({ target: Number(e.target.value) || undefined })} placeholder={metric?.unit === 'npr' ? 'e.g. 500000' : 'e.g. 400'} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 font-normal" />
                  <span className="mt-1 block font-normal text-slate-500">It applies to the dates chosen at the top of the dashboard. While the period is still running, the chart says whether you’re on pace.</span>
                </label>
              )}

              <div className="text-xs">
                <p className="font-semibold text-slate-700">Only include</p>
                {Object.entries(widget.where || {}).map(([dim, keys]) => (
                  <FilterRow key={dim} prepared={prepared} metric={metric} dim={dim as DimensionKey} keys={keys || []}
                    onChange={(next) => { const where = { ...(widget.where || {}) }; if (next.length) where[dim as DimensionKey] = next; else delete where[dim as DimensionKey]; set({ where: Object.keys(where).length ? where : undefined }); }} />
                ))}
                <div className="mt-1 flex gap-2">
                  <label className="sr-only" htmlFor="add-filter">Add a filter</label>
                  <select id="add-filter" value={filterDim} onChange={(e) => setFilterDim(e.target.value as DimensionKey | '')} className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5">
                    <option value="">Add a filter…</option>
                    {dims.filter((dim) => !widget.where?.[dim]).map((dim) => <option key={dim} value={dim}>{DIMENSIONS[dim]}</option>)}
                  </select>
                  <button type="button" disabled={!filterDim} onClick={() => { if (filterDim) { set({ where: { ...(widget.where || {}), [filterDim]: [] } }); setFilterDim(''); } }} className="rounded-lg border border-slate-300 px-3 font-semibold text-slate-700 disabled:opacity-40">Add</button>
                </div>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-3 text-xs">
                <label className="font-semibold text-slate-700">Chart title (optional)
                  <input value={widget.title || ''} maxLength={60} onChange={(e) => set({ title: e.target.value || undefined })} placeholder={metric?.label || ''} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 font-normal" />
                </label>
                <label className="font-semibold text-slate-700">Size
                  <select value={widget.size} onChange={(e) => set({ size: e.target.value as Widget['size'] })} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 font-normal">
                    <option value="S">Small</option><option value="M">Medium</option><option value="L">Full width</option>
                  </select>
                </label>
              </div>
            </fieldset>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
            {error && <p className="mr-auto text-xs font-semibold text-rose-600" role="alert">{error}</p>}
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={save} className="btn btn-primary">{initial ? 'Save chart' : 'Add chart'}</button>
          </div>
        </div>
        <div className="hidden flex-1 flex-col gap-3 overflow-y-auto p-6 lg:flex">
          <p className="text-xs font-bold text-slate-500">Preview</p>
          {metric ? <WidgetCard prepared={prepared} widget={widget} filters={filters} preview /> : <p className="text-sm text-slate-500">Choose a number to see the preview.</p>}
        </div>
      </div>
    </div></Portal>
  );
}

function MetricSelect({ label, value, metrics, onChange }: { label: string; value: string; metrics: MetricDef[]; onChange: (key: string) => void }) {
  return (
    <label className="block font-semibold text-slate-700">{label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 font-normal">
        {AREAS.map((area) => {
          const list = metrics.filter((m) => m.area === area && !('num' in m));
          return list.length ? <optgroup key={area} label={area}>{list.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</optgroup> : null;
        })}
      </select>
    </label>
  );
}

function FilterRow({ prepared, metric, dim, keys, onChange }: { prepared: Prepared; metric: MetricDef | null; dim: DimensionKey; keys: string[]; onChange: (keys: string[]) => void }) {
  const options = useMemo(() => dimensionOptions(prepared, metric, dim), [prepared, metric, dim]);
  return (
    <div className="mt-1 rounded-lg border border-slate-200 p-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-800">{DIMENSIONS[dim]}</span>
        <button type="button" onClick={() => onChange([])} className="text-[11px] font-semibold text-slate-500 hover:text-rose-600">Remove filter</button>
      </div>
      <div className="mt-1 flex max-h-28 flex-wrap gap-1 overflow-y-auto">
        {options.map((option) => (
          <label key={option.key} className={`cursor-pointer rounded-full border px-2 py-0.5 ${keys.includes(option.key) ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600'}`}>
            <input type="checkbox" className="sr-only" checked={keys.includes(option.key)} onChange={(e) => onChange(e.target.checked ? [...keys, option.key] : keys.filter((k) => k !== option.key))} />
            {option.label}
          </label>
        ))}
        {!options.length && <span className="text-slate-500">No values yet.</span>}
      </div>
      {!keys.length && <p className="mt-1 text-[11px] text-amber-700">Pick at least one, or remove the filter.</p>}
    </div>
  );
}
