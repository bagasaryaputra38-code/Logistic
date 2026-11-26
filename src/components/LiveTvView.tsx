import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Tv,
  UserCheck,
} from 'lucide-react';
import {
  calculateDriverDuration,
  calculateLiveDriverTimer,
} from '../services/driverLogService';
import { DriverLogEntry } from '../types/delivery';
import { formatIndonesianDate, formatIndonesianShortDate } from '../utils/deliveryCalculations';

interface LiveTvViewProps {
  entries: DriverLogEntry[];
  isLoading: boolean;
  onGoToDataSupir: () => void;
}

type LiveTvFilter = 'all' | 'pending_do' | 'over_2h';

const PAGE_SIZE = 8;
const AUTO_ROTATE_MS = 10000;

function formatClockWib(nowMs: number): string {
  const d = new Date(nowMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function getTodayDateString(nowMs: number): string {
  const d = new Date(nowMs);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getEntryStartEpochMs(entry: DriverLogEntry): number {
  if (!entry.tanggal || !entry.jamMasuk) return Number.MAX_SAFE_INTEGER;
  const [y, m, d] = entry.tanggal.split('-').map(Number);
  const [hh, mm] = entry.jamMasuk.split(':').map(Number);
  const ms = new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

export const LiveTvView: React.FC<LiveTvViewProps> = ({
  entries,
  isLoading,
  onGoToDataSupir,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [filter, setFilter] = useState<LiveTvFilter>('all');
  const [isTvExpanded, setIsTvExpanded] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);

  // Live 1-second tick for digital wall clock and all running driver timers
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Sync browser fullscreen exit (e.g. pressing Esc)
  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement) {
        setIsTvExpanded(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTvExpanded && !document.fullscreenElement) {
        setIsTvExpanded(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTvExpanded]);

  const toggleTvMode = async () => {
    const next = !isTvExpanded;
    setIsTvExpanded(next);
    if (next) {
      try {
        if (containerRef.current && document.fullscreenEnabled && !document.fullscreenElement) {
          await containerRef.current.requestFullscreen();
        }
      } catch {
        // Fallback to fixed viewport expansion inside iframe
      }
    } else {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
      } catch {
        // Ignore if fullscreen was not active
      }
    }
  };

  // Strictly active/running driver entries (Jam Masuk present & Jam Keluar not yet filled)
  const runningRows = useMemo(() => {
    return entries
      .filter((item) => Boolean(item.jamMasuk && !item.jamKeluar))
      .map((item) => {
        const totalLive = calculateLiveDriverTimer(item.tanggal, item.jamMasuk, nowMs);
        const doDuration = item.jamSelesaiDo
          ? calculateDriverDuration(item.jamMasuk, item.jamSelesaiDo)
          : null;
        const doLive = doDuration
          ? null
          : calculateLiveDriverTimer(item.tanggal, item.jamMasuk, nowMs);
        const isOverTwoHours = Boolean(
          (totalLive && !totalLive.isPendingStart && totalLive.isOverTwoHours) ||
            (doDuration && doDuration.isOverTwoHours)
        );
        return {
          entry: item,
          totalLive,
          doDuration,
          doLive,
          isOverTwoHours,
          startEpochMs: getEntryStartEpochMs(item),
        };
      })
      .sort((a, b) => a.startEpochMs - b.startEpochMs);
  }, [entries, nowMs]);

  const stats = useMemo(() => {
    let pendingDoCount = 0;
    let overTwoHoursCount = 0;
    for (const row of runningRows) {
      if (!row.entry.jamSelesaiDo) pendingDoCount += 1;
      if (row.isOverTwoHours) overTwoHoursCount += 1;
    }
    return {
      totalRunning: runningRows.length,
      pendingDoCount,
      doDoneCount: runningRows.length - pendingDoCount,
      overTwoHoursCount,
    };
  }, [runningRows]);

  const filteredRows = useMemo(() => {
    if (filter === 'pending_do') {
      return runningRows.filter((r) => !r.entry.jamSelesaiDo);
    }
    if (filter === 'over_2h') {
      return runningRows.filter((r) => r.isOverTwoHours);
    }
    return runningRows;
  }, [runningRows, filter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePageIndex = pageIndex % totalPages;

  useEffect(() => {
    setPageIndex(0);
  }, [filter]);

  useEffect(() => {
    if (!autoRotate || totalPages <= 1) return;
    const id = window.setInterval(() => {
      setPageIndex((prev) => (prev + 1) % totalPages);
    }, AUTO_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [autoRotate, totalPages]);

  const visibleRows = useMemo(() => {
    const start = safePageIndex * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safePageIndex]);

  const todayStr = getTodayDateString(nowMs);
  const clockText = formatClockWib(nowMs);

  return (
    <div
      ref={containerRef}
      className={`${
        isTvExpanded
          ? 'fixed inset-0 z-50 bg-slate-950 p-4 sm:p-6 overflow-y-auto flex flex-col'
          : 'rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden shadow-sm'
      } text-slate-100`}
    >
      {/* TV Broadcast Top Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-5 py-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="bg-white rounded-lg px-2.5 py-1.5 shrink-0">
            <div className="h-8 w-28 overflow-hidden flex items-center justify-center">
              <img
                src="/assets/aistudio/image_d1d507a0.png"
                alt="logistic PT FUMIRA"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-[center_52%] scale-[1.2]"
              />
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Live TV Operasional Supir</span>
              <span aria-hidden="true">·</span>
              <span>{formatIndonesianDate(todayStr)}</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white truncate">
              Monitor Antrean &amp; Durasi Kendaraan Berjalan
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between xl:justify-end gap-4 sm:gap-6">
          {/* Summary Metrics */}
          <div className="flex items-center gap-5 text-sm tabular-nums">
            <div>
              <div className="text-[11px] text-slate-400">Sedang Berjalan</div>
              <div className="text-xl font-bold font-mono text-white">
                {stats.totalRunning}
              </div>
            </div>
            <div className="h-8 w-px bg-slate-800" aria-hidden="true" />
            <div>
              <div className="text-[11px] text-slate-400">Proses DO</div>
              <div className="text-xl font-bold font-mono text-yellow-300">
                {stats.pendingDoCount}
              </div>
            </div>
            <div className="h-8 w-px bg-slate-800" aria-hidden="true" />
            <div>
              <div className="text-[11px] text-slate-400">Di Atas 2 Jam</div>
              <div
                className={`text-xl font-bold font-mono ${
                  stats.overTwoHoursCount > 0 ? 'text-red-400' : 'text-slate-300'
                }`}
              >
                {stats.overTwoHoursCount}
              </div>
            </div>
          </div>

          {/* Live Wall Clock */}
          <div className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-right shrink-0">
            <div className="text-[10px] text-slate-400">Waktu Sekarang</div>
            <div className="text-xl sm:text-2xl font-mono font-bold tracking-wider tabular-nums text-white">
              {clockText}
            </div>
          </div>
        </div>
      </div>

      {/* TV Control Strip */}
      <div className="bg-slate-900/60 border-b border-slate-800 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
              filter === 'all'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Semua Berjalan ({stats.totalRunning})
          </button>
          <button
            type="button"
            onClick={() => setFilter('pending_do')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
              filter === 'pending_do'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Menunggu Selesai DO ({stats.pendingDoCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('over_2h')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
              filter === 'over_2h'
                ? 'bg-red-950 text-red-200 border border-red-800/70'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Melebihi 2 Jam ({stats.overTwoHoursCount})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {totalPages > 1 && (
            <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 tabular-nums">
              <span>
                Halaman {safePageIndex + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setAutoRotate((v) => !v)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white cursor-pointer whitespace-nowrap"
              >
                {autoRotate ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                {autoRotate ? 'Jeda' : 'Putar'}
              </button>
              <button
                type="button"
                onClick={() => setPageIndex((p) => (p + 1) % totalPages)}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white cursor-pointer whitespace-nowrap"
              >
                Berikutnya
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={toggleTvMode}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {isTvExpanded ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                Keluar Layar Penuh
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                Tampilan Layar Penuh
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main TV Board Body */}
      <div className="flex-1 bg-slate-950">
        {isLoading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[0, 1, 2, 3].map((idx) => (
              <div key={idx} className="h-16 bg-slate-900 rounded-xl border border-slate-800" />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <Tv className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">
              {runningRows.length === 0
                ? 'Tidak ada data supir yang sedang berjalan'
                : 'Tidak ada data supir untuk filter ini'}
            </h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              {runningRows.length === 0
                ? 'Kendaraan dengan Jam Masuk yang belum memiliki Jam Keluar akan tampil otomatis secara real-time di layar ini.'
                : 'Pilih filter Semua Berjalan untuk melihat seluruh kendaraan aktif.'}
            </p>
            <div className="pt-2">
              {runningRows.length === 0 ? (
                <button
                  type="button"
                  onClick={onGoToDataSupir}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  <UserCheck className="w-4 h-4" />
                  Buka Input Data Supir
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  Tampilkan Semua Berjalan
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/90 border-b border-slate-800 text-xs font-semibold text-slate-400 whitespace-nowrap">
                  <th className="py-3.5 px-4 text-center">No</th>
                  <th className="py-3.5 px-4">No Mobil &amp; Armada</th>
                  <th className="py-3.5 px-4">Supir &amp; Transporter</th>
                  <th className="py-3.5 px-4">Jam Masuk</th>
                  <th className="py-3.5 px-4">Durasi Timer DO</th>
                  <th className="py-3.5 px-4">Durasi Timer Total</th>
                  <th className="py-3.5 px-4">Status &amp; Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/90">
                {visibleRows.map(({ entry, totalLive, doDuration, doLive }) => {
                  const isOtherDay = entry.tanggal !== todayStr;

                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-slate-900/60 transition-colors"
                    >
                      {/* No */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        <span className="font-mono text-lg font-bold tabular-nums text-slate-200">
                          #{entry.no}
                        </span>
                      </td>

                      {/* No Mobil & Jenis */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="font-mono text-lg sm:text-xl font-bold tracking-wide text-white">
                          {entry.noMobil}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {entry.jenisKendaraan}
                        </div>
                      </td>

                      {/* Supir & Transporter */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="text-base font-semibold text-slate-100">
                          {entry.supir}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {entry.transporter}
                        </div>
                      </td>

                      {/* Jam Masuk */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="font-mono text-lg font-semibold tabular-nums text-slate-100">
                          {entry.jamMasuk}
                        </div>
                        {isOtherDay && (
                          <div className="text-xs text-slate-400 mt-0.5">
                            {formatIndonesianShortDate(entry.tanggal)}
                          </div>
                        )}
                      </td>

                      {/* Durasi Timer DO */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        {doDuration ? (
                          <div className="space-y-1">
                            <span
                              className={`inline-flex items-center gap-2 px-3 py-1 rounded-md border text-sm font-semibold tabular-nums ${
                                doDuration.isOverTwoHours
                                  ? 'bg-red-500/20 border-red-400/60 text-red-200'
                                  : 'bg-yellow-400/15 border-yellow-400/50 text-yellow-200'
                              }`}
                            >
                              {doDuration.formatted}
                            </span>
                            <div className="text-xs text-slate-400 font-mono tabular-nums">
                              Selesai DO {entry.jamSelesaiDo}
                            </div>
                          </div>
                        ) : doLive ? (
                          doLive.isPendingStart ? (
                            <span className="text-xs text-slate-400">
                              Menunggu {entry.jamMasuk}
                            </span>
                          ) : (
                            <div className="space-y-1">
                              <span
                                className={`inline-flex items-center gap-2 px-3 py-1 rounded-md border text-base sm:text-lg font-mono font-bold tabular-nums ${
                                  doLive.isOverTwoHours
                                    ? 'bg-red-500/20 border-red-400/60 text-red-200'
                                    : 'bg-yellow-400/15 border-yellow-400/50 text-yellow-200'
                                }`}
                              >
                                <Clock className="w-4 h-4 shrink-0" />
                                {doLive.clockText}
                              </span>
                              <div
                                className={`text-xs font-medium ${
                                  doLive.isOverTwoHours ? 'text-red-300' : 'text-yellow-300'
                                }`}
                              >
                                Proses DO · {doLive.isOverTwoHours ? '> 2 jam' : '< 2 jam'}
                              </div>
                            </div>
                          )
                        ) : (
                          <span className="text-xs text-slate-500">-</span>
                        )}
                      </td>

                      {/* Durasi Timer Total */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        {totalLive ? (
                          totalLive.isPendingStart ? (
                            <span className="text-xs text-slate-400">
                              Menunggu {entry.jamMasuk}
                            </span>
                          ) : (
                            <div className="space-y-1">
                              <span
                                className={`inline-flex items-center gap-2 px-3 py-1 rounded-md border text-base sm:text-lg font-mono font-bold tabular-nums ${
                                  totalLive.isOverTwoHours
                                    ? 'bg-red-500/20 border-red-400/60 text-red-200'
                                    : 'bg-yellow-400/15 border-yellow-400/50 text-yellow-200'
                                }`}
                              >
                                <Clock className="w-4 h-4 shrink-0" />
                                {totalLive.clockText}
                              </span>
                              <div
                                className={`text-xs font-medium ${
                                  totalLive.isOverTwoHours ? 'text-red-300' : 'text-yellow-300'
                                }`}
                              >
                                {totalLive.isOverTwoHours ? 'Di atas 2 jam' : 'Di bawah 2 jam'}
                              </div>
                            </div>
                          )
                        ) : (
                          <span className="text-xs text-slate-500">-</span>
                        )}
                      </td>

                      {/* Status & Keterangan */}
                      <td className="py-4 px-4 min-w-[180px] max-w-xs">
                        <div className="text-xs font-semibold text-slate-200">
                          {entry.jamSelesaiDo
                            ? `DO Selesai (${entry.jamSelesaiDo}) · Menunggu Keluar`
                            : 'Sedang Proses DO'}
                        </div>
                        {entry.keterangan && (
                          <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                            {entry.keterangan}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom Real-Data Legend & Quick Footer */}
      <div className="bg-slate-900 border-t border-slate-800 px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-4">
          <span>
            Kuning: di bawah 2 jam
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Merah: di atas 2 jam
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Sinkron otomatis dengan Input Data Supir
          </span>
        </div>
        <button
          type="button"
          onClick={onGoToDataSupir}
          className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          Kelola di Input Data Supir →
        </button>
      </div>
    </div>
  );
};
