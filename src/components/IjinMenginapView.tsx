import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileDown,
  FileText,
  Printer,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  exportIjinMenginapCsv,
  getNextIjinMenginapNoForDate,
} from '../services/ijinMenginapService';
import {
  DriverLogEntry,
  IjinMenginapEntry,
  IjinMenginapFormState,
  SURAT_JALAN_VENDORS,
  VALIDATION_LIMITS,
} from '../types/delivery';
import {
  formatIndonesianDate,
  formatIndonesianShortDate,
  parseDateParts,
} from '../utils/deliveryCalculations';

interface IjinMenginapViewProps {
  entries: IjinMenginapEntry[];
  driverLogs: DriverLogEntry[];
  onSave: (form: IjinMenginapFormState, existing?: IjinMenginapEntry | null) => Promise<void>;
  onDelete: (entry: IjinMenginapEntry) => Promise<void>;
  isLoading: boolean;
}

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

function getLocalDateYYYYMMDD(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatFormalLetterDate(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const dt = parseDateParts(dateStr);
  const tgl = dt.getDate();
  const bulan = BULAN_ID[dt.getMonth()] ?? '';
  const tahun = dt.getFullYear();
  return `${tgl} ${bulan} ${tahun}`;
}

function formatTanggalMenginapRange(startDate: string, endDate?: string): string {
  if (!startDate) return '....................................................';
  const startText = formatIndonesianDate(startDate);
  if (endDate && VALIDATION_LIMITS.DATE_REGEX.test(endDate)) {
    return `${startText} s/d ${formatIndonesianDate(endDate)}`;
  }
  return startText;
}

const TRANSPORTER_SUGGESTIONS = SURAT_JALAN_VENDORS.filter((v) => v !== 'Lainnya');

export const IjinMenginapView: React.FC<IjinMenginapViewProps> = ({
  entries,
  driverLogs,
  onSave,
  onDelete,
  isLoading,
}) => {
  const todayStr = getLocalDateYYYYMMDD();

  const [tanggalSurat, setTanggalSurat] = useState<string>(todayStr);
  const [tempatSurat, setTempatSurat] = useState<string>('Bekasi');
  const [namaSupir, setNamaSupir] = useState<string>('');
  const [transporter, setTransporter] = useState<string>('');
  const [noPolisi, setNoPolisi] = useState<string>('');
  const [tanggalMenginap, setTanggalMenginap] = useState<string>(todayStr);
  const [tanggalMenginapSampai, setTanggalMenginapSampai] = useState<string>('');
  const [alasanMenginap, setAlasanMenginap] = useState<string>('');
  const [namaPemohon, setNamaPemohon] = useState<string>('');
  const [namaDiketahui, setNamaDiketahui] = useState<string>('');
  const [namaDisetujui, setNamaDisetujui] = useState<string>('');

  const [selectedDriverPick, setSelectedDriverPick] = useState<string>('');
  const [editingEntry, setEditingEntry] = useState<IjinMenginapEntry | null>(null);
  const [previewEntry, setPreviewEntry] = useState<IjinMenginapEntry | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const supirInputRef = useRef<HTMLInputElement | null>(null);

  const previewNo = useMemo(() => {
    if (editingEntry && editingEntry.tanggalSurat === tanggalSurat) {
      return editingEntry.no;
    }
    return getNextIjinMenginapNoForDate(entries, tanggalSurat);
  }, [entries, tanggalSurat, editingEntry]);

  const countOnSelectedDate = useMemo(
    () => entries.filter((e) => e.tanggalSurat === tanggalSurat).length,
    [entries, tanggalSurat]
  );

  const transporterOptions = useMemo(() => {
    const set = new Set<string>(TRANSPORTER_SUGGESTIONS);
    driverLogs.forEach((d) => {
      if (d.transporter.trim()) set.add(d.transporter.trim());
    });
    return Array.from(set);
  }, [driverLogs]);

  const filteredEntries = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return entries.filter((item) => {
      if (
        filterDate &&
        item.tanggalSurat !== filterDate &&
        item.tanggalMenginap !== filterDate &&
        item.tanggalMenginapSampai !== filterDate
      ) {
        return false;
      }
      if (!q) return true;
      return (
        String(item.no).includes(q) ||
        item.namaSupir.toLowerCase().includes(q) ||
        item.transporter.toLowerCase().includes(q) ||
        item.noPolisi.toLowerCase().includes(q) ||
        item.alasanMenginap.toLowerCase().includes(q) ||
        item.tanggalMenginap.includes(q) ||
        item.tanggalMenginapSampai.includes(q) ||
        formatIndonesianDate(item.tanggalMenginap).toLowerCase().includes(q) ||
        (item.tanggalMenginapSampai
          ? formatIndonesianDate(item.tanggalMenginapSampai).toLowerCase().includes(q)
          : false)
      );
    });
  }, [entries, searchTerm, filterDate]);

  const activeLetterData = useMemo(() => {
    if (previewEntry) {
      return {
        tempatSurat: previewEntry.tempatSurat || 'Bekasi',
        tanggalSurat: previewEntry.tanggalSurat,
        namaSupir: previewEntry.namaSupir,
        transporter: previewEntry.transporter,
        noPolisi: previewEntry.noPolisi,
        tanggalMenginap: previewEntry.tanggalMenginap,
        tanggalMenginapSampai: previewEntry.tanggalMenginapSampai || '',
        alasanMenginap: previewEntry.alasanMenginap,
        namaPemohon: previewEntry.namaPemohon,
        namaDiketahui: previewEntry.namaDiketahui,
        namaDisetujui: previewEntry.namaDisetujui,
        no: previewEntry.no,
      };
    }
    return {
      tempatSurat: tempatSurat.trim() || 'Bekasi',
      tanggalSurat,
      namaSupir: namaSupir.trim(),
      transporter: transporter.trim(),
      noPolisi: noPolisi.trim().toUpperCase(),
      tanggalMenginap,
      tanggalMenginapSampai,
      alasanMenginap: alasanMenginap.trim(),
      namaPemohon: namaPemohon.trim(),
      namaDiketahui: namaDiketahui.trim(),
      namaDisetujui: namaDisetujui.trim(),
      no: previewNo,
    };
  }, [
    previewEntry,
    tempatSurat,
    tanggalSurat,
    namaSupir,
    transporter,
    noPolisi,
    tanggalMenginap,
    tanggalMenginapSampai,
    alasanMenginap,
    namaPemohon,
    namaDiketahui,
    namaDisetujui,
    previewNo,
  ]);

  const handlePickDriverLog = (logId: string) => {
    setSelectedDriverPick(logId);
    const found = driverLogs.find((d) => d.id === logId);
    if (!found) return;
    setPreviewEntry(null);
    setNamaSupir(found.supir);
    setTransporter(found.transporter);
    setNoPolisi(found.noMobil);
    const nextStart = found.tanggal || todayStr;
    setTanggalMenginap(nextStart);
    if (tanggalMenginapSampai && nextStart > tanggalMenginapSampai) {
      setTanggalMenginapSampai('');
    }
  };

  const resetFormFields = () => {
    setNamaSupir('');
    setTransporter('');
    setNoPolisi('');
    setTanggalMenginapSampai('');
    setAlasanMenginap('');
    setSelectedDriverPick('');
    setEditingEntry(null);
    setTimeout(() => {
      supirInputRef.current?.focus();
    }, 50);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setPreviewEntry(null);

    if (!VALIDATION_LIMITS.DATE_REGEX.test(tanggalSurat)) {
      setStatusMsg({ type: 'err', text: 'Format Tanggal Surat tidak valid.' });
      return;
    }
    if (!VALIDATION_LIMITS.DATE_REGEX.test(tanggalMenginap)) {
      setStatusMsg({ type: 'err', text: 'Format Tanggal Menginap tidak valid.' });
      return;
    }
    if (tanggalMenginapSampai) {
      if (!VALIDATION_LIMITS.DATE_REGEX.test(tanggalMenginapSampai)) {
        setStatusMsg({ type: 'err', text: 'Format Tanggal Sampai Dengan (s/d) tidak valid.' });
        return;
      }
      if (tanggalMenginapSampai < tanggalMenginap) {
        setStatusMsg({
          type: 'err',
          text: 'Tanggal Sampai Dengan (s/d) tidak boleh lebih awal dari Tanggal Mulai Menginap.',
        });
        return;
      }
    }
    if (!namaSupir.trim()) {
      setStatusMsg({ type: 'err', text: 'Nama Supir wajib diisi.' });
      supirInputRef.current?.focus();
      return;
    }
    if (!transporter.trim()) {
      setStatusMsg({ type: 'err', text: 'Transporter wajib diisi.' });
      return;
    }
    if (!noPolisi.trim()) {
      setStatusMsg({ type: 'err', text: 'No Polisi Kendaraan wajib diisi.' });
      return;
    }
    if (!alasanMenginap.trim()) {
      setStatusMsg({ type: 'err', text: 'Alasan Menginap wajib diisi.' });
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(
        {
          tanggalSurat,
          tempatSurat: tempatSurat.trim() || 'Bekasi',
          namaSupir: namaSupir.trim(),
          transporter: transporter.trim(),
          noPolisi: noPolisi.trim().toUpperCase(),
          tanggalMenginap,
          tanggalMenginapSampai,
          alasanMenginap: alasanMenginap.trim(),
          namaPemohon: namaPemohon.trim(),
          namaDiketahui: namaDiketahui.trim(),
          namaDisetujui: namaDisetujui.trim(),
        },
        editingEntry
      );
      setStatusMsg({
        type: 'ok',
        text: editingEntry
          ? `Surat Permohonan Ijin Menginap (${namaSupir.trim()} — ${noPolisi.trim().toUpperCase()}) diperbarui.`
          : `Surat Permohonan Ijin Menginap No. ${previewNo} (${namaSupir.trim()} — ${noPolisi.trim().toUpperCase()}) berhasil disimpan.`,
      });
      resetFormFields();
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menyimpan surat ijin menginap.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (entry: IjinMenginapEntry) => {
    setPreviewEntry(null);
    setEditingEntry(entry);
    setTanggalSurat(entry.tanggalSurat);
    setTempatSurat(entry.tempatSurat || 'Bekasi');
    setNamaSupir(entry.namaSupir);
    setTransporter(entry.transporter);
    setNoPolisi(entry.noPolisi);
    setTanggalMenginap(entry.tanggalMenginap);
    setTanggalMenginapSampai(entry.tanggalMenginapSampai || '');
    setAlasanMenginap(entry.alasanMenginap);
    setNamaPemohon(entry.namaPemohon || '');
    setNamaDiketahui(entry.namaDiketahui || '');
    setNamaDisetujui(entry.namaDisetujui || '');
    setSelectedDriverPick('');
    setStatusMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingEntry(null);
    setTanggalSurat(todayStr);
    setTempatSurat('Bekasi');
    setTanggalMenginap(todayStr);
    setTanggalMenginapSampai('');
    setNamaPemohon('');
    setNamaDiketahui('');
    setNamaDisetujui('');
    resetFormFields();
    setStatusMsg(null);
  };

  const handlePrintCurrent = () => {
    window.print();
  };

  const handlePrintEntry = (entry: IjinMenginapEntry) => {
    setPreviewEntry(entry);
    setTimeout(() => {
      window.print();
    }, 80);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
            <span>Formulir Resmi Gudang</span>
            <span aria-hidden="true">·</span>
            <span>Total Surat Tersimpan: {entries.length}</span>
            <span aria-hidden="true">·</span>
            <span>
              Tanggal {formatIndonesianShortDate(tanggalSurat)}: {countOnSelectedDate} surat
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Surat Permohonan Ijin Menginap</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <a
            href="/assets/aistudio/SURAT_IJIN_MENGINAP_2566d35f.pdf"
            download="SURAT_PERMOHONAN_IJIN_MENGINAP_BLANKO.pdf"
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <FileDown className="w-3.5 h-3.5" />
            Unduh Blanko PDF
          </a>
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-500">
              <div>No Urut ({formatIndonesianShortDate(tanggalSurat)})</div>
              <div className="text-[11px] text-slate-400">Reset per tanggal surat</div>
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-blue-700">
              #{previewNo}
            </div>
          </div>
        </div>
      </div>

      {/* Main Two-Column Grid: Input Form + Official Letter Preview */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Form Card (Hidden when printing) */}
        <section className="xl:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden no-print">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-blue-700 shrink-0" />
              <h3 className="text-base font-semibold text-slate-900">
                {editingEntry
                  ? `Edit Surat #${editingEntry.no} — ${editingEntry.namaSupir}`
                  : 'Input Surat Permohonan Ijin Menginap'}
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
            <datalist id="ijin-menginap-transporter-list">
              {transporterOptions.map((tr) => (
                <option key={tr} value={tr} />
              ))}
            </datalist>

            {/* Quick Autofill from Driver Log */}
            {driverLogs.length > 0 && !editingEntry && (
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                <label
                  htmlFor="im-driver-pick"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Isi Otomatis dari Input Data Supir (Opsional)
                </label>
                <select
                  id="im-driver-pick"
                  value={selectedDriverPick}
                  onChange={(e) => handlePickDriverLog(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm text-slate-800 focus:border-blue-600 focus:outline-none"
                >
                  <option value="">-- Pilih kendaraan/supir yang sudah tercatat --</option>
                  {driverLogs.slice(0, 40).map((d) => (
                    <option key={d.id} value={d.id}>
                      {formatIndonesianShortDate(d.tanggal)} · {d.noMobil} · {d.supir} ({d.transporter})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Nama Supir */}
              <div className="space-y-1.5">
                <label
                  htmlFor="im-supir"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Nama Supir
                </label>
                <input
                  ref={supirInputRef}
                  id="im-supir"
                  type="text"
                  required
                  maxLength={VALIDATION_LIMITS.MAX_SUPIR_LENGTH}
                  placeholder="Nama lengkap supir"
                  value={namaSupir}
                  onChange={(e) => {
                    setPreviewEntry(null);
                    setNamaSupir(e.target.value);
                  }}
                  className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              {/* Transporter */}
              <div className="space-y-1.5">
                <label
                  htmlFor="im-transporter"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Transporter
                </label>
                <input
                  id="im-transporter"
                  type="text"
                  list="ijin-menginap-transporter-list"
                  required
                  maxLength={VALIDATION_LIMITS.MAX_TRANSPORTER_LENGTH}
                  placeholder="Pilih / ketik nama transporter"
                  value={transporter}
                  onChange={(e) => {
                    setPreviewEntry(null);
                    setTransporter(e.target.value);
                  }}
                  className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              {/* No Polisi Kendaraan */}
              <div className="space-y-1.5">
                <label
                  htmlFor="im-nopol"
                  className="block text-xs font-semibold text-slate-700"
                >
                  No Polisi Kendaraan
                </label>
                <input
                  id="im-nopol"
                  type="text"
                  required
                  maxLength={VALIDATION_LIMITS.MAX_NO_MOBIL_LENGTH}
                  placeholder="Contoh: B 9123 KXT"
                  value={noPolisi}
                  onChange={(e) => {
                    setPreviewEntry(null);
                    setNoPolisi(e.target.value.toUpperCase());
                  }}
                  className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-mono font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              {/* Tanggal Menginap s/d */}
              <div className="sm:col-span-2 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2.5 items-end">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="im-tgl-menginap"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Tanggal Menginap
                    </label>
                    <input
                      id="im-tgl-menginap"
                      type="date"
                      required
                      value={tanggalMenginap}
                      onChange={(e) => {
                        const nextStart = e.target.value;
                        setPreviewEntry(null);
                        setTanggalMenginap(nextStart);
                        if (tanggalMenginapSampai && nextStart > tanggalMenginapSampai) {
                          setTanggalMenginapSampai(nextStart);
                        }
                      }}
                      className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-serif font-normal text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div className="hidden sm:flex items-center justify-center h-11 px-1 text-xs font-serif font-normal text-slate-600">
                    s/d
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="im-tgl-menginap-sampai"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Sampai Dengan (s/d)
                      </label>
                      {tanggalMenginapSampai && (
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewEntry(null);
                            setTanggalMenginapSampai('');
                          }}
                          className="text-[11px] font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          Kosongkan
                        </button>
                      )}
                    </div>
                    <input
                      id="im-tgl-menginap-sampai"
                      type="date"
                      min={tanggalMenginap}
                      value={tanggalMenginapSampai}
                      onChange={(e) => {
                        setPreviewEntry(null);
                        setTanggalMenginapSampai(e.target.value);
                      }}
                      className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-serif font-normal text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>
                <p className="text-xs font-serif font-normal text-slate-700">
                  {formatTanggalMenginapRange(tanggalMenginap, tanggalMenginapSampai)}
                </p>
              </div>

              {/* Alasan Menginap */}
              <div className="sm:col-span-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="im-alasan"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Alasan Menginap
                  </label>
                  <span className="text-xs font-mono tabular-nums text-slate-400">
                    {alasanMenginap.length}/{VALIDATION_LIMITS.MAX_ALASAN_MENGINAP_LENGTH}
                  </span>
                </div>
                <textarea
                  id="im-alasan"
                  required
                  rows={3}
                  maxLength={VALIDATION_LIMITS.MAX_ALASAN_MENGINAP_LENGTH}
                  placeholder="Contoh: Menunggu jadwal muat / antrian bongkar muat hari berikutnya"
                  value={alasanMenginap}
                  onChange={(e) => {
                    setPreviewEntry(null);
                    setAlasanMenginap(e.target.value);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-600 focus:outline-none resize-y"
                />
              </div>
            </div>

            {/* Tempat, Tanggal Surat & Penandatangan */}
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="im-tempat"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Kota / Tempat Surat
                  </label>
                  <input
                    id="im-tempat"
                    type="text"
                    required
                    maxLength={VALIDATION_LIMITS.MAX_TEMPAT_SURAT_LENGTH}
                    value={tempatSurat}
                    onChange={(e) => {
                      setPreviewEntry(null);
                      setTempatSurat(e.target.value);
                    }}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="im-tgl-surat"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Tanggal Surat
                  </label>
                  <input
                    id="im-tgl-surat"
                    type="date"
                    required
                    value={tanggalSurat}
                    onChange={(e) => {
                      setPreviewEntry(null);
                      setTanggalSurat(e.target.value);
                    }}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  Nama Penandatangan (Opsional — biarkan kosong untuk tanda tangan basah)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label
                      htmlFor="im-pemohon"
                      className="block text-[11px] font-medium text-slate-500"
                    >
                      Pemohon (Warehouse Div)
                    </label>
                    <input
                      id="im-pemohon"
                      type="text"
                      maxLength={VALIDATION_LIMITS.MAX_PENANDATANGAN_LENGTH}
                      placeholder="Nama Pemohon"
                      value={namaPemohon}
                      onChange={(e) => {
                        setPreviewEntry(null);
                        setNamaPemohon(e.target.value);
                      }}
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="im-diketahui"
                      className="block text-[11px] font-medium text-slate-500"
                    >
                      Diketahui (Sales &amp; Marketing)
                    </label>
                    <input
                      id="im-diketahui"
                      type="text"
                      maxLength={VALIDATION_LIMITS.MAX_PENANDATANGAN_LENGTH}
                      placeholder="Nama Pengetahui"
                      value={namaDiketahui}
                      onChange={(e) => {
                        setPreviewEntry(null);
                        setNamaDiketahui(e.target.value);
                      }}
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="im-disetujui"
                      className="block text-[11px] font-medium text-slate-500"
                    >
                      Disetujui (HA &amp; GS Div.)
                    </label>
                    <input
                      id="im-disetujui"
                      type="text"
                      maxLength={VALIDATION_LIMITS.MAX_PENANDATANGAN_LENGTH}
                      placeholder="Nama Penyetuju"
                      value={namaDisetujui}
                      onChange={(e) => {
                        setPreviewEntry(null);
                        setNamaDisetujui(e.target.value);
                      }}
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>
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

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
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
                type="button"
                onClick={handlePrintCurrent}
                className="h-11 inline-flex items-center justify-center gap-2 px-4 border border-slate-300 bg-white text-slate-800 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Printer className="w-4 h-4" />
                Cetak Surat
              </button>
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
                    ? 'Perbarui Surat'
                    : `Simpan Surat (#${previewNo})`}
              </button>
            </div>
          </form>
        </section>

        {/* Official Letter Live Preview & Printable Sheet */}
        <section className="xl:col-span-6 space-y-3">
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 no-print">
            <div className="text-xs font-semibold text-slate-700">
              {previewEntry
                ? `Pratinjau Surat Tersimpan (#${previewEntry.no} — ${previewEntry.namaSupir})`
                : 'Pratinjau Langsung Format Surat Resmi'}
            </div>
            <div className="flex items-center gap-2">
              {previewEntry && (
                <button
                  type="button"
                  onClick={() => setPreviewEntry(null)}
                  className="h-8 px-2.5 border border-slate-200 bg-white text-xs font-medium text-slate-600 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Kembali ke Input
                </button>
              )}
              <button
                type="button"
                onClick={handlePrintCurrent}
                className="inline-flex items-center gap-1.5 h-8 px-3 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak / Simpan PDF
              </button>
            </div>
          </div>

          <div
            id="ijin-menginap-print-sheet"
            className="ijin-menginap-sheet bg-white border border-slate-200 rounded-xl p-6 sm:p-10 text-slate-950 font-serif print-container"
          >
            {/* Title */}
            <h1 className="text-center text-base sm:text-lg font-normal tracking-wide underline underline-offset-4 uppercase">
              SURAT PERMOHONAN IJIN MENGINAP
            </h1>

            {/* Intro */}
            <p className="mt-8 text-sm leading-relaxed">
              Dengan ini mohon di berikan ijin menginap untuk :
            </p>

            {/* Fields */}
            <div className="mt-5 space-y-3.5 text-sm">
              <div className="grid grid-cols-[150px_16px_1fr] sm:grid-cols-[175px_20px_1fr] items-baseline gap-y-1">
                <span>Nama Supir</span>
                <span>:</span>
                <span className="font-normal break-words">
                  {activeLetterData.namaSupir || '....................................................'}
                </span>
              </div>

              <div className="grid grid-cols-[150px_16px_1fr] sm:grid-cols-[175px_20px_1fr] items-baseline gap-y-1">
                <span>Transporter</span>
                <span>:</span>
                <span className="font-normal break-words">
                  {activeLetterData.transporter || '....................................................'}
                </span>
              </div>

              <div className="grid grid-cols-[150px_16px_1fr] sm:grid-cols-[175px_20px_1fr] items-baseline gap-y-1">
                <span>No Polisi Kendaraan</span>
                <span>:</span>
                <span className="font-normal break-words">
                  {activeLetterData.noPolisi || '....................................................'}
                </span>
              </div>

              <div className="grid grid-cols-[150px_16px_1fr] sm:grid-cols-[175px_20px_1fr] items-baseline gap-y-1">
                <span>Tanggal Menginap</span>
                <span>:</span>
                <span className="font-serif font-normal">
                  {formatTanggalMenginapRange(
                    activeLetterData.tanggalMenginap,
                    activeLetterData.tanggalMenginapSampai
                  )}
                </span>
              </div>

              <div className="grid grid-cols-[150px_16px_1fr] sm:grid-cols-[175px_20px_1fr] items-baseline gap-y-1">
                <span>Alasan Menginap</span>
                <span>:</span>
                <span className="font-normal whitespace-pre-line break-words">
                  {activeLetterData.alasanMenginap || '....................................................'}
                </span>
              </div>
            </div>

            {/* Closing */}
            <p className="mt-8 text-sm leading-relaxed">
              Demikian permohonan ini kami buat agar dimaklumi dan diucapkan terima kasih atas
              kerjasamanya.
            </p>

            {/* Place & Date */}
            <p className="mt-7 text-sm">
              {activeLetterData.tempatSurat || 'Bekasi'},{' '}
              {activeLetterData.tanggalSurat
                ? formatFormalLetterDate(activeLetterData.tanggalSurat)
                : '…………………………'}
            </p>

            {/* Signature Columns */}
            <div className="mt-4 grid grid-cols-3 gap-4 text-xs sm:text-sm text-center">
              <div className="flex flex-col items-center">
                <div>Pemohon,</div>
                <div className="mt-1">Warehouse Div</div>
                <div className="h-20" />
                <div className="font-normal">
                  ({activeLetterData.namaPemohon || '………………'})
                </div>
              </div>

              <div className="flex flex-col items-center">
                <div>Diketahui oleh,</div>
                <div className="mt-1">Sales &amp; Marketing Div</div>
                <div className="h-20" />
                <div className="font-normal">
                  ({activeLetterData.namaDiketahui || '……………….'})
                </div>
              </div>

              <div className="flex flex-col items-center">
                <div>Disetujui oleh,</div>
                <div className="mt-1">HA &amp; GS Div.</div>
                <div className="h-20" />
                <div className="font-normal">
                  ({activeLetterData.namaDisetujui || '………….….'})
                </div>
              </div>
            </div>

            {/* CC Footer */}
            <div className="mt-12 text-xs sm:text-sm leading-relaxed">
              <div>Tembusan :</div>
              <ol className="list-decimal list-inside mt-1 space-y-0.5 pl-1">
                <li>Pemohon</li>
                <li>Sales &amp; Marketing / Proc Exim</li>
                <li>PPIC</li>
              </ol>
            </div>
          </div>
        </section>
      </div>

      {/* Saved List Section (Hidden when printing) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden no-print">
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari supir, no polisi, transporter, alasan..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-xs sm:text-sm text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <input
                aria-label="Filter tanggal surat atau menginap"
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
              onClick={() => exportIjinMenginapCsv(filteredEntries)}
              className="inline-flex items-center gap-1.5 h-9 px-3 border border-slate-200 bg-white text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
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
                ? 'Belum ada Surat Permohonan Ijin Menginap tersimpan.'
                : 'Tidak ada surat yang cocok dengan filter pencarian.'}
            </p>
            <p className="text-xs text-slate-500">
              {entries.length === 0
                ? 'Isi formulir di atas lalu klik Simpan Surat untuk menyimpan dan mencetak.'
                : 'Ubah kata kunci pencarian atau pilih Semua Tanggal.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 whitespace-nowrap">
                  <th className="py-3 px-4 text-center">No</th>
                  <th className="py-3 px-4">Tanggal Surat</th>
                  <th className="py-3 px-4">Tanggal Menginap</th>
                  <th className="py-3 px-4">Nama Supir</th>
                  <th className="py-3 px-4">No Polisi</th>
                  <th className="py-3 px-4">Transporter</th>
                  <th className="py-3 px-4">Alasan Menginap</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredEntries.map((item) => {
                  const isConfirming = confirmDeleteId === item.id;
                  const isPreviewing = previewEntry?.id === item.id;

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isPreviewing ? 'bg-blue-50/60' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3 px-4 text-center font-mono font-bold tabular-nums text-slate-900 whitespace-nowrap">
                        {item.no}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-900">
                          {formatIndonesianShortDate(item.tanggalSurat)}
                        </div>
                        <div className="text-xs font-mono tabular-nums text-slate-400">
                          {item.tanggalSurat}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-serif font-normal text-slate-900">
                          {formatTanggalMenginapRange(
                            item.tanggalMenginap,
                            item.tanggalMenginapSampai
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">
                        {item.namaSupir}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {item.noPolisi}
                      </td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {item.transporter}
                      </td>
                      <td className="py-3 px-4 text-slate-600 min-w-[200px] max-w-xs">
                        {item.alasanMenginap}
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
                                  if (previewEntry?.id === item.id) {
                                    setPreviewEntry(null);
                                  }
                                  if (editingEntry?.id === item.id) {
                                    handleCancelEdit();
                                  }
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
                              onClick={() => {
                                setPreviewEntry(item);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              title="Pratinjau Surat"
                              className="p-2 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrintEntry(item)}
                              title="Cetak Surat"
                              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              title="Edit Surat"
                              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(item.id)}
                              title="Hapus Surat"
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
