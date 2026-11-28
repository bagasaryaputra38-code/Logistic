import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Download,
  Eye,
  FileSpreadsheet,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { DeliveryReport, MONTHLY_TARGET_TON, VALIDATION_LIMITS } from '../types/delivery';
import {
  computeDailyTotals,
  exportReportsToCsv,
  exportReportsToXlsx,
  formatIndonesianDate,
  formatIndonesianMonth,
  formatIndonesianShortDate,
  formatNumber,
  getDaysInMonth,
  roundTon,
} from '../utils/deliveryCalculations';
import { MonthlyTargetChart } from './MonthlyTargetChart';

interface HistoryViewProps {
  reports: DeliveryReport[];
  onViewReport: (date: string) => void;
  onNewReport: () => void;
  isAdmin?: boolean;
  onDeleteReport?: (report: DeliveryReport) => Promise<void>;
  onEditReportDate?: (report: DeliveryReport, newDate: string) => Promise<void>;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  reports,
  onViewReport,
  onNewReport,
  isAdmin = false,
  onDeleteReport,
  onEditReportDate,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [hoveredDailyDate, setHoveredDailyDate] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DeliveryReport | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [pendingEditDate, setPendingEditDate] = useState<DeliveryReport | null>(null);
  const [newDateInput, setNewDateInput] = useState<string>('');
  const [isUpdatingDate, setIsUpdatingDate] = useState(false);
  const [editDateError, setEditDateError] = useState<string | null>(null);

  const canDelete = Boolean(isAdmin && onDeleteReport);
  const canEditDate = Boolean(isAdmin && onEditReportDate);

  const dateConflictReport = useMemo(() => {
    if (!pendingEditDate || !VALIDATION_LIMITS.DATE_REGEX.test(newDateInput)) return null;
    if (newDateInput === pendingEditDate.date) return null;
    return reports.find((r) => r.id !== pendingEditDate.id && r.date === newDateInput) ?? null;
  }, [pendingEditDate, newDateInput, reports]);

  const handleConfirmDelete = async () => {
    if (!pendingDelete || !onDeleteReport) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteReport(pendingDelete);
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Gagal menghapus data delivery.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmEditDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEditDate || !onEditReportDate) return;
    if (!VALIDATION_LIMITS.DATE_REGEX.test(newDateInput)) {
      setEditDateError('Format tanggal baru tidak valid.');
      return;
    }
    if (newDateInput === pendingEditDate.date) {
      setEditDateError('Pilih tanggal yang berbeda dari tanggal saat ini.');
      return;
    }
    if (dateConflictReport) {
      setEditDateError(
        `Laporan tanggal ${newDateInput} sudah ada. Pilih tanggal lain atau hapus laporan tanggal tersebut terlebih dahulu.`
      );
      return;
    }

