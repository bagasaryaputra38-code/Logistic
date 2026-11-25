import {
  DeliveryFormState,
  DeliveryReport,
  MONTHLY_TARGET_TON,
  SEGMENTS,
  SegmentKey,
} from '../types/delivery';
import {
  downloadCsvFile,
  downloadXlsxFile,
  formatCsvDecimal,
  getCsvDayName,
  getLocalDateStamp,
} from './csvExport';

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

const BULAN_MAP: Record<string, string> = {
  januari: '01',
  jan: '01',
  februari: '02',
  feb: '02',
  maret: '03',
  mar: '03',
  april: '04',
  apr: '04',
  mei: '05',
  may: '05',
  juni: '06',
  jun: '06',
  juli: '07',
  jul: '07',
  agustus: '08',
  agu: '08',
  aug: '08',
  september: '09',
  sep: '09',
  oktober: '10',
  okt: '10',
  oct: '10',
  november: '11',
  nov: '11',
  desember: '12',
  des: '12',
  dec: '12',
};

export function parseDateParts(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatIndonesianDate(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const dt = parseDateParts(dateStr);
  const hari = HARI_ID[dt.getDay()];
  const tgl = dt.getDate();
  const bulan = BULAN_ID[dt.getMonth()];
  const tahun = dt.getFullYear();
  return `${hari}, ${tgl} ${bulan} ${tahun}`;
}

export function formatIndonesianShortDate(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const dt = parseDateParts(dateStr);
  const tgl = dt.getDate();
  const bulan = BULAN_ID[dt.getMonth()]?.slice(0, 3) ?? '';
  const tahun = dt.getFullYear();
  return `${tgl} ${bulan} ${tahun}`;
}

export function formatIndonesianMonth(monthKey: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  const [year, month] = monthKey.split('-').map(Number);
  return `${BULAN_ID[(month || 1) - 1]} ${year}`;
}

export function formatNumber(val: number): string {
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 2,
  }).format(val);
}

export function roundTon(val: number): number {
  if (!Number.isFinite(val) || val < 0) return 0;
  return Math.round(val * 100) / 100;
}

export function computeSegmentDailyTotals(r: Pick<
  DeliveryFormState,
  | 'jktProjectForming'
  | 'jktIndustri'
  | 'jktIsbsRitel'
  | 'jktOthers'
  | 'smgProjectForming'
  | 'smgIndustri'
  | 'smgIsbsRitel'
  | 'smgOthers'
>) {
  const jkt = roundTon(
    r.jktProjectForming + r.jktIndustri + r.jktIsbsRitel + r.jktOthers
  );
  const smg = roundTon(
    r.smgProjectForming + r.smgIndustri + r.smgIsbsRitel + r.smgOthers
  );
  const combined = roundTon(jkt + smg);
  return { jkt, smg, combined };
}

export function computeDailyTotals(r: Pick<
  DeliveryFormState,
  | 'dailyJktTotal'
  | 'dailySmgTotal'
  | 'jktProjectForming'
  | 'jktIndustri'
  | 'jktIsbsRitel'
  | 'jktOthers'
  | 'smgProjectForming'
  | 'smgIndustri'
  | 'smgIsbsRitel'
  | 'smgOthers'
>) {
  const seg = computeSegmentDailyTotals(r);
  const jkt = r.dailyJktTotal !== undefined ? roundTon(r.dailyJktTotal) : seg.jkt;
  const smg = r.dailySmgTotal !== undefined ? roundTon(r.dailySmgTotal) : seg.smg;
  const combined = roundTon(jkt + smg);
  return { jkt, smg, combined };
}

export interface SegmentRowSummary {
  key: SegmentKey;
  label: string;
  dailyJkt: number;
  dailySmg: number;
  dailyCombined: number;
  mtdJkt: number;
  mtdSmg: number;
  mtdCombined: number;
  dailySharePct: number;
  mtdSharePct: number;
}

