/**
 * Every page and Settings tab a person can be given, in the order the role editor shows them.
 *
 * A page key ("p.orders_all") is what a role grants. Each page also feeds one older feature key
 * ("order_desk") so server data rules and existing checks keep working: a feature is granted
 * when any of its pages is, at the widest level among them.
 */
import type { FeatureKey } from './permissions';

export type PageKey =
  | 'p.dashboard' | 'p.products'
  | 'p.orders_extractor' | 'p.orders_manual' | 'p.orders_all' | 'p.orders_daily' | 'p.orders_monthly'
  | 'p.sales_offers' | 'p.delivery_failures' | 'p.follow_ups' | 'p.customer_calls'
  | 'p.feedback' | 'p.returns' | 'p.issue_categories'
  | 'p.customers' | 'p.customer_insights'
  | 'p.beat_plan' | 'p.stores' | 'p.distributors' | 'p.dispatch' | 'p.live_tracking' | 'p.shelf_photos' | 'p.stock_counts'
  | 'p.calls' | 'p.cheques' | 'p.documents' | 'p.scorecards'
  | 'p.influencers' | 'p.marketing_sends'
  | 'p.calendar_tasks' | 'p.tasks' | 'p.activity' | 'p.reports' | 'p.export'
  | 'p.settings_brands' | 'p.settings_channels' | 'p.settings_lists' | 'p.settings_promotions'
  | 'p.settings_shared_links' | 'p.settings_alerts' | 'p.settings_beats' | 'p.settings_holidays'
  | 'p.settings_task_templates' | 'p.settings_google' | 'p.settings_import' | 'p.settings_upgrade'
  | 'p.settings_follow_ups';

export type SensitiveKey = 's.money' | 's.customers' | 's.influencers' | 's.download';

export type AreaKey = 'overview' | 'online' | 'reviews' | 'customers' | 'offline' | 'marketing' | 'operations' | 'settings';

export interface PageDefinition {
  key: PageKey;
  label: string;
  area: AreaKey;
  /** What the person can do there, in plain words. */
  description: string;
  /** Path the menu opens. Pages without a path live inside another page. */
  href?: string;
  /** Paths this page owns: exact matches and their sub-paths. */
  paths: string[];
  /** Older feature this page counts towards. */
  feature: FeatureKey;
  /** Older feature names that page code asks about; on this page they are answered by this page's setting. */
  answers: FeatureKey[];
  /** Which levels make sense here. */
  actions: ('VIEW' | 'CREATE' | 'EDIT' | 'DELETE')[];
  /** Whether "own, team or everyone's records" applies. */
  scoped: boolean;
  /** Settings tab id, for Settings pages. */
  settingsTab?: string;
  /** Sensitive details the page cannot work without when people can add or change things on it. */
  needs?: SensitiveKey[];
}

export const AREAS: { key: AreaKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'online', label: 'Online orders' },
  { key: 'reviews', label: 'Reviews & returns' },
  { key: 'customers', label: 'Customers' },
  { key: 'offline', label: 'Offline sales' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'operations', label: 'Operations' },
  { key: 'settings', label: 'Settings' },
];

const ALL: PageDefinition['actions'] = ['VIEW', 'CREATE', 'EDIT', 'DELETE'];
const VIEW_ONLY: PageDefinition['actions'] = ['VIEW'];
const NO_DELETE: PageDefinition['actions'] = ['VIEW', 'CREATE', 'EDIT'];

const page = (key: PageKey, label: string, area: AreaKey, feature: FeatureKey, description: string, extra: Partial<PageDefinition> = {}): PageDefinition => ({
  key, label, area, feature, description, paths: extra.href ? [extra.href] : [], answers: [feature], actions: ALL, scoped: true, ...extra,
});

const settings = (key: PageKey, label: string, tab: string, description: string): PageDefinition =>
  page(key, label, 'settings', 'settings', description, { settingsTab: tab, scoped: false, actions: ALL });

