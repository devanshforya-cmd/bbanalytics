'use client';

import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from '@/components/common/Toast';
import { buildSheets, exportFileName, datasetByKey, type DatasetKey, type ExportFilters, type ExportSource } from '@/lib/export/datasets';
import { db } from '@/lib/db/db-service';
import { canDownload } from '@/lib/download-access';

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
  // Hidden for roles without "Download data" (Staff & roles).
  if (!canDownload(db.getCurrentUser())) return null;
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
      className={`btn btn-secondary shrink-0 self-start disabled:opacity-60 sm:self-auto ${className}`}>
      {busy ? <span className="bb-spinner" aria-hidden="true" /> : <Download />}
      {busy ? 'Preparing…' : label}
    </button>
  );
}
