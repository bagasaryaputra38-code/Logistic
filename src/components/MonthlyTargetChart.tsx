import React, { useMemo, useState } from 'react';
import {
  computeMonthlyTargetProgress,
  formatIndonesianMonth,
  formatIndonesianShortDate,
  formatNumber,
  MonthlyTargetPoint,
} from '../utils/deliveryCalculations';
import { DeliveryReport, MONTHLY_TARGET_TON } from '../types/delivery';

interface MonthlyTargetChartProps {
  reports: DeliveryReport[];
  monthKey: string;
  upToDate?: string;
  highlightDate?: string;
  onSelectDate?: (date: string) => void;
}

const CHART_WIDTH = 920;
const CHART_HEIGHT = 360;
const PAD_LEFT = 76;
const PAD_RIGHT = 32;
const PAD_TOP = 34;
const PAD_BOTTOM = 46;
const PLOT_W = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

export const MonthlyTargetChart: React.FC<MonthlyTargetChartProps> = ({
  reports,
  monthKey,
  upToDate,
  highlightDate,
  onSelectDate,
}) => {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const summary = useMemo(
    () => computeMonthlyTargetProgress(reports, monthKey, upToDate, MONTHLY_TARGET_TON),
    [reports, monthKey, upToDate]
  );

  const yMax = useMemo(() => {
    const peak = Math.max(summary.targetTon, summary.actualMtdTon);
    if (peak <= summary.targetTon) return 11000;
    return Math.ceil((peak * 1.1) / 2000) * 2000;
  }, [summary.targetTon, summary.actualMtdTon]);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = 2000;
    for (let v = 0; v <= yMax; v += step) {
      ticks.push(v);
    }
    if (!ticks.includes(summary.targetTon)) {
      ticks.push(summary.targetTon);
      ticks.sort((a, b) => a - b);
    }
    return ticks;
  }, [yMax, summary.targetTon]);

  const xTicks = useMemo(() => {
    const ticks = [1, 5, 10, 15, 20, 25];
    if (!ticks.includes(summary.daysInMonth)) {
      ticks.push(summary.daysInMonth);
    }
    return ticks;
  }, [summary.daysInMonth]);

  const getX = (day: number) =>
    PAD_LEFT + (Math.min(Math.max(day, 0), summary.daysInMonth) / summary.daysInMonth) * PLOT_W;

  const getY = (ton: number) =>
    PAD_TOP + PLOT_H - (Math.min(Math.max(ton, 0), yMax) / yMax) * PLOT_H;

  const activePoint: MonthlyTargetPoint | null = useMemo(() => {
    if (summary.points.length === 0) return null;
    const targetDate = hoveredDate ?? highlightDate ?? summary.latestDate;
    return (
      summary.points.find((p) => p.date === targetDate) ??
      summary.points[summary.points.length - 1]
    );
  }, [summary.points, hoveredDate, highlightDate, summary.latestDate]);

  // Build full cumulative trajectory starting from origin (day 0, 0 t) so even 1 point draws a clear progression line & area
  const trajectoryCoords = useMemo(() => {
    if (summary.points.length === 0) return [];
    const origin = { x: getX(0), y: getY(0), day: 0, mtdTon: 0 };
    const rest = summary.points.map((p) => ({
      x: getX(p.day),
      y: getY(p.mtdTon),
      day: p.day,
      mtdTon: p.mtdTon,
    }));
    return [origin, ...rest];
  }, [summary.points, summary.daysInMonth, yMax]);

  const linePath = useMemo(() => {
    if (trajectoryCoords.length < 2) return '';
    return trajectoryCoords
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(' ');
  }, [trajectoryCoords]);

  const areaPath = useMemo(() => {
    if (trajectoryCoords.length < 2) return '';
    const first = trajectoryCoords[0];
    const last = trajectoryCoords[trajectoryCoords.length - 1];
    const baseY = getY(0).toFixed(1);
    return `${linePath} L ${last.x.toFixed(1)} ${baseY} L ${first.x.toFixed(1)} ${baseY} Z`;
  }, [linePath, trajectoryCoords, yMax]);

  // Simple pace projection from latest recorded point to end of month based on average daily actual so far
  const projectedMonthEndTon = useMemo(() => {
    if (summary.points.length === 0 || summary.latestDay <= 0) return null;
    const avgPerDay = summary.actualMtdTon / summary.latestDay;
    return Math.round(avgPerDay * summary.daysInMonth);
  }, [summary.points.length, summary.actualMtdTon, summary.latestDay, summary.daysInMonth]);

  const targetY = getY(summary.targetTon);
  const progressBarPct = Math.min(summary.achievementPct, 100);
  const idealBarPct =
    summary.targetTon > 0
      ? Math.min((summary.idealMtdAtLatestDay / summary.targetTon) * 100, 100)
      : 0;

  const latestCoord =
    summary.points.length > 0
      ? {
          x: getX(summary.latestDay),
          y: getY(summary.actualMtdTon),
        }
      : null;

  return (
    <section
      aria-label="Grafik pencapaian harian menuju target bulanan"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden print-container"
    >
      {/* Header */}
      <div className="p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900">
            Grafik Pencapaian Harian Menuju Target Bulanan (10.000 Ton)
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Periode {formatIndonesianMonth(summary.monthKey)}
            <span aria-hidden="true"> · </span>
            Target {formatNumber(summary.targetTon)} Ton
            <span aria-hidden="true"> · </span>
            Laju Ideal {formatNumber(summary.idealDailyTon)} Ton/hari ({summary.daysInMonth} hari)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-700 shrink-0">
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <span className="w-4 h-0.5 bg-blue-700 inline-block" />
            Realisasi Akumulasi
          </span>
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <span className="w-4 border-t-2 border-dashed border-slate-400 inline-block" />
            Laju Ideal ({formatNumber(summary.idealDailyTon)} t/hari)
          </span>
          <span className="inline-flex items-center gap-2 whitespace-nowrap text-emerald-700">
            <span className="w-4 border-t-2 border-dashed border-emerald-600 inline-block" />
            Target 10.000 Ton
          </span>
          <span className="inline-flex items-center gap-2 whitespace-nowrap text-amber-700">
            <span className="w-4 border-t-2 border-dotted border-amber-500 inline-block" />
            Proyeksi Akhir Bulan
          </span>
        </div>
      </div>

      {/* 4-Column Hairline KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border-y border-slate-200 bg-slate-50/60">
        <div className="px-5 py-3.5 space-y-0.5">
          <div className="text-xs text-slate-500">Target Bulanan</div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
            {formatNumber(summary.targetTon)} Ton
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500">
            Ideal {formatNumber(summary.idealDailyTon)} t/hari
          </div>
        </div>

        <div className="px-5 py-3.5 space-y-0.5">
          <div className="text-xs text-slate-500">Realisasi Akumulasi (MTD)</div>
          <div className="text-lg font-bold font-mono tabular-nums text-blue-800">
            {formatNumber(summary.actualMtdTon)} Ton
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-600">
            {summary.achievementPct.toFixed(1)}% dari 10.000 Ton
          </div>
        </div>

        <div className="px-5 py-3.5 space-y-0.5">
          <div className="text-xs text-slate-500">
            {summary.isTargetReached ? 'Surplus Atas Target' : 'Sisa Menuju Target'}
          </div>
          <div
            className={`text-lg font-bold font-mono tabular-nums ${
              summary.isTargetReached ? 'text-emerald-700' : 'text-slate-900'
            }`}
          >
            {summary.isTargetReached
              ? `+${formatNumber(summary.surplusTon)} Ton`
              : `${formatNumber(summary.remainingTon)} Ton`}
          </div>
          <div
            className={`text-[11px] font-mono tabular-nums ${
              summary.paceVarianceTon >= 0 ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {summary.points.length > 0
              ? `${summary.paceVarianceTon >= 0 ? '+' : ''}${formatNumber(
                  summary.paceVarianceTon
                )} t vs laju ideal`
              : 'Belum ada catatan bulan ini'}
          </div>
        </div>

        <div className="px-5 py-3.5 space-y-0.5">
          <div className="text-xs text-slate-500">Kebutuhan Harian Sisa Bulan</div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
            {summary.isTargetReached
              ? 'Tercapai'
              : `${formatNumber(summary.requiredDailyAvgTon)} t/hari`}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500">
            {summary.isTargetReached
              ? '100% target terlewati'
              : summary.points.length > 0
              ? `Sisa ${summary.remainingDays} hari setelah tgl ${summary.latestDay}`
              : `${summary.daysInMonth} hari penuh tersedia`}
          </div>
        </div>
      </div>

      {/* Linear Progress Strip */}
      <div className="px-5 pt-4 pb-3 space-y-1.5 border-b border-slate-100">
        <div className="flex items-center justify-between text-xs text-slate-700 font-mono tabular-nums">
          <span>
            Progres Bulanan: <strong className="text-slate-900">{formatNumber(summary.actualMtdTon)}</strong> /{' '}
            {formatNumber(summary.targetTon)} Ton
          </span>
          <span className="font-bold text-blue-800">
            {summary.achievementPct.toFixed(1)}%
          </span>
        </div>
        <div className="relative w-full h-3 bg-slate-100 rounded-md overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              summary.isTargetReached ? 'bg-emerald-600' : 'bg-blue-700'
            }`}
            style={{ width: `${progressBarPct}%` }}
          />
          {idealBarPct > 0 && idealBarPct < 100 && (
            <div
              title={`Posisi Laju Ideal hari ke-${summary.latestDay}: ${formatNumber(
                summary.idealMtdAtLatestDay
              )} Ton`}
              className="absolute inset-y-0 w-0.5 bg-slate-600"
              style={{ left: `${idealBarPct}%` }}
            />
          )}
        </div>
      </div>

      {/* Interactive SVG Trajectory Chart */}
      <div className="p-4 sm:p-5 space-y-3">
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              className="w-full h-auto block select-none"
              role="img"
              aria-label={`Grafik pencapaian harian menuju target ${formatNumber(
                summary.targetTon
              )} ton`}
              onMouseLeave={() => setHoveredDate(null)}
            >
              <defs>
                <linearGradient id={`mtdFill-${monthKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Soft Target Zone Highlight (>= 10.000 t) */}
              <rect
                x={PAD_LEFT}
                y={PAD_TOP}
                width={PLOT_W}
                height={Math.max(targetY - PAD_TOP, 0)}
                fill="#ecfdf5"
                fillOpacity={0.55}
              />

              {/* Vertical Day Gridlines */}
              {xTicks.map((day) => {
                const x = getX(day);
                return (
                  <g key={`xgrid-${day}`}>
                    <line
                      x1={x}
                      y1={PAD_TOP}
                      x2={x}
                      y2={PAD_TOP + PLOT_H}
                      stroke="#f1f5f9"
                      strokeWidth={1}
                    />
                    <line
                      x1={x}
                      y1={PAD_TOP + PLOT_H}
                      x2={x}
                      y2={PAD_TOP + PLOT_H + 5}
                      stroke="#94a3b8"
                      strokeWidth={1}
                    />
                    <text
                      x={x}
                      y={CHART_HEIGHT - 16}
                      textAnchor="middle"
                      fontSize="13"
                      fontWeight="500"
                      className="fill-slate-600 font-mono tabular-nums"
                    >
                      Tgl {day}
                    </text>
                  </g>
                );
              })}

              {/* Horizontal Grid Lines & Y-Axis Labels */}
              {yTicks.map((tick) => {
                const y = getY(tick);
                const isTargetTick = tick === summary.targetTon;
                return (
                  <g key={`ygrid-${tick}`}>
                    <line
                      x1={PAD_LEFT}
                      y1={y}
                      x2={CHART_WIDTH - PAD_RIGHT}
                      y2={y}
                      stroke={tick === 0 ? '#94a3b8' : '#e2e8f0'}
                      strokeWidth={tick === 0 ? 1.5 : 1}
                    />
                    <text
                      x={PAD_LEFT - 12}
                      y={y + 4.5}
                      textAnchor="end"
                      fontSize="13"
                      fontWeight={isTargetTick ? '700' : '500'}
                      className={`${
                        isTargetTick ? 'fill-emerald-700' : 'fill-slate-600'
                      } font-mono tabular-nums`}
                    >
                      {formatNumber(tick)}
                    </text>
                  </g>
                );
              })}

              {/* Y-Axis Unit Label */}
              <text
                x={PAD_LEFT}
                y={18}
                textAnchor="start"
                fontSize="12"
                fontWeight="600"
                className="fill-slate-500"
              >
                Akumulasi (Ton)
              </text>

              {/* Ideal Linear Pace Trajectory (Day 0 -> Day N) */}
              <line
                x1={getX(0)}
                y1={getY(0)}
                x2={getX(summary.daysInMonth)}
                y2={targetY}
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="6 5"
              />

              {/* Target Bulanan 10.000 Ton Line */}
              <line
                x1={PAD_LEFT}
                y1={targetY}
                x2={CHART_WIDTH - PAD_RIGHT}
                y2={targetY}
                stroke="#059669"
                strokeWidth={2.25}
                strokeDasharray="8 5"
              />
              <rect
                x={CHART_WIDTH - PAD_RIGHT - 178}
                y={targetY - 22}
                width={174}
                height={20}
                rx={4}
                fill="#059669"
              />
              <text
                x={CHART_WIDTH - PAD_RIGHT - 91}
                y={targetY - 8}
                textAnchor="middle"
                fontSize="12"
                fontWeight="700"
                className="fill-white font-mono tabular-nums"
              >
                TARGET: 10.000 TON
              </text>

              {/* Cumulative Actual Area & Line */}
              {trajectoryCoords.length > 1 && (
                <>
                  <path d={areaPath} fill={`url(#mtdFill-${monthKey})`} />
                  <path
                    d={linePath}
                    fill="none"
                    stroke="#1d4ed8"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}

              {/* Current Pace Projection Line to End of Month */}
              {latestCoord &&
                projectedMonthEndTon !== null &&
                summary.latestDay < summary.daysInMonth && (
                  <>
                    <line
                      x1={latestCoord.x}
                      y1={latestCoord.y}
                      x2={getX(summary.daysInMonth)}
                      y2={getY(Math.min(projectedMonthEndTon, yMax))}
                      stroke="#d97706"
                      strokeWidth={2}
                      strokeDasharray="3 4"
                    />
                    <circle
                      cx={getX(summary.daysInMonth)}
                      cy={getY(Math.min(projectedMonthEndTon, yMax))}
                      r={4}
                      fill="#f59e0b"
                    />
                    <text
                      x={getX(summary.daysInMonth) - 8}
                      y={Math.max(getY(Math.min(projectedMonthEndTon, yMax)) - 10, PAD_TOP + 16)}
                      textAnchor="end"
                      fontSize="12"
                      fontWeight="600"
                      className="fill-amber-700 font-mono tabular-nums"
                    >
                      Proyeksi: {formatNumber(projectedMonthEndTon)} t
                    </text>
                  </>
                )}

              {/* Vertical Highlight Guide for Active Point */}
              {activePoint && (
                <line
                  x1={getX(activePoint.day)}
                  y1={PAD_TOP}
                  x2={getX(activePoint.day)}
                  y2={PAD_TOP + PLOT_H}
                  stroke="#93c5fd"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                />
              )}

              {/* Interactive Data Points */}
              {summary.points.map((p) => {
                const cx = getX(p.day);
                const cy = getY(p.mtdTon);
                const isSelected = activePoint?.date === p.date;

                return (
                  <g
                    key={p.date}
                    className={onSelectDate ? 'cursor-pointer' : undefined}
                    onMouseEnter={() => setHoveredDate(p.date)}
                    onClick={() => onSelectDate?.(p.date)}
                  >
                    <rect
                      x={cx - 18}
                      y={PAD_TOP}
                      width={36}
                      height={PLOT_H}
                      fill="transparent"
                    />
                    {isSelected && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={11}
                        fill="#1d4ed8"
                        fillOpacity={0.14}
                      />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isSelected ? 6.5 : 5}
                      fill={isSelected ? '#1d4ed8' : '#ffffff'}
                      stroke="#1d4ed8"
                      strokeWidth={2.5}
                    />
                  </g>
                );
              })}

              {/* Callout Label Box on Active Point inside SVG */}
              {activePoint && (() => {
                const cx = getX(activePoint.day);
                const cy = getY(activePoint.mtdTon);
                const boxW = 204;
                const boxH = 58;
                const placeLeft = cx + boxW + 18 > CHART_WIDTH - PAD_RIGHT;
                const boxX = placeLeft ? Math.max(cx - boxW - 14, PAD_LEFT + 4) : cx + 14;
                const boxY = Math.min(Math.max(cy - boxH / 2, PAD_TOP + 6), PAD_TOP + PLOT_H - boxH - 6);

                return (
                  <g className="pointer-events-none">
                    <rect
                      x={boxX}
                      y={boxY}
                      width={boxW}
                      height={boxH}
                      rx={8}
                      fill="#0f172a"
                      fillOpacity={0.95}
                    />
                    <text
                      x={boxX + 12}
                      y={boxY + 20}
                      fontSize="12.5"
                      fontWeight="700"
                      className="fill-white"
                    >
                      {formatIndonesianShortDate(activePoint.date)} ({activePoint.achievementPct.toFixed(1)}%)
                    </text>
                    <text
                      x={boxX + 12}
                      y={boxY + 38}
                      fontSize="12"
                      className="fill-blue-200 font-mono tabular-nums"
                    >
                      Akumulasi: {formatNumber(activePoint.mtdTon)} t
                    </text>
                    <text
                      x={boxX + 12}
                      y={boxY + 52}
                      fontSize="11.5"
                      className="fill-teal-300 font-mono tabular-nums"
                    >
                      Harian: +{formatNumber(activePoint.dailyTon)} t
                    </text>
                  </g>
                );
              })()}
            </svg>
          </div>
        </div>

        {/* Clear Active Day Detail Footer */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          {activePoint ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">
                  {formatIndonesianShortDate(activePoint.date)}
                </span>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="font-mono tabular-nums">
                  Pengiriman Hari Ini:{' '}
                  <strong className="text-teal-700">+{formatNumber(activePoint.dailyTon)} t</strong>{' '}
                  (JKT {formatNumber(activePoint.dailyJkt)} t, SMG {formatNumber(activePoint.dailySmg)} t)
                </span>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="font-mono tabular-nums">
                  Sisa Target:{' '}
                  <strong className="text-slate-900">
                    {formatNumber(Math.max(summary.targetTon - activePoint.mtdTon, 0))} t
                  </strong>
                </span>
              </div>
              <div className="font-mono tabular-nums">
                Laju Ideal Tgl {activePoint.day}: {formatNumber(activePoint.idealMtdTon)} t (
                <span className={activePoint.paceDiffTon >= 0 ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                  {activePoint.paceDiffTon >= 0 ? '+' : ''}
                  {formatNumber(activePoint.paceDiffTon)} t
                </span>
                )
              </div>
            </>
          ) : (
            <span>
              Belum ada laporan pengiriman untuk periode {formatIndonesianMonth(summary.monthKey)}.
            </span>
          )}
        </div>
      </div>
    </section>
  );
};
