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
