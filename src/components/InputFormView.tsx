import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  ClipboardPaste,
  RefreshCw,
  RotateCcw,
  Save,
  X,
} from 'lucide-react';
import {
  DeliveryFormState,
  DeliveryReport,
  MtdMode,
  VALIDATION_LIMITS,
} from '../types/delivery';
import {
  computeAutoMtdFromPrevious,
  computeSegmentDailyTotals,
  findPreviousMonthReport,
  formatIndonesianDate,
  formatNumber,
  generateWhatsAppReport,
  INITIAL_NOV_19_SAMPLE,
  parseWhatsAppReport,
  roundTon,
} from '../utils/deliveryCalculations';

interface InputFormViewProps {
  reports: DeliveryReport[];
  onSave: (form: DeliveryFormState) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

const SAMPLE_WA_PROMPT = generateWhatsAppReport(INITIAL_NOV_19_SAMPLE, {
  useDashForZero: false,
});

function getDefaultNewDate(reports: DeliveryReport[]): string {
  const realReports = [...reports].sort((a, b) => b.date.localeCompare(a.date));
  if (realReports.length > 0) {
    const latest = realReports[0].date;
    const [y, m, d] = latest.split('-').map(Number);
    const next = new Date(y, (m || 1) - 1, (d || 1) + 1);
    const yyyy = next.getFullYear();
    const mm = String(next.getMonth() + 1).padStart(2, '0');
    const dd = String(next.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return new Date().toISOString().slice(0, 10);
}

interface DraftRowInputProps {
  label: string;
  value: number;
  onChange: (raw: string) => void;
  id: string;
  emphasized?: boolean;
}

const DraftRowInput: React.FC<DraftRowInputProps> = ({
  label,
  value,
  onChange,
  id,
  emphasized = false,
}) => (
  <div className="flex items-center justify-between gap-3 py-2">
    <label
      htmlFor={id}
      className={`text-xs sm:text-sm ${
        emphasized ? 'font-semibold text-slate-900' : 'text-slate-700'
      }`}
    >
      {label}
    </label>
    <div className="relative w-36 sm:w-40 shrink-0">
      <input
        id={id}
        type="number"
        min="0"
        step="any"
        value={value === 0 ? '' : value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value)}
        className={`w-full h-10 pl-3 pr-8 rounded-lg border text-sm font-mono tabular-nums text-right focus:border-blue-600 focus:outline-none ${
          emphasized
            ? 'border-slate-300 bg-slate-50 font-semibold text-slate-900 focus:bg-white'
            : 'border-slate-300 bg-white text-slate-900'
        }`}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400 pointer-events-none">
        t
      </span>
    </div>
  </div>
);

export const InputFormView: React.FC<InputFormViewProps> = ({
  reports,
  onSave,
  onCancel,
  isSaving,
}) => {
  const initialDate = getDefaultNewDate(reports);
  const initialPrev = findPreviousMonthReport(reports, initialDate);

  const [form, setForm] = useState<DeliveryFormState>(() => {
    const autoMtd = computeAutoMtdFromPrevious(
      {
        jktProjectForming: 0,
        jktIndustri: 0,
        jktIsbsRitel: 0,
        jktOthers: 0,
        smgProjectForming: 0,
        smgIndustri: 0,
        smgIsbsRitel: 0,
        smgOthers: 0,
      },
      initialPrev
    );
    return {
      date: initialDate,
      jktProjectForming: 0,
      jktIndustri: 0,
      jktIsbsRitel: 0,
      jktOthers: 0,
      smgProjectForming: 0,
      smgIndustri: 0,
      smgIsbsRitel: 0,
      smgOthers: 0,
      mtdMode: 'auto',
      ...autoMtd,
      notes: '',
    };
  });

  const [showWaImporter, setShowWaImporter] = useState(false);
  const [waRawText, setWaRawText] = useState('');
  const [waFeedback, setWaFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const existingForDate = useMemo(
    () => reports.find((r) => r.date === form.date) ?? null,
    [reports, form.date]
  );

  const previousReport = useMemo(
    () => findPreviousMonthReport(reports, form.date),
    [reports, form.date]
  );

  const parseInputNum = (raw: string): number => {
    const cleaned = raw.replace(',', '.').trim();
    if (cleaned === '' || cleaned === '-') return 0;
    const num = Number(cleaned);
    if (Number.isNaN(num) || num < 0) return 0;
    return Math.min(num, VALIDATION_LIMITS.MAX_MTD_TON);
  };

  // Update a segment daily field, and if in 'auto' mode, auto-compute MTD & TODAY fields synchronously
  const handleDailySegmentChange = (
    field:
      | 'jktProjectForming'
      | 'jktIndustri'
      | 'jktIsbsRitel'
      | 'jktOthers'
      | 'smgProjectForming'
      | 'smgIndustri'
      | 'smgIsbsRitel'
      | 'smgOthers',
    raw: string
  ) => {
    const val = parseInputNum(raw);
    setForm((prev) => {
      const next = { ...prev, [field]: val };
      if (next.mtdMode === 'auto') {
        const auto = computeAutoMtdFromPrevious(next, previousReport);
        return { ...next, ...auto };
      }
      return next;
    });
  };

  // Update any TODAY or MTD Total field directly (switches mtdMode to 'manual' so user edits are never overwritten)
  const handleDirectTotalChange = (
    field:
      | 'dailyJktTotal'
      | 'dailySmgTotal'
      | 'mtdJktTotal'
      | 'mtdSmgTotal'
      | 'mtdCombinedTotal'
      | 'mtdJktProjectForming'
      | 'mtdJktIndustri'
      | 'mtdJktIsbsRitel'
      | 'mtdJktOthers'
      | 'mtdSmgProjectForming'
      | 'mtdSmgIndustri'
      | 'mtdSmgIsbsRitel'
      | 'mtdSmgOthers',
    raw: string
  ) => {
    const val = parseInputNum(raw);
    setForm((prev) => {
      const next: DeliveryFormState = {
        ...prev,
        mtdMode: 'manual',
        [field]: val,
      };
      // If user updates mtdJktTotal or mtdSmgTotal, automatically keep mtdCombinedTotal synced unless user is directly editing mtdCombinedTotal
      if (field === 'mtdJktTotal' || field === 'mtdSmgTotal') {
        next.mtdCombinedTotal = roundTon(next.mtdJktTotal + next.mtdSmgTotal);
      }
      return next;
    });
  };

  const handleDateChange = (newDate: string) => {
    const prevForNewDate = findPreviousMonthReport(reports, newDate);
    setForm((prev) => {
      const next = { ...prev, date: newDate };
      if (next.mtdMode === 'auto') {
        const auto = computeAutoMtdFromPrevious(next, prevForNewDate);
        return { ...next, ...auto };
      }
      return next;
    });
  };

  const handleModeSwitch = (mode: MtdMode) => {
    if (mode === 'auto') {
      setForm((prev) => {
        const auto = computeAutoMtdFromPrevious(prev, previousReport);
        return {
          ...prev,
          mtdMode: 'auto',
          ...auto,
        };
      });
    } else {
      setForm((prev) => ({
        ...prev,
        mtdMode: 'manual',
      }));
    }
  };

  const handleSyncTodayFromSegments = () => {
    setForm((prev) => {
      const seg = computeSegmentDailyTotals(prev);
      const mtdJkt = roundTon(
        prev.mtdJktProjectForming +
          prev.mtdJktIndustri +
          prev.mtdJktIsbsRitel +
          prev.mtdJktOthers
      );
      const mtdSmg = roundTon(
        prev.mtdSmgProjectForming +
          prev.mtdSmgIndustri +
          prev.mtdSmgIsbsRitel +
          prev.mtdSmgOthers
      );
      return {
        ...prev,
        dailyJktTotal: seg.jkt,
        dailySmgTotal: seg.smg,
        mtdJktTotal: mtdJkt,
        mtdSmgTotal: mtdSmg,
        mtdCombinedTotal: roundTon(mtdJkt + mtdSmg),
      };
    });
  };

  const handleResetZero = () => {
    setForm((prev) => ({
      ...prev,
      dailyJktTotal: 0,
      dailySmgTotal: 0,
      jktProjectForming: 0,
      jktIndustri: 0,
      jktIsbsRitel: 0,
      jktOthers: 0,
      smgProjectForming: 0,
      smgIndustri: 0,
      smgIsbsRitel: 0,
      smgOthers: 0,
      mtdMode: 'manual',
      mtdJktProjectForming: 0,
      mtdJktIndustri: 0,
      mtdJktIsbsRitel: 0,
      mtdJktOthers: 0,
      mtdSmgProjectForming: 0,
      mtdSmgIndustri: 0,
      mtdSmgIsbsRitel: 0,
      mtdSmgOthers: 0,
      mtdJktTotal: 0,
      mtdSmgTotal: 0,
      mtdCombinedTotal: 0,
      notes: '',
    }));
  };

  const handleParseWa = () => {
    const result = parseWhatsAppReport(waRawText);
    if (!result.success) {
      setWaFeedback({ type: 'err', msg: result.error || 'Gagal memproses teks.' });
      return;
    }
    setForm((prev) => {
      const merged: DeliveryFormState = {
        ...prev,
        ...result.data,
      };
      const seg = computeSegmentDailyTotals(merged);
      if (result.data.dailyJktTotal === undefined) {
        merged.dailyJktTotal = seg.jkt;
      }
      if (result.data.dailySmgTotal === undefined) {
        merged.dailySmgTotal = seg.smg;
      }
      if (result.data.mtdJktTotal === undefined) {
        merged.mtdJktTotal = roundTon(
          merged.mtdJktProjectForming +
            merged.mtdJktIndustri +
            merged.mtdJktIsbsRitel +
            merged.mtdJktOthers
        );
      }
      if (result.data.mtdSmgTotal === undefined) {
        merged.mtdSmgTotal = roundTon(
          merged.mtdSmgProjectForming +
            merged.mtdSmgIndustri +
            merged.mtdSmgIsbsRitel +
            merged.mtdSmgOthers
        );
      }
      if (result.data.mtdCombinedTotal === undefined) {
        merged.mtdCombinedTotal = roundTon(merged.mtdJktTotal + merged.mtdSmgTotal);
      }
      return merged;
    });
    setWaFeedback({
      type: 'ok',
      msg: `Berhasil mengekstrak ${result.matchedFields} data dari teks WhatsApp.`,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!VALIDATION_LIMITS.DATE_REGEX.test(form.date)) {
      setFormError('Tanggal laporan tidak valid.');
      return;
    }

    if (existingForDate) {
      setFormError(
        `Data tanggal ${form.date} sudah tersimpan sebagai data final dan tidak dapat diedit atau ditimpa.`
      );
      return;
    }

    try {
      await onSave(form);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan laporan.');
    }
  };

  const pfCombined = roundTon(form.mtdJktProjectForming + form.mtdSmgProjectForming);
  const indCombined = roundTon(form.mtdJktIndustri + form.mtdSmgIndustri);
  const isbsCombined = roundTon(form.mtdJktIsbsRitel + form.mtdSmgIsbsRitel);
  const othersCombined = roundTon(form.mtdJktOthers + form.mtdSmgOthers);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header + Quick Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Input Data Pengiriman Harian
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Susunan input disamakan dengan draft laporan harian (TODAY, Project forming, Industri, ISBS Ritel, Others). Data yang tersimpan bersifat final.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetZero}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-white text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Kosongkan (0)
          </button>
          <button
            type="button"
            onClick={() => setShowWaImporter((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 bg-slate-50 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
          >
            <ClipboardPaste className="w-4 h-4 text-blue-700" />
            {showWaImporter ? 'Tutup Impor WA' : 'Impor Teks WhatsApp'}
          </button>
        </div>
      </div>

      {/* Collapsible WhatsApp Text Importer */}
      {showWaImporter && (
        <div className="bg-white border border-blue-200 rounded-xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Tempel Laporan Format WhatsApp
              </h3>
              <p className="text-xs text-slate-500">
                Mendukung baris TODAY (Jkt, Total Jkt, Smg, Total Smg, Total Delv Jkt&amp;Smg) dan seluruh Note segmen
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setWaRawText(SAMPLE_WA_PROMPT);
                setWaFeedback(null);
              }}
              className="text-xs font-medium text-blue-700 hover:text-blue-800 underline cursor-pointer self-start sm:self-auto"
            >
              Gunakan Contoh 19 Nov 2026
            </button>
          </div>

          <textarea
            value={waRawText}
            onChange={(e) => setWaRawText(e.target.value)}
            rows={7}
            placeholder="Tempel teks 'Informasi delv hari Kamis, 19 November 2026...' di sini"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-mono text-slate-800 focus:bg-white focus:border-blue-600 focus:outline-none"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {waFeedback && (
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                    waFeedback.type === 'ok' ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {waFeedback.type === 'ok' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  {waFeedback.msg}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleParseWa}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-blue-800 transition-colors cursor-pointer"
            >
              Ekstrak ke Formulir
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {formError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-2.5 text-sm text-red-800">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Date & Calculation Mode Header */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-5 space-y-1.5">
            <label htmlFor="report-date" className="block text-xs font-semibold text-slate-700">
              Informasi delv hari (Tanggal Laporan)
            </label>
            <input
              id="report-date"
              type="date"
              required
              value={form.date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
            />
            <p className="text-xs text-slate-600 font-medium">
              {formatIndonesianDate(form.date)}
            </p>
          </div>

          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700">
                Mode Perhitungan Total Akumulasi:
              </span>
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => handleModeSwitch('auto')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    form.mtdMode === 'auto'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Otomatis dari Segmen
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch('manual')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    form.mtdMode === 'manual'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Manual (Sesuai Draft)
                </button>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-600">
              {previousReport ? (
                <span>
                  Akumulasi hari sebelumnya ({formatIndonesianDate(previousReport.date)}): JKT{' '}
                  <strong className="font-mono tabular-nums text-slate-900">
                    {formatNumber(previousReport.mtdJktTotal)} t
                  </strong>{' '}
                  · SMG{' '}
                  <strong className="font-mono tabular-nums text-slate-900">
                    {formatNumber(previousReport.mtdSmgTotal)} t
                  </strong>
                  . Mengisi angka langsung di kolom <strong>TODAY</strong> atau <strong>Total</strong> otomatis beralih ke mode Manual.
                </span>
              ) : (
                <span>
                  Belum ada catatan hari sebelumnya di bulan ini. Anda dapat langsung mengisi angka
                  pada blok <strong>TODAY</strong> dan seluruh segmen sesuai draft.
                </span>
              )}
              {existingForDate && (
                <div className="text-red-700 font-semibold mt-1">
                  Data tanggal {form.date} sudah tersimpan sebagai data final dan tidak dapat diedit atau ditimpa. Silakan pilih tanggal lain.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BLOK TODAY (Sesuai Draft: Jkt, Total Jkt, Smg, Total Smg, Total Delv Jkt&Smg) */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold tracking-wide">TODAY</h3>
              <p className="text-xs text-slate-300">
                Ringkasan pengiriman hari ini dan total akumulasi Jkt &amp; Smg
              </p>
            </div>
            <button
              type="button"
              onClick={handleSyncTodayFromSegments}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded-lg transition-colors self-start sm:self-auto cursor-pointer"
            >
              <Calculator className="w-3.5 h-3.5" />
              Hitung Ulang dari 4 Segmen
            </button>
          </div>

          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 divide-y md:divide-y-0 divide-slate-200">
            <div className="divide-y divide-slate-100">
              <DraftRowInput
                id="today-jkt"
                label="Jkt"
                value={form.dailyJktTotal}
                onChange={(v) => handleDirectTotalChange('dailyJktTotal', v)}
              />
              <DraftRowInput
                id="today-total-jkt"
                label="Total Jkt"
                value={form.mtdJktTotal}
                onChange={(v) => handleDirectTotalChange('mtdJktTotal', v)}
                emphasized
              />
            </div>

            <div className="divide-y divide-slate-100">
              <DraftRowInput
                id="today-smg"
                label="Smg"
                value={form.dailySmgTotal}
                onChange={(v) => handleDirectTotalChange('dailySmgTotal', v)}
              />
              <DraftRowInput
                id="today-total-smg"
                label="Total Smg"
                value={form.mtdSmgTotal}
                onChange={(v) => handleDirectTotalChange('mtdSmgTotal', v)}
                emphasized
              />
            </div>
          </div>

          <div className="px-5 py-3.5 bg-blue-50/60 border-t border-slate-200 flex items-center justify-between gap-4">
            <label
              htmlFor="today-total-combined"
              className="text-sm font-bold text-blue-950"
            >
              Total Delv Jkt&amp;Smg
            </label>
            <div className="relative w-44">
              <input
                id="today-total-combined"
                type="number"
                min="0"
                step="any"
                value={form.mtdCombinedTotal === 0 ? '' : form.mtdCombinedTotal}
                placeholder="0"
                onChange={(e) => handleDirectTotalChange('mtdCombinedTotal', e.target.value)}
                className="w-full h-11 pl-3 pr-8 rounded-lg border border-blue-300 bg-white text-base font-bold font-mono tabular-nums text-right text-blue-950 focus:border-blue-600 focus:outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-500 pointer-events-none">
                t
              </span>
            </div>
          </div>
        </div>

        {/* 4 SEGMENT BLOCKS (Sesuai Draft: Project forming, Industri, ISBS Ritel, Others) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Note : Project forming */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between">
            <div>
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">Note : Project forming</h3>
              </div>
              <div className="px-5 py-2 divide-y divide-slate-100">
                <DraftRowInput
                  id="pf-jkt"
                  label="Project forming(Jkt)"
                  value={form.jktProjectForming}
                  onChange={(v) => handleDailySegmentChange('jktProjectForming', v)}
                />
                <DraftRowInput
                  id="pf-mtd-jkt"
                  label="Total Project forming(Jkt)"
                  value={form.mtdJktProjectForming}
                  onChange={(v) => handleDirectTotalChange('mtdJktProjectForming', v)}
                />
                <DraftRowInput
                  id="pf-smg"
                  label="Project forming(Smg)"
                  value={form.smgProjectForming}
                  onChange={(v) => handleDailySegmentChange('smgProjectForming', v)}
                />
                <DraftRowInput
                  id="pf-mtd-smg"
                  label="Total Project forming (Smg)"
                  value={form.mtdSmgProjectForming}
                  onChange={(v) => handleDirectTotalChange('mtdSmgProjectForming', v)}
                />
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-800">Total Project forming Jkt&amp;Smg</span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {formatNumber(pfCombined)} t
              </span>
            </div>
          </div>

          {/* Note : Industri */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between">
            <div>
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">Note : Industri</h3>
              </div>
              <div className="px-5 py-2 divide-y divide-slate-100">
                <DraftRowInput
                  id="ind-jkt"
                  label="Industri (Jkt)"
                  value={form.jktIndustri}
                  onChange={(v) => handleDailySegmentChange('jktIndustri', v)}
                />
                <DraftRowInput
                  id="ind-mtd-jkt"
                  label="Total Industri (Jkt)"
                  value={form.mtdJktIndustri}
                  onChange={(v) => handleDirectTotalChange('mtdJktIndustri', v)}
                />
                <DraftRowInput
                  id="ind-smg"
                  label="Industri (Smg)"
                  value={form.smgIndustri}
                  onChange={(v) => handleDailySegmentChange('smgIndustri', v)}
                />
                <DraftRowInput
                  id="ind-mtd-smg"
                  label="Total Industri (Smg)"
                  value={form.mtdSmgIndustri}
                  onChange={(v) => handleDirectTotalChange('mtdSmgIndustri', v)}
                />
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-800">Total Industri Jkt&amp;Smg</span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {formatNumber(indCombined)} t
              </span>
            </div>
          </div>

          {/* ISBS Ritel */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between">
            <div>
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">ISBS Ritel</h3>
              </div>
              <div className="px-5 py-2 divide-y divide-slate-100">
                <DraftRowInput
                  id="isbs-jkt"
                  label="ISBS Ritel (Jkt)"
                  value={form.jktIsbsRitel}
                  onChange={(v) => handleDailySegmentChange('jktIsbsRitel', v)}
                />
                <DraftRowInput
                  id="isbs-mtd-jkt"
                  label="Total ISBS Ritel (Jkt)"
                  value={form.mtdJktIsbsRitel}
                  onChange={(v) => handleDirectTotalChange('mtdJktIsbsRitel', v)}
                />
                <DraftRowInput
                  id="isbs-smg"
                  label="ISBS (Smg)"
                  value={form.smgIsbsRitel}
                  onChange={(v) => handleDailySegmentChange('smgIsbsRitel', v)}
                />
                <DraftRowInput
                  id="isbs-mtd-smg"
                  label="Total ISBS (Smg)"
                  value={form.mtdSmgIsbsRitel}
                  onChange={(v) => handleDirectTotalChange('mtdSmgIsbsRitel', v)}
                />
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-800">Total Delv ISBS Jkt&amp;Smg</span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {formatNumber(isbsCombined)} t
              </span>
            </div>
          </div>

          {/* Others */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between">
            <div>
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">Others</h3>
              </div>
              <div className="px-5 py-2 divide-y divide-slate-100">
                <DraftRowInput
                  id="oth-jkt"
                  label="Others (Jkt)"
                  value={form.jktOthers}
                  onChange={(v) => handleDailySegmentChange('jktOthers', v)}
                />
                <DraftRowInput
                  id="oth-mtd-jkt"
                  label="Total Others (Jkt)"
                  value={form.mtdJktOthers}
                  onChange={(v) => handleDirectTotalChange('mtdJktOthers', v)}
                />
                <DraftRowInput
                  id="oth-smg"
                  label="Others (Smg)"
                  value={form.smgOthers}
                  onChange={(v) => handleDailySegmentChange('smgOthers', v)}
                />
                <DraftRowInput
                  id="oth-mtd-smg"
                  label="Total Others (Smg)"
                  value={form.mtdSmgOthers}
                  onChange={(v) => handleDirectTotalChange('mtdSmgOthers', v)}
                />
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-800">Total Delv Others Jkt&amp;Smg</span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {formatNumber(othersCombined)} t
              </span>
            </div>
          </div>
        </div>

        {/* Notes & Action Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="report-notes" className="text-xs font-semibold text-slate-700">
                Catatan Tambahan (Opsional)
              </label>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                {form.notes.length}/{VALIDATION_LIMITS.MAX_NOTES_LENGTH}
              </span>
            </div>
            <textarea
              id="report-notes"
              rows={2}
              maxLength={VALIDATION_LIMITS.MAX_NOTES_LENGTH}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Contoh: Penyesuaian muatan atau catatan operasional..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 border border-slate-200 bg-white text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
              Batal
            </button>

            <button
              type="submit"
              disabled={isSaving || Boolean(existingForDate)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {isSaving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving ? 'Menyimpan...' : 'Simpan & Lihat Rekap Otomatis'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
