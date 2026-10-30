import type { ActionPermission } from './permissions';

export interface OrderOption { id: string; name: string; active: boolean }
export interface OrderOptions { channels: OrderOption[]; deliveryMethods: OrderOption[] }
export type OrderOptionKind = keyof OrderOptions;

const initialChannels = ['Instagram', 'Messenger', 'WhatsApp', 'Website', 'TikTok', 'Walk-in', 'Pathao Bazaar', 'Phone Call', 'Field Order', 'YouTube', 'Facebook', 'Other'];
const initialDelivery = ['Standard', 'Pathao', 'InDrive', 'Yango', 'Pick-up', 'In-house Rider', 'Nepal Post'];
const options = (names: string[], prefix: string): OrderOption[] => [...new Set(names.filter(Boolean))].map((name, index) => ({ id: `${prefix}_${index}`, name, active: true }));

export function defaultOrderOptions(history: { platform?: string; deliveryMethod?: string }[] = []): OrderOptions {
  return { channels: options([...initialChannels, ...history.flatMap(order => order.platform ? [order.platform] : [])], 'channel'),
    deliveryMethods: options([...initialDelivery, ...history.flatMap(order => order.deliveryMethod ? [order.deliveryMethod] : [])], 'delivery') };
}

export function validateOrderOptions(value: unknown): OrderOptions {
  if (!value || typeof value !== 'object') throw new Error('Channels and delivery methods are required.');
  const result = {} as OrderOptions;
  for (const kind of ['channels', 'deliveryMethods'] as const) {
    const rows = (value as OrderOptions)[kind];
    if (!Array.isArray(rows) || rows.length > 100) throw new Error('Use no more than 100 entries per list.');
    const names = new Set<string>(); const ids = new Set<string>();
    result[kind] = rows.map(row => {
      if (!row || typeof row.name !== 'string' || !row.name.trim() || row.name.trim().length > 60 || /[\u0000-\u001f\u007f]/.test(row.name)
        || typeof row.id !== 'string' || !/^[A-Za-z0-9_:-]{1,100}$/.test(row.id) || typeof row.active !== 'boolean') throw new Error('Each entry needs a name of 1–60 characters and a valid ID.');
      const name = row.name.trim(); const key = name.toLocaleLowerCase('en-US');
      if (names.has(key) || ids.has(row.id)) throw new Error('Channel and delivery names must be unique within their list.');
      names.add(key); ids.add(row.id);
      return { id: row.id, name, active: row.active };
    });
    if (!result[kind].some(row => row.active)) throw new Error('Keep at least one active sales channel and delivery method.');
  }
  return result;
}

export function requiredOrderOptionActions(before: OrderOptions, after: OrderOptions): ActionPermission[] {
  const actions = new Set<ActionPermission>();
  for (const kind of ['channels', 'deliveryMethods'] as const) {
    for (const row of after[kind]) {
      const prior = before[kind].find(entry => entry.id === row.id);
      if (!prior) actions.add('CREATE');
      else {
        if (prior.name !== row.name || !prior.active && row.active) actions.add('EDIT');
        if (prior.active && !row.active) actions.add('DELETE');
      }
    }
    if (before[kind].some(prior => !after[kind].some(row => row.id === prior.id))) actions.add('DELETE');
  }
  return [...actions];
}

export function activeOrderOptionNames(value: OrderOptions, kind: OrderOptionKind, existing?: string): string[] {
  const names = value[kind].filter(row => row.active).map(row => row.name);
  return existing && !names.includes(existing) ? [existing, ...names] : names;
}

export function assertActiveOrderOption(value: OrderOptions, kind: OrderOptionKind, name: unknown, existing?: string): string {
  if (typeof name !== 'string' || !name.trim() || name !== existing && !activeOrderOptionNames(value, kind).includes(name)) {
    throw new Error(`Choose an active ${kind === 'channels' ? 'sales channel' : 'delivery method'} from Settings → Channels & Logistics.`);
  }
  return name;
}
