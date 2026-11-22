'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { UserWithPermissions } from '@/lib/permissions';
import { isActivePath, visibleNavGroups, type NavGroup } from './nav-items';

const OPEN_KEY = 'bb_nav_open_groups_v1';

function readOpen(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}') || {}; } catch { return {}; }
}

/**
 * The main menu in collapsible areas: D2C, B2B and Operations, with Dashboard and Products on top.
 * Each person's open and closed areas are remembered on their device. The area holding the open
 * page always opens, and a search opens everything. People who only have pages in one area see
 * it open, without an extra heading to click.
 */
export default function NavMenu({ user, pathname, query = '', onNavigate, compact = false }: {
  user: UserWithPermissions | null | undefined; pathname: string; query?: string; onNavigate?: () => void; compact?: boolean;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => { setOpen(readOpen()); }, []);

  const q = query.trim().toLowerCase();
  const groups = visibleNavGroups(user)
    .map((group) => ({ ...group, sections: group.sections.map((entry) => ({ ...entry, items: entry.items.filter((item) => !q || item.label.toLowerCase().includes(q)) })).filter((entry) => entry.items.length) }))
    .filter((group) => group.sections.length);
  const titled = groups.filter((group) => group.title);
  // Only the closest match is active, so /customers/insights does not also light up /customers.
  const activeHref = groups.flatMap((group) => group.sections.flatMap((entry) => entry.items.map((item) => item.href))).filter((href) => isActivePath(pathname, href)).sort((a, b) => b.length - a.length)[0];
  const holdsActive = (group: NavGroup) => group.sections.some((entry) => entry.items.some((item) => isActivePath(pathname, item.href)));
  const isOpen = (group: NavGroup) => !!q || titled.length <= 1 || holdsActive(group) || (open[group.key] ?? true);
  const toggle = (group: NavGroup) => {
    const next = { ...open, [group.key]: !isOpen(group) };
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };

  if (!groups.length) return <p className="px-3 py-8 text-center text-xs text-slate-500">No page matches “{query}”.</p>;

  const link = compact
    ? { base: 'flex items-center justify-between rounded-lg px-3 py-2 text-xs transition', active: 'bg-black/[0.05] font-medium text-slate-900', idle: 'text-slate-600 hover:bg-slate-50', icon: 'h-4 w-4' }
    : { base: 'group flex h-8 items-center justify-between rounded-lg px-2.5 text-[13px] transition-colors duration-150', active: 'bg-blue-50 font-medium text-blue-900 shadow-[inset_0_0_0_1px_rgba(12,121,181,0.12)]', idle: 'text-slate-600 hover:bg-black/[0.03] hover:text-slate-900', icon: 'h-4 w-4' };

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const expanded = isOpen(group);
        const panelId = `nav-${group.key}${compact ? '-m' : ''}`;
        const GroupIcon = group.icon;
        const count = group.sections.reduce((sum, entry) => sum + entry.items.length, 0);
        const body = (
          <div id={panelId} className={group.title ? 'mt-1 space-y-2' : 'space-y-2'}>
            {group.sections.map((entry) => (
              <div key={entry.title || 'top'}>
                {entry.title && group.sections.length > 1 && <p className="px-2.5 pb-1 pt-2 text-xs text-slate-400">{entry.title}</p>}
                <div className="space-y-0.5">
                  {entry.items.map((item) => {
                    const active = item.href === activeHref;
                    const Icon = item.icon;
                    return (
                      <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={`${link.base} ${active ? `${link.active}${compact ? '' : ' bb-nav-active'}` : link.idle}`}>
                        <span className="flex items-center gap-2.5">
                          <Icon className={`${link.icon} shrink-0 ${active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                          <span>{item.label}</span>
                        </span>
                        {item.badge && <span className="font-mono text-[11px] tabular-nums text-slate-500">{item.badge}</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
        if (!group.title) return <div key={group.key} className="pb-1">{body}</div>;
        return (
          <div key={group.key} className="border-t border-black/[0.06] pt-3">
            <button type="button" onClick={() => toggle(group)} aria-expanded={expanded} aria-controls={panelId} disabled={!!q || titled.length <= 1}
              className="flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-black/[0.03] disabled:cursor-default disabled:hover:bg-transparent">
              {GroupIcon && <GroupIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />}
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-slate-900">{group.title}</span>
                {!expanded && <span className="block truncate text-[11px] text-slate-500">{count} pages · {group.description}</span>}
              </span>
              {titled.length > 1 && !q && <ChevronRight aria-hidden="true" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />}
            </button>
            {expanded && body}
          </div>
        );
      })}
    </div>
  );
}
