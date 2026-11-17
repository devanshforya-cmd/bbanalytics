import { createHash } from 'node:crypto';
import { supabaseAdmin } from './supabase-server';
import { allocateSequence } from './document-counter';
import { syncCustomersForPhones, WorkspaceError } from './server-workspace';
import type { StoredWorkspaceRecord } from './workspace-policy';
import { RESERVED_PREFIXES, brandPrefix, formatDocumentId, isShortDocumentId } from '../document-ids';
import { lookupId, sameName } from '../marketing';
import type { User } from '../types';

/**
 * One-time, repeatable data upgrade for the November 2026 change list.
 *
 *  1. Orders flagged as marketing become marketing sends and leave the orders collection.
 *  2. Existing orders receive short IDs in order of creation; the old ID is kept as the legacy ID.
 *  3. Field orders and dispatches receive SO- and DP- numbers.
 *  4. Single influencer categories become niche records; single content URLs become link lists.
 *
 * Every step only touches records that still need it, so running it again is safe.
 */

type Row = StoredWorkspaceRecord;
interface Mutation { collection: string; id: string; operation: 'upsert' | 'delete'; data?: Record<string, any>; expectedVersion: number; mutationId: string; createdBy: string }

async function readAll(collection: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin.from('workspace_records').select('collection,id,data,created_by,version,last_mutation_id').eq('collection', collection).order('id').range(offset, offset + 999);
    if (error) throw new WorkspaceError(503, 'Records could not be loaded for the upgrade.');
    rows.push(...((data || []) as Row[]));
    if (!data || data.length < 1000) return rows;
  }
}

const byCreation = (a: Row, b: Row) => String(a.data.createdAt || a.data.orderDateAd || '').localeCompare(String(b.data.createdAt || b.data.orderDateAd || '')) || a.id.localeCompare(b.id);
const stamp = (step: string, id: string) => `upgrade_nov2026_${step}_${createHash('sha256').update(id).digest('hex').slice(0, 24)}`;

export interface UpgradePlan { marketingOrders: number; ordersWithoutShortId: number; fieldOrdersWithoutShortId: number; dispatchesWithoutNumber: number; influencersWithoutNiches: number; contentToConvert: number; pending: number }

function summarize(data: { orders: Row[]; secondaryOrders: Row[]; dispatches: Row[]; influencers: Row[]; content: Row[] }): UpgradePlan {
  const plan = {
    marketingOrders: data.orders.filter(row => row.data.isMarketing).length,
    ordersWithoutShortId: data.orders.filter(row => !row.data.isMarketing && !isShortDocumentId(row.data.orderNumber)).length,
    fieldOrdersWithoutShortId: data.secondaryOrders.filter(row => !isShortDocumentId(row.data.orderNumber)).length,
    dispatchesWithoutNumber: data.dispatches.filter(row => !isShortDocumentId(row.data.dispatchNumber)).length,
    influencersWithoutNiches: data.influencers.filter(row => !Array.isArray(row.data.nicheIds)).length,
    contentToConvert: data.content.filter(row => !Array.isArray(row.data.links)).length,
  };
  return { ...plan, pending: Object.values(plan).reduce((sum, count) => sum + count, 0) };
}

async function load() {
  const [orders, secondaryOrders, dispatches, influencers, content, niches, sends, products, failures, returns, feedback, config] = await Promise.all(
    ['orders', 'secondaryOrders', 'dispatches', 'influencers', 'influencerContent', 'influencerNiches', 'marketingSends', 'products', 'deliveryFailures', 'returns', 'feedbackEntries', 'workspaceConfig'].map(readAll));
  return { orders, secondaryOrders, dispatches, influencers, content, niches, sends, products, failures, returns, feedback, config };
}

export async function planDataUpgrade(): Promise<UpgradePlan> { return summarize(await load()); }

