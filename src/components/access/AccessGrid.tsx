'use client';

import React, { useMemo, useState } from 'react';
import { Lock, RotateCcw, Search } from 'lucide-react';
import { AREAS, PAGES, SENSITIVE, type PageDefinition, type SensitiveKey } from '@/lib/access-catalog';
import { isOn, normalizePagePermission, normalizeSensitive, requiredSensitive, type AccessMap } from '@/lib/roles';
import type { ActionPermission, DataScope, FeaturePermission } from '@/lib/permissions';

const ACTION_LABEL: Record<ActionPermission, string> = { VIEW: 'View', CREATE: 'Add', EDIT: 'Edit', DELETE: 'Delete' };
const SCOPE_LABEL: Record<DataScope, string> = { OWN: 'Their own', TEAM: 'Their team’s', ALL: 'Everyone’s' };

interface AccessGridProps {
  value: AccessMap;
  onChange: (next: AccessMap) => void;
  /** The role's access, when editing one person: rows that differ are marked and can be reset. */
  base?: AccessMap;
  idPrefix: string;
}

function differs(a: FeaturePermission | undefined, b: FeaturePermission | undefined): boolean {
  const left = isOn(a) ? a! : null; const right = isOn(b) ? b! : null;
  if (!left || !right) return !!left !== !!right;
  return left.actions.join() !== right.actions.join() || (left.scope || null) !== (right.scope || null);
}

