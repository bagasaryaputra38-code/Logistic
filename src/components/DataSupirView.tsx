import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FileSpreadsheet,
  RefreshCw,
  Save,
  Search,
  Timer,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  calculateDriverDuration,
  calculateLiveDriverTimer,
  exportDriverLogsCsv,
  exportDriverLogsXlsx,
  formatAverageDurationMinutes,
  getNextDriverNoForDate,
} from '../services/driverLogService';
import {
  DRIVER_VEHICLE_TYPES,
  DriverLogEntry,
  DriverLogFormState,
  SURAT_JALAN_VENDORS,
  VALIDATION_LIMITS,
} from '../types/delivery';
import {
  formatIndonesianDate,
  formatIndonesianShortDate,
} from '../utils/deliveryCalculations';

interface DataSupirViewProps {
  entries: DriverLogEntry[];
  onSave: (form: DriverLogFormState, existing?: DriverLogEntry | null) => Promise<void>;
  onDelete: (entry: DriverLogEntry) => Promise<void>;
  onClearAll: () => Promise<void>;
  isLoading: boolean;
}

function getCurrentTimeHHMM(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function getLocalDateYYYYMMDD(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const TRANSPORTER_SUGGESTIONS = SURAT_JALAN_VENDORS.filter((v) => v !== 'Lainnya');

export const DataSupirView: React.FC<DataSupirViewProps> = ({
  entries,
  onSave,
  onDelete,
  onClearAll,
  isLoading,
}) => {
  const todayStr = getLocalDateYYYYMMDD();

  const [tanggal, setTanggal] = useState<string>(todayStr);
  const [jamMasuk, setJamMasuk] = useState<string>(() => getCurrentTimeHHMM());
  const [jamKeluar, setJamKeluar] = useState<string>('');
  const [noMobil, setNoMobil] = useState<string>('');
  const [supir, setSupir] = useState<string>('');
  const [jenisKendaraan, setJenisKendaraan] = useState<string>('');
  const [transporter, setTransporter] = useState<string>('');
  const [keterangan, setKeterangan] = useState<string>('');
  const [editingEntry, setEditingEntry] = useState<DriverLogEntry | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickBusyId, setQuickBusyId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const noMobilInputRef = useRef<HTMLInputElement | null>(null);

  // Sequential number automatically refreshes back to 1 whenever date switches to a date with no entries
  const previewNo = useMemo(() => {
    if (editingEntry && editingEntry.tanggal === tanggal) {
      return editingEntry.no;
    }
    return getNextDriverNoForDate(entries, tanggal);
  }, [entries, tanggal, editingEntry]);

  const countOnSelectedDate = useMemo(
    () => entries.filter((e) => e.tanggal === tanggal).length,
    [entries, tanggal]
  );

  const filteredEntries = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return entries.filter((item) => {
      if (filterDate && item.tanggal !== filterDate) return false;
      if (!q) return true;
      return (
        String(item.no).includes(q) ||
        item.tanggal.includes(q) ||
        formatIndonesianDate(item.tanggal).toLowerCase().includes(q) ||
        item.noMobil.toLowerCase().includes(q) ||
        item.supir.toLowerCase().includes(q) ||
        item.jenisKendaraan.toLowerCase().includes(q) ||
        item.transporter.toLowerCase().includes(q) ||
        item.keterangan.toLowerCase().includes(q)
      );
    });
  }, [entries, searchTerm, filterDate]);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const hasActiveTimers = useMemo(() => {
    const hasActiveForm = Boolean(jamMasuk.trim() && !jamKeluar.trim());
    const hasActiveRow = entries.some((e) => Boolean(e.jamMasuk && !e.jamKeluar));
    return hasActiveForm || hasActiveRow;
  }, [entries, jamMasuk, jamKeluar]);

  useEffect(() => {
    if (!hasActiveTimers) return;
    setNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [hasActiveTimers]);

  const formDuration = useMemo(
    () => calculateDriverDuration(jamMasuk, jamKeluar),
    [jamMasuk, jamKeluar]
  );

  const formLiveTimer = useMemo(
    () => (jamKeluar.trim() ? null : calculateLiveDriverTimer(tanggal, jamMasuk, nowMs)),
    [tanggal, jamMasuk, jamKeluar, nowMs]
  );

  const activeTimerStats = useMemo(() => {
    let totalActive = 0;
    let overTwoHours = 0;
    for (const item of filteredEntries) {
      if (!item.jamKeluar && item.jamMasuk) {
        const live = calculateLiveDriverTimer(item.tanggal, item.jamMasuk, nowMs);
        if (live && !live.isPendingStart) {
          totalActive += 1;
          if (live.isOverTwoHours) overTwoHours += 1;
        }
      }
    }
    return { totalActive, overTwoHours };
  }, [filteredEntries, nowMs]);

  const avgDurationSummary = useMemo(() => {
    const completed = filteredEntries
      .map((item) => calculateDriverDuration(item.jamMasuk, item.jamKeluar))
      .filter((d): d is NonNullable<typeof d> => d !== null);
    if (completed.length === 0) return null;
    const totalMin = completed.reduce((sum, d) => sum + d.totalMinutes, 0);
    return {
      count: completed.length,
      label: formatAverageDurationMinutes(totalMin / completed.length),
    };
  }, [filteredEntries]);

  const resetFormAfterSave = () => {
    setJamMasuk(getCurrentTimeHHMM());
    setJamKeluar('');
    setNoMobil('');
    setSupir('');
    setJenisKendaraan('');
    setTransporter('');
    setKeterangan('');
    setEditingEntry(null);
    setTimeout(() => {
      noMobilInputRef.current?.focus();
    }, 50);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!VALIDATION_LIMITS.DATE_REGEX.test(tanggal)) {
      setStatusMsg({ type: 'err', text: 'Format Hari / Tanggal tidak valid.' });
      return;
    }
    if (!noMobil.trim()) {
      setStatusMsg({ type: 'err', text: 'No Mobil wajib diisi.' });
      noMobilInputRef.current?.focus();
      return;
    }
    if (!supir.trim()) {
      setStatusMsg({ type: 'err', text: 'Nama Supir wajib diisi.' });
      return;
    }
    if (!jenisKendaraan.trim()) {
      setStatusMsg({ type: 'err', text: 'Jenis Kendaraan wajib diisi.' });
      return;
    }
    if (!transporter.trim()) {
      setStatusMsg({ type: 'err', text: 'Transporter wajib diisi.' });
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(
        {
          tanggal,
          jamMasuk: jamMasuk.trim(),
          jamKeluar: jamKeluar.trim(),
          noMobil: noMobil.trim().toUpperCase(),
          supir: supir.trim(),
          jenisKendaraan: jenisKendaraan.trim(),
          transporter: transporter.trim(),
          keterangan: keterangan.trim(),
        },
        editingEntry
      );
      setStatusMsg({
        type: 'ok',
        text: editingEntry
          ? `Data supir ${supir.trim()} (${noMobil.trim().toUpperCase()}) berhasil diperbarui.`
          : `Data supir No. ${previewNo} (${noMobil.trim().toUpperCase()}) berhasil disimpan.`,
      });
      resetFormAfterSave();
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menyimpan data supir.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (entry: DriverLogEntry) => {
    setEditingEntry(entry);
    setTanggal(entry.tanggal);
    setJamMasuk(entry.jamMasuk);
    setJamKeluar(entry.jamKeluar);
    setNoMobil(entry.noMobil);
    setSupir(entry.supir);
    setJenisKendaraan(entry.jenisKendaraan);
    setTransporter(entry.transporter);
    setKeterangan(entry.keterangan);
    setStatusMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingEntry(null);
    setTanggal(todayStr);
    setJamMasuk(getCurrentTimeHHMM());
    setJamKeluar('');
    setNoMobil('');
    setSupir('');
    setJenisKendaraan('');
    setTransporter('');
    setKeterangan('');
    setStatusMsg(null);
  };

  const handleQuickClockOut = async (entry: DriverLogEntry) => {
    setQuickBusyId(entry.id);
    setStatusMsg(null);
    try {
      const nowTime = getCurrentTimeHHMM();
      await onSave(
        {
          tanggal: entry.tanggal,
          jamMasuk: entry.jamMasuk,
          jamKeluar: nowTime,
          noMobil: entry.noMobil,
          supir: entry.supir,
          jenisKendaraan: entry.jenisKendaraan,
          transporter: entry.transporter,
          keterangan: entry.keterangan,
        },
        entry
      );
    } finally {
      setQuickBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
            <span>Log Kedatangan &amp; Keberangkatan Supir</span>
            <span aria-hidden="true">·</span>
            <span>Total Tercatat: {entries.length}</span>
            <span aria-hidden="true">·</span>
            <span>
              Tanggal {formatIndonesianShortDate(tanggal)}: {countOnSelectedDate} kendaraan
            </span>
            {activeTimerStats.totalActive > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                  <Timer className="w-3.5 h-3.5 text-slate-500" />
                  Timer Aktif: {activeTimerStats.totalActive}
                  {activeTimerStats.overTwoHours > 0 && (
                    <span className="font-semibold text-red-700">
                      ({activeTimerStats.overTwoHours} &gt; 2 jam)
                    </span>
                  )}
                </span>
              </>
            )}
            {avgDurationSummary && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-blue-700">
                  Rata-rata Durasi: {avgDurationSummary.label} ({avgDurationSummary.count} data)
                </span>
              </>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-900">Input Data Supir</h2>
        </div>

        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 shrink-0">
          <div className="text-xs text-slate-500">
            <div>No Urut Input ({formatIndonesianShortDate(tanggal)})</div>
            <div className="text-[11px] text-slate-400">
              Reset otomatis ke No. 1 tiap ganti tanggal
            </div>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-blue-700">
            #{previewNo}
          </div>
        </div>
      </div>

      {/* Input Form Card */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <UserCheck className="w-4 h-4 text-blue-700 shrink-0" />
            <h3 className="text-base font-semibold text-slate-900">
              {editingEntry
                ? `Edit Data Supir (No. ${editingEntry.no} — ${editingEntry.noMobil})`
                : 'Formulir Input Data Supir'}
            </h3>
          </div>
          {editingEntry && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Batal Edit
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <datalist id="driver-vehicle-types">
            {DRIVER_VEHICLE_TYPES.map((vt) => (
              <option key={vt} value={vt} />
            ))}
          </datalist>
          <datalist id="driver-transporter-list">
            {TRANSPORTER_SUGGESTIONS.map((tr) => (
              <option key={tr} value={tr} />
            ))}
          </datalist>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* No Urut (Auto per Tanggal) */}
            <div className="space-y-1.5">
              <label
                htmlFor="drv-no"
                className="block text-xs font-semibold text-slate-700"
              >
                No (Otomatis per Tanggal)
              </label>
              <input
                id="drv-no"
                type="text"
                readOnly
                value={`No. ${previewNo}`}
                className="w-full h-11 px-3.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-mono font-bold tabular-nums text-blue-800 focus:outline-none"
              />
              <p className="text-[11px] text-slate-400">
                Kembali ke No. 1 saat ganti tanggal baru
              </p>
            </div>

            {/* Hari / Tanggal */}
            <div className="space-y-1.5">
              <label
                htmlFor="drv-tanggal"
                className="block text-xs font-semibold text-slate-700"
              >
                Hari / Tanggal
              </label>
              <input
                id="drv-tanggal"
                type="date"
                required
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
              />
              <p className="text-[11px] font-medium text-slate-600">
                {formatIndonesianDate(tanggal)}
              </p>
            </div>

            {/* Jam Masuk */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="drv-jam-masuk"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Jam Masuk
                </label>
                <button
                  type="button"
                  onClick={() => setJamMasuk(getCurrentTimeHHMM())}
                  className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
                >
                  Sekarang
                </button>
              </div>
              <input
                id="drv-jam-masuk"
                type="time"
                value={jamMasuk}
                onChange={(e) => setJamMasuk(e.target.value)}
                className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            {/* Jam Keluar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="drv-jam-keluar"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Jam Keluar (Opsional)
                </label>
                <div className="flex items-center gap-2">
                  {jamKeluar && (
                    <button
                      type="button"
                      onClick={() => setJamKeluar('')}
                      className="text-[11px] font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Kosongkan
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setJamKeluar(getCurrentTimeHHMM())}
                    className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
                  >
                    Sekarang
                  </button>
                </div>
              </div>
              <input
                id="drv-jam-keluar"
                type="time"
                value={jamKeluar}
                onChange={(e) => setJamKeluar(e.target.value)}
                className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
              />
              {formDuration ? (
                <p
                  className={`text-[11px] font-semibold tabular-nums inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${
                    formDuration.isOverTwoHours
                      ? 'bg-red-100/80 border-red-300 text-red-800'
                      : 'bg-yellow-100/80 border-yellow-400 text-yellow-900'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      formDuration.isOverTwoHours ? 'bg-red-600' : 'bg-yellow-500'
                    }`}
                  />
                  Durasi: {formDuration.formatted} ({formDuration.rangeLabel}
                  {formDuration.isOvernight ? ', +1 hari' : ''})
                </p>
              ) : formLiveTimer ? (
                formLiveTimer.isPendingStart ? (
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    Timer menunggu jam masuk ({jamMasuk})
                  </p>
                ) : (
                  <p
                    className={`text-[11px] font-mono font-semibold tabular-nums inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${
                      formLiveTimer.isOverTwoHours
                        ? 'bg-red-100/80 border-red-300 text-red-800'
                        : 'bg-yellow-100/80 border-yellow-400 text-yellow-900'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                        formLiveTimer.isOverTwoHours ? 'bg-red-600' : 'bg-yellow-500'
                      }`}
                    />
                    Timer: {formLiveTimer.clockText} (
                    {formLiveTimer.isOverTwoHours ? '> 2 jam' : '< 2 jam'})
                  </p>
                )
              ) : (
                <p className="text-[11px] text-slate-400">
                  Durasi dihitung otomatis saat jam masuk &amp; keluar terisi
                </p>
              )}
            </div>

            {/* No Mobil */}
            <div className="space-y-1.5">
              <label
                htmlFor="drv-nomobil"
                className="block text-xs font-semibold text-slate-700"
              >
                No Mobil
              </label>
              <input
                ref={noMobilInputRef}
                id="drv-nomobil"
                type="text"
                required
                maxLength={VALIDATION_LIMITS.MAX_NO_MOBIL_LENGTH}
                placeholder="Contoh: B 9123 KXT"
                value={noMobil}
                onChange={(e) => setNoMobil(e.target.value.toUpperCase())}
                className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-mono font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            {/* Supir */}
            <div className="space-y-1.5">
              <label
                htmlFor="drv-supir"
                className="block text-xs font-semibold text-slate-700"
              >
                Supir
              </label>
              <input
                id="drv-supir"
                type="text"
                required
                maxLength={VALIDATION_LIMITS.MAX_SUPIR_LENGTH}
                placeholder="Nama supir"
                value={supir}
                onChange={(e) => setSupir(e.target.value)}
                className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            {/* Jenis Kendaraan */}
            <div className="space-y-1.5">
              <label
                htmlFor="drv-jenis"
                className="block text-xs font-semibold text-slate-700"
              >
                Jenis Kendaraan
              </label>
              <input
                id="drv-jenis"
                type="text"
                list="driver-vehicle-types"
                required
                maxLength={VALIDATION_LIMITS.MAX_JENIS_KENDARAAN_LENGTH}
                placeholder="Pilih / ketik (CDD, Fuso, Tronton...)"
                value={jenisKendaraan}
                onChange={(e) => setJenisKendaraan(e.target.value)}
                className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            {/* Transporter */}
            <div className="space-y-1.5">
              <label
                htmlFor="drv-transporter"
                className="block text-xs font-semibold text-slate-700"
              >
                Transporter
              </label>
              <input
                id="drv-transporter"
                type="text"
                list="driver-transporter-list"
                required
                maxLength={VALIDATION_LIMITS.MAX_TRANSPORTER_LENGTH}
                placeholder="Pilih / ketik nama transporter"
                value={transporter}
                onChange={(e) => setTransporter(e.target.value)}
                className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            {/* Keterangan */}
            <div className="sm:col-span-2 lg:col-span-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="drv-keterangan"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Keterangan (Opsional)
                </label>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {keterangan.length}/{VALIDATION_LIMITS.MAX_KETERANGAN_LENGTH}
                </span>
              </div>
              <input
                id="drv-keterangan"
                type="text"
                maxLength={VALIDATION_LIMITS.MAX_KETERANGAN_LENGTH}
                placeholder="Contoh: Muat tujuan Semarang / Proyek / Catatan gate..."
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          {statusMsg && (
            <div
              className={`rounded-lg px-3.5 py-2.5 text-xs font-medium flex items-center gap-2 border ${
                statusMsg.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {statusMsg.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            {editingEntry && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="h-11 px-4 border border-slate-200 bg-white text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-11 inline-flex items-center justify-center gap-2 px-5 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {isSubmitting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSubmitting
                ? 'Menyimpan...'
                : editingEntry
                  ? 'Perbarui Data Supir'
                  : `Simpan Data Supir (No. ${previewNo})`}
            </button>
          </div>
        </form>
      </section>

      {/* Daftar List Data Supir */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari no mobil, supir, transporter..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-xs sm:text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <input
                aria-label="Filter tanggal"
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setFilterDate(filterDate === todayStr ? '' : todayStr)}
                className={`h-9 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  filterDate === todayStr
                    ? 'border-blue-700 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Hari Ini
              </button>
              {filterDate && filterDate !== todayStr && (
                <button
                  type="button"
                  onClick={() => setFilterDate('')}
                  className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  Semua Tanggal
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={filteredEntries.length === 0}
              onClick={() => exportDriverLogsCsv(filteredEntries)}
              className="inline-flex items-center gap-1.5 h-9 px-3 border border-slate-200 bg-white text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>

            <button
              type="button"
              disabled={filteredEntries.length === 0}
              onClick={() => exportDriverLogsXlsx(filteredEntries)}
              className="inline-flex items-center gap-1.5 h-9 px-3 border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-medium rounded-lg hover:bg-emerald-100 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Excel
            </button>

            {entries.length > 0 &&
              (confirmClearAll ? (
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    disabled={clearingAll}
                    onClick={async () => {
                      setClearingAll(true);
                      try {
                        await onClearAll();
                        setConfirmClearAll(false);
                      } finally {
                        setClearingAll(false);
                      }
                    }}
                    className="h-9 px-2.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 cursor-pointer whitespace-nowrap"
                  >
                    {clearingAll ? 'Menghapus...' : 'Ya, Hapus Semua'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="h-9 px-2.5 border border-slate-200 bg-white text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="inline-flex items-center gap-1 h-9 px-3 border border-red-200 bg-red-50 text-red-700 text-xs font-medium rounded-lg hover:bg-red-100 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Kosongkan
                </button>
              ))}
          </div>
        </div>

        {/* Color Legend Strip for Durasi Timer */}
        <div className="px-4 py-2 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium text-slate-700">Keterangan Warna Durasi Timer:</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-yellow-400 bg-yellow-100/80 text-yellow-900 font-medium">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              Di bawah 2 jam (&lt; 2 jam)
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-red-300 bg-red-100/80 text-red-800 font-medium">
              <span className="w-2 h-2 rounded-full bg-red-600" />
              Di atas 2 jam (&gt; 2 jam)
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            Timer berjalan otomatis saat Jam Keluar belum diisi
          </span>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 bg-slate-100 rounded-lg" />
            ))}
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-700">
              {entries.length === 0
                ? 'Belum ada data supir tersimpan.'
                : 'Tidak ada data supir yang cocok dengan filter.'}
            </p>
            <p className="text-xs text-slate-500">
              {entries.length === 0
                ? 'Lengkapi formulir di atas lalu klik Simpan Data Supir.'
                : 'Ubah kata kunci pencarian atau pilih Semua Tanggal.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 whitespace-nowrap">
                  <th className="py-3 px-4 text-center">No</th>
                  <th className="py-3 px-4">Hari / Tanggal</th>
                  <th className="py-3 px-4">Jam Masuk</th>
                  <th className="py-3 px-4">Jam Keluar</th>
                  <th className="py-3 px-4">Durasi Timer</th>
                  <th className="py-3 px-4">No Mobil</th>
                  <th className="py-3 px-4">Supir</th>
                  <th className="py-3 px-4">Jenis Kendaraan</th>
                  <th className="py-3 px-4">Transporter</th>
                  <th className="py-3 px-4">Keterangan</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredEntries.map((item) => {
                  const isConfirming = confirmDeleteId === item.id;
                  const isClockBusy = quickBusyId === item.id;
                  const duration = calculateDriverDuration(item.jamMasuk, item.jamKeluar);
                  const liveTimer = duration
                    ? null
                    : calculateLiveDriverTimer(item.tanggal, item.jamMasuk, nowMs);

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-center font-mono font-bold tabular-nums text-slate-900 whitespace-nowrap">
                        {item.no}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-900">
                          {formatIndonesianDate(item.tanggal)}
                        </div>
                        <div className="text-xs font-mono tabular-nums text-slate-400">
                          {item.tanggal}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                        {item.jamMasuk || '-'}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                        {item.jamKeluar ? (
                          <span className="text-slate-800">{item.jamKeluar}</span>
                        ) : (
                          <button
                            type="button"
                            disabled={isClockBusy}
                            onClick={() => handleQuickClockOut(item)}
                            title="Catat jam keluar sekarang"
                            className="inline-flex items-center gap-1 px-2 py-1 border border-blue-200 bg-blue-50 text-blue-700 text-xs font-sans font-medium rounded-md hover:bg-blue-100 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Clock className="w-3 h-3" />
                            {isClockBusy ? 'Menyimpan...' : 'Catat Keluar'}
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {duration ? (
                          <div className="space-y-1">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-xs font-semibold tabular-nums ${
                                duration.isOverTwoHours
                                  ? 'bg-red-100/80 border-red-300 text-red-800'
                                  : 'bg-yellow-100/80 border-yellow-400 text-yellow-900'
                              }`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  duration.isOverTwoHours ? 'bg-red-600' : 'bg-yellow-500'
                                }`}
                              />
                              {duration.formatted}
                            </span>
                            <div className="text-xs font-mono tabular-nums text-slate-400">
                              {duration.rangeLabel}
                              {duration.isOvernight ? ' (+1 hari)' : ''}
                            </div>
                          </div>
                        ) : liveTimer ? (
                          liveTimer.isPendingStart ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-slate-200 bg-slate-100 text-slate-600 text-xs font-medium">
                                Menunggu ({item.jamMasuk})
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-xs font-mono font-bold tabular-nums ${
                                  liveTimer.isOverTwoHours
                                    ? 'bg-red-100/80 border-red-300 text-red-800'
                                    : 'bg-yellow-100/80 border-yellow-400 text-yellow-900'
                                }`}
                              >
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 animate-pulse ${
                                    liveTimer.isOverTwoHours ? 'bg-red-600' : 'bg-yellow-500'
                                  }`}
                                />
                                {liveTimer.clockText}
                              </span>
                              <div className="text-[11px] text-slate-500 tabular-nums">
                                Aktif sejak {item.jamMasuk} ·{' '}
                                <span
                                  className={`font-semibold ${
                                    liveTimer.isOverTwoHours ? 'text-red-700' : 'text-yellow-800'
                                  }`}
                                >
                                  {liveTimer.isOverTwoHours ? '> 2 jam' : '< 2 jam'}
                                </span>
                              </div>
                            </div>
                          )
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {item.noMobil}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">
                        {item.supir}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {item.jenisKendaraan}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {item.transporter}
                      </td>
                      <td className="py-3 px-4 text-slate-600 min-w-[160px] max-w-xs">
                        {item.keterangan || '-'}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {isConfirming ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={deletingId === item.id}
                              onClick={async () => {
                                setDeletingId(item.id);
                                try {
                                  await onDelete(item);
                                  setConfirmDeleteId(null);
                                } finally {
                                  setDeletingId(null);
                                }
                              }}
                              className="px-2.5 py-1 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700 cursor-pointer"
                            >
                              {deletingId === item.id ? 'Menghapus...' : 'Konfirmasi'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1 border border-slate-200 text-slate-600 text-xs font-medium rounded-md hover:bg-slate-100 cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              title="Edit Data Supir"
                              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(item.id)}
                              title="Hapus Data Supir"
                              className="p-2 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
      </section>
    </div>
  );
};