export function computeSegmentRows(r: DeliveryFormState | DeliveryReport): SegmentRowSummary[] {
  const dailyTotals = computeDailyTotals(r);
  const mtdCombinedTotal = roundTon(
    r.mtdCombinedTotal !== undefined
      ? r.mtdCombinedTotal
      : r.mtdJktTotal + r.mtdSmgTotal
  );

  const map: Record<
    SegmentKey,
    { dailyJkt: number; dailySmg: number; mtdJkt: number; mtdSmg: number }
  > = {
    projectForming: {
      dailyJkt: r.jktProjectForming,
      dailySmg: r.smgProjectForming,
      mtdJkt: r.mtdJktProjectForming,
      mtdSmg: r.mtdSmgProjectForming,
    },
    industri: {
      dailyJkt: r.jktIndustri,
      dailySmg: r.smgIndustri,
      mtdJkt: r.mtdJktIndustri,
      mtdSmg: r.mtdSmgIndustri,
    },
    isbsRitel: {
      dailyJkt: r.jktIsbsRitel,
      dailySmg: r.smgIsbsRitel,
      mtdJkt: r.mtdJktIsbsRitel,
      mtdSmg: r.mtdSmgIsbsRitel,
    },
    others: {
      dailyJkt: r.jktOthers,
      dailySmg: r.smgOthers,
      mtdJkt: r.mtdJktOthers,
      mtdSmg: r.mtdSmgOthers,
    },
  };

  return SEGMENTS.map((seg) => {
    const vals = map[seg.key];
    const dailyCombined = roundTon(vals.dailyJkt + vals.dailySmg);
    const mtdCombined = roundTon(vals.mtdJkt + vals.mtdSmg);
    return {
      key: seg.key,
      label: seg.label,
      dailyJkt: vals.dailyJkt,
      dailySmg: vals.dailySmg,
      dailyCombined,
      mtdJkt: vals.mtdJkt,
      mtdSmg: vals.mtdSmg,
      mtdCombined,
      dailySharePct:
        dailyTotals.combined > 0 ? (dailyCombined / dailyTotals.combined) * 100 : 0,
      mtdSharePct:
        mtdCombinedTotal > 0 ? (mtdCombined / mtdCombinedTotal) * 100 : 0,
    };
  });
}

export function computeAutoMtdFromPrevious(
  daily: Pick<
    DeliveryFormState,
    | 'jktProjectForming'
    | 'jktIndustri'
    | 'jktIsbsRitel'
    | 'jktOthers'
    | 'smgProjectForming'
    | 'smgIndustri'
    | 'smgIsbsRitel'
    | 'smgOthers'
  >,
  previousReport?: DeliveryReport | null
) {
  const prev = previousReport ?? {
    mtdJktProjectForming: 0,
    mtdJktIndustri: 0,
    mtdJktIsbsRitel: 0,
    mtdJktOthers: 0,
    mtdSmgProjectForming: 0,
    mtdSmgIndustri: 0,
    mtdSmgIsbsRitel: 0,
    mtdSmgOthers: 0,
  };

  const dailySeg = computeSegmentDailyTotals(daily);

  const mtdJktProjectForming = roundTon(prev.mtdJktProjectForming + daily.jktProjectForming);
  const mtdJktIndustri = roundTon(prev.mtdJktIndustri + daily.jktIndustri);
  const mtdJktIsbsRitel = roundTon(prev.mtdJktIsbsRitel + daily.jktIsbsRitel);
  const mtdJktOthers = roundTon(prev.mtdJktOthers + daily.jktOthers);

  const mtdSmgProjectForming = roundTon(prev.mtdSmgProjectForming + daily.smgProjectForming);
  const mtdSmgIndustri = roundTon(prev.mtdSmgIndustri + daily.smgIndustri);
  const mtdSmgIsbsRitel = roundTon(prev.mtdSmgIsbsRitel + daily.smgIsbsRitel);
  const mtdSmgOthers = roundTon(prev.mtdSmgOthers + daily.smgOthers);

  const mtdJktTotal = previousReport
    ? roundTon(previousReport.mtdJktTotal + dailySeg.jkt)
    : roundTon(mtdJktProjectForming + mtdJktIndustri + mtdJktIsbsRitel + mtdJktOthers);
  const mtdSmgTotal = previousReport
    ? roundTon(previousReport.mtdSmgTotal + dailySeg.smg)
    : roundTon(mtdSmgProjectForming + mtdSmgIndustri + mtdSmgIsbsRitel + mtdSmgOthers);
  const mtdCombinedTotal = roundTon(mtdJktTotal + mtdSmgTotal);

  return {
    dailyJktTotal: dailySeg.jkt,
    dailySmgTotal: dailySeg.smg,
    mtdJktProjectForming,
    mtdJktIndustri,
    mtdJktIsbsRitel,
    mtdJktOthers,
    mtdSmgProjectForming,
    mtdSmgIndustri,
    mtdSmgIsbsRitel,
    mtdSmgOthers,
    mtdJktTotal,
    mtdSmgTotal,
    mtdCombinedTotal,
  };
}

