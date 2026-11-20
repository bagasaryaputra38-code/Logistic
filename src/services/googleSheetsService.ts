import { SURAT_JALAN_VENDORS, SuratJalanVendor } from '../types/delivery';

export const DEFAULT_SPREADSHEET_ID = '1dbNYotgReV4jljVDkzgQ-udzt0XbxHYCYa49CqpGcD4';
export const DEFAULT_SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${DEFAULT_SPREADSHEET_ID}/edit`;

export class GoogleSheetsAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleSheetsAuthError';
  }
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheets: Array<{ sheetId: number; title: string }>;
}

export interface SuratJalanSheetRowInput {
  no: number;
  tanggal: string;
  noDO: string;
  vendor: string;
  customVendor: string;
  dokumen: string;
}

export interface ParsedSheetSuratJalanRow {
  no: number;
  tanggal: string;
  noDO: string;
  vendor: SuratJalanVendor;
  customVendor: string;
  dokumen: string;
}

export function extractSpreadsheetId(urlOrId: string): string | null {
  const trimmed = (urlOrId || '').trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  if (/^[a-zA-Z0-9-_]{15,}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function formatA1Range(sheetTitle: string, cellRange: string): string {
  const escaped = sheetTitle.replace(/'/g, "''");
  return `'${escaped}'!${cellRange}`;
}

export function normalizeSheetDate(raw: string): string | null {
  const val = (raw || '').trim();
  if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(val)) {
    return val;
  }
  // Handle DD/MM/YYYY or DD-MM-YYYY
  const dmy = val.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const dd = dmy[1].padStart(2, '0');
    const mm = dmy[2].padStart(2, '0');
    const yyyy = dmy[3];
    const candidate = `${yyyy}-${mm}-${dd}`;
    if (/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function parseVendorCell(rawVendor: string): {
  vendor: SuratJalanVendor;
  customVendor: string;
} {
  const clean = (rawVendor || '').trim();
  if (!clean) {
    return { vendor: 'Lainnya', customVendor: '' };
  }
  const exact = (SURAT_JALAN_VENDORS as readonly string[]).find(
    (v) => v.toLowerCase() === clean.toLowerCase()
  );
  if (exact) {
    return { vendor: exact as SuratJalanVendor, customVendor: '' };
  }
  const lainnyaMatch = clean.match(/^Lainnya\s*\((.+)\)$/i);
  if (lainnyaMatch && lainnyaMatch[1]) {
    return { vendor: 'Lainnya', customVendor: lainnyaMatch[1].trim() };
  }
  return { vendor: 'Lainnya', customVendor: clean };
}

function detectNoFirstLayout(headerRow: string[]): boolean {
  const col0 = String(headerRow[0] ?? '').trim().toLowerCase();
  const col1 = String(headerRow[1] ?? '').trim().toLowerCase();
  return (col0 === 'no' || col0.startsWith('no ')) && col1.includes('tanggal');
}

async function parseSheetsApiError(res: Response): Promise<never> {
  let detail = '';
  try {
    const body = (await res.json()) as { error?: { message?: string; status?: string } };
    detail = body?.error?.message || '';
  } catch {
    detail = '';
  }

  if (res.status === 401) {
    throw new GoogleSheetsAuthError(
      'Sesi izin Google Sheets telah berakhir. Silakan hubungkan kembali akun Google Anda.'
    );
  }
  if (res.status === 403) {
    throw new Error(
      `Akses ke Google Spreadsheet ditolak (403). Pastikan akun Google yang terhubung memiliki izin Editor pada spreadsheet tersebut. ${detail ? `(${detail})` : ''}`.trim()
    );
  }
  if (res.status === 404) {
    throw new Error('Spreadsheet tidak ditemukan. Periksa kembali link/ID Google Spreadsheet.');
  }
  throw new Error(detail || `Gagal terhubung ke Google Sheets (HTTP ${res.status}).`);
}

export async function fetchSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string
): Promise<SpreadsheetMetadata> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}?fields=properties.title,sheets.properties(sheetId,title,index)`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    await parseSheetsApiError(res);
  }

  const data = (await res.json()) as {
    properties?: { title?: string };
    sheets?: Array<{ properties?: { sheetId?: number; title?: string; index?: number } }>;
  };

  const sheets = (data.sheets || [])
    .map((s) => ({
      sheetId: Number(s.properties?.sheetId ?? 0),
      title: String(s.properties?.title || 'Sheet1'),
      index: Number(s.properties?.index ?? 0),
    }))
    .sort((a, b) => a.index - b.index)
    .map(({ sheetId, title }) => ({ sheetId, title }));

  if (sheets.length === 0) {
    throw new Error('Spreadsheet tidak memiliki tab/lembar kerja yang dapat dibaca.');
  }

  return {
    spreadsheetId,
    spreadsheetTitle: String(data.properties?.title || 'Spreadsheet Surat Jalan'),
    sheets,
  };
}

