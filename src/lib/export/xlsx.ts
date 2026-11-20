/**
 * A small, dependency-light .xlsx writer (Office Open XML zipped with fflate).
 * Real Excel files: multiple sheets, bold frozen header row, filters, column widths, numbers kept as
 * numbers (so totals and pivots work) and money/quantity number formats. Runs in the browser and on
 * the server.
 */
import { strToU8, zipSync } from 'fflate';

/** 'link' cells holding a web address become a clickable "Open" link. */
export type ColumnType = 'text' | 'number' | 'money' | 'percent' | 'link';
export interface Column { header: string; type?: ColumnType; width?: number }
export interface Sheet { name: string; columns: Column[]; rows: (string | number | null | undefined | boolean)[][] }

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Characters Excel refuses inside XML.
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');

function colName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** Excel sheet names: 31 characters, no []:*?/\ and unique within the workbook. */
export function safeSheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const base = (raw.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Sheet').slice(0, 31);
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i += 1) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
    used.add(name.toLowerCase());
    return name;
  });
}

// Style ids in styles.xml: 0 default, 1 header, 2 integer, 3 money (2 dp, thousands), 4 percent, 5 wrapped text, 6 link.
const STYLE: Record<ColumnType, number> = { text: 0, number: 2, money: 3, percent: 4, link: 6 };
const LINK_LABEL = 'Open';
const isWebLink = (value: string) => /^https?:\/\/[^\s"]{1,240}$/.test(value);

function sheetXml(sheet: Sheet): string {
  const widths = sheet.columns.map((column, i) => {
    if (column.width) return column.width;
    if (column.type === 'link') return Math.max(8, column.header.length + 2);
    const longest = Math.max(column.header.length, ...sheet.rows.slice(0, 200).map((row) => String(row[i] ?? '').length));
    return Math.min(60, Math.max(8, longest + 2));
  });
  const rows: string[] = [];
  const header = sheet.columns.map((column, i) => `<c r="${colName(i)}1" t="inlineStr" s="1"><is><t>${esc(column.header)}</t></is></c>`).join('');
  rows.push(`<row r="1">${header}</row>`);
  sheet.rows.forEach((row, r) => {
    const cells = sheet.columns.map((column, i) => {
      const value = row[i];
      const ref = `${colName(i)}${r + 2}`;
      if (value === null || value === undefined || value === '') return '';
      if (typeof value === 'number' && Number.isFinite(value) && column.type && column.type !== 'text') return `<c r="${ref}" s="${STYLE[column.type]}"><v>${value}</v></c>`;
      if (column.type === 'link' && typeof value === 'string' && isWebLink(value)) {
        return `<c r="${ref}" s="6" t="str"><f>${esc(`HYPERLINK("${value}","${LINK_LABEL}")`)}</f><v>${LINK_LABEL}</v></c>`;
      }
      if (typeof value === 'boolean') return `<c r="${ref}" t="inlineStr"><is><t>${value ? 'Yes' : 'No'}</t></is></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`;
    }).join('');
    rows.push(`<row r="${r + 2}">${cells}</row>`);
  });
  const lastCol = colName(Math.max(0, sheet.columns.length - 1));
  const cols = widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols><sheetData>${rows.join('')}</sheetData>${sheet.rows.length ? `<autoFilter ref="A1:${lastCol}${sheet.rows.length + 1}"/>` : ''}</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><u/><sz val="11"/><color rgb="FF1D4ED8"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function filterNames(names: string[], sheets: Sheet[]): string {
  const entries = names.map((name, i) => sheets[i].rows.length
    ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(name.replace(/'/g, "''"))}'!$A$1:$${colName(Math.max(0, sheets[i].columns.length - 1))}$${sheets[i].rows.length + 1}</definedName>`
    : '').join('');
  return entries ? `<definedNames>${entries}</definedNames>` : '';
}

export function buildWorkbook(input: Sheet[], meta: { title?: string; author?: string } = {}): Uint8Array {
  const sheets = input.length ? input : [{ name: 'Empty', columns: [{ header: 'No data' }], rows: [] }];
  const names = safeSheetNames(sheets.map((sheet) => sheet.name));
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(meta.title || 'Brand Bucket export')}</dc:title><dc:creator>${esc(meta.author || 'Brand Bucket')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${filterNames(names, sheets)}</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(STYLES),
  };
  sheets.forEach((sheet, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sheet)); });
  return zipSync(files, { level: 6 });
}

/** Save a workbook from the browser. */
export function downloadWorkbook(sheets: Sheet[], fileName: string, meta?: { title?: string; author?: string }) {
  const bytes = buildWorkbook(sheets, meta);
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
