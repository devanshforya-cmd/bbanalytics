'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/db/db-service';
import type { Brand, DataImportRecord } from '@/lib/types';
import { IMPORT_COLUMNS, type CsvImportInput, type CsvImportType, type ValidatedImport } from '@/lib/import-validation';
import { downloadCSV, generateCSV } from '@/lib/csv';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, UploadCloud } from 'lucide-react';

type Preview = ValidatedImport['preview'];

export default function DataImportSection() {
  const [brands, setBrands] = useState<Brand[]>(() => db.getBrands('ACTIVE'));
  const [history, setHistory] = useState<DataImportRecord[]>(() => db.getImportHistory());
  const [sourceType, setSourceType] = useState<CsvImportType>('ORDERS');
  const [brandCode, setBrandCode] = useState('');
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState('');
  const [batchId, setBatchId] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<DataImportRecord | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    const refresh = () => { setBrands(db.getBrands('ACTIVE')); setHistory([...db.getImportHistory()]); };
    refresh();
    window.addEventListener('bb-db-updated', refresh);
    void db.syncWithSupabase();
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);

  useEffect(() => { setPreview(null); setMessage(null); }, [sourceType, brandCode]);

  const reset = () => { setCsv(''); setFileName(''); setBatchId(''); setPreview(null); setResult(null); setMessage(null); };
  const downloadTemplate = () => {
    downloadCSV(generateCSV(IMPORT_COLUMNS[sourceType].map((label) => ({ key: label, label })), []), `template_${sourceType.toLowerCase()}`);
  };
  const downloadReferences = () => {
    const records = [
      ...db.getProducts().filter((product) => product.brandCode === brandCode).map((product) => ({ type: 'Product', id: product.id, name: product.name, parent: '', brand: product.brandCode, reference: product.sku })),
      ...db.getDistributors().map((entry) => ({ type: 'Distributor', id: entry.id, name: entry.name, parent: '', brand: entry.brandsCarried?.join('; ') || '', reference: '' })),
      ...db.getBranches().map((entry) => ({ type: 'Branch', id: entry.id, name: entry.name, parent: entry.distributorId, brand: entry.brandsAvailable?.join('; ') || '', reference: '' })),
      ...db.getOrders().filter((order) => order.brandCode === brandCode).map((order) => ({ type: 'Order', id: order.id, name: order.customerName, parent: '', brand: order.brandCode, reference: order.orderNumber })),
    ];
    downloadCSV(generateCSV(['type', 'id', 'name', 'parent', 'brand', 'reference'].map((key) => ({ key, label: key })), records), 'import_reference_ids');
  };
  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    setMessage(null); setPreview(null); setResult(null);
    if (!file.name.toLowerCase().endsWith('.csv') || file.size > 300000) { setMessage({ error: true, text: 'Choose a CSV file smaller than 300 KB.' }); return; }
    setBusy('Reading CSV…');
    try { setCsv(await file.text()); setFileName(file.name); setBatchId(crypto.randomUUID()); }
    catch { setCsv(''); setMessage({ error: true, text: 'The file could not be read. Choose it again.' }); }
    finally { setBusy(''); }
  };
  const request = async (action: 'preview' | 'commit') => {
    if (!csv || !brandCode || busy) return;
    setBusy(action === 'preview' ? 'Validating all rows against current records…' : 'Saving the complete batch…');
    setMessage(null);
    try {
      const input: CsvImportInput = { sourceType, brandCode, fileName, batchId, csv };
      const response = await fetch('/api/import', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Workspace-User': db.getCurrentUser().id }, body: JSON.stringify({ ...input, action }) });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) throw new Error(body?.error || `The import could not be confirmed (${response.status}). Retry the same file to check its status.`);
      if (action === 'preview' && !body.alreadyImported) { setPreview(body.preview); return; }
      if (!body.record || body.record.persistence !== 'CONFIRMED') throw new Error('The server did not confirm the batch. Retry without choosing a new file.');
      setResult(body.record); setPreview(null);
      const refresh = await db.syncWithSupabase();
      setHistory((previous) => [body.record, ...previous.filter((entry) => entry.id !== body.record.id)]);
      setMessage({ error: false, text: `${body.record.importedCount} records confirmed saved.${refresh.success ? '' : ' Refresh the workspace when connected to load them here.'}` });
    } catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : 'Save was not confirmed. Retry this batch before starting another import.' }); }
    finally { setBusy(''); }
  };

  return (
    <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><FileSpreadsheet className="h-5 w-5" />CSV data import</h2>
        <p className="mt-2 text-sm text-slate-600">Import up to 50 orders, returns or dispatches. Each row creates one record with one product. Every row is validated before the complete batch is saved.</p>
        <p className="mt-2 text-sm text-amber-800">Imports do not replace existing records. Batch rollback is unavailable; review the preview carefully before saving.</p>
      </div>
      {message && <p role={message.error ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-lg p-3 text-sm ${message.error ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>{message.error ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}{message.text}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold">Import type
          <select value={sourceType} disabled={!!busy || !!result} onChange={(event) => setSourceType(event.target.value as CsvImportType)} className="block w-full rounded-lg border p-2">
            <option value="ORDERS">Orders</option><option value="RETURNS">Returns</option><option value="OFFLINE_SALES">Dispatches</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold">Brand
          <select value={brandCode} disabled={!!busy || !!result} onChange={(event) => setBrandCode(event.target.value)} className="block w-full rounded-lg border p-2">
            <option value="">Select an active brand</option>{brands.map((brand) => <option key={brand.id} value={brand.code}>{brand.name}</option>)}
          </select>
        </label>
      </div>
      {!brands.length && <p className="text-sm text-slate-600">Add an active brand and its real catalog before importing.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={downloadTemplate} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Download className="h-4 w-4" />Download blank template</button>
        <button type="button" disabled={!brandCode || !!busy} onClick={downloadReferences} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Download current reference IDs</button>
      </div>
      <details className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
        <summary className="cursor-pointer font-semibold">CSV requirements</summary>
        <p className="mt-2">Use the exact headers in the current template. Dates use YYYY-MM-DD within BS years 2078–2085, quantities are positive whole numbers, and amounts are explicit non-negative numbers with up to two decimal places. Product, order, distributor and branch IDs must match real records exactly. Order numbers are trimmed and saved in uppercase.</p>
        <p className="mt-2">{sourceType === 'ORDERS' ? 'Order numbers must be new and unique. Unit Price is required; order totals are calculated from quantity × unit price. Valid statuses: PENDING, DISPATCHED, DELIVERED, FAILED, CANCELLED, RETURNED, EXCHANGED.' : sourceType === 'RETURNS' ? 'Order ID is the existing record ID, not its order number. Customer and platform come from that order. Quantity cannot exceed the unreturned quantity. Resolutions: Exchanged, Returned, Refunded, Pending, Rejected.' : 'Dispatch ID must be a new unique ID. Leave Branch ID blank only for a distributor-level dispatch. A branch must belong to the supplied distributor.'}</p>
        <p className="mt-2">Notes and Remarks may be blank. Payment Terms: COD, Prepaid, Credit 15 days, Credit 30 days, Advance. No invalid or duplicate rows are silently skipped.</p>
      </details>
      {!result && <label className="block space-y-2 rounded-lg border border-dashed p-4 text-sm"><span className="flex items-center gap-2 font-semibold"><UploadCloud className="h-4 w-4" />Choose CSV</span><input type="file" accept=".csv,text/csv" disabled={!!busy || !brandCode} onChange={chooseFile} />{fileName && <span className="block text-slate-600">{fileName}</span>}</label>}
      {busy && <p role="status" className="text-sm text-blue-700">{busy}</p>}
      {!result && !preview && <button type="button" disabled={!csv || !brandCode || !!busy} onClick={() => void request('preview')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Validate and preview</button>}
      {preview && <div className="space-y-3">
        <h3 className="font-semibold">Validated preview ({preview.length} records)</h3>
        <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Reference</th><th className="p-2">Catalog product</th><th className="p-2">Quantity</th><th className="p-2">Amount</th></tr></thead><tbody>{preview.map((row, index) => <tr key={index} className="border-t"><td className="p-2">{row.reference}</td><td className="p-2">{row.product}</td><td className="p-2">{row.quantity}</td><td className="p-2">{row.amount === undefined ? '—' : row.amount.toFixed(2)}</td></tr>)}</tbody></table></div>
        <button type="button" disabled={!!busy} onClick={() => void request('commit')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save {preview.length} validated records</button>
      </div>}
      {result && <button type="button" onClick={reset} className="rounded-lg border px-4 py-2 text-sm font-semibold">Start another import</button>}
      <div className="space-y-2 border-t pt-4">
        <h3 className="font-semibold">Import history</h3>
        <p className="text-xs text-slate-500">Older import receipts do not prove that their records were saved or rolled back.</p>
        {!history.length ? <p className="text-sm text-slate-500">No import batches recorded.</p> : <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">File</th><th className="p-2">Type</th><th className="p-2">Records</th><th className="p-2">Confirmation</th></tr></thead><tbody>{history.map((record) => <tr key={record.id} className="border-t"><td className="p-2">{record.fileName}<span className="block text-xs text-slate-500">{new Date(record.importedAt).toLocaleString()}</span></td><td className="p-2">{record.sourceType}</td><td className="p-2">{record.importedCount}</td><td className="p-2">{record.persistence === 'CONFIRMED' ? 'Server confirmed' : 'Legacy receipt — unverified'}</td></tr>)}</tbody></table></div>}
      </div>
    </section>
  );
}
