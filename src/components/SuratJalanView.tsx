import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  Layers,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  clearSheetsAccessToken,
  connectGoogleSheets,
  getSheetsAccessToken,
  subscribeSheetsTokenStatus,
} from '../firebase';
import {
  DEFAULT_SPREADSHEET_ID,
  DEFAULT_SPREADSHEET_URL,
  extractSpreadsheetId,
  fetchSpreadsheetMetadata,
  fetchSpreadsheetRows,
  GoogleSheetsAuthError,
  ParsedSheetSuratJalanRow,
  SpreadsheetMetadata,
  syncSuratJalanBatchToGoogleSheet,
  syncSuratJalanToGoogleSheet,
} from '../services/googleSheetsService';
import { getNextSuratJalanNoForDate } from '../services/suratJalanService';
import {
  SURAT_JALAN_DOKUMEN_OPTIONS,
  SURAT_JALAN_VENDORS,
  SuratJalanEntry,
  SuratJalanFormState,
  SuratJalanVendor,
  VALIDATION_LIMITS,
} from '../types/delivery';
import {
  formatIndonesianDate,
  formatIndonesianShortDate,
} from '../utils/deliveryCalculations';

const SJ_DRAFTS_STORAGE_KEY = 'sj_drafts_v1';

interface DraftSuratJalanItem {
  draftId: string;
  tanggal: string;
  noDO: string;
  vendor: SuratJalanVendor;
  customVendor: string;
  dokumen: string;
}

interface DraftSuratJalanWithNo extends DraftSuratJalanItem {
  previewNo: number;
}

interface SuratJalanViewProps {
  entries: SuratJalanEntry[];
  onSave: (
    form: SuratJalanFormState,
    existing?: SuratJalanEntry | null,
    minNextNo?: number
  ) => Promise<{ id: string; no: number }>;
  onSaveBatch: (
    items: SuratJalanFormState[],
    minNextNoByDate?: Map<string, number>
  ) => Promise<
    Array<{
      id: string;
      no: number;
      tanggal: string;
      noDO: string;
      vendor: SuratJalanVendor;
      customVendor: string;
      dokumen: string;
    }>
  >;
}