export async function fetchSpreadsheetRows(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string
): Promise<ParsedSheetSuratJalanRow[]> {
  const range = encodeURIComponent(formatA1Range(sheetTitle, 'A1:E'));
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${range}?valueRenderOption=FORMATTED_VALUE`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    await parseSheetsApiError(res);
  }

  const data = (await res.json()) as { values?: string[][] };
  const allRows = data.values || [];
  if (allRows.length === 0) return [];

  const detectedHeaderIdx = allRows.slice(0, 10).findIndex((r) => {
    const joined = r.map((c) => String(c ?? '').toLowerCase()).join(' ');
    return (
      joined.includes('delivery order') ||
      joined.includes('nama vendor') ||
      (joined.includes('tanggal') && joined.includes('no'))
    );
  });

  const headerIdx = detectedHeaderIdx >= 0 ? detectedHeaderIdx : -1;
  const header = headerIdx >= 0 ? allRows[headerIdx] || [] : allRows[0] || [];
  const noFirst = headerIdx >= 0 && detectNoFirstLayout(header);
  const startIdx = headerIdx >= 0 ? headerIdx + 1 : 0;

  const parsed: ParsedSheetSuratJalanRow[] = [];
  const perDateCounter = new Map<string, number>();

  for (let i = startIdx; i < allRows.length; i += 1) {
    const r = allRows[i] || [];
    const rawDate = noFirst ? String(r[1] ?? '') : String(r[0] ?? '');
    const rawNo = noFirst ? String(r[0] ?? '') : String(r[1] ?? '');
    const rawDo = String(r[2] ?? '').trim();
    const rawVendor = String(r[3] ?? '').trim();
    const rawDokumen = String(r[4] ?? '').trim() || 'TERKIRIM';

    const tanggal = normalizeSheetDate(rawDate);
    if (!tanggal || !rawDo) continue;

    const currentMax = perDateCounter.get(tanggal) ?? 0;
    const parsedNo = Number.parseInt(rawNo, 10);
    const no = Number.isFinite(parsedNo) && parsedNo >= 1 ? parsedNo : currentMax + 1;
    perDateCounter.set(tanggal, Math.max(currentMax, no));

    const { vendor, customVendor } = parseVendorCell(rawVendor);
    parsed.push({
      no,
      tanggal,
      noDO: rawDo,
      vendor,
      customVendor,
      dokumen: rawDokumen,
    });
  }

  return parsed;
}

export async function syncSuratJalanToGoogleSheet(params: {
  accessToken: string;
  spreadsheetId: string;
  sheetTitle: string;
  entry: SuratJalanSheetRowInput;
  previousMatch?: { tanggal: string; noDO: string } | null;
}): Promise<{ action: 'appended' | 'updated'; rowNumber: number }> {
  const { accessToken, spreadsheetId, sheetTitle, entry, previousMatch } = params;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  // 1. Read columns A:E from top to bottom so we know header layout and exact unfilled rows
  const allRange = encodeURIComponent(formatA1Range(sheetTitle, 'A1:E'));
  const allRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${allRange}?valueRenderOption=FORMATTED_VALUE`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!allRes.ok) {
    await parseSheetsApiError(allRes);
  }
  const allData = (await allRes.json()) as { values?: string[][] };
  const allRows = allData.values || [];

  const detectedHeaderIdx = allRows.slice(0, 10).findIndex((r) => {
    const joined = r.map((c) => String(c ?? '').toLowerCase()).join(' ');
    return (
      joined.includes('delivery order') ||
      joined.includes('nama vendor') ||
      (joined.includes('tanggal') && joined.includes('no'))
    );
  });

  const hasAnyNonEmptyCell = allRows.some((r) =>
    r.some((c) => Boolean(String(c ?? '').trim()))
  );

  let headerIdx = detectedHeaderIdx;
  if (!hasAnyNonEmptyCell) {
    const headerRange = encodeURIComponent(formatA1Range(sheetTitle, 'A1:E1'));
    const putHeaderRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${headerRange}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          values: [['Tanggal', 'No', 'No Delivery Order', 'Nama Vendor', 'Dokumen']],
        }),
      }
    );
    if (!putHeaderRes.ok) {
      await parseSheetsApiError(putHeaderRes);
    }
    headerIdx = 0;
  } else if (headerIdx < 0) {
    headerIdx = 0;
  }

  const headerRow = allRows[headerIdx] || [];
  const noFirst = hasAnyNonEmptyCell && detectNoFirstLayout(headerRow);
  const dataStartIdx = headerIdx + 1;

  const vendorDisplay =
    entry.vendor === 'Lainnya' && entry.customVendor
      ? `${entry.vendor} (${entry.customVendor})`
      : entry.vendor;
  const dokumenVal = (entry.dokumen || 'TERKIRIM').trim() || 'TERKIRIM';

  const rowValues = noFirst
    ? [entry.no, entry.tanggal, entry.noDO, vendorDisplay, dokumenVal]
    : [entry.tanggal, entry.no, entry.noDO, vendorDisplay, dokumenVal];

  // 2. If editing an existing entry, update the matching row in place
  if (previousMatch) {
    let matchedRowIdx = -1;
    for (let i = allRows.length - 1; i >= dataStartIdx; i -= 1) {
      const r = allRows[i] || [];
      const matchesTanggalFirst =
        normalizeSheetDate(String(r[0] ?? '')) === previousMatch.tanggal &&
        String(r[2] ?? '').trim() === previousMatch.noDO;
      const matchesNoFirst =
        normalizeSheetDate(String(r[1] ?? '')) === previousMatch.tanggal &&
        String(r[2] ?? '').trim() === previousMatch.noDO;
      const matchesLegacy =
        normalizeSheetDate(String(r[0] ?? '')) === previousMatch.tanggal &&
        String(r[1] ?? '').trim() === previousMatch.noDO;
      if (matchesTanggalFirst || matchesNoFirst || matchesLegacy) {
        matchedRowIdx = i;
        break;
      }
    }

    if (matchedRowIdx >= 0) {
      const targetRowNumber = matchedRowIdx + 1;
      const updateRange = encodeURIComponent(
        formatA1Range(sheetTitle, `A${targetRowNumber}:E${targetRowNumber}`)
      );
      const updateRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}/values/${updateRange}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ values: [rowValues] }),
        }
      );
      if (!updateRes.ok) {
        await parseSheetsApiError(updateRes);
      }
      return { action: 'updated', rowNumber: targetRowNumber };
    }
  }

  // 3. Find the first unfilled row from top to bottom (columns A:E)
  let targetRowIdx = -1;
  for (let i = dataStartIdx; i < allRows.length; i += 1) {
    const r = allRows[i] || [];
    const noDoEmpty = !String(r[2] ?? '').trim();
    const vendorEmpty = !String(r[3] ?? '').trim();
    const allCellsEmpty = [0, 1, 2, 3, 4].every((colIdx) => !String(r[colIdx] ?? '').trim());
    if (allCellsEmpty || (noDoEmpty && vendorEmpty)) {
      targetRowIdx = i;
      break;
    }
  }

  if (targetRowIdx < 0) {
    targetRowIdx = Math.max(allRows.length, dataStartIdx);
  }

  const targetRowNumber = targetRowIdx + 1;
  const targetRange = encodeURIComponent(
    formatA1Range(sheetTitle, `A${targetRowNumber}:E${targetRowNumber}`)
  );
  const putRowRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${targetRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({ values: [rowValues] }),
    }
  );
  if (!putRowRes.ok) {
    await parseSheetsApiError(putRowRes);
  }

  return { action: 'appended', rowNumber: targetRowNumber };
}