/** Commit in transactions of at most 200 changes; if one batch is refused, retry its records one by one so a single bad record cannot block the rest. */
async function commit(groups: Mutation[][], failures: string[], label: (group: Mutation[]) => string): Promise<number> {
  let done = 0;
  const send = async (mutations: Mutation[]) => (await supabaseAdmin.rpc('commit_workspace_mutations', { p_mutations: mutations })).error;
  let batch: Mutation[][] = [];
  const flush = async () => {
    if (!batch.length) return;
    const error = await send(batch.flat());
    if (!error) done += batch.length;
    else for (const group of batch) {
      const single = await send(group);
      if (single) failures.push(`${label(group)}: ${single.code === '40001' ? 'changed during the upgrade, run it again' : single.code === '23503' ? 'refers to a product that no longer exists' : 'could not be saved'}`);
      else done++;
    }
    batch = [];
  };
  for (const group of groups) {
    if (batch.flat().length + group.length > 200) await flush();
    batch.push(group);
  }
  await flush();
  return done;
}

export async function runDataUpgrade(user: User) {
  const data = await load();
  const before = summarize(data);
  const failures: string[] = [];
  const result = { sendsCreated: 0, influencersCreated: 0, ordersNumbered: 0, fieldOrdersNumbered: 0, dispatchesNumbered: 0, nichesLinked: 0, contentConverted: 0 };

  // ---- 1. Marketing-flagged orders become sends -------------------------------------------
  const influencers = [...data.influencers];
  const productIds = new Set(data.products.map(row => row.id));
  const marketing = data.orders.filter(row => row.data.isMarketing).sort(byCreation);
  if (marketing.length) {
    const first = await allocateSequence(RESERVED_PREFIXES.marketingSends, marketing.length, user.id);
    const groups: Mutation[][] = [];
    marketing.forEach((order, index) => {
      const d = order.data;
      const cleanName = String(d.customerName || '').replace(/\s*\(PR\)\s*$/i, '').trim() || 'Unnamed influencer';
      let influencer = influencers.find(row => row.id === d.influencerId) || influencers.find(row => sameName(row.data.name, cleanName));
      const group: Mutation[] = [];
      if (!influencer) {
        // A send must belong to an influencer, so a missing profile is created from the order's name.
        const id = `inf_${createHash('sha256').update(cleanName.toLowerCase()).digest('hex').slice(0, 24)}`;
        influencer = { collection: 'influencers', id, created_by: order.created_by, version: 0,
          data: { id, name: cleanName, ...(d.customerPhone ? { phone: d.customerPhone } : {}), ...(d.address ? { address: d.address } : {}), ...(d.district ? { city: d.district } : {}),
            platforms: [], nicheIds: [], qualityRating: 'NOT_RATED', totalSends: 0, totalContent: 0, isActive: true, notes: 'Profile created from an earlier marketing send.', createdAt: d.createdAt || new Date().toISOString() } };
        influencers.push(influencer);
        group.push({ collection: 'influencers', id, operation: 'upsert', data: influencer.data, expectedVersion: 0, mutationId: stamp('influencer', id), createdBy: order.created_by });
        result.influencersCreated++;
      }
      const sendId = `send_${order.id}`.slice(0, 170);
      const items = (Array.isArray(d.items) ? d.items : []).map((item: any) => ({ productId: productIds.has(item.productId) ? item.productId : '', productName: String(item.productName || 'Product'),
        brandCode: String(item.brandCode || d.brandCode || '').toUpperCase(), quantity: Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1 }));
      const send = { id: sendId, sendNumber: formatDocumentId(RESERVED_PREFIXES.marketingSends, first + index), influencerId: influencer.id, influencerName: influencer.data.name,
        brandCodes: [...new Set([String(d.brandCode || '').toUpperCase(), ...items.map((item: any) => item.brandCode)].filter(Boolean))], reachOutPlatform: String(d.platform || 'Not recorded'),
        responsibleId: d.assignedToId || order.created_by, responsibleName: d.assignedToName || '', sentDateAd: d.orderDateAd, sentDateBs: d.orderDateBs || '', items,
        deliveryChannel: String(d.deliveryMethod || 'Standard'), ...(d.address ? { deliveryAddress: d.address } : {}), ...(d.customerPhone ? { deliveryPhone: d.customerPhone } : {}),
        ...(d.notes ? { notes: d.notes } : {}), status: d.contentReceived ? 'CONTENT_RECEIVED' : 'SENT', legacyOrderNumber: d.orderNumber, createdAt: d.createdAt || new Date().toISOString() };
      if (!data.sends.some(row => row.id === sendId)) group.push({ collection: 'marketingSends', id: sendId, operation: 'upsert', data: send, expectedVersion: 0, mutationId: stamp('send', order.id), createdBy: order.created_by });
      group.push({ collection: 'orders', id: order.id, operation: 'delete', expectedVersion: order.version, mutationId: stamp('unorder', order.id), createdBy: order.created_by });
      groups.push(group);
    });
    result.sendsCreated = await commit(groups, failures, group => `Marketing order ${group.find(m => m.collection === 'orders')?.id}`);
    // Recount the customers these orders may have touched, and each influencer's totals.
    try { await syncCustomersForPhones(user, marketing.map(row => String(row.data.customerPhone || '')), 'upgrade_nov2026_marketing'); }
    catch { failures.push('Customer totals for moved marketing orders could not be recounted; run the upgrade again.'); }
  }

  // ---- 2. Short IDs for existing orders, oldest first --------------------------------------
  const prefixes = data.config.find(row => row.id === 'workspace')?.data.brandPrefixes;
  const commercial = (await readAll('orders')).filter(row => !row.data.isMarketing);
  const taken = new Set(commercial.map(row => String(row.data.orderNumber || '').toUpperCase()));
  const byPrefix = new Map<string, Row[]>();
  for (const order of commercial.filter(row => !isShortDocumentId(row.data.orderNumber)).sort(byCreation)) {
    const prefix = brandPrefix(String(order.data.items?.[0]?.brandCode || order.data.brandCode || ''), prefixes);
    byPrefix.set(prefix, [...(byPrefix.get(prefix) || []), order]);
  }
  const renumbered = new Map<string, { id: string; from: string; to: string }>();
  const orderGroups: Mutation[][] = [];
  for (const [prefix, rows] of byPrefix) {
    let next = await allocateSequence(prefix, rows.length, user.id);
    for (const order of rows) {
      let candidate = formatDocumentId(prefix, next++);
      // An old record may already use this exact text; take a fresh number instead.
      while (taken.has(candidate)) candidate = formatDocumentId(prefix, await allocateSequence(prefix, 1, user.id));
      taken.add(candidate);
      const from = String(order.data.orderNumber || '');
      renumbered.set(order.id, { id: order.id, from, to: candidate });
      orderGroups.push([{ collection: 'orders', id: order.id, operation: 'upsert', data: { ...order.data, orderNumber: candidate, ...(from ? { legacyOrderNumber: from } : {}) },
        expectedVersion: order.version, mutationId: stamp('shortid', order.id), createdBy: order.created_by }]);
    }
  }
  result.ordersNumbered = await commit(orderGroups, failures, group => `Order ${group[0].data?.legacyOrderNumber || group[0].id}`);

  // Records that quote an order's ID follow it to the new short ID.
  const byOldNumber = new Map([...renumbered.values()].filter(entry => entry.from).map(entry => [entry.from.toUpperCase(), entry]));
  const references: Mutation[][] = [];
  for (const [collection, rows] of [['deliveryFailures', data.failures], ['returns', data.returns], ['feedbackEntries', data.feedback]] as const) {
    for (const row of rows) {
      const match = (row.data.orderId && renumbered.get(row.data.orderId)) || (row.data.orderNumber && byOldNumber.get(String(row.data.orderNumber).toUpperCase()));
      if (!match || row.data.orderNumber === match.to) continue;
      references.push([{ collection, id: row.id, operation: 'upsert', data: { ...row.data, orderNumber: match.to, orderId: row.data.orderId || match.id }, expectedVersion: row.version, mutationId: stamp('ref', `${collection}:${row.id}`), createdBy: row.created_by }]);
    }
  }
  await commit(references, failures, group => `${group[0].collection} ${group[0].id}`);

  // ---- 3. Field orders (SO-) and dispatches (DP-) ------------------------------------------
  const numberOthers = async (rows: Row[], collection: string, prefix: string, field: string) => {
    const pending = rows.filter(row => !isShortDocumentId(row.data[field])).sort(byCreation);
    if (!pending.length) return 0;
    const used = new Set(rows.map(row => String(row.data[field] || '').toUpperCase()));
    let next = await allocateSequence(prefix, pending.length, user.id);
    const groups: Mutation[][] = [];
    for (const row of pending) {
      let candidate = formatDocumentId(prefix, next++);
      while (used.has(candidate)) candidate = formatDocumentId(prefix, await allocateSequence(prefix, 1, user.id));
      used.add(candidate);
      const previous = row.data[field];
      groups.push([{ collection, id: row.id, operation: 'upsert', data: { ...row.data, [field]: candidate, ...(previous && field === 'orderNumber' ? { legacyOrderNumber: previous } : {}) },
        expectedVersion: row.version, mutationId: stamp(prefix, row.id), createdBy: row.created_by }]);
    }
    return commit(groups, failures, group => `${collection} ${group[0].id}`);
  };
  result.fieldOrdersNumbered = await numberOthers(data.secondaryOrders, 'secondaryOrders', RESERVED_PREFIXES.secondaryOrders, 'orderNumber');
  result.dispatchesNumbered = await numberOthers(data.dispatches, 'dispatches', RESERVED_PREFIXES.dispatches, 'dispatchNumber');

  // ---- 4. Niches and content links ----------------------------------------------------------
  const niches = [...data.niches];
  const nicheGroups: Mutation[][] = [];
  const freshInfluencers = await readAll('influencers');
  const sendsNow = await readAll('marketingSends');
  for (const row of freshInfluencers) {
    const own = sendsNow.filter(send => send.data.influencerId === row.id && send.data.status !== 'CANCELLED');
    const last = own.reduce<Row | null>((best, send) => !best || String(send.data.sentDateAd) > String(best.data.sentDateAd) ? send : best, null);
    const next: Record<string, any> = { ...row.data, totalSends: own.length, ...(last ? { lastSendDate: last.data.sentDateAd, lastSendDateBs: last.data.sentDateBs } : {}) };
    const group: Mutation[] = [];
    if (!Array.isArray(row.data.nicheIds)) {
      const name = String(row.data.category || '').trim();
      next.nicheIds = [];
      if (name) {
        let niche = niches.find(entry => sameName(entry.data.name, name));
        if (!niche) {
          const id = lookupId('niche', name);
          niche = { collection: 'influencerNiches', id, created_by: user.id, version: 0, data: { id, name, isArchived: false, createdBy: user.fullName, createdAt: new Date().toISOString() } };
          niches.push(niche);
          group.push({ collection: 'influencerNiches', id, operation: 'upsert', data: niche.data, expectedVersion: 0, mutationId: stamp('niche', id), createdBy: user.id });
        }
        next.nicheIds = [niche.id];
      }
      result.nichesLinked++;
    }
    if (JSON.stringify(next) === JSON.stringify(row.data)) continue;
    group.push({ collection: 'influencers', id: row.id, operation: 'upsert', data: next, expectedVersion: row.version, mutationId: stamp('influencer_fix', `${row.id}:${row.version}`), createdBy: row.created_by });
    nicheGroups.push(group);
  }
  await commit(nicheGroups, failures, group => `Influencer ${group[group.length - 1].id}`);

  const contentGroups: Mutation[][] = [];
  for (const row of data.content.filter(entry => !Array.isArray(entry.data.links))) {
    const { url, platform, brandCode, productName, ...rest } = row.data;
    const next = { ...rest, links: url ? [{ platform: platform || 'Other', url }] : [], brandCodes: brandCode ? [brandCode] : [], productIds: [], productNames: productName ? [productName] : [], postStatus: 'UNKNOWN' };
    contentGroups.push([{ collection: 'influencerContent', id: row.id, operation: 'upsert', data: next, expectedVersion: row.version, mutationId: stamp('content', row.id), createdBy: row.created_by }]);
  }
  result.contentConverted = await commit(contentGroups, failures, group => `Content ${group[0].id}`);

  const after = await planDataUpgrade();
  const id = `act_upgrade_nov2026_${Date.now()}`;
  await supabaseAdmin.from('workspace_records').insert({ collection: 'activityLogs', id, created_by: user.id, version: 1, last_mutation_id: id,
    data: { id, userId: user.id, userName: user.fullName, userRole: user.role, action: 'DATA_UPGRADE', entityType: 'workspace', entityId: 'nov2026', details: { ...result, failures: failures.length }, createdAt: new Date().toISOString() } });
  return { before, after, result, failures: failures.slice(0, 50) };
}
