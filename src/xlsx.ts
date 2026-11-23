// Minimal Excel (.xlsx) writer and reader with no dependencies.
// Writing: Office Open XML parts packed in an uncompressed ("stored") zip.
// Reading: zip central directory + the browser's DecompressionStream for deflated parts.

export type Cell = string | number | null | undefined;
export interface SheetSpec {
  name: string;
  rows: Cell[][];
  /** Column widths in characters. */
  widths?: number[];
  /** Style the first row as a header and freeze it. */
  header?: boolean;
  /** 1-based row numbers drawn in grey italics (example rows). */
  mutedRows?: number[];
  hidden?: boolean;
  /** Dropdowns: column index (0-based) → absolute range such as "Lists!$A$2:$A$9". */
  lists?: Record<number, string>;
  /** Number of rows the dropdowns apply to, below the header. */
  listRows?: number;
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const escapeXml = (value: string) =>
  value
    // Characters that are illegal in XML 1.0 would corrupt the file.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function columnName(index: number) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function sheetXml(sheet: SheetSpec) {
  const muted = new Set(sheet.mutedRows || []);
  const rows = sheet.rows
    .map((row, r) => {
      const rowNumber = r + 1;
      const style = sheet.header && r === 0 ? 1 : muted.has(rowNumber) ? 2 : 0;
      const cells = row
        .map((value, c) => {
          if (value === null || value === undefined || value === '') return '';
          const ref = `${columnName(c)}${rowNumber}`;
          const s = style ? ` s="${style}"` : '';
          if (typeof value === 'number' && Number.isFinite(value))
            return `<c r="${ref}"${s}><v>${value}</v></c>`;
          return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join('');
  const views = sheet.header
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const lists = Object.entries(sheet.lists || {});
  const last = (sheet.listRows || 500) + 1;
  const validations = lists.length
    ? `<dataValidations count="${lists.length}">${lists
        .map(
          ([col, range]) =>
            `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${columnName(Number(col))}2:${columnName(Number(col))}${last}"><formula1>${escapeXml(range)}</formula1></dataValidation>`,
        )
        .join('')}</dataValidations>`
    : '';
  return (
    XML_HEAD +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `${views}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>${validations}` +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>'
  );
}

const STYLES =
  XML_HEAD +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
  '<font><i/><sz val="11"/><color rgb="FF808080"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF1D6B8F"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

// ---------------------------------------------------------------- zip (store)
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files: [string, string][]) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [path, text] of files) {
    const name = encoder.encode(path);
    const data = encoder.encode(text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x21, true); // 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, 0, true);
    entry.setUint16(14, 0x21, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((n, part) => n + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)] as BlobPart[], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function writeXlsx(sheets: SheetSpec[]) {
  const sheetEntries = sheets
    .map(
      (sheet, i) =>
        `<sheet name="${escapeXml(sheet.name.slice(0, 31))}" sheetId="${i + 1}"${sheet.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`,
    )
    .join('');
  const files: [string, string][] = [
    [
      '[Content_Types].xml',
      XML_HEAD +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '</Types>',
    ],
    [
      '_rels/.rels',
      XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ],
    [
      'xl/workbook.xml',
      XML_HEAD +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheetEntries}</sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    ],
    ['xl/styles.xml', STYLES],
    ...sheets.map(
      (sheet, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet)] as [string, string],
    ),
  ];
  return zipStore(files);
}

/** Starts a browser download for a blob. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------- reading
async function unzip(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  let end = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('not-a-zip');
  const count = view.getUint16(end + 10, true);
  let pointer = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files = new Map<string, () => Promise<string>>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(pointer, true) !== 0x02014b50) throw new Error('bad-zip');
    const method = view.getUint16(pointer + 10, true);
    const size = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, pointer + 46, nameLength));
    const localName = view.getUint16(localOffset + 26, true);
    const localExtra = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localName + localExtra;
    const bytes = new Uint8Array(buffer, start, size);
    files.set(name, async () => {
      if (method === 0) return decoder.decode(bytes);
      if (method !== 8) throw new Error('unsupported-zip');
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(stream).text();
    });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const parseXml = (text: string) => new DOMParser().parseFromString(text, 'application/xml');
const byTag = (node: Document | Element, tag: string) =>
  Array.from(node.getElementsByTagNameNS('*', tag));

function columnIndex(ref: string) {
  const letters = ref.replace(/[0-9]/g, '');
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

/** Reads the first worksheet of an .xlsx file as rows of trimmed strings. */
export async function readXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const files = await unzip(buffer);
  const read = async (path: string) => {
    const file = files.get(path);
    return file ? parseXml(await file()) : null;
  };
  const workbook = await read('xl/workbook.xml');
  const rels = await read('xl/_rels/workbook.xml.rels');
  if (!workbook) throw new Error('not-xlsx');
  const firstSheet = byTag(workbook, 'sheet')[0];
  const relId =
    firstSheet?.getAttribute('r:id') ||
    firstSheet?.getAttributeNS(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'id',
    );
  let target =
    (rels &&
      byTag(rels, 'Relationship')
        .find((r) => r.getAttribute('Id') === relId)
        ?.getAttribute('Target')) ||
    'worksheets/sheet1.xml';
  target = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  const sheet = await read(target);
  if (!sheet) throw new Error('not-xlsx');
  const shared = await read('xl/sharedStrings.xml');
  const strings = shared
    ? byTag(shared, 'si').map((si) =>
        byTag(si, 't')
          .map((t) => t.textContent || '')
          .join(''),
      )
    : [];
  const rows: string[][] = [];
  for (const row of byTag(sheet, 'row')) {
    const r = Number(row.getAttribute('r') || rows.length + 1) - 1;
    const values: string[] = [];
    for (const cell of byTag(row, 'c')) {
      const ref = cell.getAttribute('r');
      const c = ref ? columnIndex(ref) : values.length;
      const type = cell.getAttribute('t');
      const v = byTag(cell, 'v')[0]?.textContent ?? '';
      values[c] = (
        type === 's'
          ? (strings[Number(v)] ?? '')
          : type === 'inlineStr'
            ? byTag(cell, 't')
                .map((t) => t.textContent || '')
                .join('')
            : type === 'b'
              ? v === '1'
                ? 'TRUE'
                : 'FALSE'
              : v
      ).trim();
    }
    rows[r] = Array.from(values, (value) => value ?? '');
  }
  return Array.from(rows, (row) => row ?? []);
}

/** Parses comma- or semicolon-separated text (Excel's "CSV" export in many locales). */
export function readCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] || '';
  const separator =
    (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length
      ? ';'
      : firstLine.includes('\t')
        ? '\t'
        : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell) quoted = true;
    else if (ch === separator) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell.trim()]);
  return rows;
}

/** Reads an uploaded .xlsx or .csv file into rows of strings. */
export async function readSpreadsheet(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  if (isZip) return readXlsx(buffer);
  if (/\.xls$/i.test(file.name)) throw new Error('old-xls');
  return readCsv(new TextDecoder().decode(buffer));
}

/** Converts an Excel serial day number (1900 date system) to YYYY-MM-DD. */
export function excelSerialToDate(serial: number) {
  const ms = Math.round((serial - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}
