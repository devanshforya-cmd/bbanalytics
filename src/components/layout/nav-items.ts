import type React from 'react';
import {
  ListChecks, ClipboardList, Download, LayoutDashboard, Compass, Store, Truck, Camera, Phone, CreditCard, FileText, Award, ScanText,
  ClipboardPen, ClipboardCheck, TruckIcon, MessageSquareHeart, RotateCcw, Tags, Users, PieChart, CheckSquare,
  History, FileSpreadsheet, BadgePercent, Navigation, Calendar, Settings, Package, Megaphone, Gift, PhoneOutgoing, PhoneCall,
} from 'lucide-react';
import { AREAS, PAGES, type PageKey } from '@/lib/access-catalog';
import { hasAccess, isSuperAdmin, type UserWithPermissions } from '@/lib/permissions';
import { ShoppingBag, Building2, Wrench } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  /** The page that must be given; Settings opens when any Settings tab is. */
  page: PageKey | 'settings';
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export interface NavSection { title: string; items: NavItem[] }

const ICONS: Partial<Record<PageKey, React.ComponentType<{ className?: string }>>> = {
  'p.dashboard': LayoutDashboard, 'p.products': Package,
  'p.orders_extractor': ScanText, 'p.orders_manual': ClipboardPen, 'p.orders_all': ListChecks, 'p.orders_daily': ClipboardCheck,
  'p.orders_monthly': FileSpreadsheet, 'p.sales_offers': BadgePercent, 'p.delivery_failures': TruckIcon, 'p.follow_ups': PhoneOutgoing, 'p.customer_calls': PhoneCall,
  'p.feedback': MessageSquareHeart, 'p.returns': RotateCcw, 'p.issue_categories': Tags,
  'p.customers': Users, 'p.customer_insights': PieChart,
  'p.beat_plan': Compass, 'p.stores': Store, 'p.dispatch': Truck, 'p.live_tracking': Navigation, 'p.shelf_photos': Camera, 'p.stock_counts': ClipboardList,
  'p.calls': Phone, 'p.cheques': CreditCard, 'p.documents': FileText, 'p.scorecards': Award,
  'p.influencers': Megaphone, 'p.marketing_sends': Gift,
  'p.calendar_tasks': Calendar, 'p.tasks': CheckSquare, 'p.activity': History, 'p.reports': Download, 'p.export': FileSpreadsheet,
};

/** The menu, built from the same page list roles are made from, so every page is in both. */
export const NAV_SECTIONS: NavSection[] = [
  ...AREAS.filter((area) => area.key !== 'settings').map((area) => ({
    title: area.label,
    items: PAGES.filter((page) => page.area === area.key && page.href).map((page) => ({
      label: page.label, href: page.href!, page: page.key, icon: ICONS[page.key] || FileText,
      ...(page.key === 'p.calendar_tasks' ? { badge: 'BS/AD' } : {}),
    })),
  })),
  { title: 'Admin', items: [{ label: 'Settings', href: '/settings', page: 'settings', icon: Settings }] },
];

export function canSeeNavItem(user: UserWithPermissions | null | undefined, item: Pick<NavItem, 'page'>): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  if (item.page === 'settings') return PAGES.some((page) => page.settingsTab && hasAccess(user, page.key));
  return hasAccess(user, item.page);
}

export function visibleNavSections(user: UserWithPermissions | null | undefined): NavSection[] {
  return NAV_SECTIONS.map((section) => ({ ...section, items: section.items.filter((item) => canSeeNavItem(user, item)) })).filter((section) => section.items.length > 0);
}

/** The menu in three business areas. Overview (no title) always sits on top, open. */
export interface NavGroup {
  key: 'overview' | 'd2c' | 'b2b' | 'operations';
  title?: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  sections: NavSection[];
}

const section = (title: string) => NAV_SECTIONS.find((entry) => entry.title === title)!;

export const NAV_GROUPS: NavGroup[] = [
  { key: 'overview', sections: [{ ...section('Overview'), title: '' }] },
  { key: 'd2c', title: 'D2C', description: 'Online orders, customers and marketing', icon: ShoppingBag,
    sections: [section('Online orders'), section('Reviews & returns'), section('Customers'), section('Marketing')] },
  { key: 'b2b', title: 'B2B', description: 'Field sales, stores and distributors', icon: Building2,
    sections: [{ ...section('Offline sales'), title: 'Field sales' }] },
  { key: 'operations', title: 'Operations', description: 'Tasks, reports and settings', icon: Wrench,
    sections: [{ ...section('Operations'), title: 'Work' }, section('Admin')] },
];

export function visibleNavGroups(user: UserWithPermissions | null | undefined): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    sections: group.sections.map((entry) => ({ ...entry, items: entry.items.filter((item) => canSeeNavItem(user, item)) })).filter((entry) => entry.items.length > 0),
  })).filter((group) => group.sections.length > 0);
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