function getLocalDateYYYYMMDD(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function loadSavedDrafts(): DraftSuratJalanItem[] {
  try {
    const raw = window.localStorage.getItem(SJ_DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is DraftSuratJalanItem =>
        Boolean(item) &&
        typeof item.draftId === 'string' &&
        typeof item.tanggal === 'string' &&
        VALIDATION_LIMITS.DATE_REGEX.test(item.tanggal) &&
        typeof item.noDO === 'string' &&
        item.noDO.trim().length > 0 &&
        typeof item.vendor === 'string' &&
        (SURAT_JALAN_VENDORS as readonly string[]).includes(item.vendor)
    );
  } catch {
    return [];
  }
}

export const SuratJalanView: React.FC<SuratJalanViewProps> = ({
  entries,
  onSave,
  onSaveBatch,
}) => {
  const todayStr = getLocalDateYYYYMMDD();

  const [tanggal, setTanggal] = useState<string>(todayStr);
  const [noDO, setNoDO] = useState<string>('');
  const [vendor, setVendor] = useState<SuratJalanVendor | ''>('');
  const [customVendor, setCustomVendor] = useState<string>('');
  const [dokumen, setDokumen] = useState<string>('TERKIRIM');
  const [keepVendorAfterAdd, setKeepVendorAfterAdd] = useState<boolean>(true);

  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftSuratJalanItem[]>(() => loadSavedDrafts());
  const [confirmClearDrafts, setConfirmClearDrafts] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Google Sheets state (in-memory token only)
  const [hasSheetsToken, setHasSheetsToken] = useState<boolean>(() =>
    Boolean(getSheetsAccessToken())
  );
  const [isConnectingSheets, setIsConnectingSheets] = useState(false);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string>(DEFAULT_SPREADSHEET_URL);
  const [sheetMetadata, setSheetMetadata] = useState<SpreadsheetMetadata | null>(null);
  const [selectedSheetTitle, setSelectedSheetTitle] = useState<string>('');
  const [sheetRows, setSheetRows] = useState<ParsedSheetSuratJalanRow[]>([]);
  const [isLoadingSheetRows, setIsLoadingSheetRows] = useState(false);
  const [sheetsError, setSheetsError] = useState<string | null>(null);
  const [isLoadingSheetMeta, setIsLoadingSheetMeta] = useState(false);

  // Explicit confirmation modal states before writing to Google Sheets
  const [pendingConfirmForm, setPendingConfirmForm] = useState<SuratJalanFormState | null>(null);
  const [pendingConfirmBatch, setPendingConfirmBatch] = useState<DraftSuratJalanWithNo[] | null>(
    null
  );

  const noDoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(SJ_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    } catch {
      // Ignore storage quota errors
    }
  }, [drafts]);

  const activeSpreadsheetId = useMemo(
    () => extractSpreadsheetId(spreadsheetUrl) || DEFAULT_SPREADSHEET_ID,
    [spreadsheetUrl]
  );

  // Assign deterministic per-date sequential numbers across [Cloud + Sheet + Drafts]
  const draftsWithPreviewNo = useMemo<DraftSuratJalanWithNo[]>(() => {
    const baseEntries = [...entries, ...sheetRows];
    const perDateCounter = new Map<string, number>();

    return drafts.map((draft) => {
      if (!perDateCounter.has(draft.tanggal)) {
        const baseNext = getNextSuratJalanNoForDate(baseEntries, draft.tanggal);
        perDateCounter.set(draft.tanggal, baseNext);
      }
      const nextNo = perDateCounter.get(draft.tanggal) ?? 1;
      perDateCounter.set(draft.tanggal, nextNo + 1);
      return {
        ...draft,
        previewNo: Math.min(nextNo, VALIDATION_LIMITS.MAX_SURAT_JALAN_NO),
      };
    });
  }, [drafts, entries, sheetRows]);

  // Sequential number considers Cloud + Sheet + Drafts and resets to 1 on each new date
  const previewNo = useMemo(() => {
    if (editingDraftId) {
      const matched = draftsWithPreviewNo.find((d) => d.draftId === editingDraftId);
      if (matched && matched.tanggal === tanggal) {
        return matched.previewNo;
      }
    }
    const combined = [
      ...entries,
      ...sheetRows,
      ...draftsWithPreviewNo.map((d) => ({ tanggal: d.tanggal, no: d.previewNo })),
    ];
    return getNextSuratJalanNoForDate(combined, tanggal);
  }, [entries, sheetRows, draftsWithPreviewNo, tanggal, editingDraftId]);

  useEffect(() => {
    const unsub = subscribeSheetsTokenStatus((hasToken) => {
      setHasSheetsToken(hasToken);
      if (!hasToken) {
        setSheetMetadata(null);
        setSelectedSheetTitle('');
        setSheetRows([]);
      }
    });
    return () => unsub();
  }, []);

  const loadRowsForTab = async (token: string, spreadsheetId: string, tabTitle: string) => {
    if (!tabTitle) return;
    setIsLoadingSheetRows(true);
    try {
      const rows = await fetchSpreadsheetRows(token, spreadsheetId, tabTitle);
      setSheetRows(rows);
    } catch (err) {
      if (err instanceof GoogleSheetsAuthError) {
        clearSheetsAccessToken();
      }
      setSheetsError(
        err instanceof Error ? err.message : 'Gagal membaca isi baris spreadsheet.'
      );
    } finally {
      setIsLoadingSheetRows(false);
    }
  };

  const loadMetadataForSpreadsheet = async (token: string, spreadsheetId: string) => {
    setIsLoadingSheetMeta(true);
    setSheetsError(null);
    try {
      const meta = await fetchSpreadsheetMetadata(spreadsheetId, token);
      setSheetMetadata(meta);
      const nextTab = meta.sheets.some((s) => s.title === selectedSheetTitle)
        ? selectedSheetTitle
        : meta.sheets[0].title;
      setSelectedSheetTitle(nextTab);
      await loadRowsForTab(token, spreadsheetId, nextTab);
      return meta;
    } catch (err) {
      if (err instanceof GoogleSheetsAuthError) {
        clearSheetsAccessToken();
      }
      const msg = err instanceof Error ? err.message : 'Gagal membaca metadata spreadsheet.';
      setSheetsError(msg);
      return null;
    } finally {
      setIsLoadingSheetMeta(false);
    }
  };

  useEffect(() => {
    const token = getSheetsAccessToken();
    if (!hasSheetsToken || !token) return;
    void loadMetadataForSpreadsheet(token, activeSpreadsheetId);
  }, [hasSheetsToken, activeSpreadsheetId]);

  useEffect(() => {
    const token = getSheetsAccessToken();
    if (!hasSheetsToken || !token || !selectedSheetTitle) return;
    if (sheetMetadata?.spreadsheetId !== activeSpreadsheetId) return;
    void loadRowsForTab(token, activeSpreadsheetId, selectedSheetTitle);
  }, [selectedSheetTitle]);

  const handleConnectSheets = async () => {
    setSheetsError(null);
    setIsConnectingSheets(true);
    try {
      const token = await connectGoogleSheets();
      await loadMetadataForSpreadsheet(token, activeSpreadsheetId);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      if (code !== 'auth/popup-closed-by-user') {
        setSheetsError(
          err instanceof Error ? err.message : 'Gagal menghubungkan akun Google Sheets.'
        );
      }
    } finally {
      setIsConnectingSheets(false);
    }
  };

  const todayCount = useMemo(() => {
    const mergedKeys = new Set<string>();
    entries.forEach((e) => {
      if (e.tanggal === tanggal) mergedKeys.add(e.noDO.trim().toLowerCase());
    });
    sheetRows.forEach((r) => {
      if (r.tanggal === tanggal) mergedKeys.add(r.noDO.trim().toLowerCase());
    });
    return mergedKeys.size;
  }, [entries, sheetRows, tanggal]);

  const resetFormAfterAction = (preserveVendor: boolean) => {
    setNoDO('');
    if (!preserveVendor) {
      setVendor('');
      setCustomVendor('');
    }
    setDokumen('TERKIRIM');
    setEditingDraftId(null);
    setTimeout(() => {
      noDoInputRef.current?.focus();
    }, 50);
  };

  const validateCurrentForm = (): SuratJalanFormState | null => {
    if (!VALIDATION_LIMITS.DATE_REGEX.test(tanggal)) {
      setStatusMsg({ type: 'err', text: 'Format tanggal tidak valid.' });
      return null;
    }
    if (!noDO.trim()) {
      setStatusMsg({ type: 'err', text: 'No Delivery Order wajib diisi.' });
      noDoInputRef.current?.focus();
      return null;
    }
    if (!vendor) {
      setStatusMsg({ type: 'err', text: 'Silakan pilih Nama Vendor terlebih dahulu.' });
      return null;
    }
    return {
      tanggal,
      noDO: noDO.trim(),
      vendor,
      customVendor: vendor === 'Lainnya' ? customVendor.trim() : '',
      dokumen: dokumen.trim() || 'TERKIRIM',
    };
  };

  const handleAddOrUpdateDraft = () => {
    setStatusMsg(null);
    setSheetsError(null);
    const validForm = validateCurrentForm();
    if (!validForm || !validForm.vendor) return;

    const cleanKey = `${validForm.tanggal}__${validForm.noDO.toLowerCase()}`;
    const duplicateInDraft = drafts.find(
      (d) =>
        d.draftId !== editingDraftId &&
        `${d.tanggal}__${d.noDO.trim().toLowerCase()}` === cleanKey
    );
    if (duplicateInDraft) {
      setStatusMsg({
        type: 'err',
        text: `No DO "${validForm.noDO}" untuk tanggal ${validForm.tanggal} sudah ada di daftar Draft.`,
      });
      noDoInputRef.current?.focus();
      return;
    }

    const assignedPreviewNo = previewNo;

    if (editingDraftId) {
      setDrafts((prev) =>
        prev.map((d) =>
          d.draftId === editingDraftId
            ? {
                ...d,
                tanggal: validForm.tanggal,
                noDO: validForm.noDO,
                vendor: validForm.vendor as SuratJalanVendor,
                customVendor: validForm.customVendor,
                dokumen: validForm.dokumen,
              }
            : d
        )
      );
      setStatusMsg({
        type: 'ok',
        text: `Draft (${validForm.noDO}) diperbarui. Klik "Kirim Semua ke Spreadsheet" bila sudah selesai.`,
      });
      resetFormAfterAction(keepVendorAfterAdd);
      return;
    }

    const newDraft: DraftSuratJalanItem = {
      draftId: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      tanggal: validForm.tanggal,
      noDO: validForm.noDO,
      vendor: validForm.vendor,
      customVendor: validForm.customVendor,
      dokumen: validForm.dokumen,
    };

    setDrafts((prev) => [...prev, newDraft]);
    setConfirmClearDrafts(false);
    setStatusMsg({
      type: 'ok',
      text: `Masuk ke Draft No. ${assignedPreviewNo} (${validForm.noDO}). Lanjut input atau klik "Kirim Semua ke Spreadsheet".`,
    });
    resetFormAfterAction(keepVendorAfterAdd);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAddOrUpdateDraft();
  };

  const handleDirectSingleSaveClick = () => {
    setStatusMsg(null);
    setSheetsError(null);
    const validForm = validateCurrentForm();
    if (!validForm) return;
    setPendingConfirmForm(validForm);
  };

  const executeConfirmedSingleSendToSheet = async () => {
    if (!pendingConfirmForm) return;
    const formToSave = pendingConfirmForm;

    setIsSubmitting(true);
    setStatusMsg(null);
    setSheetsError(null);

    try {
      let token = getSheetsAccessToken();
      let targetTab = selectedSheetTitle;
      let latestSheetRows = sheetRows;

      if (!token) {
        token = await connectGoogleSheets();
      }
      if (!targetTab || sheetMetadata?.spreadsheetId !== activeSpreadsheetId) {
        const meta = await fetchSpreadsheetMetadata(activeSpreadsheetId, token);
        setSheetMetadata(meta);
        targetTab = meta.sheets[0].title;
        setSelectedSheetTitle(targetTab);
      }
      try {
        latestSheetRows = await fetchSpreadsheetRows(token, activeSpreadsheetId, targetTab);
        setSheetRows(latestSheetRows);
      } catch {
        // Keep existing cache if transient read fails
      }

      const minNextNoFromSheet = getNextSuratJalanNoForDate(latestSheetRows, formToSave.tanggal);

      // 1. Save to Cloud Firestore to lock sequential per-date `no`
      const saved = await onSave(formToSave, null, minNextNoFromSheet);

      // 2. Send automatically to Google Spreadsheet (top-to-bottom unfilled row)
      const sheetResult = await syncSuratJalanToGoogleSheet({
        accessToken: token,
        spreadsheetId: activeSpreadsheetId,
        sheetTitle: targetTab,
        entry: {
          no: saved.no,
          tanggal: formToSave.tanggal,
          noDO: formToSave.noDO,
          vendor: formToSave.vendor,
          customVendor: formToSave.customVendor,
          dokumen: formToSave.dokumen || 'TERKIRIM',
        },
        previousMatch: null,
      });

      void loadRowsForTab(token, activeSpreadsheetId, targetTab);

      setStatusMsg({
        type: 'ok',
        text: `Data No. ${saved.no} (${formToSave.noDO}) otomatis terkirim ke Google Spreadsheet (Tab "${targetTab}", baris ${sheetResult.rowNumber}).`,
      });

      setPendingConfirmForm(null);
      resetFormAfterAction(keepVendorAfterAdd);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      if (code === 'auth/popup-closed-by-user') {
        setPendingConfirmForm(null);
        return;
      }
      if (err instanceof GoogleSheetsAuthError) {
        clearSheetsAccessToken();
      }
      const msg =
        err instanceof Error ? err.message : 'Gagal mengirim data surat jalan ke Spreadsheet.';
      setSheetsError(msg);
      setStatusMsg({
        type: 'err',
        text: msg,
      });
      setPendingConfirmForm(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeConfirmedBatchSendToSheet = async () => {
    if (!pendingConfirmBatch || pendingConfirmBatch.length === 0) return;
    const batchItems = pendingConfirmBatch;

    setIsSubmitting(true);
    setStatusMsg(null);
    setSheetsError(null);

    try {
      let token = getSheetsAccessToken();
      let targetTab = selectedSheetTitle;
      let latestSheetRows = sheetRows;

      if (!token) {
        token = await connectGoogleSheets();
      }
      if (!targetTab || sheetMetadata?.spreadsheetId !== activeSpreadsheetId) {
        const meta = await fetchSpreadsheetMetadata(activeSpreadsheetId, token);
        setSheetMetadata(meta);
        targetTab = meta.sheets[0].title;
        setSelectedSheetTitle(targetTab);
      }
      try {
        latestSheetRows = await fetchSpreadsheetRows(token, activeSpreadsheetId, targetTab);
        setSheetRows(latestSheetRows);
      } catch {
        // Keep cached sheetRows if transient fetch fails
      }

      const minNextNoByDate = new Map<string, number>();
      Array.from(new Set(batchItems.map((b) => b.tanggal))).forEach((dateStr) => {
        minNextNoByDate.set(dateStr, getNextSuratJalanNoForDate(latestSheetRows, dateStr));
      });

      const formPayloadList: SuratJalanFormState[] = batchItems.map((item) => ({
        tanggal: item.tanggal,
        noDO: item.noDO,
        vendor: item.vendor,
        customVendor: item.customVendor,
        dokumen: item.dokumen || 'TERKIRIM',
      }));

      // 1. Save all drafts to Cloud Firestore
      const savedEntries = await onSaveBatch(formPayloadList, minNextNoByDate);

      // Clear saved drafts
      const savedDraftIds = new Set(batchItems.map((b) => b.draftId));
      setDrafts((prev) => prev.filter((d) => !savedDraftIds.has(d.draftId)));
      if (editingDraftId && savedDraftIds.has(editingDraftId)) {
        resetFormAfterAction(keepVendorAfterAdd);
      }

      // 2. Send all saved entries automatically to Google Spreadsheet (top-to-bottom unfilled rows)
      const sheetResult = await syncSuratJalanBatchToGoogleSheet({
        accessToken: token,
        spreadsheetId: activeSpreadsheetId,
        sheetTitle: targetTab,
        entries: savedEntries.map((item) => ({
          no: item.no,
          tanggal: item.tanggal,
          noDO: item.noDO,
          vendor: item.vendor,
          customVendor: item.customVendor,
          dokumen: item.dokumen || 'TERKIRIM',
        })),
      });

      void loadRowsForTab(token, activeSpreadsheetId, targetTab);

      const rowDesc =
        sheetResult.firstRowNumber === sheetResult.lastRowNumber
          ? `baris ${sheetResult.firstRowNumber}`
          : `baris ${sheetResult.firstRowNumber}–${sheetResult.lastRowNumber}`;

      setStatusMsg({
        type: 'ok',
        text: `${savedEntries.length} data Draft otomatis terkirim ke Google Spreadsheet (Tab "${targetTab}", ${rowDesc}).`,
      });

      setPendingConfirmBatch(null);
      setTimeout(() => {
        noDoInputRef.current?.focus();
      }, 50);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      if (code === 'auth/popup-closed-by-user') {
        setPendingConfirmBatch(null);
        return;
      }
      if (err instanceof GoogleSheetsAuthError) {
        clearSheetsAccessToken();
      }
      const msg =
        err instanceof Error ? err.message : 'Gagal mengirim seluruh Draft ke Spreadsheet.';
      setSheetsError(msg);
      setStatusMsg({
        type: 'err',
        text: msg,
      });
      setPendingConfirmBatch(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEditDraft = (draft: DraftSuratJalanWithNo) => {
    setEditingDraftId(draft.draftId);
    setTanggal(draft.tanggal);
    setNoDO(draft.noDO);
    setVendor(draft.vendor);
    setCustomVendor(draft.customVendor || '');
    setDokumen(draft.dokumen || 'TERKIRIM');
    setStatusMsg(null);
    noDoInputRef.current?.focus();
  };

  const handleRemoveDraft = (draftId: string) => {
    setDrafts((prev) => prev.filter((d) => d.draftId !== draftId));
    if (editingDraftId === draftId) {
      setEditingDraftId(null);
      setNoDO('');
    }
  };

  const handleCancelEditDraft = () => {
    setEditingDraftId(null);
    setTanggal(todayStr);
    setNoDO('');
    setVendor('');
    setCustomVendor('');
    setDokumen('TERKIRIM');
    setStatusMsg(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
            <span>Input Operasional Logistik</span>
            <span aria-hidden="true">·</span>
            <span>
              Tanggal {formatIndonesianShortDate(tanggal)}: {todayCount} DO Tercatat
            </span>
            {drafts.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-blue-700">Draft: {drafts.length} DO</span>
              </>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-900">Data Surat Jalan</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-xs text-slate-500">
              <div>No Urut ({formatIndonesianShortDate(tanggal)})</div>
              <div className="text-[11px] text-slate-400">
                Refresh ke No. 1 tiap ganti tanggal
              </div>
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-blue-700">
              #{previewNo}
            </div>
          </div>

          <a
            href={spreadsheetUrl || DEFAULT_SPREADSHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 border border-slate-200 bg-white text-slate-700 text-xs sm:text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <ExternalLink className="w-4 h-4 text-blue-700" />
            Buka Spreadsheet Database
          </a>
        </div>
      </div>

      {/* Google Sheets Connection Panel */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Pengiriman Otomatis ke Google Spreadsheet
                </h3>
                {hasSheetsToken ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Terhubung{sheetMetadata ? ` (${sheetMetadata.spreadsheetTitle})` : ''}
                    {sheetRows.length > 0 ? ` · ${sheetRows.length} baris` : ''}
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-amber-700">
                    Hubungkan Google Sheets untuk mengirim langsung ke spreadsheet
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Semua data yang disimpan (baik 1 data langsung maupun seluruh Draft) otomatis dikirim
                ke baris kosong pertama dari atas ke bawah pada spreadsheet tujuan.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {hasSheetsToken && sheetMetadata && (
              <div className="flex items-center gap-2">
                <label
                  htmlFor="sj-sheet-tab"
                  className="text-xs font-medium text-slate-600 whitespace-nowrap"
                >
                  Tab Sheet:
                </label>
                <select
                  id="sj-sheet-tab"
                  value={selectedSheetTitle}
                  onChange={(e) => setSelectedSheetTitle(e.target.value)}
                  disabled={isLoadingSheetMeta || isLoadingSheetRows}
                  className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm font-medium text-slate-800 focus:border-blue-600 focus:outline-none cursor-pointer"
                >
                  {sheetMetadata.sheets.map((s) => (
                    <option key={s.sheetId} value={s.title}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Official Google Sign-In button style */}
            <button
              type="button"
              disabled={isConnectingSheets || isLoadingSheetMeta}
              onClick={handleConnectSheets}
              className="h-10 inline-flex items-center justify-center gap-2.5 px-4 rounded-md border border-[#747775] bg-white hover:bg-slate-50 text-[#1F1F1F] text-sm font-medium transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap shadow-2xs"
            >
              {isConnectingSheets || isLoadingSheetMeta ? (
                <RefreshCw className="w-4 h-4 animate-spin text-slate-600" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
              )}
              <span>{hasSheetsToken ? 'Refresh Google Sheets' : 'Sign in with Google'}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
          <label
            htmlFor="sj-spreadsheet-url"
            className="text-xs font-medium text-slate-600 shrink-0"
          >
            Link Spreadsheet:
          </label>
          <input
            id="sj-spreadsheet-url"
            type="url"
            value={spreadsheetUrl}
            onChange={(e) => setSpreadsheetUrl(e.target.value)}
            placeholder={DEFAULT_SPREADSHEET_URL}
            className="flex-1 h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-mono text-slate-700 focus:bg-white focus:border-blue-600 focus:outline-none"
          />
          {spreadsheetUrl !== DEFAULT_SPREADSHEET_URL && (
            <button
              type="button"
              onClick={() => setSpreadsheetUrl(DEFAULT_SPREADSHEET_URL)}
              className="text-xs font-medium text-blue-700 hover:underline cursor-pointer shrink-0"
            >
              Reset Default
            </button>
          )}
        </div>

        {sheetsError && (
          <div className="rounded-lg px-3.5 py-2.5 text-xs font-medium flex items-start gap-2 border bg-amber-50 border-amber-200 text-amber-900">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{sheetsError}</span>
          </div>
        )}
      </div>

      {/* Main Split: Input Form (Left) + Draft Queue (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Input Form Card */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <FileCheck2 className="w-4 h-4 text-blue-700 shrink-0" />
              <h3 className="text-base font-semibold text-slate-900">
                {editingDraftId ? `Edit Draft (No. ${previewNo})` : 'Input Surat Jalan'}
              </h3>
            </div>
            {editingDraftId && (
              <button
                type="button"
                onClick={handleCancelEditDraft}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Batal Edit
              </button>
            )}
          </div>

          <form onSubmit={handleFormSubmit} className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="sj-no" className="block text-xs font-semibold text-slate-700">
                  No Urut
                </label>
                <input
                  id="sj-no"
                  type="text"
                  readOnly
                  value={`No. ${previewNo}`}
                  className="w-full h-11 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm font-mono font-bold tabular-nums text-blue-800 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label htmlFor="sj-tanggal" className="block text-xs font-semibold text-slate-700">
                  Tanggal
                </label>
                <input
                  id="sj-tanggal"
                  type="date"
                  required
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sj-nodo" className="block text-xs font-semibold text-slate-700">
                No Delivery Order
              </label>
              <input
                ref={noDoInputRef}
                id="sj-nodo"
                type="text"
                required
                maxLength={VALIDATION_LIMITS.MAX_DO_LENGTH}
                autoComplete="off"
                placeholder="Scan atau ketik nomor DO lalu Enter..."
                value={noDO}
                onChange={(e) => setNoDO(e.target.value)}
                className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sj-vendor" className="block text-xs font-semibold text-slate-700">
                Nama Vendor
              </label>
              <select
                id="sj-vendor"
                required
                value={vendor}
                onChange={(e) => setVendor(e.target.value as SuratJalanVendor | '')}
                className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-600 focus:outline-none cursor-pointer"
              >
                <option value="" disabled>
                  -- Pilih Vendor --
                </option>
                {SURAT_JALAN_VENDORS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            {vendor === 'Lainnya' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="sj-custom-vendor"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Keterangan Nama Vendor (Opsional)
                </label>
                <input
                  id="sj-custom-vendor"
                  type="text"
                  maxLength={VALIDATION_LIMITS.MAX_VENDOR_LENGTH}
                  placeholder="Tulis nama vendor..."
                  value={customVendor}
                  onChange={(e) => setCustomVendor(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="sj-dokumen" className="block text-xs font-semibold text-slate-700">
                Dokumen
              </label>
              <input
                id="sj-dokumen"
                type="text"
                list="sj-dokumen-options"
                required
                maxLength={VALIDATION_LIMITS.MAX_DOKUMEN_LENGTH}
                value={dokumen}
                onChange={(e) => setDokumen(e.target.value)}
                placeholder="TERKIRIM"
                className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
              />
              <datalist id="sj-dokumen-options">
                {SURAT_JALAN_DOKUMEN_OPTIONS.map((opt) => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={keepVendorAfterAdd}
                onChange={(e) => setKeepVendorAfterAdd(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 cursor-pointer"
              />
              <span>Samakan Nama Vendor untuk input berikutnya</span>
            </label>

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

            <div className="space-y-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 inline-flex items-center justify-center gap-2 px-4 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {editingDraftId
                  ? `Simpan Perubahan Draft (No. ${previewNo})`
                  : `Tambah ke Draft (No. ${previewNo})`}
              </button>

              {!editingDraftId && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleDirectSingleSaveClick}
                  className="w-full h-10 inline-flex items-center justify-center gap-2 px-4 border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-lg hover:bg-emerald-100 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  Simpan &amp; Kirim Langsung 1 Data ke Spreadsheet
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Right Column: Draft Queue Card Only (Saved List removed as requested) */}
        <div className="lg:col-span-7 bg-white border border-blue-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 bg-blue-50/60 border-b border-blue-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Draft Surat Jalan ({draftsWithPreviewNo.length} Data Siap Dikirim)
                </h3>
                <p className="text-xs text-slate-600">
                  Input banyak nomor DO terlebih dahulu ke Draft, lalu kirim bersamaan langsung ke
                  Google Spreadsheet.
                </p>
              </div>
            </div>

            {draftsWithPreviewNo.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {confirmClearDrafts ? (
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setDrafts([]);
                        setEditingDraftId(null);
                        setConfirmClearDrafts(false);
                      }}
                      className="h-9 px-2.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 cursor-pointer"
                    >
                      Ya, Kosongkan Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearDrafts(false)}
                      className="h-9 px-2.5 border border-slate-200 bg-white text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setConfirmClearDrafts(true)}
                    className="inline-flex items-center gap-1 h-9 px-3 border border-red-200 bg-white text-red-700 text-xs font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus Draft
                  </button>
                )}

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setStatusMsg(null);
                    setSheetsError(null);
                    setPendingConfirmBatch(draftsWithPreviewNo);
                  }}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5" />
                  Kirim Semua ({draftsWithPreviewNo.length}) ke Spreadsheet
                </button>
              </div>
            )}
          </div>

          {draftsWithPreviewNo.length === 0 ? (
            <div className="px-6 py-14 text-center space-y-2">
              <p className="text-sm font-medium text-slate-700">
                Belum ada antrean Draft Surat Jalan.
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Isi formulir di samping lalu klik <strong>Tambah ke Draft</strong> (atau tekan{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[11px]">
                  Enter
                </kbd>
                ) untuk mengumpulkan banyak DO dan mengirimnya bersamaan ke Google Spreadsheet, atau
                gunakan tombol <strong>Simpan &amp; Kirim Langsung</strong>.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-2.5 px-4">Tanggal</th>
                    <th className="py-2.5 px-3 text-center">No</th>
                    <th className="py-2.5 px-4">No Delivery Order</th>
                    <th className="py-2.5 px-4">Nama Vendor</th>
                    <th className="py-2.5 px-3">Dokumen</th>
                    <th className="py-2.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs sm:text-sm">
                  {draftsWithPreviewNo.map((item) => {
                    const isEditingThis = editingDraftId === item.draftId;
                    const displayVendor =
                      item.vendor === 'Lainnya' && item.customVendor
                        ? `${item.vendor} (${item.customVendor})`
                        : item.vendor;
                    return (
                      <tr
                        key={item.draftId}
                        className={
                          isEditingThis
                            ? 'bg-blue-50/70'
                            : 'hover:bg-slate-50/80 transition-colors'
                        }
                      >
                        <td className="py-3 px-4 whitespace-nowrap font-mono text-xs text-slate-700">
                          {item.tanggal}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold tabular-nums text-blue-700 whitespace-nowrap">
                          {item.previewNo}
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-slate-900">
                          {item.noDO}
                        </td>
                        <td className="py-3 px-4 text-slate-700">{displayVendor}</td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="text-xs font-semibold text-emerald-700">
                            {item.dokumen || 'TERKIRIM'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEditDraft(item)}
                              title="Edit Draft"
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveDraft(item.draftId)}
                              title="Hapus dari Draft"
                              className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
      </div>

      {/* Explicit Confirmation Modal: Single Entry Send to Spreadsheet */}
      {pendingConfirmForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-sheets-title"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="confirm-sheets-title" className="text-base font-bold text-slate-900">
                    Konfirmasi Kirim ke Google Spreadsheet
                  </h3>
                  <p className="text-xs text-slate-500">
                    Data ini akan langsung ditambahkan ke spreadsheet tujuan
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setPendingConfirmForm(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Target Spreadsheet</span>
                <span className="font-semibold text-slate-900 text-right truncate max-w-[220px]">
                  {sheetMetadata?.spreadsheetTitle || 'DATA_SURAT_JALAN_BALIK'}
                </span>
              </div>
              {selectedSheetTitle && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Tab Sheet</span>
                  <span className="font-semibold text-blue-800 text-right">
                    {selectedSheetTitle}
                  </span>
                </div>
              )}
              <div className="border-t border-slate-200 my-1.5 pt-2 flex justify-between gap-2">
                <span className="text-slate-500">Tanggal</span>
                <span className="font-medium text-slate-900 text-right">
                  {formatIndonesianDate(pendingConfirmForm.tanggal)} ({pendingConfirmForm.tanggal})
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">No Urut (Per Tanggal)</span>
                <span className="font-mono font-bold text-slate-900">#{previewNo}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">No Delivery Order</span>
                <span className="font-mono font-semibold text-slate-900 text-right">
                  {pendingConfirmForm.noDO}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Nama Vendor</span>
                <span className="font-medium text-slate-900 text-right">
                  {pendingConfirmForm.vendor === 'Lainnya' && pendingConfirmForm.customVendor
                    ? `${pendingConfirmForm.vendor} (${pendingConfirmForm.customVendor})`
                    : pendingConfirmForm.vendor}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Dokumen</span>
                <span className="font-semibold text-emerald-700 text-right">
                  {pendingConfirmForm.dokumen || 'TERKIRIM'}
                </span>
              </div>
            </div>

            {!hasSheetsToken && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Anda akan diminta menyetujui akses Google Sheets melalui pop-up Google untuk
                mengirim baris ini langsung ke spreadsheet.
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void executeConfirmedSingleSendToSheet()}
                className="flex-1 h-11 inline-flex items-center justify-center gap-2 px-4 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4" />
                )}
                {isSubmitting
                  ? 'Mengirim...'
                  : hasSheetsToken
                    ? 'Ya, Kirim ke Spreadsheet'
                    : 'Hubungkan Google & Kirim'}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setPendingConfirmForm(null)}
                className="h-11 px-4 border border-slate-200 bg-white text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal: Batch Draft Send to Spreadsheet */}
      {pendingConfirmBatch && pendingConfirmBatch.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-batch-sheets-title"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="confirm-batch-sheets-title" className="text-base font-bold text-slate-900">
                    Konfirmasi Kirim {pendingConfirmBatch.length} Draft ke Spreadsheet
                  </h3>
                  <p className="text-xs text-slate-500">
                    Seluruh baris berikut akan langsung dikirim dari atas ke bawah
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setPendingConfirmBatch(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Target Spreadsheet</span>
                <span className="font-semibold text-slate-900 text-right truncate max-w-[260px]">
                  {sheetMetadata?.spreadsheetTitle || 'DATA_SURAT_JALAN_BALIK'}
                </span>
              </div>
              {selectedSheetTitle && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Tab Sheet</span>
                  <span className="font-semibold text-blue-800 text-right">
                    {selectedSheetTitle}
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Jumlah Baris Draft</span>
                <span className="font-bold text-slate-900">{pendingConfirmBatch.length} Data</span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2 px-3">Tanggal</th>
                    <th className="py-2 px-2 text-center">No</th>
                    <th className="py-2 px-3">No DO</th>
                    <th className="py-2 px-3">Vendor</th>
                    <th className="py-2 px-2">Dok</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {pendingConfirmBatch.map((item) => (
                    <tr key={item.draftId}>
                      <td className="py-2 px-3 font-mono whitespace-nowrap">{item.tanggal}</td>
                      <td className="py-2 px-2 text-center font-mono font-bold text-blue-700">
                        {item.previewNo}
                      </td>
                      <td className="py-2 px-3 font-mono font-medium text-slate-900">
                        {item.noDO}
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        {item.vendor === 'Lainnya' && item.customVendor
                          ? `${item.vendor} (${item.customVendor})`
                          : item.vendor}
                      </td>
                      <td className="py-2 px-2 font-semibold text-emerald-700">
                        {item.dokumen || 'TERKIRIM'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!hasSheetsToken && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Anda akan diminta menyetujui akses Google Sheets melalui pop-up Google untuk
                mengirim seluruh baris ini langsung ke spreadsheet.
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void executeConfirmedBatchSendToSheet()}
                className="flex-1 h-11 inline-flex items-center justify-center gap-2 px-4 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4" />
                )}
                {isSubmitting
                  ? 'Mengirim Semua...'
                  : hasSheetsToken
                    ? `Ya, Kirim Semua (${pendingConfirmBatch.length}) ke Spreadsheet`
                    : `Hubungkan Google & Kirim (${pendingConfirmBatch.length})`}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setPendingConfirmBatch(null)}
                className="h-11 px-4 border border-slate-200 bg-white text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