function Switch({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean; id: string }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${checked ? 'bg-emerald-600' : 'bg-slate-300'}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function AccessGrid({ value, onChange, base, idPrefix }: AccessGridProps) {
  const [query, setQuery] = useState('');
  const needed = useMemo(() => new Set(requiredSensitive(value)), [value]);
  const neededBy = (key: SensitiveKey) => PAGES.filter((page) => page.needs?.includes(key) && isOn(value[page.key]) && value[page.key].actions.some((action) => action !== 'VIEW')).map((page) => page.label);

  const setPage = (def: PageDefinition, next: Partial<FeaturePermission> | null) => onChange({ ...value, [def.key]: normalizePagePermission(def.key, next) });
  const togglePage = (def: PageDefinition, on: boolean) => setPage(def, on ? { access: 'VIEW_ONLY', actions: ['VIEW'], scope: base?.[def.key]?.scope || 'ALL' } : null);
  const toggleAction = (def: PageDefinition, action: ActionPermission) => {
    const current = value[def.key];
    const actions = new Set(current?.actions || []);
    if (action === 'VIEW') return; // View is the page switch itself
    if (actions.has(action)) actions.delete(action); else actions.add(action);
    setPage(def, { access: 'VIEW_EDIT', scope: current?.scope, actions: ['VIEW', ...actions].filter((entry, index, list) => list.indexOf(entry) === index) as ActionPermission[] });
  };
  const setArea = (pages: PageDefinition[], mode: 'full' | 'view' | 'none') => {
    const next = { ...value };
    for (const def of pages) next[def.key] = mode === 'none' ? normalizePagePermission(def.key, null) : normalizePagePermission(def.key, { access: 'FULL', scope: 'ALL', actions: mode === 'full' ? def.actions : ['VIEW'] });
    onChange(next);
  };
  const reset = (key: string) => {
    const next = { ...value };
    if (base?.[key]) next[key] = base[key]; else delete next[key];
    onChange(next);
  };

  const q = query.trim().toLowerCase();
  const matches = (def: PageDefinition) => !q || `${def.label} ${def.description}`.toLowerCase().includes(q);

  return (
    <div className="space-y-4">
      <label className="relative block">
        <span className="sr-only">Find a page</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a page" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm" />
      </label>

      <section aria-labelledby={`${idPrefix}-sensitive`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <h4 id={`${idPrefix}-sensitive`} className="text-sm font-semibold text-slate-900">Sensitive details</h4>
          <p className="text-xs text-slate-600">Off means these are blanked out everywhere, including downloads.</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {SENSITIVE.map((entry) => {
            const locked = needed.has(entry.key);
            const on = locked || isOn(value[entry.key]);
            const custom = base && differs(base[entry.key], value[entry.key]);
            return (
              <li key={entry.key} className="flex items-start gap-3 px-4 py-3">
                <Switch id={`${idPrefix}-${entry.key}`} checked={on} disabled={locked} label={entry.label} onChange={(next) => onChange({ ...value, [entry.key]: normalizeSensitive(next ? { access: 'VIEW_ONLY' } : null) })} />
                <div className="min-w-0 flex-1">
                  <label htmlFor={`${idPrefix}-${entry.key}`} className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                    {entry.label}
                    {custom && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Custom</span>}
                  </label>
                  <p className="text-xs text-slate-600">{entry.description}</p>
                  {locked && <p className="mt-1 flex items-center gap-1 text-xs text-slate-600"><Lock className="h-3 w-3" aria-hidden="true" /> Needed to add or change things on {neededBy(entry.key).join(', ')}.</p>}
                </div>
                {custom && <button type="button" onClick={() => reset(entry.key)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"><RotateCcw className="mr-1 inline h-3 w-3" aria-hidden="true" />Use role</button>}
              </li>
            );
          })}
        </ul>
      </section>

      {AREAS.map((area) => {
        const pages = PAGES.filter((def) => def.area === area.key && matches(def));
        if (!pages.length) return null;
        const onCount = pages.filter((def) => isOn(value[def.key])).length;
        return (
          <section key={area.key} aria-labelledby={`${idPrefix}-${area.key}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <h4 id={`${idPrefix}-${area.key}`} className="text-sm font-semibold text-slate-900">{area.label} <span className="font-normal text-slate-600">· {onCount} of {pages.length} on</span></h4>
              <div className="flex gap-1 text-xs font-semibold">
                <button type="button" onClick={() => setArea(pages, 'full')} className="rounded-lg px-2 py-1 text-blue-700 hover:bg-blue-50">All, full</button>
                <button type="button" onClick={() => setArea(pages, 'view')} className="rounded-lg px-2 py-1 text-blue-700 hover:bg-blue-50">All, view only</button>
                <button type="button" onClick={() => setArea(pages, 'none')} className="rounded-lg px-2 py-1 text-slate-700 hover:bg-slate-100">None</button>
              </div>
            </div>
            <ul className="divide-y divide-slate-100">
              {pages.map((def) => {
                const perm = value[def.key];
                const on = isOn(perm);
                const custom = base && differs(base[def.key], perm);
                const rowId = `${idPrefix}-${def.key.replace('.', '-')}`;
                return (
                  <li key={def.key} className={`px-4 py-3 ${custom ? 'bg-amber-50/50' : ''}`}>
                    <div className="flex items-start gap-3">
                      <Switch id={rowId} checked={on} label={`${def.label} page`} onChange={(next) => togglePage(def, next)} />
                      <div className="min-w-0 flex-1">
                        <label htmlFor={rowId} className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                          {def.label}
                          {custom && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Custom</span>}
                        </label>
                        <p className="text-xs text-slate-600">{def.description}</p>
                        {on && (
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                            {def.actions.length > 1 && (
                              <div role="group" aria-label={`What they can do on ${def.label}`} className="inline-flex rounded-lg bg-slate-100 p-0.5">
                                {def.actions.map((action) => {
                                  const active = perm.actions.includes(action);
                                  return (
                                    <button key={action} type="button" aria-pressed={active} disabled={action === 'VIEW'} onClick={() => toggleAction(def, action)}
                                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'} disabled:cursor-default`}>
                                      {ACTION_LABEL[action]}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {def.scoped && (
                              <label className="flex items-center gap-1.5 text-xs text-slate-700">
                                Records:
                                <select value={perm.scope || 'ALL'} onChange={(event) => setPage(def, { ...perm, scope: event.target.value as DataScope })} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                                  {(['OWN', 'TEAM', 'ALL'] as DataScope[]).map((scope) => <option key={scope} value={scope}>{SCOPE_LABEL[scope]}</option>)}
                                </select>
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                      {custom && <button type="button" onClick={() => reset(def.key)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"><RotateCcw className="mr-1 inline h-3 w-3" aria-hidden="true" />Use role</button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {AREAS.every((area) => !PAGES.some((def) => def.area === area.key && matches(def))) && <p className="text-sm text-slate-600">No page matches “{query}”.</p>}
    </div>
  );
}
