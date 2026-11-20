import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Info,
  Lock,
  Plus,
  Printer,
} from 'lucide-react';
import { DeliveryReport } from '../types/delivery';
import {
  computeDailyTotals,
  computeSegmentRows,
  formatIndonesianDate,
  formatIndonesianMonth,
  formatIndonesianShortDate,
  formatNumber,
  generateWhatsAppReport,
  getMtdVariance,
  roundTon,
} from '../utils/deliveryCalculations';

interface RecapViewProps {
  reports: DeliveryReport[];
  selectedReport: DeliveryReport | null;
  onSelectDate: (date: string) => void;
  onNewReport: () => void;
  isLoading: boolean;
}

export const RecapView: React.FC<RecapViewProps> = ({
  reports,
  selectedReport,
  onSelectDate,
  onNewReport,
  isLoading,
}) => {
  const [copied, setCopied] = useState(false);
  const [dashForZero, setDashForZero] = useState(false);

  const sortedReports = useMemo(
    () => [...reports].sort((a, b) => b.date.localeCompare(a.date)),
    [reports]
  );

  const currentIndex = useMemo(() => {
    if (!selectedReport) return -1;
    return sortedReports.findIndex((r) => r.date === selectedReport.date);
  }, [sortedReports, selectedReport]);

  const prevOlderReport =
    currentIndex >= 0 && currentIndex < sortedReports.length - 1
      ? sortedReports[currentIndex + 1]
      : null;
  const nextNewerReport = currentIndex > 0 ? sortedReports[currentIndex - 1] : null;

  const waText = useMemo(() => {
    if (!selectedReport) return '';
    return generateWhatsAppReport(selectedReport, { useDashForZero: dashForZero });
  }, [selectedReport, dashForZero]);

  const handleCopyWa = async () => {
    if (!waText) return;
    try {
      await navigator.clipboard.writeText(waText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback textarea copy
      const el = document.createElement('textarea');
      el.value = waText;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-24 bg-white border border-slate-200 rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl" />
          ))}
        </div>
        <div className="h-80 bg-white border border-slate-200 rounded-xl" />
      </div>
    );
  }

  if (!selectedReport) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center max-w-xl mx-auto mt-8 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Belum Ada Data Rekapitulasi Pengiriman
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Mulai catat pengiriman harian cabang Jakarta (JKT) dan Semarang (SMG) atau tempel
          pesan laporan WhatsApp untuk menghasilkan rekapitulasi otomatis.
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={onNewReport}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Input Pengiriman Pertama
          </button>
        </div>
      </div>
    );
  }

  const daily = computeDailyTotals(selectedReport);
  const rows = computeSegmentRows(selectedReport);
  const mtdCombinedTotal = roundTon(
    selectedReport.mtdCombinedTotal !== undefined
      ? selectedReport.mtdCombinedTotal
      : selectedReport.mtdJktTotal + selectedReport.mtdSmgTotal
  );
  const variance = getMtdVariance(selectedReport);

  const jktDailyPct = daily.combined > 0 ? (daily.jkt / daily.combined) * 100 : 0;
  const smgDailyPct = daily.combined > 0 ? (daily.smg / daily.combined) * 100 : 0;
  const jktMtdPct = mtdCombinedTotal > 0 ? (selectedReport.mtdJktTotal / mtdCombinedTotal) * 100 : 0;
  const smgMtdPct = mtdCombinedTotal > 0 ? (selectedReport.mtdSmgTotal / mtdCombinedTotal) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Date Navigation & Report Context Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 print-container">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Periode {formatIndonesianMonth(selectedReport.monthKey)}</span>
            <span aria-hidden="true">·</span>
            <span>Satuan: Ton</span>
            <span aria-hidden="true">·</span>
            <span>
              Mode Akumulasi:{' '}
              {selectedReport.mtdMode === 'auto' ? 'Otomatis' : 'Penyesuaian Manual'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 font-medium text-slate-700">
              <Lock className="w-3 h-3 text-slate-500" />
              Data Final
            </span>
            {selectedReport.isSample && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-700 font-medium">Data Pratinjau (Belum Disimpan Cloud)</span>
              </>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {formatIndonesianDate(selectedReport.date)}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <div className="inline-flex items-center border border-slate-200 rounded-lg bg-slate-50 p-0.5">
            <button
              type="button"
              disabled={!prevOlderReport}
              onClick={() => prevOlderReport && onSelectDate(prevOlderReport.date)}
              title="Hari sebelumnya"
              className="p-2 text-slate-600 hover:text-slate-900 disabled:opacity-35 disabled:cursor-not-allowed rounded-md hover:bg-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <select
              aria-label="Pilih tanggal laporan"
              value={selectedReport.date}
              onChange={(e) => onSelectDate(e.target.value)}
              className="bg-transparent text-xs sm:text-sm font-medium text-slate-800 px-2 py-1.5 focus:outline-none cursor-pointer"
            >
              {sortedReports.map((r) => (
                <option key={r.id} value={r.date}>
                  {formatIndonesianShortDate(r.date)} ({r.date})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!nextNewerReport}
              onClick={() => nextNewerReport && onSelectDate(nextNewerReport.date)}
              title="Hari berikutnya"
              className="p-2 text-slate-600 hover:text-slate-900 disabled:opacity-35 disabled:cursor-not-allowed rounded-md hover:bg-white transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 bg-white text-slate-700 text-xs sm:text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Cetak
          </button>

          <button
            type="button"
            onClick={handleCopyWa}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Tersalin!' : 'Salin Laporan WA'}
          </button>
        </div>
      </div>

      {/* 4-Column KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="text-xs font-medium text-slate-500">Pengiriman Hari Ini (JKT + SMG)</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-mono tabular-nums text-slate-900">
              {formatNumber(daily.combined)}
            </span>
            <span className="text-sm font-medium text-slate-500">Ton</span>
          </div>
          <div className="text-xs text-slate-600 font-mono tabular-nums">
            JKT {formatNumber(daily.jkt)} Ton · SMG {formatNumber(daily.smg)} Ton
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Cabang Jakarta (JKT)</span>
            <span className="text-xs font-mono tabular-nums text-blue-700 font-semibold">
              {jktDailyPct.toFixed(1)}% harian
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-mono tabular-nums text-slate-900">
              {formatNumber(daily.jkt)}
            </span>
            <span className="text-sm font-medium text-slate-500">Ton</span>
          </div>
          <div className="text-xs text-slate-600 font-mono tabular-nums">
            Total Akumulasi JKT: <span className="font-semibold text-slate-900">{formatNumber(selectedReport.mtdJktTotal)} Ton</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Cabang Semarang (SMG)</span>
            <span className="text-xs font-mono tabular-nums text-teal-700 font-semibold">
              {smgDailyPct.toFixed(1)}% harian
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-mono tabular-nums text-slate-900">
              {formatNumber(daily.smg)}
            </span>
            <span className="text-sm font-medium text-slate-500">Ton</span>
          </div>
          <div className="text-xs text-slate-600 font-mono tabular-nums">
            Total Akumulasi SMG: <span className="font-semibold text-slate-900">{formatNumber(selectedReport.mtdSmgTotal)} Ton</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-900 rounded-xl p-5 flex flex-col justify-between gap-3 text-white">
          <div className="text-xs font-medium text-slate-300">Total Delv JKT &amp; SMG (Akumulasi)</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-mono tabular-nums text-white">
              {formatNumber(mtdCombinedTotal)}
            </span>
            <span className="text-sm font-medium text-slate-300">Ton</span>
          </div>
          <div className="text-xs text-slate-300 font-mono tabular-nums">
            JKT {jktMtdPct.toFixed(1)}% · SMG {smgMtdPct.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Main Rekapitulasi Otomatis Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden print-container">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Tabel Rekapitulasi Per Segmen
            </h3>
            <p className="text-xs text-slate-500">
              Rincian tonase pengiriman harian dan total akumulasi bulan berjalan ({formatIndonesianMonth(selectedReport.monthKey)})
            </p>
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            Tanggal Data: {selectedReport.date}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-5">Segmen</th>
                <th className="py-3 px-4 text-right">JKT Harian</th>
                <th className="py-3 px-4 text-right">SMG Harian</th>
                <th className="py-3 px-4 text-right bg-slate-100/70">Total Harian</th>
                <th className="py-3 px-4 text-right">Total JKT</th>
                <th className="py-3 px-4 text-right">Total SMG</th>
                <th className="py-3 px-4 text-right bg-blue-50/50 text-blue-900">
                  Total JKT &amp; SMG
                </th>
                <th className="py-3 px-5 text-right">Porsi MTD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {rows.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-5 font-medium text-slate-900 whitespace-nowrap">
                    {row.label}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                    {row.dailyJkt === 0 ? (
                      <span className="text-slate-400">0 Ton</span>
                    ) : (
                      `${formatNumber(row.dailyJkt)} Ton`
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                    {row.dailySmg === 0 ? (
                      <span className="text-slate-400">0 Ton</span>
                    ) : (
                      `${formatNumber(row.dailySmg)} Ton`
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 bg-slate-50/70">
                    {formatNumber(row.dailyCombined)} Ton
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                    {formatNumber(row.mtdJkt)} Ton
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                    {formatNumber(row.mtdSmg)} Ton
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-blue-900 bg-blue-50/30">
                    {formatNumber(row.mtdCombined)} Ton
                  </td>
                  <td className="py-3.5 px-5 text-right font-mono tabular-nums text-xs text-slate-600">
                    {row.mtdSharePct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white font-semibold text-sm">
                <td className="py-3.5 px-5">Total Keseluruhan</td>
                <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                  {formatNumber(daily.jkt)} Ton
                </td>
                <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                  {formatNumber(daily.smg)} Ton
                </td>
                <td className="py-3.5 px-4 text-right font-mono tabular-nums bg-slate-800">
                  {formatNumber(daily.combined)} Ton
                </td>
                <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                  {formatNumber(selectedReport.mtdJktTotal)} Ton
                </td>
                <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                  {formatNumber(selectedReport.mtdSmgTotal)} Ton
                </td>
                <td className="py-3.5 px-4 text-right font-mono tabular-nums bg-blue-900">
                  {formatNumber(mtdCombinedTotal)} Ton
                </td>
                <td className="py-3.5 px-5 text-right font-mono tabular-nums text-xs">100.0%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {variance.hasVariance && (
          <div className="px-5 py-3 bg-amber-50 border-t border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
            <div>
              <span className="font-semibold">Catatan Audit Akumulasi Manual:</span>{' '}
              {Math.abs(variance.jktDiff) > 0.01 && (
                <span>
                  Total JKT tercatat {formatNumber(selectedReport.mtdJktTotal)} Ton (penjumlahan 4
                  segmen JKT = {formatNumber(variance.jktSegmentSum)} Ton, selisih{' '}
                  {variance.jktDiff > 0 ? `+${variance.jktDiff}` : variance.jktDiff} Ton).{' '}
                </span>
              )}
              {Math.abs(variance.smgDiff) > 0.01 && (
                <span>
                  Total SMG tercatat {formatNumber(selectedReport.mtdSmgTotal)} Ton (penjumlahan 4
                  segmen SMG = {formatNumber(variance.smgSegmentSum)} Ton, selisih{' '}
                  {variance.smgDiff > 0 ? `+${variance.smgDiff}` : variance.smgDiff} Ton).
                </span>
              )}
            </div>
          </div>
        )}

        {selectedReport.notes && (
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Catatan:</span> {selectedReport.notes}
          </div>
        )}
      </div>

      {/* Bottom Split: Visual Segment Breakdown & WhatsApp Report Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Visual Comparison */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Komposisi Akumulasi Cabang per Segmen
              </h3>
              <p className="text-xs text-slate-500">
                Perbandingan kontribusi Jakarta (JKT) dan Semarang (SMG)
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600 shrink-0">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-700 inline-block" />
                JKT
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-teal-600 inline-block" />
                SMG
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {rows.map((row) => {
              const maxSegmentMtd = Math.max(...rows.map((r) => r.mtdCombined), 1);
              const barWidthPct = (row.mtdCombined / maxSegmentMtd) * 100;
              const jktPart = row.mtdCombined > 0 ? (row.mtdJkt / row.mtdCombined) * 100 : 0;
              const smgPart = row.mtdCombined > 0 ? (row.mtdSmg / row.mtdCombined) * 100 : 0;

              return (
                <div key={row.key} className="space-y-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-slate-800">{row.label}</span>
                    <span className="font-mono tabular-nums text-xs text-slate-600">
                      Harian <strong className="text-slate-900">{formatNumber(row.dailyCombined)} Ton</strong> · Total{' '}
                      <strong className="text-slate-900">{formatNumber(row.mtdCombined)} Ton</strong> ({row.mtdSharePct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-md overflow-hidden">
                    <div
                      className="h-full flex rounded-md overflow-hidden transition-all duration-300"
                      style={{ width: `${Math.max(barWidthPct, row.mtdCombined > 0 ? 2 : 0)}%` }}
                    >
                      {row.mtdJkt > 0 && (
                        <div
                          className="bg-blue-700 h-full"
                          style={{ width: `${jktPart}%` }}
                          title={`JKT: ${formatNumber(row.mtdJkt)} Ton`}
                        />
                      )}
                      {row.mtdSmg > 0 && (
                        <div
                          className="bg-teal-600 h-full"
                          style={{ width: `${smgPart}%` }}
                          title={`SMG: ${formatNumber(row.mtdSmg)} Ton`}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                    <span>JKT: {formatNumber(row.mtdJkt)} Ton</span>
                    <span>SMG: {formatNumber(row.mtdSmg)} Ton</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* WhatsApp Formatted Recap Box */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3 no-print">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Format Laporan WhatsApp</h3>
              <p className="text-xs text-slate-500">Siap salin ke grup operasional</p>
            </div>
            <button
              type="button"
              onClick={handleCopyWa}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Tersalin' : 'Salin'}
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dashForZero}
              onChange={(e) => setDashForZero(e.target.checked)}
              className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            Tampilkan tanda &ldquo;-&rdquo; untuk segmen bernilai 0 pada harian
          </label>

          <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs font-mono text-slate-800 whitespace-pre-wrap overflow-y-auto max-h-80 leading-relaxed select-all">
            {waText}
          </pre>
        </div>
      </div>
    </div>
  );
};