    setIsUpdatingDate(true);
    setEditDateError(null);
    try {
      await onEditReportDate(pendingEditDate, newDateInput);
      setPendingEditDate(null);
    } catch (err) {
      setEditDateError(err instanceof Error ? err.message : 'Gagal mengubah tanggal data delivery.');
    } finally {
      setIsUpdatingDate(false);
    }
  };

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

  // Active month for 10.000 Ton monthly target trajectory
  const targetMonthKey = useMemo(() => {
    if (selectedMonth !== 'all') return selectedMonth;
    if (availableMonths.length > 0) return availableMonths[0];
    return new Date().toISOString().slice(0, 7);
  }, [selectedMonth, availableMonths]);

  const idealDailyTarget = useMemo(
    () => roundTon(MONTHLY_TARGET_TON / getDaysInMonth(targetMonthKey)),
    [targetMonthKey]
  );

  // Chronological order for trend chart (max 14 latest entries in filter)
  const chartReports = useMemo(() => {
    return [...filteredReports].slice(0, 14).reverse();
  }, [filteredReports]);

  const maxDailyChart = useMemo(() => {
    const rawMax = Math.max(
      idealDailyTarget,
      ...chartReports.map((r) => computeDailyTotals(r).combined),
      100
    );
    return Math.ceil((rawMax * 1.15) / 100) * 100;
  }, [chartReports, idealDailyTarget]);

  const activeDailyBarReport = useMemo(() => {
    if (chartReports.length === 0) return null;
    if (hoveredDailyDate) {
      const found = chartReports.find((r) => r.date === hoveredDailyDate);
      if (found) return found;
    }
    return chartReports[chartReports.length - 1];
  }, [chartReports, hoveredDailyDate]);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Riwayat &amp; Tren Pengiriman</h2>
          <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
            <span>Daftar laporan harian final yang tersimpan ({filteredReports.length} catatan)</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 font-medium text-slate-700">
              <Lock className="w-3 h-3 text-slate-500" />
              Data Final (Hanya Lihat)
            </span>
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
            className="inline-flex items-center gap-1.5 h-10 px-3.5 border border-slate-200 bg-white text-slate-700 text-xs sm:text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            Ekspor CSV
          </button>

          <button
            type="button"
            disabled={filteredReports.length === 0}
            onClick={() => exportReportsToXlsx(filteredReports)}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs sm:text-sm font-medium rounded-lg hover:bg-emerald-100 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel (.xlsx)
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

      {/* Monthly Target Trajectory Chart (10.000 Ton) */}
      <MonthlyTargetChart
        reports={reports}
        monthKey={targetMonthKey}
        onSelectDate={onViewReport}
      />

      {/* Daily Trend Bar Visualization */}
      {chartReports.length > 0 && (() => {
        const svgW = 920;
        const svgH = 276;
        const padL = 62;
        const padR = 24;
        const padT = 30;
        const padB = 42;
        const plotW = svgW - padL - padR;
        const plotH = svgH - padT - padB;
        const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxDailyChart * f));
        const getBarY = (val: number) =>
          padT + plotH - (Math.min(Math.max(val, 0), maxDailyChart) / maxDailyChart) * plotH;
        const targetLineY = getBarY(idealDailyTarget);
        const slotCount = Math.max(chartReports.length, 6);
        const slotW = plotW / slotCount;
        const barW = Math.min(Math.max(slotW * 0.46, 22), 48);
        const activeDaily = activeDailyBarReport ? computeDailyTotals(activeDailyBarReport) : null;

        return (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  Grafik Tonase Harian (JKT &amp; SMG)
                </h3>
                <p className="text-xs sm:text-sm text-slate-500">
                  Perbandingan realisasi pengiriman harian terhadap laju ideal {formatNumber(idealDailyTarget)} t/hari — klik batang untuk membuka rekap
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-700 shrink-0">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-blue-700 inline-block" />
                  Jakarta (JKT)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-teal-600 inline-block" />
                  Semarang (SMG)
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-emerald-700">
                  <span className="w-4 border-t-2 border-dashed border-emerald-600 inline-block" />
                  Target Harian: {formatNumber(idealDailyTarget)} t
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                <svg
                  viewBox={`0 0 ${svgW} ${svgH}`}
                  className="w-full h-auto block select-none"
                  role="img"
                  aria-label="Grafik tonase harian JKT dan SMG"
                  onMouseLeave={() => setHoveredDailyDate(null)}
                >
                  {/* Horizontal Gridlines & Y-Axis Ticks */}
                  {yTicks.map((tick) => {
                    const y = getBarY(tick);
                    return (
                      <g key={`dy-${tick}`}>
                        <line
                          x1={padL}
                          y1={y}
                          x2={svgW - padR}
                          y2={y}
                          stroke={tick === 0 ? '#94a3b8' : '#e2e8f0'}
                          strokeWidth={tick === 0 ? 1.5 : 1}
                        />
                        <text
                          x={padL - 10}
                          y={y + 4}
                          textAnchor="end"
                          fontSize="12"
                          fontWeight="500"
                          className="fill-slate-600 font-mono tabular-nums"
                        >
                          {formatNumber(tick)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Y-axis unit */}
                  <text
                    x={padL}
                    y={16}
                    textAnchor="start"
                    fontSize="12"
                    fontWeight="600"
                    className="fill-slate-500"
                  >
                    Tonase Harian (Ton)
                  </text>

                  {/* Ideal Daily Pace Line */}
                  <line
                    x1={padL}
                    y1={targetLineY}
                    x2={svgW - padR}
                    y2={targetLineY}
                    stroke="#059669"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                  <rect
                    x={svgW - padR - 178}
                    y={Math.max(targetLineY - 21, padT)}
                    width={174}
                    height={19}
                    rx={4}
                    fill="#059669"
                  />
                  <text
                    x={svgW - padR - 91}
                    y={Math.max(targetLineY - 8, padT + 13)}
                    textAnchor="middle"
                    fontSize="11.5"
                    fontWeight="700"
                    className="fill-white font-mono tabular-nums"
                  >
                    IDEAL: {formatNumber(idealDailyTarget)} t/hari
                  </text>

                  {/* Stacked JKT + SMG Bars */}
                  {chartReports.map((r, idx) => {
                    const daily = computeDailyTotals(r);
                    const totalSlots = chartReports.length;
                    const groupLeft = padL + ((plotW - slotW * totalSlots) / 2) + idx * slotW;
                    const cx = groupLeft + slotW / 2;
                    const barX = cx - barW / 2;
                    const baseY = getBarY(0);
                    const jktTopY = getBarY(daily.jkt);
                    const jktH = Math.max(baseY - jktTopY, 0);
                    const totalTopY = getBarY(daily.combined);
                    const smgH = Math.max(jktTopY - totalTopY, 0);
                    const isActive = activeDailyBarReport?.date === r.date;

                    return (
                      <g
                        key={r.id}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredDailyDate(r.date)}
                        onClick={() => onViewReport(r.date)}
                      >
                        <rect
                          x={groupLeft}
                          y={padT}
                          width={slotW}
                          height={plotH}
                          fill={isActive ? '#f8fafc' : 'transparent'}
                        />
                        {daily.jkt > 0 && (
                          <rect
                            x={barX}
                            y={jktTopY}
                            width={barW}
                            height={jktH}
                            fill="#1d4ed8"
                            opacity={isActive ? 1 : 0.88}
                          />
                        )}
                        {daily.smg > 0 && (
                          <rect
                            x={barX}
                            y={totalTopY}
                            width={barW}
                            height={smgH}
                            rx={3}
                            fill="#0d9488"
                            opacity={isActive ? 1 : 0.88}
                          />
                        )}
                        <text
                          x={cx}
                          y={Math.max(totalTopY - 8, padT + 12)}
                          textAnchor="middle"
                          fontSize="12"
                          fontWeight="700"
                          className={`${
                            isActive ? 'fill-blue-800' : 'fill-slate-800'
                          } font-mono tabular-nums`}
                        >
                          {formatNumber(daily.combined)}
                        </text>
                        <text
                          x={cx}
                          y={svgH - 14}
                          textAnchor="middle"
                          fontSize="12"
                          fontWeight={isActive ? '700' : '500'}
                          className={`${
                            isActive ? 'fill-slate-900' : 'fill-slate-600'
                          } font-mono tabular-nums`}
                        >
                          {formatIndonesianShortDate(r.date).replace(/\s+\d{4}$/, '')}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {activeDailyBarReport && activeDaily && (
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">
                    {formatIndonesianShortDate(activeDailyBarReport.date)}
                  </span>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="font-mono tabular-nums">
                    JKT <strong className="text-blue-800">{formatNumber(activeDaily.jkt)} t</strong>
                  </span>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="font-mono tabular-nums">
                    SMG <strong className="text-teal-700">{formatNumber(activeDaily.smg)} t</strong>
                  </span>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="font-mono tabular-nums">
                    Total Harian <strong className="text-slate-900">{formatNumber(activeDaily.combined)} t</strong>
                  </span>
                </div>
                <span className="font-mono tabular-nums">
                  {activeDaily.combined >= idealDailyTarget ? (
                    <span className="text-emerald-700 font-semibold">
                      +{formatNumber(roundTon(activeDaily.combined - idealDailyTarget))} t di atas ideal harian
                    </span>
                  ) : (
                    <span className="text-amber-700 font-semibold">
                      -{formatNumber(roundTon(idealDailyTarget - activeDaily.combined))} t di bawah ideal harian
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        );
      })()}

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
                  <th className="py-3 px-5 text-right">{canDelete || canEditDate ? 'Aksi' : 'Lihat'}</th>
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
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onViewReport(r.date)}
                            title="Lihat Rekapitulasi"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50/70 hover:bg-blue-100 rounded-md transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Lihat
                          </button>
                          {canEditDate && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditDateError(null);
                                setNewDateInput(r.date);
                                setPendingEditDate(r);
                              }}
                              title="Edit Tanggal Data Delivery (Khusus Administrator)"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors cursor-pointer"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              Edit Tanggal
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError(null);
                                setPendingDelete(r);
                              }}
                              title="Hapus Data Delivery (Khusus Administrator)"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50/80 hover:bg-red-100 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Hapus
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal: Delete Delivery Report (Admin Only) */}
      {canDelete && pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-delivery-title"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-50 text-red-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="confirm-delete-delivery-title"
                    className="text-base font-bold text-slate-900"
                  >
                    Hapus Data Delivery
                  </h3>
                  <p className="text-xs text-slate-500">Khusus Administrator</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setPendingDelete(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Tanggal Laporan</span>
                <span className="font-semibold text-slate-900">
                  {formatIndonesianDate(pendingDelete.date)} ({pendingDelete.date})
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Total Harian (JKT &amp; SMG)</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatNumber(computeDailyTotals(pendingDelete).combined)} Ton
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Total Akumulasi (MTD)</span>
                <span className="font-mono font-semibold text-blue-900 tabular-nums">
                  {formatNumber(
                    roundTon(
                      pendingDelete.mtdCombinedTotal !== undefined
                        ? pendingDelete.mtdCombinedTotal
                        : pendingDelete.mtdJktTotal + pendingDelete.mtdSmgTotal
                    )
                  )}{' '}
                  Ton
                </span>
              </div>
            </div>

            <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              Data delivery pada tanggal ini akan dihapus permanen dari database dan tidak dapat
              dikembalikan.
            </p>

            {deleteError && (
              <div className="text-xs text-red-700 font-medium">{deleteError}</div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleConfirmDelete()}
                className="flex-1 h-10 inline-flex items-center justify-center gap-2 px-4 bg-red-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors cursor-pointer"
              >
                {isDeleting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus Permanen'}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setPendingDelete(null)}
                className="h-10 px-4 border border-slate-200 bg-white text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Delivery Report Date (Admin Only) */}
      {canEditDate && pendingEditDate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-edit-date-title"
        >
          <form
            onSubmit={(e) => void handleConfirmEditDate(e)}
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="history-edit-date-title" className="text-base font-bold text-slate-900">
                    Edit Tanggal Data Delivery
                  </h3>
                  <p className="text-xs text-slate-500">Khusus Administrator</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isUpdatingDate}
                onClick={() => setPendingEditDate(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Tanggal Saat Ini</span>
                <span className="font-semibold text-slate-900">
                  {formatIndonesianDate(pendingEditDate.date)} ({pendingEditDate.date})
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Total Harian (JKT &amp; SMG)</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatNumber(computeDailyTotals(pendingEditDate).combined)} Ton
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="history-new-date" className="block text-xs font-semibold text-slate-700">
                Tanggal Baru
              </label>
              <input
                id="history-new-date"
                type="date"
                required
                disabled={isUpdatingDate}
                value={newDateInput}
                onChange={(e) => {
                  setNewDateInput(e.target.value);
                  setEditDateError(null);
                }}
                className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-none"
              />
              {VALIDATION_LIMITS.DATE_REGEX.test(newDateInput) && (
                <p className="text-xs text-slate-600 font-medium">
                  {formatIndonesianDate(newDateInput)}
                </p>
              )}
            </div>

            {dateConflictReport && (
              <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Laporan tanggal {newDateInput} sudah ada. Pilih tanggal lain atau hapus laporan
                tanggal tersebut terlebih dahulu.
              </div>
            )}

            {editDateError && !dateConflictReport && (
              <div className="text-xs text-red-700 font-medium">{editDateError}</div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={
                  isUpdatingDate ||
                  !VALIDATION_LIMITS.DATE_REGEX.test(newDateInput) ||
                  newDateInput === pendingEditDate.date ||
                  Boolean(dateConflictReport)
                }
                className="flex-1 h-10 inline-flex items-center justify-center gap-2 px-4 bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isUpdatingDate ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Calendar className="w-4 h-4" />
                )}
                {isUpdatingDate ? 'Menyimpan...' : 'Simpan Tanggal Baru'}
              </button>
              <button
                type="button"
                disabled={isUpdatingDate}
                onClick={() => setPendingEditDate(null)}
                className="h-10 px-4 border border-slate-200 bg-white text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
              >
                Batal
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
