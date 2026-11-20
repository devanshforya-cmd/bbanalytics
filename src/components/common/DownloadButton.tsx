'use client';

import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from '@/components/common/Toast';
import { buildSheets, exportFileName, datasetByKey, type DatasetKey, type ExportFilters, type ExportSource } from '@/lib/export/datasets';

/**
 * "Download Excel" for a list page. Pass the records the page is showing (after its own filters)
 * as `records`, so the file matches the screen; anything not passed comes from the full data.
 */
export default function DownloadButton({ datasets, records, filters = {}, fileLabel, label = 'Download Excel', className = '' }: {
  datasets: DatasetKey[];
  records?: Partial<ExportSource>;
  filters?: ExportFilters;
  fileLabel?: string;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      // Loaded on click so list pages don't carry the workbook code.
      const [{ clientExportSource }, { downloadWorkbook }] = await Promise.all([import('@/lib/export/client-source'), import('@/lib/export/xlsx')]);
      const source = { ...clientExportSource(), ...records } as ExportSource;
      const sheets = buildSheets(source, datasets, filters, { skipEmpty: datasets.length > 1 });
      const rows = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
      if (!rows) { toast.error('Nothing to download with the current filters.'); return; }
      const name = exportFileName(fileLabel || datasetByKey(datasets[0]).label.split(' (')[0], filters, source);
      downloadWorkbook(sheets, name, { title: name.replace(/_/g, ' ') });
      toast.success(`Downloaded ${rows.toLocaleString()} ${rows === 1 ? 'row' : 'rows'}.`);
    } catch (error) {
      toast.error(error instanceof Error ? `Download failed: ${error.message}` : 'Download failed.');
    } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={download} disabled={busy}
      className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-60 sm:ml-auto sm:self-auto ${className}`}>
      <Download className={`h-3.5 w-3.5 text-emerald-600 ${busy ? 'animate-pulse' : ''}`} />
      {busy ? 'Preparing…' : label}
    </button>
  );
}
