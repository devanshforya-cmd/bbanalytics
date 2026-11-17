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
import Breadcrumbs from '@/components/common/Breadcrumbs';
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
import SetupWizard from '@/components/dashboard/SetupWizard';
import { db } from '@/lib/db/db-service';
import { getSessionUser } from '@/lib/auth';
import { hasAccess, isSuperAdmin } from '@/lib/permissions';
import { Compass, Sliders, ListChecks, DatabaseZap, Sparkles } from 'lucide-react';

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
  | 'UPGRADE';

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
    };
    if (tab && tabByQuery[tab]) setActiveTab(tabByQuery[tab]);
  }, []);

  const tabs = [
    { id: 'GOOGLE' as SettingsTab, label: 'Google Workspace', icon: Share2 },
    { id: 'STAFF' as SettingsTab, label: 'Staff & Roles', icon: Users },
    { id: 'FIELD_SALES' as SettingsTab, label: 'Field Sales & Beats', icon: Compass },
    { id: 'BRANDS' as SettingsTab, label: 'Brand Management', icon: Tag },
    { id: 'CHANNELS' as SettingsTab, label: 'Channels & Logistics', icon: Share2 },
    { id: 'RULES' as SettingsTab, label: 'Alert Rules', icon: Bell },
    { id: 'HOLIDAYS' as SettingsTab, label: 'Holiday Calendar', icon: Calendar },
    { id: 'TEMPLATES' as SettingsTab, label: 'Task Templates', icon: Layers },
    { id: 'PROMOTIONS' as SettingsTab, label: 'Promotions', icon: Flame },
    { id: 'IMPORT' as SettingsTab, label: 'Data Import Tool', icon: FileSpreadsheet },
    { id: 'SHARED_ACCESS' as SettingsTab, label: 'Shared Access', icon: Share2 },
    { id: 'LISTS' as SettingsTab, label: 'Lists & Categories', icon: ListChecks },
    { id: 'FEATURE_FLAGS' as SettingsTab, label: 'Feature Flags (A/B)', icon: Sliders },
    { id: 'UPGRADE' as SettingsTab, label: 'Data Upgrade', icon: DatabaseZap },
  ].filter(tab => {
    if (['GOOGLE', 'STAFF', 'RULES', 'IMPORT', 'SHARED_ACCESS', 'FEATURE_FLAGS', 'UPGRADE'].includes(tab.id)) return isSuperAdmin(user);
    if (tab.id === 'CHANNELS') return hasAccess(user, 'orderflow');
    if (tab.id === 'FIELD_SALES') return hasAccess(user, 'beat_plans') || hasAccess(user, 'stores');
    return true;
  });
  const activeTabAllowed = tabs.some(tab => tab.id === activeTab);
  useEffect(() => { if (!activeTabAllowed) setActiveTab('BRANDS'); }, [activeTabAllowed]);

  return (
    <PageGuard feature="settings">
      <div className="space-y-6 pb-20">
        <Breadcrumbs items={[{ label: 'System Configuration & Settings' }]} />

        {/* Page Title & Navigation Bar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                System Administration &amp; Configuration
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage operational staff, brand lines, delivery channels, and business rules.
              </p>
            </div>
            {isSuperAdmin(user) && (
              <button type="button" onClick={() => setShowSetupGuide(true)} className="inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 sm:self-center">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" /> Setup guide
              </button>
            )}
          </div>

          {/* Tab Strip */}
          <div className="flex items-center gap-1.5 pt-4 overflow-x-auto pb-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    const url = new URL(window.location.href);
                    const queryByTab: Record<SettingsTab, string> = {
                      GOOGLE: 'google',
                      STAFF: 'staff',
                      FIELD_SALES: 'field-sales',
                      BRANDS: 'brands',
                      CHANNELS: 'channels',
                      RULES: 'rules',
                      HOLIDAYS: 'holidays',
                      TEMPLATES: 'templates',
                      PROMOTIONS: 'promotions',
                      IMPORT: 'import',
                      SHARED_ACCESS: 'shared-access',
                      FEATURE_FLAGS: 'feature-flags',
                      LISTS: 'lists',
                      UPGRADE: 'upgrade',
                    };
                    url.searchParams.set('tab', queryByTab[tab.id]);
                    window.history.replaceState(null, '', url);
                  }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

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
        </div>
        {/* Opened on purpose from here; the dashboard only shows it for a brand-new, empty workspace. */}
        {showSetupGuide && isSuperAdmin(user) && <SetupWizard onComplete={() => setShowSetupGuide(false)} onDismiss={() => setShowSetupGuide(false)} />}
      </div>
    </PageGuard>
  );
}