export const PAGES: PageDefinition[] = [
  page('p.dashboard', 'Dashboard', 'overview', 'dashboard', 'Daily numbers and charts across brands', { href: '/dashboard', actions: VIEW_ONLY, scoped: false }),
  page('p.products', 'Products & combos', 'overview', 'products', 'Catalogue, prices, stock and combos', { href: '/products', scoped: false }),

  page('p.orders_extractor', 'WhatsApp extractor', 'online', 'orderflow', 'Paste WhatsApp messages and save them as orders', { href: '/orderflow/extractor', actions: NO_DELETE, needs: ['s.money', 's.customers'] }),
  page('p.orders_manual', 'Manual order entry', 'online', 'orderflow', 'Type in an order by hand', { href: '/orderflow/manual-entry', actions: NO_DELETE, needs: ['s.money', 's.customers'] }),
  page('p.orders_all', 'All orders', 'online', 'order_desk', 'Search orders, change delivery status, log failures, returns and exchanges', { href: '/orderflow/orders', answers: ['order_desk', 'orderflow'] }),
  page('p.orders_daily', 'Daily orders', 'online', 'orderflow', 'Each day’s orders checked against the sheet', { href: '/orderflow/daily-orders', actions: VIEW_ONLY }),
  page('p.orders_monthly', 'Monthly sales sheet', 'online', 'orderflow', 'Month totals by brand, product and channel', { href: '/orderflow/monthly-sales', actions: VIEW_ONLY }),
  page('p.sales_offers', 'Sales & offers', 'online', 'orderflow', 'Schedule sales, discounts and free gifts', { href: '/orderflow/sales', answers: ['orderflow', 'order_desk', 'marketing'], scoped: false }),
  page('p.delivery_failures', 'Delivery failures', 'online', 'orderflow', 'Failed deliveries and re-attempts', { href: '/orderflow/delivery-failures', actions: NO_DELETE }),
  page('p.follow_ups', 'Follow-up calls', 'online', 'customer_calls', 'Calls due to customers after they order, and logging how each went', { href: '/orderflow/follow-ups', actions: NO_DELETE, needs: ['s.customers'] }),
  page('p.customer_calls', 'Customer call log', 'online', 'customer_calls', 'Every call to online customers, follow-ups and others. Separate from store calls', { href: '/orderflow/customer-calls', actions: NO_DELETE, needs: ['s.customers'] }),

  page('p.feedback', 'Feedback & complaints', 'reviews', 'reviews', 'Customer reviews and complaints', { href: '/reviews/feedback' }),
  page('p.returns', 'Returns', 'reviews', 'reviews', 'Logged returns and their outcome', { href: '/reviews/returns', answers: ['reviews', 'order_desk'] }),
  page('p.issue_categories', 'Issue categories', 'reviews', 'reviews', 'The list of complaint reasons', { href: '/reviews/categories', scoped: false }),

  page('p.customers', 'Customer directory', 'customers', 'customers', 'Every customer and their order history', { href: '/customers', needs: ['s.customers'] }),
  page('p.customer_insights', 'Cohort insights', 'customers', 'customers', 'Repeat rate, churn and segments', { href: '/customers/insights', actions: VIEW_ONLY }),

  page('p.beat_plan', 'Beat plans & routes', 'offline', 'beat_plans', 'Store visits, routes and field tasks', { href: '/offline-sales/beat-plan' }),
  page('p.stores', 'Stores & branches', 'offline', 'stores', 'Retailers, chain branches and contacts', { href: '/offline-sales/stores' }),
  page('p.distributors', 'Distributors & chains', 'offline', 'distributors', 'Distributor and chain head-office accounts, shown inside Stores'),
  page('p.dispatch', 'Orders & dispatch', 'offline', 'dispatches', 'Store orders as dispatch orders: received, packed, dispatched, delivered; order challans and payment terms', { href: '/offline-sales/dispatch' }),
  page('p.live_tracking', 'Live GPS tracking', 'offline', 'gps_tracking', 'Where field staff are right now', { href: '/offline-sales/live-tracking', actions: ['VIEW', 'EDIT'] }),
  page('p.stock_counts', 'Stock counts', 'offline', 'stock_counts', 'Shelf counts and daily sales at every store, and what is out or running low', { href: '/offline-sales/stock-counts' }),
  page('p.shelf_photos', 'Shelf photos', 'offline', 'shelf_photos', 'Before and after shelf photos', { href: '/offline-sales/shelf-photos' }),
  page('p.calls', 'Call tracker', 'offline', 'call_tracker', 'Calls to stores and their outcome', { href: '/offline-sales/calls' }),
  page('p.cheques', 'Cheque tracker', 'offline', 'cheque_tracker', 'Cheques collected, handed over and banked', { href: '/offline-sales/cheques', needs: ['s.money'] }),
  page('p.documents', 'Document handover', 'offline', 'document_handover', 'VAT bills, challans and signed orders', { href: '/offline-sales/documents' }),
  page('p.scorecards', 'Staff scorecards', 'offline', 'staff_scorecards', 'Field staff performance', { href: '/offline-sales/scorecard', actions: VIEW_ONLY }),

  page('p.influencers', 'Influencer directory', 'marketing', 'marketing', 'Influencers, their content and ratings', { href: '/marketing/influencers', needs: ['s.influencers'] }),
  page('p.marketing_sends', 'Marketing sends', 'marketing', 'marketing', 'Products sent to influencers', { href: '/marketing/sends', needs: ['s.influencers'] }),

  page('p.calendar_tasks', 'Calendar to-do', 'operations', 'tasks', 'Your to-do list on the BS/AD calendar', { href: '/opscore/calendar-tasks' }),
  page('p.tasks', 'Task management', 'operations', 'tasks', 'Assign and follow up tasks', { href: '/opscore/tasks' }),
  page('p.activity', 'Activity trail', 'operations', 'activity', 'Who changed what, and when', { href: '/opscore/activity', actions: VIEW_ONLY }),
  page('p.reports', 'Reports & downloads', 'operations', 'export', 'Build Excel reports by date, brand, sub-brand, store and officer, and download a full backup', { href: '/opscore/reports', actions: VIEW_ONLY, scoped: false }),
  page('p.export', 'Google Sheets export', 'operations', 'export', 'Send data to Google Sheets and download CSVs', { href: '/opscore/export', actions: ['VIEW', 'EDIT'], scoped: false }),

  settings('p.settings_brands', 'Brands & order IDs', 'BRANDS', 'Add brands and set order ID prefixes'),
  settings('p.settings_channels', 'Sales channels & delivery', 'CHANNELS', 'Order platforms and delivery partners'),
  settings('p.settings_lists', 'Lists & categories', 'LISTS', 'Shared dropdown lists'),
  settings('p.settings_promotions', 'Promotions', 'PROMOTIONS', 'Trade promotions for stores'),
  settings('p.settings_shared_links', 'Shared links', 'SHARED_ACCESS', 'Read-only links for people outside the team'),
  settings('p.settings_alerts', 'Alerts & notifications', 'RULES', 'Who gets which alerts'),
  settings('p.settings_follow_ups', 'Follow-up calls', 'FOLLOW_UPS', 'How many follow-up calls, and how many days after an order'),
  settings('p.settings_beats', 'Beats & visits', 'FIELD_SALES', 'Visit rules for field staff'),
  settings('p.settings_holidays', 'Holidays', 'HOLIDAYS', 'Holiday calendar'),
  settings('p.settings_task_templates', 'Task templates', 'TEMPLATES', 'Ready-made task checklists'),
  settings('p.settings_google', 'Google Sheets & Drive', 'GOOGLE', 'Google account connection'),
  settings('p.settings_import', 'Import data', 'IMPORT', 'Bring in data from spreadsheets'),
  settings('p.settings_upgrade', 'Data upgrade', 'UPGRADE', 'One-off data repairs'),
];

