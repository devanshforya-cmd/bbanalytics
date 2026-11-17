/**
 * A small in-memory stand-in for the Supabase client, covering exactly the
 * calls the server makes against workspace_records, users and brands. Writes
 * are atomic and every call yields first, so concurrent requests interleave
 * the way they do against the real database.
 */
type Row = Record<string, any>;
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, Math.floor(Math.random() * 3)));
const field = (row: Row, column: string) => column.startsWith('data->>') ? (row.data?.[column.slice(7)] === undefined ? null : String(row.data[column.slice(7)])) : row[column];

export class FakeDatabase {
  tables: Record<string, Row[]> = { workspace_records: [], users: [], brands: [] };
  rpcCalls = 0;
  /** Product IDs that exist, to imitate the product-reference trigger. Null disables the check. */
  products: Set<string> | null = null;

  /** Copies, so a test holds what was read at that moment, like a browser does. */
  records(collection: string): Row[] { return this.tables.workspace_records.filter((row) => row.collection === collection).map((row) => structuredClone(row)); }
  seed(collection: string, data: Row, createdBy = 'admin', version = 1) { this.tables.workspace_records.push({ collection, id: data.id, data: structuredClone(data), created_by: createdBy, version, last_mutation_id: `seed_${data.id}` }); }

  private violates(candidate: Row, ignore?: Row): string | null {
    const rows = this.tables.workspace_records.filter((row) => row !== ignore);
    if (rows.some((row) => row.collection === candidate.collection && row.id === candidate.id)) return '23505';
    if (candidate.collection === 'orders' && candidate.data?.orderNumber && rows.some((row) => row.collection === 'orders' && row.data?.orderNumber === candidate.data.orderNumber)) return '23505';
    if (candidate.collection === 'customers' && candidate.data?.phone && rows.some((row) => row.collection === 'customers' && row.data?.phone === candidate.data.phone)) return '23505';
    return null;
  }

  from(table: string) {
    const db = this;
    const filters: ((row: Row) => boolean)[] = [];
    let range: [number, number] | null = null; let limit = Infinity;
    let action: { kind: 'select' | 'insert' | 'update' | 'delete' | 'upsert'; payload?: any; ignoreDuplicates?: boolean } = { kind: 'select' };
    let single = false;
    const run = async () => {
      await pause();
      const all = db.tables[table] ||= [];
      const matches = () => all.filter((row) => filters.every((test) => test(row)));
      if (action.kind === 'select') {
        let rows = matches().sort((a, b) => String(a.collection || '').localeCompare(String(b.collection || '')) || String(a.id).localeCompare(String(b.id)));
        if (range) rows = rows.slice(range[0], range[1] + 1);
        rows = rows.slice(0, limit).map((row) => structuredClone(row));
        return single ? { data: rows[0] || null, error: null } : { data: rows, error: null };
      }
      if (action.kind === 'insert' || action.kind === 'upsert') {
        const inserted: Row[] = [];
        for (const item of Array.isArray(action.payload) ? action.payload : [action.payload]) {
          const row = structuredClone(item);
          if (table === 'workspace_records') {
            const clash = db.violates(row);
            if (clash) { if (action.kind === 'upsert' && action.ignoreDuplicates) continue; return { data: null, error: { code: clash } }; }
          }
          all.push(row); inserted.push(structuredClone(row));
        }
        return { data: inserted, error: null };
      }
      if (action.kind === 'update') {
        const updated: Row[] = [];
        for (const row of matches()) {
          const next = { ...row, ...structuredClone(action.payload) };
          if (table === 'workspace_records' && db.violates(next, row)) return { data: null, error: { code: '23505' } };
          Object.assign(row, next); updated.push(structuredClone(row));
        }
        return { data: updated, error: null };
      }
      const removed = matches();
      db.tables[table] = all.filter((row) => !removed.includes(row));
      return { data: removed.map((row) => structuredClone(row)), error: null };
    };
    const builder: any = {
      select() { return builder; },
      insert(payload: any) { action = { kind: 'insert', payload }; return builder; },
      upsert(payload: any, options: { ignoreDuplicates?: boolean } = {}) { action = { kind: 'upsert', payload, ignoreDuplicates: options.ignoreDuplicates }; return builder; },
      update(payload: any) { action = { kind: 'update', payload }; return builder; },
      delete() { action = { kind: 'delete' }; return builder; },
      eq(column: string, value: unknown) { filters.push((row) => field(row, column) === value); return builder; },
      in(column: string, values: unknown[]) { filters.push((row) => values.includes(field(row, column))); return builder; },
      lt() { return builder; },
      order() { return builder; },
      range(from: number, to: number) { range = [from, to]; return builder; },
      limit(count: number) { limit = count; return builder; },
      maybeSingle() { single = true; return run(); },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) { return run().then(resolve, reject); },
    };
    return builder;
  }

  /** Mirrors public.commit_workspace_mutations: all-or-nothing with version checks. */
  async rpc(name: string, args: { p_mutations: Row[] }) {
    await pause();
    if (name !== 'commit_workspace_mutations') return { data: null, error: { code: 'PGRST202' } };
    this.rpcCalls++;
    const draft: Row[] = this.tables.workspace_records.map((row) => ({ ...row, data: structuredClone(row.data) }));
    for (const item of [...args.p_mutations].sort((a, b) => `${a.collection}:${a.id}`.localeCompare(`${b.collection}:${b.id}`))) {
      const index = draft.findIndex((row) => row.collection === item.collection && row.id === item.id);
      const previous = index >= 0 ? draft[index] : null;
      if (previous && previous.last_mutation_id === item.mutationId) continue;
      if (!previous && item.operation === 'delete') continue;
      if ((previous?.version || 0) !== item.expectedVersion) return { data: null, error: { code: '40001' } };
      if (item.operation === 'delete') { draft.splice(index, 1); continue; }
      if (this.products) {
        const references = JSON.stringify(item.data).match(/"productId":"([^"]*)"/g)?.map((match) => match.slice(13, -1)).filter(Boolean) || [];
        if (references.some((id) => !this.products!.has(id))) return { data: null, error: { code: '23503' } };
      }
      const next = { collection: item.collection, id: item.id, data: structuredClone(item.data), created_by: previous?.created_by || item.createdBy, version: (previous?.version || 0) + 1, last_mutation_id: item.mutationId };
      if (previous) draft[index] = next; else draft.push(next);
      if (next.collection === 'orders' && draft.filter((row) => row.collection === 'orders' && row.data.orderNumber === next.data.orderNumber).length > 1) return { data: null, error: { code: '23505' } };
    }
    this.tables.workspace_records = draft;
    return { data: [], error: null };
  }
}