export async function syncSuratJalanBatchToGoogleSheet(params: {
  accessToken: string;
  spreadsheetId: string;
  sheetTitle: string;
  entries: SuratJalanSheetRowInput[];
}): Promise<{ count: number; firstRowNumber: number; lastRowNumber: number; rowNumbers: number[] }> {
  const { accessToken, spreadsheetId, sheetTitle, entries } = params;
  if (entries.length === 0) {
    return { count: 0, firstRowNumber: 0, lastRowNumber: 0, rowNumbers: [] };
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  // 1. Read columns A:E once from top to bottom
  const allRange = encodeURIComponent(formatA1Range(sheetTitle, 'A1:E'));
  const allRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${allRange}?valueRenderOption=FORMATTED_VALUE`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!allRes.ok) {
    await parseSheetsApiError(allRes);
  }
  const allData = (await allRes.json()) as { values?: string[][] };
  const allRows = allData.values || [];

  const detectedHeaderIdx = allRows.slice(0, 10).findIndex((r) => {
    const joined = r.map((c) => String(c ?? '').toLowerCase()).join(' ');
    return (
      joined.includes('delivery order') ||
      joined.includes('nama vendor') ||
      (joined.includes('tanggal') && joined.includes('no'))
    );
  });

  const hasAnyNonEmptyCell = allRows.some((r) =>
    r.some((c) => Boolean(String(c ?? '').trim()))
  );

  const batchData: Array<{ range: string; values: (string | number)[][] }> = [];
  let headerIdx = detectedHeaderIdx;

  if (!hasAnyNonEmptyCell) {
    batchData.push({
      range: formatA1Range(sheetTitle, 'A1:E1'),
      values: [['Tanggal', 'No', 'No Delivery Order', 'Nama Vendor', 'Dokumen']],
    });
    headerIdx = 0;
  } else if (headerIdx < 0) {
    headerIdx = 0;
  }

  const headerRow = allRows[headerIdx] || [];
  const noFirst = hasAnyNonEmptyCell && detectNoFirstLayout(headerRow);
  const dataStartIdx = headerIdx + 1;

  // 2. Collect all unfilled row indices from top to bottom within A:E
  const targetRowIndices: number[] = [];
  for (let i = dataStartIdx; i < allRows.length && targetRowIndices.length < entries.length; i += 1) {
    const r = allRows[i] || [];
    const noDoEmpty = !String(r[2] ?? '').trim();
    const vendorEmpty = !String(r[3] ?? '').trim();
    const allCellsEmpty = [0, 1, 2, 3, 4].every((colIdx) => !String(r[colIdx] ?? '').trim());
    if (allCellsEmpty || (noDoEmpty && vendorEmpty)) {
      targetRowIndices.push(i);
    }
  }

  let tailIdx = Math.max(allRows.length, dataStartIdx);
  while (targetRowIndices.length < entries.length) {
    targetRowIndices.push(tailIdx);
    tailIdx += 1;
  }

  // 3. Map each draft entry to its target row and group contiguous rows for compact batchUpdate
  const rowNumbers = targetRowIndices.map((idx) => idx + 1);
  const formattedRows = entries.map((entry) => {
    const vendorDisplay =
      entry.vendor === 'Lainnya' && entry.customVendor
        ? `${entry.vendor} (${entry.customVendor})`
        : entry.vendor;
    const dokumenVal = (entry.dokumen || 'TERKIRIM').trim() || 'TERKIRIM';
    return noFirst
      ? [entry.no, entry.tanggal, entry.noDO, vendorDisplay, dokumenVal]
      : [entry.tanggal, entry.no, entry.noDO, vendorDisplay, dokumenVal];
  });

  let runStart = 0;
  while (runStart < rowNumbers.length) {
    let runEnd = runStart;
    while (
      runEnd + 1 < rowNumbers.length &&
      rowNumbers[runEnd + 1] === rowNumbers[runEnd] + 1
    ) {
      runEnd += 1;
    }
    const startRowNum = rowNumbers[runStart];
    const endRowNum = rowNumbers[runEnd];
    batchData.push({
      range: formatA1Range(sheetTitle, `A${startRowNum}:E${endRowNum}`),
      values: formattedRows.slice(runStart, runEnd + 1),
    });
    runStart = runEnd + 1;
  }

  const batchRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: batchData,
      }),
    }
  );
  if (!batchRes.ok) {
    await parseSheetsApiError(batchRes);
  }

  return {
    count: entries.length,
    firstRowNumber: rowNumbers[0],
    lastRowNumber: rowNumbers[rowNumbers.length - 1],
    rowNumbers,
  };
}
