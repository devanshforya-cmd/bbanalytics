'use client';

import React, { useMemo } from 'react';
import { resolveAccess, type AccessMap } from '@/lib/roles';
import { visibleNavSections } from '@/components/layout/nav-items';
import { PAGES } from '@/lib/access-catalog';
import { hasAccess } from '@/lib/permissions';

/** The menu exactly as someone with this access will see it. */
export default function MenuPreview({ access, superAdmin = false }: { access: AccessMap; superAdmin?: boolean }) {
  const { sections, settingsTabs } = useMemo(() => {
    const user = superAdmin ? { id: 'preview', isSuperAdmin: true } : { id: 'preview', customPermissions: resolveAccess(access, {}, null) };
    return {
      sections: visibleNavSections(user),
      settingsTabs: superAdmin ? ['Every tab, including Staff & roles'] : PAGES.filter((page) => page.settingsTab && hasAccess(user, page.key)).map((page) => page.label),
    };
  }, [access, superAdmin]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <h4 className="px-1 text-xs font-semibold text-slate-700">Their menu</h4>
      {sections.length === 0 ? (
        <p className="mt-2 px-1 text-xs text-slate-600">Nothing yet. They will see a “no access” page until you turn on at least one page.</p>
      ) : (
        <div className="mt-2 space-y-3">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-1 text-[11px] font-semibold text-slate-500">{section.title}</p>
              <ul className="mt-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return <li key={item.href} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs text-slate-800"><Icon className="h-3.5 w-3.5 text-slate-500" />{item.label}</li>;
                })}
              </ul>
              {section.title === 'Admin' && settingsTabs.length > 0 && <p className="px-1.5 text-[11px] text-slate-600">Tabs: {settingsTabs.join(', ')}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