export function getMtdVariance(r: DeliveryFormState | DeliveryReport) {
  const jktSegmentSum = roundTon(
    r.mtdJktProjectForming + r.mtdJktIndustri + r.mtdJktIsbsRitel + r.mtdJktOthers
  );
  const smgSegmentSum = roundTon(
    r.mtdSmgProjectForming + r.mtdSmgIndustri + r.mtdSmgIsbsRitel + r.mtdSmgOthers
  );
  const dailySeg = computeSegmentDailyTotals(r);
  const daily = computeDailyTotals(r);

  const jktDiff = Math.round((r.mtdJktTotal - jktSegmentSum) * 100) / 100;
  const smgDiff = Math.round((r.mtdSmgTotal - smgSegmentSum) * 100) / 100;
  const dailyJktDiff = Math.round((daily.jkt - dailySeg.jkt) * 100) / 100;
  const dailySmgDiff = Math.round((daily.smg - dailySeg.smg) * 100) / 100;

  return {
    jktSegmentSum,
    smgSegmentSum,
    jktDiff,
    smgDiff,
    dailyJktDiff,
    dailySmgDiff,
    hasVariance:
      Math.abs(jktDiff) > 0.01 ||
      Math.abs(smgDiff) > 0.01 ||
      Math.abs(dailyJktDiff) > 0.01 ||
      Math.abs(dailySmgDiff) > 0.01,
  };
}

export function findPreviousMonthReport(
  reports: DeliveryReport[],
  targetDate: string
): DeliveryReport | null {
  const monthKey = targetDate.slice(0, 7);
  const candidates = reports
    .filter((r) => r.monthKey === monthKey && r.date < targetDate)
    .sort((a, b) => b.date.localeCompare(a.date));
  return candidates[0] ?? null;
}

