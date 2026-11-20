'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Download, HardDriveDownload, Star, Trash2 } from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import InfoTip from '@/components/common/InfoTip';
import { toast } from '@/components/common/Toast';
import { db } from '@/lib/db/db-service';
import { hasAccess, isSuperAdmin } from '@/lib/permissions';
import { DATASETS, buildSheets, exportFileName, type DatasetKey, type ExportFilters } from '@/lib/export/datasets';
import { RANGE_LABELS, resolveRange, type RangeKey } from '@/lib/export/ranges';
import { formatDualDate } from '@/lib/nepali-calendar';
import type { ReportPreset } from '@/lib/types';

const GROUPS = ['Online (D2C)', 'Stores (B2B)', 'Master lists', 'Work & marketing'] as const;
const QUICK: { name: string; datasets: DatasetKey[] }[] = [
  { name: 'Online sales', datasets: ['orders', 'order_lines', 'returns'] },
  { name: 'Store sales', datasets: ['store_orders', 'store_order_lines', 'dispatch_lines'] },
  { name: 'Field work', datasets: ['visits', 'stock_counts', 'shelf_share', 'calls'] },
  { name: 'Money', datasets: ['cheques', 'dispatch_lines', 'stores'] },
];

export default function ReportsPage() {
  const [, rerender] = useState(0);
  useEffect(() => { const refresh = () => rerender((n) => n + 1); window.addEventListener('bb-db-updated', refresh); return () => window.removeEventListener('bb-db-updated', refresh); }, []);
  const user = db.getCurrentUser();
  const available = DATASETS.filter((dataset) => isSuperAdmin(user) || hasAccess(user, dataset.page));

  const [chosen, setChosen] = useState<DatasetKey[]>(['order_lines', 'store_order_lines']);
  const [range, setRange] = useState<RangeKey>('THIS_BS_MONTH');
  const [custom, setCustom] = useState<{ fromAd?: string; toAd?: string }>({});
  const [brandCode, setBrandCode] = useState('ALL');
  const [subBrandId, setSubBrandId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [officerId, setOfficerId] = useState('');
  const [busy, setBusy] = useState<'report' | 'backup' | null>(null);
  const [presetName, setPresetName] = useState('');

  const brands = db.getBrands('ALL');
  const subBrands = (brands.find((brand) => brand.code === brandCode)?.subBrands || []);
  const stores = useMemo(() => [...db.getRetailers().map((r) => ({ id: r.id, name: r.name })), ...db.getBranches().map((b) => ({ id: b.id, name: b.name })), ...db.getDistributors().map((d) => ({ id: d.id, name: `${d.name} (account)` }))]
    .sort((a, b) => a.name.localeCompare(b.name)), []);
  const officers = db.getUsers().filter((u) => u.active !== false).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const presets = db.getMyPreferences().reportPresets || [];

  const resolved = resolveRange(range, undefined, custom);
  const filters: ExportFilters = { fromAd: resolved.fromAd, toAd: resolved.toAd, brandCode: brandCode === 'ALL' ? undefined : brandCode, subBrandId: subBrandId || undefined, storeId: storeId || undefined, officerId: officerId || undefined };
  const visibleChosen = chosen.filter((key) => available.some((dataset) => dataset.key === key));

  const toggle = (key: DatasetKey) => setChosen((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));

  const download = async (kind: 'report' | 'backup') => {
    const keys = kind === 'backup' ? available.map((dataset) => dataset.key) : visibleChosen;
    if (!keys.length) { toast.error('Choose at least one data set.'); return; }
    setBusy(kind);
    try {
      const [{ clientExportSource }, { downloadWorkbook }] = await Promise.all([import('@/lib/export/client-source'), import('@/lib/export/xlsx')]);
      const source = clientExportSource();
      const sheets = buildSheets(source, keys, kind === 'backup' ? {} : filters, { skipEmpty: kind === 'report' && keys.length > 1 });
      const rows = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
      if (!rows) { toast.error('Nothing matches these choices.'); return; }
      const name = kind === 'backup' ? `Brand-Bucket_Full-backup_${new Date().toISOString().slice(0, 10)}` : exportFileName(`Report_${resolved.label}`, filters, source);
      downloadWorkbook(sheets, name, { title: kind === 'backup' ? 'Brand Bucket full backup' : `Report: ${resolved.label}`, author: user.fullName });
      toast.success(`${sheets.length} ${sheets.length === 1 ? 'sheet' : 'sheets'}, ${rows.toLocaleString()} rows.`);
    } catch (error) {
      toast.error(error instanceof Error ? `Download failed: ${error.message}` : 'Download failed.');
    } finally { setBusy(null); }
  };

  const savePresets = (next: ReportPreset[]) => db.setMyPreferences({ reportPresets: next });
  const savePreset = () => {
    const name = presetName.trim();
    if (!name) { toast.error('Give the report a name.'); return; }
    const preset: ReportPreset = { id: `rp_${Date.now().toString(36)}`, name, datasets: visibleChosen, range, ...(range === 'CUSTOM' ? custom : {}),
      ...(brandCode !== 'ALL' ? { brandCode } : {}), ...(subBrandId ? { subBrandId } : {}), ...(storeId ? { storeId } : {}), ...(officerId ? { officerId } : {}) };
    savePresets([preset, ...presets.filter((p) => p.name.toLowerCase() !== name.toLowerCase())].slice(0, 30));
    setPresetName('');
    toast.success(`Saved “${name}”. It's in your saved reports on any device.`);
  };
  const apply = (preset: ReportPreset) => {
    setChosen(preset.datasets as DatasetKey[]); setRange(preset.range as RangeKey); setCustom({ fromAd: preset.fromAd, toAd: preset.toAd });
    setBrandCode(preset.brandCode || 'ALL'); setSubBrandId(preset.subBrandId || ''); setStoreId(preset.storeId || ''); setOfficerId(preset.officerId || '');
  };

  const select = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500';

  return (
    <PageGuard feature="export">
      <div className="mx-auto max-w-6xl space-y-6 pb-16">
        <div>
          <h1 className="flex items-center gap-1.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Reports & downloads
            <InfoTip label="About this page">Every sheet has both English and Nepali dates, brand and sub-brand. Lists also have their own Download Excel button for exactly what is on screen.</InfoTip>
          </h1>
          <p className="mt-1 text-sm text-slate-500">Pick the data, the dates and who it&apos;s for, and download one Excel file. Save setups you use often.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">1. What to include</h2>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK.map((quick) => (
                    <button key={quick.name} type="button" onClick={() => setChosen(quick.datasets)} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">{quick.name}</button>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
                {GROUPS.map((group) => {
                  const list = available.filter((dataset) => dataset.group === group);
                  if (!list.length) return null;
                  return (
                    <fieldset key={group}>
                      <legend className="mb-1.5 text-xs font-semibold text-slate-500">{group}</legend>
                      <div className="space-y-1">
                        {list.map((dataset) => (
                          <label key={dataset.key} className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 text-sm text-slate-800 hover:bg-slate-50">
                            <input type="checkbox" checked={chosen.includes(dataset.key)} onChange={() => toggle(dataset.key)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                            <span>{dataset.label}{!dataset.dated && <span className="text-xs text-slate-500"> (current list, no dates)</span>}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <h2 className="text-sm font-bold text-slate-900">2. Dates and who it&apos;s for</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-xs">
                  <span className="mb-1 block font-semibold text-slate-700">Dates</span>
                  <select className={select} value={range} onChange={(e) => setRange(e.target.value as RangeKey)}>
                    {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => <option key={key} value={key}>{RANGE_LABELS[key]}</option>)}
                  </select>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    {resolved.fromAd || resolved.toAd ? `${resolved.fromAd ? formatDualDate(resolved.fromAd).split(' (')[0] : 'start'} to ${resolved.toAd ? formatDualDate(resolved.toAd).split(' (')[0] : 'today'}` : 'Every date'}
                  </span>
                </label>
                {range === 'CUSTOM' ? (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="block"><span className="mb-1 block font-semibold text-slate-700">From</span><input type="date" className={select} value={custom.fromAd || ''} onChange={(e) => setCustom((c) => ({ ...c, fromAd: e.target.value || undefined }))} /></label>
                    <label className="block"><span className="mb-1 block font-semibold text-slate-700">To</span><input type="date" className={select} value={custom.toAd || ''} onChange={(e) => setCustom((c) => ({ ...c, toAd: e.target.value || undefined }))} /></label>
                  </div>
                ) : <div className="hidden sm:block" />}
                <label className="block text-xs">
                  <span className="mb-1 block font-semibold text-slate-700">Brand</span>
                  <select className={select} value={brandCode} onChange={(e) => { setBrandCode(e.target.value); setSubBrandId(''); }}>
                    <option value="ALL">All brands</option>
                    {brands.map((brand) => <option key={brand.code} value={brand.code}>{brand.name}</option>)}
                  </select>
                </label>
                <label className="block text-xs">
                  <span className="mb-1 block font-semibold text-slate-700">Sub-brand</span>
                  <select className={select} value={subBrandId} onChange={(e) => setSubBrandId(e.target.value)} disabled={!subBrands.length}>
                    <option value="">{brandCode === 'ALL' ? 'Choose a brand first' : subBrands.length ? 'Whole brand' : 'No sub-brands'}</option>
                    {subBrands.map((sub) => <option key={sub.id} value={sub.id}>{sub.name}{sub.isActive ? '' : ' (archived)'}</option>)}
                  </select>
                </label>
                <label className="block text-xs">
                  <span className="mb-1 block font-semibold text-slate-700">Store</span>
                  <select className={select} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                    <option value="">All stores</option>
                    {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                  </select>
                </label>
                <label className="block text-xs">
                  <span className="mb-1 block font-semibold text-slate-700">Officer</span>
                  <select className={select} value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
                    <option value="">Everyone</option>
                    {officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.fullName}</option>)}
                  </select>
                </label>
              </div>
            </section>

            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-slate-600">{visibleChosen.length} {visibleChosen.length === 1 ? 'data set' : 'data sets'} · {resolved.label}{brandCode !== 'ALL' ? ` · ${brands.find((b) => b.code === brandCode)?.name}` : ''}{subBrandId ? ` · ${subBrands.find((s) => s.id === subBrandId)?.name}` : ''}</span>
              <button type="button" onClick={() => download('report')} disabled={!!busy || !visibleChosen.length}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                <Download className="h-4 w-4" /> {busy === 'report' ? 'Preparing…' : 'Download Excel'}
              </button>
            </div>
          </div>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Star className="h-4 w-4 text-amber-500" /> Saved reports</h2>
              <div className="mt-3 flex gap-2">
                <input aria-label="Name for this report" value={presetName} onChange={(e) => setPresetName(e.target.value)} maxLength={80} placeholder="e.g. Monthly FURR sales"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500" />
                <button type="button" onClick={savePreset} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Save</button>
              </div>
              {presets.length === 0 ? <p className="mt-3 text-xs text-slate-500">Set up a report on the left and save it here for one click next time.</p> : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {presets.map((preset) => (
                    <li key={preset.id} className="flex items-center justify-between gap-2 py-2">
                      <button type="button" onClick={() => apply(preset)} className="min-w-0 text-left">
                        <span className="block truncate text-sm font-semibold text-slate-900 hover:text-blue-700">{preset.name}</span>
                        <span className="block truncate text-[11px] text-slate-500">{RANGE_LABELS[preset.range as RangeKey] || preset.range} · {preset.datasets.length} {preset.datasets.length === 1 ? 'data set' : 'data sets'}</span>
                      </button>
                      <button type="button" aria-label={`Delete ${preset.name}`} onClick={() => savePresets(presets.filter((p) => p.id !== preset.id))} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Trash2 className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><HardDriveDownload className="h-4 w-4 text-slate-600" /> Full backup</h2>
              <p className="mt-2 text-xs text-slate-600">Everything you can see, every date, one sheet per data set. Keep a copy somewhere safe.</p>
              <button type="button" onClick={() => download('backup')} disabled={!!busy}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
                {busy === 'backup' ? 'Preparing…' : 'Download full backup'}
              </button>
            </section>
          </aside>
        </div>
      </div>
    </PageGuard>
  );
}
