import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from './supabase-server';
import { formatDocumentId } from '../document-ids';

/**
 * Atomic running numbers for short document IDs.
 *
 * Each prefix has one counter row. A number is taken with a compare-and-swap
 * UPDATE (`WHERE version = <the version just read>`), which the database
 * applies as a single statement: two people saving at the same instant can
 * never both win the same version, so they can never receive the same number.
 * The loser simply reads again and takes the next one.
 *
 * Counters live in the existing workspace_records table under a collection the
 * browser can neither read nor write, so no database migration is required.
 */
const COUNTER_COLLECTION = 'documentCounters';

export class CounterError extends Error { status = 503; }

export async function allocateSequence(prefix: string, count: number, actorId: string): Promise<number> {
  if (!/^[A-Z0-9]{2,4}$/.test(prefix) || !Number.isSafeInteger(count) || count < 1 || count > 100000) throw new CounterError('Invalid document counter request.');
  // Each round exactly one waiting save wins, so the number of rounds is bounded by how many saves arrive together.
  for (let attempt = 0; attempt < 200; attempt++) {
    const { data: row, error } = await supabaseAdmin.from('workspace_records').select('data,version')
      .eq('collection', COUNTER_COLLECTION).eq('id', prefix).maybeSingle();
    if (error) throw new CounterError('The ID counter could not be read. Please retry.');
    if (!row) {
      const inserted = await supabaseAdmin.from('workspace_records').insert({ collection: COUNTER_COLLECTION, id: prefix,
        data: { id: prefix, last: count }, created_by: actorId, version: 1, last_mutation_id: `counter_${randomUUID()}` }).select('id');
      if (!inserted.error && inserted.data?.length) return 1;
      if (inserted.error && inserted.error.code !== '23505') throw new CounterError('The ID counter could not be started. Please retry.');
      continue; // Someone else created it first; read their value.
    }
    const last = Number(row.data?.last) || 0;
    const updated = await supabaseAdmin.from('workspace_records')
      .update({ data: { id: prefix, last: last + count }, version: row.version + 1, last_mutation_id: `counter_${randomUUID()}`, updated_at: new Date().toISOString() })
      .eq('collection', COUNTER_COLLECTION).eq('id', prefix).eq('version', row.version).select('id');
    if (updated.error) throw new CounterError('The ID counter could not be updated. Please retry.');
    if (updated.data?.length) return last + 1;
    await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * Math.min(40, 4 + attempt * 2))));
  }
  throw new CounterError('Too many saves at once. Please retry in a moment.');
}

/** The next free ID for a prefix. `taken` guards against an old record that already uses the same text. */
export async function nextDocumentId(prefix: string, actorId: string, taken: (candidate: string) => Promise<boolean>): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = formatDocumentId(prefix, await allocateSequence(prefix, 1, actorId));
    if (!(await taken(candidate))) return candidate;
  }
  throw new CounterError('A free document ID could not be found. Please retry.');
}

export async function documentIdTaken(collection: string, field: string, candidate: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from('workspace_records').select('id').eq('collection', collection).eq(`data->>${field}`, candidate).limit(1);
  if (error) throw new CounterError('Existing document IDs could not be checked. Please retry.');
  return !!data?.length;
}