export function getDaysInMonth(monthKey: string): number {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return 30;
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

export interface MonthlyTargetPoint {
  date: string;
  day: number;
  dailyTon: number;
  dailyJkt: number;
  dailySmg: number;
  mtdTon: number;
  idealMtdTon: number;
  paceDiffTon: number;
  achievementPct: number;
}

export interface MonthlyTargetSummary {
  monthKey: string;
  targetTon: number;
  daysInMonth: number;
  idealDailyTon: number;
  actualMtdTon: number;
  achievementPct: number;
  remainingTon: number;
  surplusTon: number;
  isTargetReached: boolean;
  latestDay: number;
  latestDate: string | null;
  remainingDays: number;
  requiredDailyAvgTon: number;
  idealMtdAtLatestDay: number;
  paceVarianceTon: number;
  points: MonthlyTargetPoint[];
}

export function computeMonthlyTargetProgress(
  reports: DeliveryReport[],
  monthKey: string,
  upToDate?: string,
  targetTon: number = MONTHLY_TARGET_TON
): MonthlyTargetSummary {
  const daysInMonth = getDaysInMonth(monthKey);
  const idealDailyTon = roundTon(targetTon / daysInMonth);

  const monthReports = [...reports]
    .filter((r) => r.monthKey === monthKey && (!upToDate || r.date <= upToDate))
    .sort((a, b) => a.date.localeCompare(b.date));

  const points: MonthlyTargetPoint[] = monthReports.map((r) => {
    const day = Number(r.date.slice(8, 10)) || 1;
    const daily = computeDailyTotals(r);
    const mtdTon = roundTon(
      r.mtdCombinedTotal !== undefined
        ? r.mtdCombinedTotal
        : r.mtdJktTotal + r.mtdSmgTotal
    );
    const idealMtdTon = roundTon((targetTon / daysInMonth) * day);
    const paceDiffTon = Math.round((mtdTon - idealMtdTon) * 100) / 100;
    const achievementPct = targetTon > 0 ? (mtdTon / targetTon) * 100 : 0;

    return {
      date: r.date,
      day,
      dailyTon: daily.combined,
      dailyJkt: daily.jkt,
      dailySmg: daily.smg,
      mtdTon,
      idealMtdTon,
      paceDiffTon,
      achievementPct,
    };
  });

  const latestPoint = points.length > 0 ? points[points.length - 1] : null;
  const actualMtdTon = latestPoint ? latestPoint.mtdTon : 0;
  const achievementPct = targetTon > 0 ? (actualMtdTon / targetTon) * 100 : 0;
  const remainingTon = roundTon(Math.max(targetTon - actualMtdTon, 0));
  const surplusTon = roundTon(Math.max(actualMtdTon - targetTon, 0));
  const isTargetReached = actualMtdTon >= targetTon;
  const latestDay = latestPoint ? latestPoint.day : 0;
  const remainingDays = Math.max(daysInMonth - latestDay, 0);
  const requiredDailyAvgTon =
    remainingTon > 0
      ? roundTon(remainingDays > 0 ? remainingTon / remainingDays : remainingTon)
      : 0;
  const idealMtdAtLatestDay = latestPoint ? latestPoint.idealMtdTon : 0;
  const paceVarianceTon =
    Math.round((actualMtdTon - idealMtdAtLatestDay) * 100) / 100;

  return {
    monthKey,
    targetTon,
    daysInMonth,
    idealDailyTon,
    actualMtdTon,
    achievementPct,
    remainingTon,
    surplusTon,
    isTargetReached,
    latestDay,
    latestDate: latestPoint ? latestPoint.date : null,
    remainingDays,
    requiredDailyAvgTon,
    idealMtdAtLatestDay,
    paceVarianceTon,
    points,
  };
}

function fmtWaNum(val: number, dashForZero = false): string {
  if (dashForZero && val === 0) return '-';
  return Number.isInteger(val) ? String(val) : String(roundTon(val));
}

export function generateWhatsAppReport(
  r: DeliveryFormState | DeliveryReport,
  options?: { useDashForZero?: boolean }
): string {
  const daily = computeDailyTotals(r);
  const dash = options?.useDashForZero ?? false;
  const totalCombinedMtd = roundTon(
    r.mtdCombinedTotal !== undefined
      ? r.mtdCombinedTotal
      : r.mtdJktTotal + r.mtdSmgTotal
  );

  const pfCombined = roundTon(r.mtdJktProjectForming + r.mtdSmgProjectForming);
  const indCombined = roundTon(r.mtdJktIndustri + r.mtdSmgIndustri);
  const isbsCombined = roundTon(r.mtdJktIsbsRitel + r.mtdSmgIsbsRitel);
  const othCombined = roundTon(r.mtdJktOthers + r.mtdSmgOthers);

  const lines = [
    `Informasi delv hari ${formatIndonesianDate(r.date)}`,
    ``,
    `TODAY`,
    `Jkt : ${fmtWaNum(daily.jkt)} t`,
    `Total Jkt : ${fmtWaNum(r.mtdJktTotal)} t`,
    `Smg : ${fmtWaNum(daily.smg)} t`,
    `Total Smg : ${fmtWaNum(r.mtdSmgTotal)} t`,
    `Total Delv Jkt&Smg: ${fmtWaNum(totalCombinedMtd)} t`,
    ``,
    `Note :`,
    `Project forming(Jkt) : ${fmtWaNum(r.jktProjectForming, dash)} t`,
    `Total Project forming(Jkt) : ${fmtWaNum(r.mtdJktProjectForming)} t`,
    `Project forming(Smg) : ${fmtWaNum(r.smgProjectForming, dash)} t`,
    `Total Project forming (Smg) : ${fmtWaNum(r.mtdSmgProjectForming)} t`,
    `Total Project forming Jkt&Smg :${fmtWaNum(pfCombined)} t`,
    ``,
    `Note :`,
    `Industri (Jkt) :${fmtWaNum(r.jktIndustri, dash)} t`,
    `Total Industri (Jkt) : ${fmtWaNum(r.mtdJktIndustri)} t`,
    `Industri (Smg) : ${fmtWaNum(r.smgIndustri, true)} t`,
    `Total Industri (Smg) : ${fmtWaNum(r.mtdSmgIndustri)} t`,
    `Total Industri Jkt&Smg :${fmtWaNum(indCombined)} t`,
    ``,
    `ISBS Ritel (Jkt ) : ${fmtWaNum(r.jktIsbsRitel, dash)} t`,
    `Total ISBS Ritel (Jkt) : ${fmtWaNum(r.mtdJktIsbsRitel)} t`,
    `ISBS (Smg) : ${fmtWaNum(r.smgIsbsRitel)} t`,
    `Total ISBS (Smg) : ${fmtWaNum(r.mtdSmgIsbsRitel)} t`,
    `Total Delv ISBS Jkt&Smg : ${fmtWaNum(isbsCombined)} t`,
    ``,
    `Others (Jkt ) : ${fmtWaNum(r.jktOthers)} t`,
    `Total Others (Jkt) :${fmtWaNum(r.mtdJktOthers)} t`,
    `Others (Smg) : ${fmtWaNum(r.smgOthers, dash)} t`,
    `Total Others (Smg) : ${fmtWaNum(r.mtdSmgOthers)} t`,
    `Total Delv Others Jkt&Smg : ${fmtWaNum(othCombined)} t`,
  ];

  if (r.notes && r.notes.trim().length > 0 && r.notes.trim() !== 'Data awal laporan harian Kamis, 19 November 2026.') {
    lines.push('', `Catatan : ${r.notes.trim()}`);
  }

  lines.push('', `Terima kasih 🙏🙏`);
  return lines.join('\n');
}

function parseWaNumberToken(token: string): number {
  const cleaned = token.trim().replace(/\./g, '').replace(',', '.');
  if (cleaned === '-' || cleaned === '') return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export interface ParsedWaResult {
  success: boolean;
  matchedFields: number;
  data: Partial<DeliveryFormState>;
  error?: string;
}

export function parseWhatsAppReport(raw: string): ParsedWaResult {
  if (!raw || !raw.trim()) {
    return { success: false, matchedFields: 0, data: {}, error: 'Teks kosong.' };
  }

  const data: Partial<DeliveryFormState> = {};
  let matchedFields = 0;

  // Match Indonesian date e.g. "Kamis, 19 November 2026" or "19 November 2026"
  const dateMatch = raw.match(
    /(?:(?:senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu)\s*,\s*)?(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/i
  );
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const monthName = dateMatch[2].toLowerCase();
    const year = dateMatch[3];
    const monthNum = BULAN_MAP[monthName];
    if (monthNum) {
      data.date = `${year}-${monthNum}-${day}`;
      matchedFields++;
    }
  }

  const patterns: Array<[keyof DeliveryFormState, RegExp]> = [
    ['dailyJktTotal', /^\s*Jkt\s*:\s*([\d.,-]+)\s*t?/im],
    ['mtdJktTotal', /^\s*Total\s+Jkt\s*:\s*([\d.,-]+)\s*t?/im],
    ['dailySmgTotal', /^\s*Smg\s*:\s*([\d.,-]+)\s*t?/im],
    ['mtdSmgTotal', /^\s*Total\s+Smg\s*:\s*([\d.,-]+)\s*t?/im],
    ['mtdCombinedTotal', /^\s*Total\s+Delv\s+Jkt\s*&\s*Smg\s*:?\s*([\d.,-]+)\s*t?/im],
    ['jktProjectForming', /^\s*Project\s+forming\s*\(\s*Jkt\s*\)\s*:\s*([\d.,-]+)\s*t?/im],
    ['mtdJktProjectForming', /^\s*Total\s+Project\s+forming\s*\(\s*Jkt\s*\)\s*:\s*([\d.,-]+)\s*t?/im],
    ['smgProjectForming', /^\s*Project\s+forming\s*\(\s*Smg\s*\)\s*:\s*([\d.,-]+)\s*t?/im],
    ['mtdSmgProjectForming', /^\s*Total\s+Project\s+forming\s*\(\s*Smg\s*\)\s*:\s*([\d.,-]+)\s*t?/im],
    ['jktIndustri', /^\s*Industri\s*\(\s*Jkt\s*\)\s*:\s*([\d.,-]+)\s*t?/im],
    ['mtdJktIndustri', /^\s*Total\s+Industri\s*\(\s*Jkt\s*\)\s*:\s*([\d.,-]+)\s*t?/im],
    ['smgIndustri', /^\s*Industri\s*\(\s*Smg\s*\)\s*:\s*([\d.,-]+)\s*t?/im],
    ['mtdSmgIndustri', /^\s*Total\s+Industri\s*\(\s*Smg\s*\)\s*:\s*([\d.,-]+)\s*t?/im],
    ['jktIsbsRitel', /^\s*ISBS(?:\s+Ritel)?\s*\(\s*Jkt\s*\)\s*:\s*([\d.,-]+)\s*t?/im],
    ['mtdJktIsbsRitel', /^\s*Total\s+ISBS(?:\s+Ritel)?\s*\(\s*Jkt\s*\)\s*:\s*([\d.,-]+)\s*t?/im],
    ['smgIsbsRitel', /^\s*ISBS(?:\s+Ritel)?\s*\(\s*Smg\s*\)\s*:\s*([\d.,-]+)\s*t?/im],
    ['mtdSmgIsbsRitel', /^\s*Total\s+ISBS(?:\s+Ritel)?\s*\(\s*Smg\s*\)\s*:\s*([\d.,-]+)\s*t?/im],
    ['jktOthers', /^\s*Others\s*\(\s*Jkt\s*\)\s*:\s*([\d.,-]+)\s*t?/im],
    ['mtdJktOthers', /^\s*Total\s+Others\s*\(\s*Jkt\s*\)\s*:\s*([\d.,-]+)\s*t?/im],
    ['smgOthers', /^\s*Others\s*\(\s*Smg\s*\)\s*:\s*([\d.,-]+)\s*t?/im],
    ['mtdSmgOthers', /^\s*Total\s+Others\s*\(\s*Smg\s*\)\s*:\s*([\d.,-]+)\s*t?/im],
  ];

  for (const [key, regex] of patterns) {
    const m = raw.match(regex);
    if (m && m[1] !== undefined) {
      (data as Record<string, unknown>)[key] = parseWaNumberToken(m[1]);
      matchedFields++;
    }
  }

  const hasMtdValues =
    data.mtdJktTotal !== undefined ||
    data.mtdSmgTotal !== undefined ||
    data.mtdJktProjectForming !== undefined ||
    data.dailyJktTotal !== undefined;

  if (hasMtdValues) {
    data.mtdMode = 'manual';
  }

  if (matchedFields < 2) {
    return {
      success: false,
      matchedFields,
      data,
      error:
        'Format pesan tidak dikenali. Pastikan baris seperti "Jkt : 5 t" atau "Project forming(Jkt) : 51 t" tersedia.',
    };
  }

  return {
    success: true,
    matchedFields,
    data,
  };
}

export function exportReportsToCsv(reports: DeliveryReport[]): void {
  const headers = [
    'Tanggal',
    'Hari',
    'JKT Project Forming (t)',
    'JKT Industri (t)',
    'JKT ISBS Ritel (t)',
    'JKT Others (t)',
    'JKT Harian (t)',
    'SMG Project Forming (t)',
    'SMG Industri (t)',
    'SMG ISBS Ritel (t)',
    'SMG Others (t)',
    'SMG Harian (t)',
    'Total Harian JKT & SMG (t)',
    'MTD JKT Project Forming (t)',
    'MTD JKT Industri (t)',
    'MTD JKT ISBS Ritel (t)',
    'MTD JKT Others (t)',
    'MTD JKT Total (t)',
    'MTD SMG Project Forming (t)',
    'MTD SMG Industri (t)',
    'MTD SMG ISBS Ritel (t)',
    'MTD SMG Others (t)',
    'MTD SMG Total (t)',
    'Total Delv JKT & SMG (t)',
    'Mode MTD',
    'Catatan',
  ];

  const sorted = [...reports].sort((a, b) => a.date.localeCompare(b.date));
  const rows = sorted.map((r) => {
    const daily = computeDailyTotals(r);
    const mtdCombined = roundTon(
      r.mtdCombinedTotal !== undefined
        ? r.mtdCombinedTotal
        : r.mtdJktTotal + r.mtdSmgTotal
    );

    return [
      r.date,
      getCsvDayName(r.date),
      formatCsvDecimal(r.jktProjectForming),
      formatCsvDecimal(r.jktIndustri),
      formatCsvDecimal(r.jktIsbsRitel),
      formatCsvDecimal(r.jktOthers),
      formatCsvDecimal(daily.jkt),
      formatCsvDecimal(r.smgProjectForming),
      formatCsvDecimal(r.smgIndustri),
      formatCsvDecimal(r.smgIsbsRitel),
      formatCsvDecimal(r.smgOthers),
      formatCsvDecimal(daily.smg),
      formatCsvDecimal(daily.combined),
      formatCsvDecimal(r.mtdJktProjectForming),
      formatCsvDecimal(r.mtdJktIndustri),
      formatCsvDecimal(r.mtdJktIsbsRitel),
      formatCsvDecimal(r.mtdJktOthers),
      formatCsvDecimal(r.mtdJktTotal),
      formatCsvDecimal(r.mtdSmgProjectForming),
      formatCsvDecimal(r.mtdSmgIndustri),
      formatCsvDecimal(r.mtdSmgIsbsRitel),
      formatCsvDecimal(r.mtdSmgOthers),
      formatCsvDecimal(r.mtdSmgTotal),
      formatCsvDecimal(mtdCombined),
      r.mtdMode === 'auto' ? 'Otomatis' : 'Manual',
      r.notes?.trim() || '-',
    ];
  });

  downloadCsvFile(`rekap_pengiriman_jkt_smg_${getLocalDateStamp()}.csv`, headers, rows);
}

export function exportReportsToXlsx(reports: DeliveryReport[]): void {
  const sorted = [...reports].sort((a, b) => a.date.localeCompare(b.date));

  const summaryHeaders = [
    'Tanggal',
    'Hari',
    'JKT Harian (t)',
    'SMG Harian (t)',
    'Total Harian (t)',
    'MTD JKT (t)',
    'MTD SMG (t)',
    'Total MTD JKT & SMG (t)',
    'Mode MTD',
    'Catatan',
  ];

  const summaryRows = sorted.map((r) => {
    const daily = computeDailyTotals(r);
    const mtdCombined = roundTon(
      r.mtdCombinedTotal !== undefined
        ? r.mtdCombinedTotal
        : r.mtdJktTotal + r.mtdSmgTotal
    );
    return [
      r.date,
      getCsvDayName(r.date),
      roundTon(daily.jkt),
      roundTon(daily.smg),
      roundTon(daily.combined),
      roundTon(r.mtdJktTotal),
      roundTon(r.mtdSmgTotal),
      mtdCombined,
      r.mtdMode === 'auto' ? 'Otomatis' : 'Manual',
      r.notes?.trim() || '-',
    ];
  });

  const detailHeaders = [
    'Tanggal',
    'Hari',
    'JKT Project Forming (t)',
    'JKT Industri (t)',
    'JKT ISBS Ritel (t)',
    'JKT Others (t)',
    'JKT Harian (t)',
    'SMG Project Forming (t)',
    'SMG Industri (t)',
    'SMG ISBS Ritel (t)',
    'SMG Others (t)',
    'SMG Harian (t)',
    'Total Harian JKT & SMG (t)',
    'MTD JKT Project Forming (t)',
    'MTD JKT Industri (t)',
    'MTD JKT ISBS Ritel (t)',
    'MTD JKT Others (t)',
    'MTD JKT Total (t)',
    'MTD SMG Project Forming (t)',
    'MTD SMG Industri (t)',
    'MTD SMG ISBS Ritel (t)',
    'MTD SMG Others (t)',
    'MTD SMG Total (t)',
    'Total Delv JKT & SMG (t)',
    'Mode MTD',
    'Catatan',
  ];

  const detailRows = sorted.map((r) => {
    const daily = computeDailyTotals(r);
    const mtdCombined = roundTon(
      r.mtdCombinedTotal !== undefined
        ? r.mtdCombinedTotal
        : r.mtdJktTotal + r.mtdSmgTotal
    );
    return [
      r.date,
      getCsvDayName(r.date),
      roundTon(r.jktProjectForming),
      roundTon(r.jktIndustri),
      roundTon(r.jktIsbsRitel),
      roundTon(r.jktOthers),
      roundTon(daily.jkt),
      roundTon(r.smgProjectForming),
      roundTon(r.smgIndustri),
      roundTon(r.smgIsbsRitel),
      roundTon(r.smgOthers),
      roundTon(daily.smg),
      roundTon(daily.combined),
      roundTon(r.mtdJktProjectForming),
      roundTon(r.mtdJktIndustri),
      roundTon(r.mtdJktIsbsRitel),
      roundTon(r.mtdJktOthers),
      roundTon(r.mtdJktTotal),
      roundTon(r.mtdSmgProjectForming),
      roundTon(r.mtdSmgIndustri),
      roundTon(r.mtdSmgIsbsRitel),
      roundTon(r.mtdSmgOthers),
      roundTon(r.mtdSmgTotal),
      mtdCombined,
      r.mtdMode === 'auto' ? 'Otomatis' : 'Manual',
      r.notes?.trim() || '-',
    ];
  });

  downloadXlsxFile(`rekap_pengiriman_jkt_smg_${getLocalDateStamp()}.xlsx`, [
    {
      sheetName: 'Ringkasan Harian',
      headers: summaryHeaders,
      rows: summaryRows,
      textColumnIndices: [0, 1, 8, 9],
    },
    {
      sheetName: 'Detail Segmen',
      headers: detailHeaders,
      rows: detailRows,
      textColumnIndices: [0, 1, 24, 25],
    },
  ]);
}

export const INITIAL_NOV_19_SAMPLE: DeliveryReport = {
  id: 'sample_2026-11-19',
  ownerId: 'sample',
  date: '2026-11-19',
  monthKey: '2026-11',
  dailyJktTotal: 379,
  dailySmgTotal: 83,
  jktProjectForming: 51,
  jktIndustri: 268,
  jktIsbsRitel: 60,
  jktOthers: 0,
  smgProjectForming: 26,
  smgIndustri: 0,
  smgIsbsRitel: 0,
  smgOthers: 57,
  mtdMode: 'manual',
  mtdJktProjectForming: 311,
  mtdJktIndustri: 930,
  mtdJktIsbsRitel: 1708,
  mtdJktOthers: 3,
  mtdSmgProjectForming: 35,
  mtdSmgIndustri: 1,
  mtdSmgIsbsRitel: 364,
  mtdSmgOthers: 515,
  mtdJktTotal: 2950,
  mtdSmgTotal: 915,
  mtdCombinedTotal: 3865,
  notes: '',
  isSample: true,
};
