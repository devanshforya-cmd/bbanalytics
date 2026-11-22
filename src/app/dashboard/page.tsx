'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Check, ChevronDown, Download, LayoutDashboard, MoreHorizontal, Pencil, Plus, Printer, Lightbulb, X } from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import { toast } from '@/components/common/Toast';
import MorningBriefCard from './components/MorningBriefCard';
import WidgetCard from '@/components/dashboards/WidgetCard';
import { useMetricData } from '@/components/dashboards/useMetricData';
import { db } from '@/lib/db/db-service';
import { getSessionUser } from '@/lib/auth';
import { hasAccess, isSuperAdmin } from '@/lib/permissions';
import { canDownload } from '@/lib/download-access';
import { downloadWorkbook } from '@/lib/export/xlsx';
import { RANGE_LABELS, type RangePreset } from '@/lib/metrics/dates';
import { DIMENSIONS, type DimensionKey } from '@/lib/metrics/sources';
import { formatValue } from '@/lib/metrics/engine';
import { computeWidget } from '@/lib/metrics/widget-data';
import {
  TEMPLATES, cleanPrefs, fromPublished, fromTemplate, newId, templateFor,
  type Dashboard, type DashboardFilters, type DashboardPrefs, type Widget,
} from '@/lib/metrics/dashboards';

// Opened on demand only.
const WidgetEditor = dynamic(() => import('@/components/dashboards/WidgetEditor'));
const SetupWizard = dynamic(() => import('@/components/dashboard/SetupWizard'));

const SIZES: Widget['size'][] = ['S', 'M', 'L'];

