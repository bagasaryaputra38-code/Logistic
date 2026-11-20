import React, { useMemo, useState } from 'react';
import {
  Download,
  Eye,
  Lock,
  Plus,
  Search,
} from 'lucide-react';
import { DeliveryReport } from '../types/delivery';
import {
  computeDailyTotals,
  exportReportsToCsv,
  formatIndonesianMonth,
  formatIndonesianShortDate,
  formatNumber,
  roundTon,
} from '../utils/deliveryCalculations';

interface HistoryViewProps {
  reports: DeliveryReport[];
  onViewReport: (date: string) => void;
  onNewReport: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  reports,
  onViewReport,
  onNewReport,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => set.add(r.monthKey));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [reports]);

  const filteredReports = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return [...reports]
      .filter((r) => {
        if (selectedMonth !== 'all' && r.monthKey !== selectedMonth) return false;
        if (!q) return true;
        return (
          r.date.includes(q) ||
          formatIndonesianShortDate(r.date).toLowerCase().includes(q) ||
          (r.notes || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [reports, selectedMonth, searchTerm]);

  // Chronological order for trend chart (max 14 latest entries in filter)
  const chartReports = useMemo(() => {
    return [...filteredReports].slice(0, 14).reverse();
  }, [filteredReports]);

  const maxDailyChart = useMemo(() => {
    if (chartReports.length === 0) return 100;
    return Math.max(...chartReports.map((r) => computeDailyTotals(r).combined), 1);
  }, [chartReports]);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">Riwayat &amp; Tren Pengiriman</h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700">
              <Lock className="w-3 h-3 text-slate-500" />
              Data Final · Hanya Lihat
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar laporan harian final yang tersimpan ({filteredReports.length} catatan, tidak dapat diubah atau dihapus)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari tanggal atau catatan..."
              className="h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-xs sm:text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none w-52"
            />
          </div>

          <select
            aria-label="Filter bulan"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-700 focus:border-blue-600 focus:outline-none cursor-pointer"
          >
            <option value="all">Semua Bulan</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {formatIndonesianMonth(m)}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={filteredReports.length === 0}
            onClick={() => exportReportsToCsv(filteredReports)}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 border border-slate-200 bg-white text-slate-700 text-xs sm:text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Ekspor CSV
          </button>

          <button
            type="button"
            onClick={onNewReport}
            className="inline-flex items-center gap-1.5 h-10 px-4 bg-blue-700 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-blue-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Input Baru
          </button>
        </div>
      </div>

      {/* Daily Trend Bar Visualization */}
      {chartReports.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Grafik Tonase Harian (JKT &amp; SMG)
              </h3>
              <p className="text-xs text-slate-500">
                Menampilkan hingga 14 hari terbaru pada periode terpilih — klik batang untuk membuka
                rekap harian
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-700 inline-block" />
                Jakarta (JKT)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-teal-600 inline-block" />
                Semarang (SMG)
              </span>
            </div>
          </div>

          <div className="h-52 flex items-end gap-3 pt-6 pb-2 px-2 border-b border-slate-200 overflow-x-auto">
            {chartReports.map((r) => {
              const daily = computeDailyTotals(r);
              const totalPct = (daily.combined / maxDailyChart) * 100;
              const jktShare = daily.combined > 0 ? (daily.jkt / daily.combined) * 100 : 0;
              const smgShare = daily.combined > 0 ? (daily.smg / daily.combined) * 100 : 0;

              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onViewReport(r.date)}
                  className="flex-1 min-w-[52px] max-w-[84px] h-full flex flex-col items-center justify-end gap-1.5 group cursor-pointer focus:outline-none"
                  title={`${formatIndonesianShortDate(r.date)}: JKT ${formatNumber(daily.jkt)} + SMG ${formatNumber(daily.smg)} = ${formatNumber(daily.combined)}`}
                >
                  <span className="text-[11px] font-mono tabular-nums font-semibold text-slate-700 group-hover:text-blue-700">
                    {formatNumber(daily.combined)}
                  </span>
                  <div
                    className="w-full max-w-[36px] rounded-t-md overflow-hidden flex flex-col-reverse bg-slate-100 transition-transform group-hover:-translate-y-0.5"
                    style={{ height: `${Math.max(totalPct * 0.78, daily.combined > 0 ? 6 : 2)}%` }}
                  >
                    {daily.jkt > 0 && (
                      <div className="w-full bg-blue-700" style={{ height: `${jktShare}%` }} />
                    )}
                    {daily.smg > 0 && (
                      <div className="w-full bg-teal-600" style={{ height: `${smgShare}%` }} />
                    )}
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-slate-500 whitespace-nowrap">
                    {r.date.slice(5)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* History Data Grid (Final Read-Only) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredReports.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-medium text-slate-700">
              Tidak ada laporan yang cocok dengan filter saat ini.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedMonth('all');
                setSearchTerm('');
              }}
              className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
            >
              Reset Filter
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-5">Tanggal</th>
                  <th className="py-3 px-4 text-right">JKT Harian</th>
                  <th className="py-3 px-4 text-right">SMG Harian</th>
                  <th className="py-3 px-4 text-right">Total Harian</th>
                  <th className="py-3 px-4 text-right">MTD JKT</th>
                  <th className="py-3 px-4 text-right">MTD SMG</th>
                  <th className="py-3 px-4 text-right">Total JKT &amp; SMG</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-5 text-right">Lihat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredReports.map((r) => {
                  const daily = computeDailyTotals(r);
                  const mtdCombined = roundTon(
                    r.mtdCombinedTotal !== undefined
                      ? r.mtdCombinedTotal
                      : r.mtdJktTotal + r.mtdSmgTotal
                  );

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <div className="font-medium text-slate-900">
                          {formatIndonesianShortDate(r.date)}
                        </div>
                        <div className="text-xs font-mono tabular-nums text-slate-500">
                          {r.date}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {formatNumber(daily.jkt)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {formatNumber(daily.smg)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatNumber(daily.combined)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {formatNumber(r.mtdJktTotal)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {formatNumber(r.mtdSmgTotal)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-blue-900">
                        {formatNumber(mtdCombined)}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                          <Lock className="w-3 h-3 text-slate-400" />
                          Final
                        </span>
                        <span className="text-slate-400"> · </span>
                        <span>{r.mtdMode === 'auto' ? 'Otomatis' : 'Manual'}</span>
                        {r.isSample ? ' · Pratinjau' : ''}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onViewReport(r.date)}
                          title="Lihat Rekapitulasi"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50/70 hover:bg-blue-100 rounded-md transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Lihat
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