export const SENSITIVE: { key: SensitiveKey; label: string; description: string }[] = [
  { key: 's.money', label: 'Money', description: 'Order values, prices, discounts, revenue, cheque and dispatch amounts, costs and margins' },
  { key: 's.customers', label: 'Customer details', description: 'Customer phone numbers and addresses' },
  { key: 's.influencers', label: 'Influencer details', description: 'Influencer phone numbers, emails and delivery addresses' },
  { key: 's.download', label: 'Download data', description: 'Excel downloads on every list, store and order, and the Reports & downloads page. Leave off for field staff' },
];

export const SENSITIVE_KEYS = SENSITIVE.map((entry) => entry.key);
const BY_KEY = new Map(PAGES.map((entry) => [entry.key, entry]));

export function pageDefinition(key: string): PageDefinition | undefined {
  return BY_KEY.get(key as PageKey);
}

export function isPageKey(key: string): key is PageKey { return BY_KEY.has(key as PageKey); }
export function isSensitiveKey(key: string): key is SensitiveKey { return (SENSITIVE_KEYS as string[]).includes(key); }

/** The page that owns a path, or undefined for paths that need no page (login, shared links). */
export function pageForPath(pathname: string): PageDefinition | undefined {
  const path = pathname.replace(/\/+$/, '') || '/';
  let best: PageDefinition | undefined;
  let bestLength = -1;
  for (const entry of PAGES) for (const owned of entry.paths) {
    if ((path === owned || path.startsWith(`${owned}/`)) && owned.length > bestLength) { best = entry; bestLength = owned.length; }
  }
  return best;
}

export function pageForSettingsTab(tab: string): PageDefinition | undefined {
  return PAGES.find((entry) => entry.settingsTab === tab);
}

/** Paths anyone signed in may open. */
export const OPEN_PATHS = ['/no-access'];
/** Pages anyone signed in can open: a message shows only to the person it was sent to. */
export const OPEN_PREFIXES = ['/messages/'];
