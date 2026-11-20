'use client';

import React, { useEffect, useState } from 'react';
import {
  Users,
  Tag,
  Share2,
  Bell,
  Calendar,
  Layers,
  FileSpreadsheet,
  Flame,
} from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';

// 58a. Modular Settings Sub-components
import StaffManagement from './components/StaffManagement';
import BrandSettings from './components/BrandSettings';
import ChannelSettings from './components/ChannelSettings';
import NotificationRules from './components/NotificationRules';
import HolidayCalendar from './components/HolidayCalendar';
import TaskTemplates from './components/TaskTemplates';
import PromotionManager from './components/PromotionManager';
import DataImport from './components/DataImport';
import SharedAccessSettings from './components/SharedAccessSettings';
import FieldSalesSettings from './components/FieldSalesSettings';
import FeatureFlagsSettings from './components/FeatureFlagsSettings';
import GoogleWorkspaceSettings from './components/GoogleWorkspaceSettings';
import ListsSettings from './components/ListsSettings';
import OrderIdPrefixes from './components/OrderIdPrefixes';
import DataUpgradeSettings from './components/DataUpgradeSettings';
import TestDataSettings from './components/TestDataSettings';
import SetupWizard from '@/components/dashboard/SetupWizard';
import { db } from '@/lib/db/db-service';
import { getSessionUser } from '@/lib/auth';
import { hasAccess, isSuperAdmin, setActivePage } from '@/lib/permissions';
import { pageForSettingsTab } from '@/lib/access-catalog';
import { Compass, Sliders, ListChecks, DatabaseZap, Sparkles, Truck, Link2, FlaskConical } from 'lucide-react';

