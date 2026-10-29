/**
 * CSV Generation and Download Utility
 */

export interface CSVColumn<T = any> {
  key: keyof T | string;
  label: string;
  formatter?: (value: unknown, row: T) => string | number | null | undefined;
}

export function generateCSV<T = any>(
  columns: CSVColumn<T>[],
  data: T[]
): string {
  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const headerRow = columns.map((col) => escapeCell(col.label)).join(',');

  const rows = data.map((row) => {
    return columns
      .map((col) => {
        const rawValue = (row as Record<string, unknown>)[col.key as string];
        const formatted = col.formatter ? col.formatter(rawValue, row) : rawValue;
        return escapeCell(formatted);
      })
      .join(',');
  });

  return [headerRow, ...rows].join('\r\n');
}

export function downloadCSV(csvContent: string, filename: string): void {
  if (typeof window === 'undefined') return;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', safeFilename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Robust RFC-compliant CSV & TSV parser
 * Handles quoted cells, escaped quotes, newlines inside cells, and comma/tab separation.
 */
export function parseCSV(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  if (!csvText || !csvText.trim()) {
    return { headers: [], rows: [] };
  }

  const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const delimiter = !text.includes(',') && text.includes('\t') ? '\t' : ',';

  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (char === '\n' && !insideQuotes) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c !== '')) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c !== '')) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = lines[0];
  const headers = rawHeaders.map((h) => h.replace(/^["']|["']$/g, '').trim());
  const rows: Record<string, string>[] = [];

  for (let r = 1; r < lines.length; r++) {
    const line = lines[r];
    const rowObj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const headerName = headers[c];
      rowObj[headerName] = line[c] !== undefined ? line[c].trim() : '';
    }
    rows.push(rowObj);
  }

  return { headers, rows };
}
