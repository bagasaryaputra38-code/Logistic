import * as XLSX from 'xlsx';

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function getLocalDateStamp(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getCsvDayName(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '-';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return HARI_ID[dt.getDay()] ?? '-';
}

export function formatCsvDateIndonesian(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const tgl = dt.getDate();
  const bulan = BULAN_ID[dt.getMonth()] ?? '';
  const tahun = dt.getFullYear();
  return `${tgl} ${bulan} ${tahun}`;
}

export function formatCsvDecimal(val: number): string {
  if (!Number.isFinite(val)) return '0';
  const rounded = Math.round(val * 100) / 100;
  return String(rounded);
}

export function sanitizeCsvTextCell(
  raw: string | number | null | undefined,
  delimiter = ','
): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? String(raw) : '';
  }

  // Collapse line breaks and tabs so multi-line inputs never split or corrupt CSV rows
  let normalized = raw
    .replace(/\r\n|\r|\n|\t/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!normalized) return '';

  // Guard against spreadsheet formula injection while preserving plain '-' dashes
  if (/^[=+@]/.test(normalized) || /^-\S/.test(normalized)) {
    normalized = `'${normalized}`;
  }

  const mustQuote =
    normalized.includes(delimiter) ||
    normalized.includes('"') ||
    normalized.includes('\n');

  if (mustQuote) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

export function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  delimiter = ','
): void {
  const headerLine = headers
    .map((h) => sanitizeCsvTextCell(h, delimiter))
    .join(delimiter);

  const dataLines = rows.map((row) =>
    row.map((cell) => sanitizeCsvTextCell(cell, delimiter)).join(delimiter)
  );

  // Standard RFC 4180 comma-delimited CSV with CRLF + UTF-8 BOM
  const csvContent = [headerLine, ...dataLines].join('\r\n');
  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface XlsxSheetConfig {
  sheetName: string;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
  textColumnIndices?: number[];
}

function normalizeSpreadsheetCell(
  raw: string | number | null | undefined
): string | number {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : 0;
  }
  const normalized = raw
    .replace(/\r\n|\r|\n|\t/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!normalized) return '';
  if (/^[=+@]/.test(normalized) || /^-\S/.test(normalized)) {
    return `'${normalized}`;
  }
  return normalized;
}

export function downloadXlsxFile(
  filename: string,
  sheets: XlsxSheetConfig[]
): void {
  const workbook = XLSX.utils.book_new();

  sheets.forEach((sheetCfg) => {
    const cleanRows = sheetCfg.rows.map((row) =>
      row.map((cell) => normalizeSpreadsheetCell(cell))
    );
    const aoa = [sheetCfg.headers, ...cleanRows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    const textColSet = new Set(sheetCfg.textColumnIndices ?? []);

    // Force string type on ID / plate / DO / date / time columns so Excel never reformats them
    for (let r = 1; r <= cleanRows.length; r += 1) {
      textColSet.forEach((c) => {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell) {
          cell.t = 's';
          cell.v = String(cell.v ?? '');
          cell.z = '@';
        }
      });
    }

    // Auto-calculate clean column widths so no values truncate or show ####
    ws['!cols'] = sheetCfg.headers.map((header, colIdx) => {
      let maxLen = header.length;
      cleanRows.forEach((row) => {
        const val = row[colIdx];
        const len = val !== undefined && val !== null ? String(val).length : 0;
        if (len > maxLen) maxLen = len;
      });
      return { wch: Math.min(Math.max(maxLen + 4, 10), 46) };
    });

    if (sheetCfg.headers.length > 0 && cleanRows.length > 0) {
      const lastCol = XLSX.utils.encode_col(sheetCfg.headers.length - 1);
      ws['!autofilter'] = { ref: `A1:${lastCol}${cleanRows.length + 1}` };
    }

    const safeName = sheetCfg.sheetName.slice(0, 31) || 'Data';
    XLSX.utils.book_append_sheet(workbook, ws, safeName);
  });

  XLSX.writeFile(workbook, filename);
}