export type SettingsTab =
  | 'STAFF'
  | 'FIELD_SALES'
  | 'BRANDS'
  | 'CHANNELS'
  | 'RULES'
  | 'HOLIDAYS'
  | 'TEMPLATES'
  | 'PROMOTIONS'
  | 'IMPORT'
  | 'SHARED_ACCESS'
  | 'FEATURE_FLAGS'
  | 'GOOGLE'
  | 'LISTS'
  | 'UPGRADE'
  | 'TEST_DATA';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('STAFF');
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [user, setUser] = useState(() => getSessionUser() || db.getCurrentUser());
  useEffect(() => { const refresh = () => setUser(getSessionUser() || db.getCurrentUser()); window.addEventListener('bb-db-updated', refresh); return () => window.removeEventListener('bb-db-updated', refresh); }, []);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')?.trim().toLowerCase();
    const tabByQuery: Record<string, SettingsTab> = {
      staff: 'STAFF',
      'field-sales': 'FIELD_SALES',
      brands: 'BRANDS',
      'brand-management': 'BRANDS',
      channels: 'CHANNELS',
      rules: 'RULES',
      holidays: 'HOLIDAYS',
      templates: 'TEMPLATES',
      promotions: 'PROMOTIONS',
      import: 'IMPORT',
      'shared-access': 'SHARED_ACCESS',
      'feature-flags': 'FEATURE_FLAGS',
      google: 'GOOGLE',
      lists: 'LISTS',
      upgrade: 'UPGRADE',
      'test-data': 'TEST_DATA',
    };
    if (tab && tabByQuery[tab]) setActiveTab(tabByQuery[tab]);
  }, []);

  type Item = { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }>; tile: string };
  const groups: { title: string; items: Item[] }[] = [
    { title: 'Business', items: [
      { id: 'BRANDS', label: 'Brands & order IDs', icon: Tag, tile: 'bg-blue-600' },
      { id: 'CHANNELS', label: 'Sales channels & delivery', icon: Truck, tile: 'bg-emerald-500' },
      { id: 'LISTS', label: 'Lists & categories', icon: ListChecks, tile: 'bg-amber-500' },
      { id: 'PROMOTIONS', label: 'Promotions', icon: Flame, tile: 'bg-rose-500' },
    ] },
    { title: 'People & access', items: [
      { id: 'STAFF', label: 'Staff & roles', icon: Users, tile: 'bg-blue-900' },
      { id: 'SHARED_ACCESS', label: 'Shared links', icon: Link2, tile: 'bg-slate-500' },
      { id: 'RULES', label: 'Alerts & notifications', icon: Bell, tile: 'bg-rose-600' },
    ] },
    { title: 'Field sales', items: [
      { id: 'FIELD_SALES', label: 'Beats & visits', icon: Compass, tile: 'bg-emerald-600' },
      { id: 'HOLIDAYS', label: 'Holidays', icon: Calendar, tile: 'bg-amber-600' },
      { id: 'TEMPLATES', label: 'Task templates', icon: Layers, tile: 'bg-purple-600' },
    ] },
    { title: 'Data & connections', items: [
      { id: 'GOOGLE', label: 'Google Sheets & Drive', icon: Share2, tile: 'bg-emerald-500' },
      { id: 'IMPORT', label: 'Import data', icon: FileSpreadsheet, tile: 'bg-blue-500' },
      { id: 'UPGRADE', label: 'Data upgrade', icon: DatabaseZap, tile: 'bg-slate-600' },
      { id: 'FEATURE_FLAGS', label: 'Experiments', icon: Sliders, tile: 'bg-purple-500' },
      { id: 'TEST_DATA', label: 'Test data', icon: FlaskConical, tile: 'bg-orange-500' },
    ] },
  ];
  // Each tab is its own permission. Staff & roles stays with Super Admins.
  const allowed = (id: SettingsTab) => {
    if (isSuperAdmin(user)) return true;
    if (id === 'STAFF' || id === 'TEST_DATA') return false;
    const page = pageForSettingsTab(id);
    return !!page && hasAccess(user, page.key);
  };
  const visibleGroups = groups.map((group) => ({ ...group, items: group.items.filter((item) => allowed(item.id)) })).filter((group) => group.items.length);
  const tabs = visibleGroups.flatMap((group) => group.items);
  const activeTabAllowed = tabs.some(tab => tab.id === activeTab);
  useEffect(() => { if (!activeTabAllowed && tabs[0]) setActiveTab(tabs[0].id); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabAllowed]);
  const queryByTab: Record<SettingsTab, string> = {
    GOOGLE: 'google', STAFF: 'staff', FIELD_SALES: 'field-sales', BRANDS: 'brands', CHANNELS: 'channels', RULES: 'rules', HOLIDAYS: 'holidays',
    TEMPLATES: 'templates', PROMOTIONS: 'promotions', IMPORT: 'import', SHARED_ACCESS: 'shared-access', FEATURE_FLAGS: 'feature-flags', LISTS: 'lists', UPGRADE: 'upgrade', TEST_DATA: 'test-data',
  };
  const choose = (id: SettingsTab) => {
    setActiveTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', queryByTab[id]);
    window.history.replaceState(null, '', url);
  };
  const current = tabs.find((tab) => tab.id === activeTab);
  // Checks inside a tab answer for that tab, so Edit on Holidays never opens Brands.
  useEffect(() => { setActivePage(pageForSettingsTab(activeTab)?.key || null); }, [activeTab]);

  return (
    <PageGuard>
      <div className="mx-auto max-w-7xl pb-20">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
          {isSuperAdmin(user) && (
            <button type="button" onClick={() => setShowSetupGuide(true)} className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3.5 py-1.5 text-[13px] font-medium text-slate-700 shadow-xs hover:bg-slate-50">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" /> Setup guide
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Phones and tablets: one grouped picker */}
          <label className="lg:hidden">
            <span className="sr-only">Settings section</span>
            <select value={activeTab} onChange={(event) => choose(event.target.value as SettingsTab)}
              className="w-full rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[15px] font-medium text-slate-900 shadow-xs">
              {visibleGroups.map((group) => (
                <optgroup key={group.title} label={group.title}>
                  {group.items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>

          {/* Desktop: grouped list, like System Settings */}
          <nav aria-label="Settings sections" className="hidden space-y-5 lg:block">
            {visibleGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-1.5 px-3 text-[12px] font-semibold text-slate-500">{group.title}</p>
                <ul className="overflow-hidden rounded-xl bg-white shadow-xs ring-1 ring-black/[0.06]">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = item.id === activeTab;
                    return (
                      <li key={item.id}>
                        <button type="button" onClick={() => choose(item.id)} aria-current={active ? 'page' : undefined}
                          className={`flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] ${active ? 'bg-blue-600 text-white' : 'text-slate-800 hover:bg-black/[0.04]'}`}>
                          <span className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] ${active ? 'bg-white/20' : item.tile}`}>
                            <Icon className="h-[15px] w-[15px] text-white" />
                          </span>
                          <span className="flex-1 truncate py-0.5">{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <section aria-label={current?.label} className="min-w-0 space-y-4">
            {current && <h2 className="hidden text-xl font-semibold text-slate-900 lg:block">{current.label}</h2>}
        {/* Tab Content Panels */}
        <div hidden={!activeTabAllowed}>
          {activeTab === 'GOOGLE' && <GoogleWorkspaceSettings />}
          {activeTab === 'STAFF' && <StaffManagement />}
          {activeTab === 'FIELD_SALES' && <FieldSalesSettings />}
          {activeTab === 'BRANDS' && <div className="space-y-6"><BrandSettings /><OrderIdPrefixes /></div>}
          {activeTab === 'CHANNELS' && <ChannelSettings />}
          {activeTab === 'RULES' && <NotificationRules />}
          {activeTab === 'HOLIDAYS' && <HolidayCalendar />}
          {activeTab === 'TEMPLATES' && <TaskTemplates />}
          {activeTab === 'PROMOTIONS' && <PromotionManager />}
          {activeTab === 'IMPORT' && <DataImport />}
          {activeTab === 'SHARED_ACCESS' && <SharedAccessSettings />}
          {activeTab === 'FEATURE_FLAGS' && <FeatureFlagsSettings />}
          {activeTab === 'LISTS' && <ListsSettings />}
          {activeTab === 'UPGRADE' && <DataUpgradeSettings />}
          {activeTab === 'TEST_DATA' && isSuperAdmin(user) && <TestDataSettings />}
        </div>
          </section>
        </div>
        {/* Opened on purpose from here; the dashboard only shows it for a brand-new, empty workspace. */}
        {showSetupGuide && isSuperAdmin(user) && <SetupWizard onComplete={() => setShowSetupGuide(false)} onDismiss={() => setShowSetupGuide(false)} />}
      </div>
    </PageGuard>
  );
}