/** Each person's own dashboards: tabs, shared dates and brand, charts they choose. */
export default function DashboardPage() {
  const user = getSessionUser() || db.getCurrentUser();
  const { prepared, version } = useMetricData();
  const loaded = db.isWorkspaceLoaded();
  const [prefs, setPrefs] = useState<DashboardPrefs | null>(null);
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<{ widget?: Widget } | null>(null);
  const [menu, setMenu] = useState<'new' | 'more' | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const dirty = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const dragId = useRef<string | null>(null);

  // Load saved dashboards once the workspace is in. Until someone changes something, nothing is saved,
  // so a starting dashboard never overwrites one saved from another device.
  useEffect(() => {
    if (dirty.current) return;
    const saved = db.getMyPreferences().dashboards;
    let next: DashboardPrefs | null = null;
    try { next = saved?.list?.length ? cleanPrefs(saved) : null; } catch { next = null; }
    if (!next) {
      const first = fromTemplate(templateFor(user), user, db.getCalendarMode());
      next = { list: [first], activeId: first.id };
    }
    setPrefs(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, version, user.id]);

  const update = useCallback((change: (draft: DashboardPrefs) => void) => {
    setPrefs((current) => {
      if (!current) return current;
      const draft = structuredClone(current);
      change(draft);
      dirty.current = true;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        try { db.setMyPreferences({ dashboards: cleanPrefs(draft) }); } catch (error) { toast.error(error instanceof Error ? error.message : 'Your dashboard was not saved.'); }
      }, 600);
      return draft;
    });
  }, []);
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  // First-time setup guide for a brand-new workspace.
  const setupDue = loaded && isSuperAdmin(user) && db.getBrands('ALL').length === 0 && !db.getMyPreferences().setupGuideDismissedAt;
  const [showSetup, setShowSetup] = useState(false);
  useEffect(() => { setShowSetup(setupDue); }, [setupDue]);
  const closeSetup = () => { setShowSetup(false); db.setMyPreferences({ setupGuideDismissedAt: new Date().toISOString() }); };

  // The brand chosen in the top bar also narrows every chart.
  const headerBrand = db.getActiveBrandFilter();
  const headerSub = db.getActiveSubBrandFilter();
  const dashboard = prefs?.list.find((d) => d.id === prefs.activeId) || prefs?.list[0];
  const extraWhere = useMemo(() => {
    const where: Partial<Record<DimensionKey, string[]>> = {};
    const brands = [headerBrand !== 'ALL' ? headerBrand : null, dashboard?.filters.brand || null].filter(Boolean) as string[];
    if (brands.length) where.brand = brands.length === 2 && brands[0] !== brands[1] ? ['__none__'] : [brands[0].toUpperCase()];
    if (headerSub) where.subBrand = [headerSub];
    return where;
  }, [headerBrand, headerSub, dashboard?.filters.brand]);

  if (!prefs || !dashboard) return <PageGuard feature="dashboard"><div className="h-64" /></PageGuard>;

  const setActive = (id: string) => update((draft) => { draft.activeId = id; });
  const editDashboard = (change: (d: Dashboard) => void) => update((draft) => { const target = draft.list.find((d) => d.id === dashboard.id); if (target) change(target); });
  const setFilters = (patch: Partial<DashboardFilters>) => editDashboard((d) => { d.filters = { ...d.filters, ...patch }; });
  const addDashboard = (next: Dashboard) => {
    if (prefs.list.length >= 12) { toast.error('You can keep up to 12 dashboards. Delete one first.'); return; }
    update((draft) => { draft.list.push(next); draft.activeId = next.id; });
    setMenu(null);
  };
  const saveWidget = (widget: Widget) => {
    editDashboard((d) => {
      const at = d.widgets.findIndex((w) => w.id === widget.id);
      if (at >= 0) d.widgets[at] = widget; else d.widgets.push(widget);
    });
    setEditor(null);
  };
  const moveWidget = (id: string, step: -1 | 1) => editDashboard((d) => {
    const at = d.widgets.findIndex((w) => w.id === id), to = at + step;
    if (at < 0 || to < 0 || to >= d.widgets.length) return;
    [d.widgets[at], d.widgets[to]] = [d.widgets[to], d.widgets[at]];
  });
  const dropOn = (targetId: string) => {
    const from = dragId.current; dragId.current = null;
    if (!from || from === targetId) return;
    editDashboard((d) => {
      const moving = d.widgets.find((w) => w.id === from); if (!moving) return;
      d.widgets = d.widgets.filter((w) => w.id !== from);
      d.widgets.splice(d.widgets.findIndex((w) => w.id === targetId), 0, moving);
    });
  };

  const brands = db.getBrands('ACTIVE').filter((b) => isSuperAdmin(user) || !user.assignedBrands?.length || user.assignedBrands.includes('ALL') || user.assignedBrands.includes(b.code));
  const published = db.getDashboardTemplates();
  const visibleTemplates = TEMPLATES.filter((t) => t.key === 'owner' || fromTemplate(t.key, user).widgets.length >= 4);

  const downloadExcel = () => {
    const used = new Set<string>();
    const sheets = dashboard.widgets.map((widget) => {
      const data = computeWidget(prepared, widget, dashboard.filters, extraWhere);
      let name = data.title.replace(/[\\/?*[\]:]/g, '').slice(0, 28) || 'Chart';
      while (used.has(name)) name = `${name.slice(0, 26)}_${used.size}`;
      used.add(name);
      const value = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
      const intro: [string, string][] = [['Number', data.title], ['Dates', data.range.label === RANGE_LABELS.custom ? `${data.range.fromAd} to ${data.range.toAd}` : `${data.range.label} (${data.range.fromAd} to ${data.range.toAd})`], ['How it is worked out', data.metric?.description || '']];
      if (data.groups.length && widget.split) return { name, intro, columns: [{ header: DIMENSIONS[widget.split], width: 30 }, { header: data.title, type: 'number' as const }, ...(data.previousRange ? [{ header: 'Earlier period', type: 'number' as const }] : []), ...data.columns.map((c) => ({ header: c.metric.label, type: 'number' as const }))],
        rows: data.groups.map((g) => [g.label, value(g.value), ...(data.previousRange ? [value(data.previousGroups.get(g.key))] : []), ...data.columns.map((c) => value(c.values.get(g.key)))]) };
      if (data.buckets.length) return { name, intro, columns: [{ header: 'Period', width: 20 }, ...(data.series.length ? data.series.map((s) => ({ header: s.label, type: 'number' as const })) : [{ header: data.title, type: 'number' as const }])],
        rows: data.buckets.map((b, i) => [b.label, ...(data.series.length ? data.series.map((s) => value(s.values[i])) : [value(b.value)])]) };
      return { name, intro, columns: [{ header: 'Number', width: 40 }, { header: 'Value', type: 'number' as const }, { header: 'Earlier period', type: 'number' as const }], rows: [[data.title, value(data.value), value(data.previous)]] };
    });
    if (!sheets.length) { toast.error('Add a chart first.'); return; }
    downloadWorkbook(sheets, `${dashboard.name.replace(/[^\w -]+/g, '').trim() || 'dashboard'}.xlsx`, { title: dashboard.name });
  };

  return (
    <PageGuard feature="dashboard">
      <div className="space-y-5">
        <div className="print:hidden"><MorningBriefCard /></div>

        {hasAccess(user, 'settings') && db.getBrands('ACTIVE').length === 0 && loaded && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 print:hidden">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Lightbulb className="h-4 w-4 text-blue-600" aria-hidden="true" /> Add your first brand in Settings to start seeing numbers.</p>
            <Link href="/settings?tab=brands" className="btn btn-primary shrink-0">Open settings</Link>
          </div>
        )}

        {/* Dashboards as tabs */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div role="tablist" aria-label="Your dashboards" className="flex min-w-0 flex-1 flex-wrap gap-1">
            {prefs.list.map((d) => renaming === d.id ? (
              <form key={d.id} onSubmit={(e) => { e.preventDefault(); const name = new FormData(e.currentTarget).get('name')?.toString().trim(); if (name) update((draft) => { const t = draft.list.find((x) => x.id === d.id); if (t) t.name = name.slice(0, 60); }); setRenaming(null); }} className="flex items-center gap-1">
                <label className="sr-only" htmlFor={`rename-${d.id}`}>Dashboard name</label>
                <input id={`rename-${d.id}`} name="name" defaultValue={d.name} autoFocus maxLength={60} onBlur={(e) => e.currentTarget.form?.requestSubmit()} className="w-44 rounded-lg border border-blue-400 px-2 py-1.5 text-sm" />
              </form>
            ) : (
              <button key={d.id} role="tab" type="button" aria-selected={d.id === dashboard.id} onClick={() => setActive(d.id)} onDoubleClick={() => setRenaming(d.id)}
                className={`h-8 shrink-0 whitespace-nowrap rounded-lg px-3 text-[13px] transition-colors ${d.id === dashboard.id ? 'bg-black/[0.05] font-medium text-slate-900 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]' : 'text-slate-600 hover:bg-black/[0.03] hover:text-slate-900'}`}>{d.name}</button>
            ))}
            <div className="relative">
              <button type="button" onClick={() => setMenu(menu === 'new' ? null : 'new')} aria-expanded={menu === 'new'} className="btn btn-quiet"><Plus aria-hidden="true" /> New dashboard</button>
              {menu === 'new' && (
                <Menu onClose={() => setMenu(null)}>
                  <MenuItem onClick={() => addDashboard({ id: newId('dash'), name: 'New dashboard', widgets: [], filters: { range: 'thisMonth', compare: 'previous', calendar: db.getCalendarMode() } })}>Start blank</MenuItem>
                  <p className="px-3 pb-1 pt-2 text-[11px] font-bold text-slate-500">Start from a ready-made one</p>
                  {visibleTemplates.map((t) => <MenuItem key={t.key} hint={t.description} onClick={() => addDashboard(fromTemplate(t.key, user, db.getCalendarMode()))}>{t.name}</MenuItem>)}
                  {published.length > 0 && <p className="px-3 pb-1 pt-2 text-[11px] font-bold text-slate-500">Shared by your admin</p>}
                  {published.map((t) => (
                    <div key={t.id} className="flex items-center">
                      <MenuItem hint={t.description} onClick={() => addDashboard(fromPublished(t, user))}>{t.name}</MenuItem>
                      {isSuperAdmin(user) && <button type="button" aria-label={`Stop sharing ${t.name}`} onClick={() => { db.setDashboardTemplates(published.filter((p) => p.id !== t.id)); toast.success(`${t.name} is no longer shared.`); setMenu(null); }} className="mr-2 rounded p-1 text-slate-400 hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>}
                    </div>
                  ))}
                </Menu>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setEditor({})} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"><Plus className="h-4 w-4" aria-hidden="true" /> Add chart</button>
            <button type="button" onClick={() => setEditing((v) => !v)} aria-pressed={editing} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${editing ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{editing ? <><Check className="h-4 w-4" aria-hidden="true" /> Done</> : <><Pencil className="h-4 w-4" aria-hidden="true" /> Arrange</>}</button>
            <div className="relative">
              <button type="button" onClick={() => setMenu(menu === 'more' ? null : 'more')} aria-expanded={menu === 'more'} aria-label="More dashboard options" className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50"><MoreHorizontal className="h-4 w-4" /></button>
              {menu === 'more' && (
                <Menu onClose={() => setMenu(null)} align="right">
                  <MenuItem onClick={() => { setRenaming(dashboard.id); setMenu(null); }}>Rename</MenuItem>
                  <MenuItem onClick={() => addDashboard({ ...structuredClone(dashboard), id: newId('dash'), name: `${dashboard.name} (copy)`.slice(0, 60), widgets: dashboard.widgets.map((w) => ({ ...w, id: newId('w') })) })}>Duplicate</MenuItem>
                  {dashboard.template && TEMPLATES.some((t) => t.key === dashboard.template) && (
                    <MenuItem onClick={() => { if (window.confirm('Put back the ready-made charts? Your changes to this dashboard will be replaced.')) { const fresh = fromTemplate(dashboard.template!, user, dashboard.filters.calendar); editDashboard((d) => { d.widgets = fresh.widgets; }); } setMenu(null); }}>Start again from “{TEMPLATES.find((t) => t.key === dashboard.template)!.name}”</MenuItem>
                  )}
                  {canDownload(user) && <MenuItem onClick={() => { downloadExcel(); setMenu(null); }}><Download className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />Download as Excel</MenuItem>}
                  <MenuItem onClick={() => { setMenu(null); window.setTimeout(() => window.print(), 50); }}><Printer className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />Print or save as PDF</MenuItem>
                  {isSuperAdmin(user) && (
                    <MenuItem hint="Everyone can then start a dashboard from it. They only see the charts their access allows." onClick={() => {
                      const existing = published.find((t) => t.name === dashboard.name);
                      const entry = { id: existing?.id || newId('tpl'), name: dashboard.name, dashboard: structuredClone(dashboard), publishedBy: user.fullName, publishedAt: new Date().toISOString() };
                      try { db.setDashboardTemplates([...published.filter((t) => t.id !== entry.id), entry]); toast.success(`${dashboard.name} is shared. Others find it under New dashboard.`); } catch (error) { toast.error(error instanceof Error ? error.message : 'Not shared.'); }
                      setMenu(null);
                    }}>Share with everyone</MenuItem>
                  )}
                  {prefs.list.length > 1 && <MenuItem danger onClick={() => { if (window.confirm(`Delete the dashboard “${dashboard.name}”?`)) update((draft) => { draft.list = draft.list.filter((d) => d.id !== dashboard.id); draft.activeId = draft.list[0]?.id; }); setMenu(null); }}>Delete dashboard</MenuItem>}
                </Menu>
              )}
            </div>
          </div>
        </div>

        {/* Shared filters */}
        <div className="flex flex-wrap items-end gap-2 text-xs print:p-0">
          <h1 className="sr-only">{dashboard.name}</h1><span className="mr-auto" />
          <Select label="Dates" value={dashboard.filters.range} onChange={(range) => setFilters({ range: range as RangePreset, ...(range === 'custom' && !dashboard.filters.fromAd ? { fromAd: prepared.data.today.slice(0, 8) + '01', toAd: prepared.data.today } : {}) })}
            options={(Object.keys(RANGE_LABELS) as RangePreset[]).map((key) => ({ value: key, label: RANGE_LABELS[key] }))} />
          {dashboard.filters.range === 'custom' && (
            <>
              <label className="font-semibold text-slate-600">From<input type="date" value={dashboard.filters.fromAd || ''} max={dashboard.filters.toAd} onChange={(e) => setFilters({ fromAd: e.target.value })} className="ml-1 block rounded-lg border border-slate-200 px-2 py-1.5 font-normal" /></label>
              <label className="font-semibold text-slate-600">To<input type="date" value={dashboard.filters.toAd || ''} min={dashboard.filters.fromAd} onChange={(e) => setFilters({ toAd: e.target.value })} className="ml-1 block rounded-lg border border-slate-200 px-2 py-1.5 font-normal" /></label>
            </>
          )}
          <Select label="Compare with" value={dashboard.filters.compare} onChange={(compare) => setFilters({ compare: compare as DashboardFilters['compare'] })}
            options={[{ value: 'previous', label: 'The period before' }, { value: 'year', label: 'Same dates last year' }, { value: 'off', label: 'Don’t compare' }]} />
          <Select label="Calendar" value={dashboard.filters.calendar} onChange={(calendar) => setFilters({ calendar: calendar as 'BS' | 'AD' })} options={[{ value: 'BS', label: 'Nepali (BS)' }, { value: 'AD', label: 'English (AD)' }]} />
          {brands.length > 1 && (
            <Select label="Brand" value={dashboard.filters.brand || 'ALL'} onChange={(brand) => setFilters({ brand: brand === 'ALL' ? undefined : brand })}
              options={[{ value: 'ALL', label: headerBrand !== 'ALL' ? `As in the top bar (${db.getBrands('ALL').find((b) => b.code === headerBrand)?.name || headerBrand})` : 'All brands' }, ...brands.map((b) => ({ value: b.code.toUpperCase(), label: b.name }))]} />
          )}
        </div>
        {editing && <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800 print:hidden">Drag charts to reorder them, or use the arrows. Click <strong>Done</strong> when you finish. Double-click a tab to rename it.</p>}

        {dashboard.widgets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <LayoutDashboard className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
            <h2 className="mt-3 text-base font-bold text-slate-900">Add your first chart</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Pick any number the app tracks, then choose how to show it. Or start from a ready-made dashboard under New dashboard.</p>
            <button type="button" onClick={() => setEditor({})} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"><Plus className="h-4 w-4" aria-hidden="true" /> Add chart</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {dashboard.widgets.map((widget) => (
              <WidgetCard key={widget.id} prepared={prepared} widget={widget} filters={dashboard.filters} extraWhere={extraWhere} editing={editing}
                dragProps={editing ? { draggable: true, onDragStart: () => { dragId.current = widget.id; }, onDragOver: (e) => e.preventDefault(), onDrop: (e) => { e.preventDefault(); dropOn(widget.id); } } : undefined}
                actions={{
                  onEdit: () => setEditor({ widget }),
                  onDuplicate: () => editDashboard((d) => { const at = d.widgets.findIndex((w) => w.id === widget.id); d.widgets.splice(at + 1, 0, { ...structuredClone(widget), id: newId('w') }); }),
                  onRemove: () => editDashboard((d) => { d.widgets = d.widgets.filter((w) => w.id !== widget.id); }),
                  onMove: (step) => moveWidget(widget.id, step),
                  onResize: () => editDashboard((d) => { const t = d.widgets.find((w) => w.id === widget.id); if (t) t.size = SIZES[(SIZES.indexOf(t.size) + 1) % SIZES.length]; }),
                }} />
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-400 print:block">Numbers follow the same definitions on every page. Click <span className="font-semibold">ⓘ</span> on a chart to see how it is worked out, or click a number to see the records behind it. {formatValue(prepared.data.orders.length, 'count')} online orders and {formatValue(prepared.data.storeOrders.length, 'count')} store orders loaded.</p>
      </div>

      {editor && <WidgetEditor prepared={prepared} filters={dashboard.filters} initial={editor.widget} onSave={saveWidget} onClose={() => setEditor(null)} />}
      {showSetup && setupDue && <SetupWizard onComplete={closeSetup} onDismiss={closeSetup} />}
    </PageGuard>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <label className="font-semibold text-slate-600"><span aria-hidden="true">{label}</span>
      <span className="relative mt-0.5 block">
        <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-7 font-normal text-slate-800">
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      </span>
    </label>
  );
}

function Menu({ children, onClose, align = 'left' }: { children: React.ReactNode; onClose: () => void; align?: 'left' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) onClose(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return <div ref={ref} role="menu" className={`absolute top-full z-40 mt-1 w-72 rounded-xl border border-slate-200 bg-white py-1 shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`}>{children}</div>;
}

function MenuItem({ children, hint, onClick, danger }: { children: React.ReactNode; hint?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`block w-full px-3 py-2 text-left text-xs hover:bg-slate-50 ${danger ? 'text-rose-600' : 'text-slate-800'}`}>
      <span className="font-semibold">{children}</span>{hint && <span className="block text-[11px] font-normal text-slate-500">{hint}</span>}
    </button>
  );
}
