import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  BarChart3,
  BedDouble,
  ClipboardList,
  FileCheck2,
  KeyRound,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Tv,
  UserCheck,
  X,
} from 'lucide-react';
import { AdminOtpView } from './components/AdminOtpView';
import { AuthGateView } from './components/AuthGateView';
import { DataSupirView } from './components/DataSupirView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HistoryView } from './components/HistoryView';
import { IjinMenginapView } from './components/IjinMenginapView';
import { InputFormView } from './components/InputFormView';
import { LiveTvView } from './components/LiveTvView';
import { RecapView } from './components/RecapView';
import { SuratJalanView } from './components/SuratJalanView';
import { auth } from './firebase';
import {
  saveDeliveryReport,
  subscribeSharedReports,
} from './services/deliveryService';
import {
  buildDriverLogId,
  deleteDriverLogEntry,
  getNextDriverNoForDate,
  sanitizeDriverLogPayload,
  saveDriverLogEntry,
  subscribeSharedDriverLogs,
} from './services/driverLogService';
import {
  buildIjinMenginapId,
  deleteIjinMenginapEntry,
  getNextIjinMenginapNoForDate,
  sanitizeIjinMenginapPayload,
  saveIjinMenginapEntry,
  subscribeSharedIjinMenginap,
} from './services/ijinMenginapService';
import {
  deleteOtpRequest,
  issueOtpForUser,
  rejectOtpRequest,
  revokeOtpAccess,
  subscribeAllOtpRequests,
  subscribeAllOtpSecrets,
  subscribeMyOtpRequest,
} from './services/otpService';
import {
  getNextSuratJalanNoForDate,
  normalizeSuratJalanNoDo,
  sanitizeSuratJalanPayload,
  saveSuratJalanBatch,
  saveSuratJalanEntry,
  subscribeSharedSuratJalan,
} from './services/suratJalanService';
import {
  ADMIN_OTP_EMAIL,
  DeliveryFormState,
  DeliveryReport,
  DriverLogEntry,
  DriverLogFormState,
  IjinMenginapEntry,
  IjinMenginapFormState,
  isAdminEmail,
  OtpRequestRecord,
  OtpSecretRecord,
  SuratJalanEntry,
  SuratJalanFormState,
} from './types/delivery';
import { roundTon } from './utils/deliveryCalculations';

type ActiveTab =
  | 'recap'
  | 'input'
  | 'history'
  | 'surat_jalan'
  | 'data_supir'
  | 'live_tv'
  | 'ijin_menginap'
  | 'admin_otp';

function MainApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authVersion, setAuthVersion] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [myOtpRequest, setMyOtpRequest] = useState<OtpRequestRecord | null>(null);
  const [isLoadingMyOtp, setIsLoadingMyOtp] = useState(false);

  const [allOtpRequests, setAllOtpRequests] = useState<OtpRequestRecord[]>([]);
  const [allOtpSecrets, setAllOtpSecrets] = useState<Record<string, OtpSecretRecord>>({});
  const [isLoadingAdminOtp, setIsLoadingAdminOtp] = useState(false);

  const [cloudReports, setCloudReports] = useState<DeliveryReport[]>([]);
  const [localReports, setLocalReports] = useState<DeliveryReport[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const [cloudSuratJalan, setCloudSuratJalan] = useState<SuratJalanEntry[]>([]);
  const [localSuratJalan, setLocalSuratJalan] = useState<SuratJalanEntry[]>([]);
  const [isLoadingSuratJalan, setIsLoadingSuratJalan] = useState(false);

  const [cloudDriverLogs, setCloudDriverLogs] = useState<DriverLogEntry[]>([]);
  const [localDriverLogs, setLocalDriverLogs] = useState<DriverLogEntry[]>([]);
  const [isLoadingDriverLogs, setIsLoadingDriverLogs] = useState(false);

  const [cloudIjinMenginap, setCloudIjinMenginap] = useState<IjinMenginapEntry[]>([]);
  const [localIjinMenginap, setLocalIjinMenginap] = useState<IjinMenginapEntry[]>([]);
  const [isLoadingIjinMenginap, setIsLoadingIjinMenginap] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [syncRetryKey, setSyncRetryKey] = useState(0);

  const [activeTab, setActiveTab] = useState<ActiveTab>('recap');
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const seenReportTimestampsRef = useRef<Map<string, number> | null>(null);
  const lastUidRef = useRef<string | null>(null);
  const autoRetryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((curr) => (curr === msg ? null : curr));
    }, 3200);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      const nextUid = firebaseUser?.uid ?? null;
      if (lastUidRef.current !== nextUid) {
        lastUidRef.current = nextUid;
        setMyOtpRequest(null);
        setAllOtpRequests([]);
        setAllOtpSecrets({});
        setCloudReports([]);
        setCloudSuratJalan([]);
        setCloudDriverLogs([]);
        setCloudIjinMenginap([]);
        seenReportTimestampsRef.current = null;
        autoRetryCountRef.current = 0;
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        setSyncRetryKey(0);
        setSelectedDate(new Date().toISOString().slice(0, 10));
        setActiveTab('recap');
      }
      setUser(firebaseUser);
      setAuthReady(true);
      setAuthError(null);
    });
    return () => {
      unsub();
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  const isAdmin = useMemo(
    () => Boolean(user && user.emailVerified && isAdminEmail(user.email)),
    [user, authVersion]
  );

  // Subscribe to current non-admin user's OTP request status
  useEffect(() => {
    if (!authReady || !user || isAdmin) {
      setMyOtpRequest(null);
      setIsLoadingMyOtp(false);
      return;
    }

    setIsLoadingMyOtp(true);
    const unsub = subscribeMyOtpRequest(
      user.uid,
      (record) => {
        setMyOtpRequest(record);
        setIsLoadingMyOtp(false);
      },
      (err) => {
        setIsLoadingMyOtp(false);
        setAuthError(err.message);
      }
    );

    return () => unsub();
  }, [authReady, user, isAdmin]);

  // Subscribe to all OTP requests & secrets exclusively for verified Administrator
  useEffect(() => {
    if (!authReady || !user || !isAdmin) {
      setAllOtpRequests([]);
      setAllOtpSecrets({});
      setIsLoadingAdminOtp(false);
      return;
    }

    setIsLoadingAdminOtp(true);
    const unsubReq = subscribeAllOtpRequests(
      (items) => {
        setAllOtpRequests(items);
        setIsLoadingAdminOtp(false);
      },
      (err) => {
        setIsLoadingAdminOtp(false);
        setAuthError(err.message);
      }
    );

    const unsubSec = subscribeAllOtpSecrets(
      (map) => {
        setAllOtpSecrets(map);
      },
      (err) => {
        setAuthError(err.message);
      }
    );

    return () => {
      unsubReq();
      unsubSec();
    };
  }, [authReady, user, isAdmin]);

  const isAuthenticatedAndVerified = useMemo(() => {
    if (!user) return false;
    if (isAdmin) return true;
    return myOtpRequest?.status === 'verified' && !myOtpRequest.hasPendingWrites;
  }, [user, isAdmin, myOtpRequest]);

  // Reset activeTab away from admin_otp if not admin
  useEffect(() => {
    if (!isAdmin && activeTab === 'admin_otp') {
      setActiveTab('recap');
    }
  }, [isAdmin, activeTab]);

  const scheduleSharedSyncRetry = (errMessage: string) => {
    if (autoRetryCountRef.current < 3) {
      autoRetryCountRef.current += 1;
      if (!retryTimerRef.current) {
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          setSyncRetryKey((k) => k + 1);
        }, 900);
      }
      return;
    }
    setAuthError(errMessage);
  };

  const handleManualSyncReload = () => {
    autoRetryCountRef.current = 0;
    setAuthError(null);
    setSyncRetryKey((k) => k + 1);
  };

  useEffect(() => {
    if (!authReady || !user || !isAuthenticatedAndVerified) {
      setCloudReports([]);
      seenReportTimestampsRef.current = null;
      setIsLoadingData(false);
      return;
    }

    setIsLoadingData(true);
    const unsub = subscribeSharedReports(
      (items) => {
        autoRetryCountRef.current = 0;
        setAuthError(null);
        const prevMap = seenReportTimestampsRef.current;
        const nextMap = new Map<string, number>();
        let freshlyUpdatedItem: DeliveryReport | null = null;

        items.forEach((item) => {
          const ts = item.updatedAtMs ?? item.createdAtMs ?? 0;
          nextMap.set(item.date, ts);
          if (prevMap !== null) {
            const prevTs = prevMap.get(item.date);
            if (prevTs === undefined || ts > prevTs) {
              if (
                !freshlyUpdatedItem ||
                ts > (freshlyUpdatedItem.updatedAtMs ?? freshlyUpdatedItem.createdAtMs ?? 0)
              ) {
                freshlyUpdatedItem = item;
              }
            }
          }
        });

        seenReportTimestampsRef.current = nextMap;
        setCloudReports(items);
        setIsLoadingData(false);

        if (items.length > 0) {
          if (freshlyUpdatedItem) {
            setSelectedDate((freshlyUpdatedItem as DeliveryReport).date);
          } else {
            setSelectedDate((prev) =>
              items.some((r) => r.date === prev) ? prev : items[0].date
            );
          }
        }
      },
      (err) => {
        setIsLoadingData(false);
        scheduleSharedSyncRetry(err.message);
      }
    );

    return () => unsub();
  }, [authReady, user, isAuthenticatedAndVerified, syncRetryKey]);

  useEffect(() => {
    if (!authReady || !user || !isAuthenticatedAndVerified) {
      setCloudSuratJalan([]);
      setIsLoadingSuratJalan(false);
      return;
    }

    setIsLoadingSuratJalan(true);
    const unsub = subscribeSharedSuratJalan(
      (items) => {
        autoRetryCountRef.current = 0;
        setAuthError(null);
        setCloudSuratJalan(items);
        setIsLoadingSuratJalan(false);
      },
      (err) => {
        setIsLoadingSuratJalan(false);
        scheduleSharedSyncRetry(err.message);
      }
    );

    return () => unsub();
  }, [authReady, user, isAuthenticatedAndVerified, syncRetryKey]);

  useEffect(() => {
    if (!authReady || !user || !isAuthenticatedAndVerified) {
      setCloudDriverLogs([]);
      setIsLoadingDriverLogs(false);
      return;
    }

    setIsLoadingDriverLogs(true);
    const unsub = subscribeSharedDriverLogs(
      (items) => {
        autoRetryCountRef.current = 0;
        setAuthError(null);
        setCloudDriverLogs(items);
        setIsLoadingDriverLogs(false);
      },
      (err) => {
        setIsLoadingDriverLogs(false);
        scheduleSharedSyncRetry(err.message);
      }
    );

    return () => unsub();
  }, [authReady, user, isAuthenticatedAndVerified, syncRetryKey]);

  useEffect(() => {
    if (!authReady || !user || !isAuthenticatedAndVerified) {
      setCloudIjinMenginap([]);
      setIsLoadingIjinMenginap(false);
      return;
    }

    setIsLoadingIjinMenginap(true);
    const unsub = subscribeSharedIjinMenginap(
      (items) => {
        autoRetryCountRef.current = 0;
        setAuthError(null);
        setCloudIjinMenginap(items);
        setIsLoadingIjinMenginap(false);
      },
      (err) => {
        setIsLoadingIjinMenginap(false);
        scheduleSharedSyncRetry(err.message);
      }
    );

    return () => unsub();
  }, [authReady, user, isAuthenticatedAndVerified, syncRetryKey]);

  const reports = user ? cloudReports : localReports;
  const suratJalanEntries = user ? cloudSuratJalan : localSuratJalan;
  const driverLogEntries = user ? cloudDriverLogs : localDriverLogs;
  const ijinMenginapEntries = user ? cloudIjinMenginap : localIjinMenginap;

  const selectedReport = useMemo(() => {
    if (reports.length === 0) return null;
    return reports.find((r) => r.date === selectedDate) ?? reports[0];
  }, [reports, selectedDate]);

  const pendingOtpCount = useMemo(
    () => allOtpRequests.filter((r) => r.status === 'pending').length,
    [allOtpRequests]
  );

  const handleAuthChanged = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setUser(auth.currentUser);
      setAuthVersion((v) => v + 1);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setSelectedDate(new Date().toISOString().slice(0, 10));
    setActiveTab('recap');
    showToast('Anda telah keluar dari akun.');
  };

  const handleSaveReport = async (form: DeliveryFormState) => {
    setIsSaving(true);
    try {
      if (user) {
        await saveDeliveryReport(user.uid, form);
        showToast(`Laporan final tanggal ${form.date} tersimpan ke Cloud.`);
      } else {
        if (localReports.some((r) => r.date === form.date)) {
          throw new Error(
            `Laporan tanggal ${form.date} sudah bersifat final dan tidak dapat diedit atau ditimpa.`
          );
        }
        const newLocal: DeliveryReport = {
          id: `local_${form.date}`,
          ownerId: 'local',
          date: form.date,
          monthKey: form.date.slice(0, 7),
          dailyJktTotal: roundTon(form.dailyJktTotal),
          dailySmgTotal: roundTon(form.dailySmgTotal),
          jktProjectForming: roundTon(form.jktProjectForming),
          jktIndustri: roundTon(form.jktIndustri),
          jktIsbsRitel: roundTon(form.jktIsbsRitel),
          jktOthers: roundTon(form.jktOthers),
          smgProjectForming: roundTon(form.smgProjectForming),
          smgIndustri: roundTon(form.smgIndustri),
          smgIsbsRitel: roundTon(form.smgIsbsRitel),
          smgOthers: roundTon(form.smgOthers),
          mtdMode: form.mtdMode,
          mtdJktProjectForming: roundTon(form.mtdJktProjectForming),
          mtdJktIndustri: roundTon(form.mtdJktIndustri),
          mtdJktIsbsRitel: roundTon(form.mtdJktIsbsRitel),
          mtdJktOthers: roundTon(form.mtdJktOthers),
          mtdSmgProjectForming: roundTon(form.mtdSmgProjectForming),
          mtdSmgIndustri: roundTon(form.mtdSmgIndustri),
          mtdSmgIsbsRitel: roundTon(form.mtdSmgIsbsRitel),
          mtdSmgOthers: roundTon(form.mtdSmgOthers),
          mtdJktTotal: roundTon(form.mtdJktTotal),
          mtdSmgTotal: roundTon(form.mtdSmgTotal),
          mtdCombinedTotal: roundTon(form.mtdCombinedTotal),
          notes: form.notes,
          isSample: true,
        };
        setLocalReports((prev) =>
          [newLocal, ...prev].sort((a, b) => b.date.localeCompare(a.date))
        );
        showToast(`Laporan final tanggal ${form.date} disimpan di mode pratinjau.`);
      }
      setSelectedDate(form.date);
      setActiveTab('recap');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSuratJalan = async (
    form: SuratJalanFormState,
    existing?: SuratJalanEntry | null,
    minNextNo?: number
  ): Promise<{ id: string; no: number }> => {
    if (user) {
      const saved = await saveSuratJalanEntry(user.uid, form, existing, minNextNo);
      showToast(
        existing
          ? `Surat Jalan No. ${saved.no} (${form.noDO}) diperbarui di Cloud.`
          : `Surat Jalan No. ${saved.no} (${form.noDO}) tersimpan ke Cloud.`
      );
      return saved;
    } else {
      const targetKey = normalizeSuratJalanNoDo(form.noDO);
      const duplicateLocal = localSuratJalan.find(
        (item) =>
          item.id !== existing?.id && normalizeSuratJalanNoDo(item.noDO) === targetKey
      );
      if (duplicateLocal) {
        throw new Error(
          `No Delivery Order "${form.noDO.trim()}" sudah terdaftar di database (Tanggal ${duplicateLocal.tanggal}, No. ${duplicateLocal.no}). Input ganda tidak diperbolehkan.`
        );
      }
      const nowMs = Date.now();
      const entryId =
        existing?.id || `local_sj_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
      const assignedNo =
        existing && existing.tanggal === form.tanggal && existing.no >= 1
          ? existing.no
          : Math.max(getNextSuratJalanNoForDate(localSuratJalan, form.tanggal), minNextNo ?? 1);
      const sanitized = sanitizeSuratJalanPayload('local', assignedNo, form);
      const newLocal: SuratJalanEntry = {
        id: entryId,
        ...sanitized,
        createdAtMs: existing?.createdAtMs ?? nowMs,
        updatedAtMs: nowMs,
        isLocal: true,
      };
      setLocalSuratJalan((prev) => {
        const filtered = prev.filter((item) => item.id !== entryId);
        return [newLocal, ...filtered].sort((a, b) => {
          const dateCmp = b.tanggal.localeCompare(a.tanggal);
          if (dateCmp !== 0) return dateCmp;
          return a.no - b.no;
        });
      });
      showToast(
        existing
          ? `Surat Jalan No. ${assignedNo} (${form.noDO}) diperbarui di mode pratinjau.`
          : `Surat Jalan No. ${assignedNo} (${form.noDO}) disimpan di mode pratinjau.`
      );
      return { id: entryId, no: assignedNo };
    }
  };

  const handleSaveSuratJalanBatch = async (
    items: SuratJalanFormState[],
    minNextNoByDate?: Map<string, number>
  ) => {
    if (user) {
      const savedList = await saveSuratJalanBatch(user.uid, items, minNextNoByDate);
      showToast(`${savedList.length} data Surat Jalan dari Draft tersimpan ke Cloud.`);
      return savedList;
    }

    const batchKeys = new Set<string>();
    const existingLocalMap = new Map(
      localSuratJalan.map((item) => [normalizeSuratJalanNoDo(item.noDO), item])
    );

    for (const item of items) {
      const key = normalizeSuratJalanNoDo(item.noDO);
      if (!key) {
        throw new Error('No Delivery Order wajib diisi pada seluruh item Draft.');
      }
      if (batchKeys.has(key)) {
        throw new Error(
          `Terdapat No Delivery Order ganda di dalam Draft ("${item.noDO.trim()}"). Hapus atau ubah salah satu terlebih dahulu.`
        );
      }
      const dupLocal = existingLocalMap.get(key);
      if (dupLocal) {
        throw new Error(
          `No Delivery Order "${item.noDO.trim()}" sudah terdaftar di database (Tanggal ${dupLocal.tanggal}, No. ${dupLocal.no}). Input ganda tidak diperbolehkan.`
        );
      }
      batchKeys.add(key);
    }

    const nowMs = Date.now();
    const nextNoMap = new Map<string, number>();
    const newEntries: SuratJalanEntry[] = [];

    items.forEach((form, idx) => {
      if (!nextNoMap.has(form.tanggal)) {
        const localNext = getNextSuratJalanNoForDate(localSuratJalan, form.tanggal);
        const sheetMin = minNextNoByDate?.get(form.tanggal) ?? 1;
        nextNoMap.set(form.tanggal, Math.max(localNext, sheetMin));
      }
      const assignedNo = nextNoMap.get(form.tanggal) ?? 1;
      nextNoMap.set(form.tanggal, assignedNo + 1);

      const sanitized = sanitizeSuratJalanPayload('local', assignedNo, form);
      const entryId = `local_sj_${nowMs}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
      newEntries.push({
        id: entryId,
        ...sanitized,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        isLocal: true,
      });
    });

    setLocalSuratJalan((prev) =>
      [...newEntries, ...prev].sort((a, b) => {
        const dateCmp = b.tanggal.localeCompare(a.tanggal);
        if (dateCmp !== 0) return dateCmp;
        return a.no - b.no;
      })
    );
    showToast(`${newEntries.length} data Surat Jalan dari Draft disimpan di mode pratinjau.`);
    return newEntries.map((e) => ({
      id: e.id,
      no: e.no,
      tanggal: e.tanggal,
      noDO: e.noDO,
      vendor: e.vendor,
      customVendor: e.customVendor,
      dokumen: e.dokumen,
    }));
  };

  const handleSaveDriverLog = async (
    form: DriverLogFormState,
    existing?: DriverLogEntry | null
  ) => {
    if (user) {
      await saveDriverLogEntry(user.uid, form, existing);
      showToast(
        existing
          ? `Data supir ${form.noMobil} diperbarui di Cloud.`
          : `Data supir ${form.noMobil} tersimpan ke Cloud.`
      );
    } else {
      const nowMs = Date.now();
      const entryId = existing?.id || buildDriverLogId('local');
      const assignedNo =
        existing && existing.tanggal === form.tanggal
          ? existing.no
          : getNextDriverNoForDate(localDriverLogs, form.tanggal);
      const sanitized = sanitizeDriverLogPayload('local', assignedNo, form);
      const newLocal: DriverLogEntry = {
        id: entryId,
        ...sanitized,
        createdAtMs: existing?.createdAtMs ?? nowMs,
        updatedAtMs: nowMs,
        isLocal: true,
      };
      setLocalDriverLogs((prev) => {
        const filtered = prev.filter((item) => item.id !== entryId);
        return [newLocal, ...filtered].sort((a, b) => {
          const dateCmp = b.tanggal.localeCompare(a.tanggal);
          if (dateCmp !== 0) return dateCmp;
          return a.no - b.no;
        });
      });
      showToast(
        existing
          ? `Data supir ${form.noMobil} diperbarui di mode pratinjau.`
          : `Data supir ${form.noMobil} disimpan di mode pratinjau.`
      );
    }
  };

  const handleDeleteDriverLog = async (entry: DriverLogEntry) => {
    if (user && !entry.isLocal) {
      await deleteDriverLogEntry(entry.id);
      showToast(`Data supir ${entry.noMobil} dihapus.`);
    } else {
      setLocalDriverLogs((prev) => prev.filter((item) => item.id !== entry.id));
      showToast(`Data supir ${entry.noMobil} dihapus dari pratinjau.`);
    }
  };

  const handleClearAllDriverLogs = async () => {
    if (user) {
      await Promise.all(
        cloudDriverLogs
          .filter((item) => !item.isLocal)
          .map((item) => deleteDriverLogEntry(item.id))
      );
      showToast('Seluruh data supir di Cloud telah dikosongkan.');
    } else {
      setLocalDriverLogs([]);
      showToast('Seluruh data supir pratinjau telah dikosongkan.');
    }
  };

  const handleSaveIjinMenginap = async (
    form: IjinMenginapFormState,
    existing?: IjinMenginapEntry | null
  ) => {
    if (user) {
      await saveIjinMenginapEntry(user.uid, form, existing);
      showToast(
        existing
          ? `Surat Ijin Menginap ${form.noPolisi} diperbarui di Cloud.`
          : `Surat Ijin Menginap ${form.noPolisi} tersimpan ke Cloud.`
      );
    } else {
      const nowMs = Date.now();
      const entryId = existing?.id || buildIjinMenginapId('local');
      const assignedNo =
        existing && existing.tanggalSurat === form.tanggalSurat
          ? existing.no
          : getNextIjinMenginapNoForDate(localIjinMenginap, form.tanggalSurat);
      const sanitized = sanitizeIjinMenginapPayload('local', assignedNo, form);
      const newLocal: IjinMenginapEntry = {
        id: entryId,
        ...sanitized,
        createdAtMs: existing?.createdAtMs ?? nowMs,
        updatedAtMs: nowMs,
        isLocal: true,
      };
      setLocalIjinMenginap((prev) => {
        const filtered = prev.filter((item) => item.id !== entryId);
        return [newLocal, ...filtered].sort((a, b) => {
          const dateCmp = b.tanggalSurat.localeCompare(a.tanggalSurat);
          if (dateCmp !== 0) return dateCmp;
          return a.no - b.no;
        });
      });
      showToast(
        existing
          ? `Surat Ijin Menginap ${form.noPolisi} diperbarui di mode pratinjau.`
          : `Surat Ijin Menginap ${form.noPolisi} disimpan di mode pratinjau.`
      );
    }
  };

  const handleDeleteIjinMenginap = async (entry: IjinMenginapEntry) => {
    if (user && !entry.isLocal) {
      await deleteIjinMenginapEntry(entry.id);
      showToast(`Surat Ijin Menginap ${entry.noPolisi} dihapus.`);
    } else {
      setLocalIjinMenginap((prev) => prev.filter((item) => item.id !== entry.id));
      showToast(`Surat Ijin Menginap ${entry.noPolisi} dihapus dari pratinjau.`);
    }
  };

  const openNewInput = () => {
    setActiveTab('input');
    setMobileMenuOpen(false);
  };

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: React.ReactNode;
    pendingCount?: number;
  }> = [
    {
      id: 'recap',
      label: 'Rekapitulasi Harian',
      icon: <ClipboardList className="w-4 h-4" />,
    },
    {
      id: 'input',
      label: 'Input Delivery',
      icon: <Plus className="w-4 h-4" />,
    },
    {
      id: 'history',
      label: 'Riwayat & Grafik',
      icon: <BarChart3 className="w-4 h-4" />,
    },
    {
      id: 'surat_jalan',
      label: 'Data Surat Jalan',
      icon: <FileCheck2 className="w-4 h-4" />,
    },
    {
      id: 'data_supir',
      label: 'Input Data Supir',
      icon: <UserCheck className="w-4 h-4" />,
    },
    {
      id: 'live_tv',
      label: 'Live TV Supir',
      icon: <Tv className="w-4 h-4" />,
      pendingCount: driverLogEntries.filter((item) => Boolean(item.jamMasuk && !item.jamKeluar))
        .length,
    },
    {
      id: 'ijin_menginap',
      label: 'Surat Ijin Menginap',
      icon: <BedDouble className="w-4 h-4" />,
    },
    ...(isAdmin
      ? [
          {
            id: 'admin_otp' as ActiveTab,
            label: 'Permintaan OTP',
            icon: <KeyRound className="w-4 h-4" />,
            pendingCount: pendingOtpCount,
          },
        ]
      : []),
  ];

  const pageTitleMap: Record<ActiveTab, string> = {
    recap: 'Laporan Rekapitulasi Harian',
    input: 'Input Delivery Harian',
    history: 'Riwayat & Tren Bulanan',
    surat_jalan: 'Data Surat Jalan',
    data_supir: 'Input Data Supir & Kendaraan',
    live_tv: 'Live TV Antrean Supir',
    ijin_menginap: 'Surat Permohonan Ijin Menginap',
    admin_otp: 'Permintaan OTP Pengguna',
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 text-slate-600">
        <RefreshCw className="w-6 h-6 text-blue-700 animate-spin" />
        <p className="text-sm font-medium">Memuat sesi akun...</p>
      </div>
    );
  }

  if (!user || !isAuthenticatedAndVerified) {
    return (
      <AuthGateView
        currentUser={user}
        otpRequest={myOtpRequest}
        isLoadingOtpStatus={isLoadingMyOtp}
        onAuthChanged={handleAuthChanged}
      />
    );
  }

  const accountLabel = user.displayName || user.email || user.phoneNumber || 'Pengguna';
  const accountContact = user.email || user.phoneNumber || '';

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-900 print:block print:min-h-0 print:bg-white">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 no-print">
        <div className="h-16 px-4 flex items-center border-b border-slate-200">
          <div className="h-14 w-52 overflow-hidden flex items-center justify-center shrink-0">
            <img
              src="/assets/aistudio/image_d1d507a0.png"
              alt="logistic PT FUMIRA"
              className="w-full h-full object-cover object-[center_52%] scale-[1.25]"
            />
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.pendingCount === 'number' && item.pendingCount > 0 && (
                  <span className="text-xs font-bold text-amber-700 tabular-nums shrink-0">
                    {item.pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Cloud Account Section */}
        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={accountLabel}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-700 shrink-0">
                  {accountLabel.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 truncate">
                  {accountLabel}
                </div>
                {accountContact && (
                  <div className="text-[11px] text-slate-500 truncate">{accountContact}</div>
                )}
                {isAdmin && (
                  <div className="text-[11px] font-semibold text-blue-700 truncate">
                    Administrator OTP
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 bg-white text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Keluar Akun
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col border-r border-slate-200 z-10">
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200">
              <div className="h-12 w-48 overflow-hidden flex items-center justify-center shrink-0">
                <img
                  src="/assets/aistudio/image_d1d507a0.png"
                  alt="logistic PT FUMIRA"
                  className="w-full h-full object-cover object-[center_52%] scale-[1.2]"
                />
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-blue-50 text-blue-800'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      {item.icon}
                      <span>{item.label}</span>
                    </span>
                    {typeof item.pendingCount === 'number' && item.pendingCount > 0 && (
                      <span className="text-xs font-bold text-amber-700 tabular-nums">
                        {item.pendingCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="p-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Keluar ({accountContact || accountLabel})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 print-main-wrapper print:block">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0 truncate">
              <span className="text-slate-400 hidden sm:inline">Pengiriman JKT &amp; SMG</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-semibold text-slate-900 truncate">
                {pageTitleMap[activeTab]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {isAdmin && activeTab !== 'admin_otp' && pendingOtpCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('admin_otp')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
              >
                <KeyRound className="w-3.5 h-3.5" />
                Permintaan OTP ({pendingOtpCount})
              </button>
            )}
            <div className="h-9 sm:h-10 w-28 sm:w-32 overflow-hidden flex items-center justify-center shrink-0">
              <img
                src="/assets/aistudio/Gemini_Generated_Image_ilz0ujilz0ujilz0_fcf80d9d.jfif"
                alt="FUMIRA"
                className="w-full h-full object-cover object-center"
              />
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-5 print-main-content print:block print:space-y-0">
          {authError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="break-all">{authError}</span>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={handleManualSyncReload}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-700 text-white text-xs font-semibold hover:bg-red-800 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Muat Ulang Data
                </button>
                <button
                  type="button"
                  onClick={() => setAuthError(null)}
                  className="text-xs font-medium underline cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}

          {activeTab === 'recap' && (
            <RecapView
              reports={reports}
              selectedReport={selectedReport}
              onSelectDate={(date) => setSelectedDate(date)}
              onNewReport={openNewInput}
              isLoading={isLoadingData}
            />
          )}

          {activeTab === 'input' && (
            <InputFormView
              reports={reports}
              onSave={handleSaveReport}
              onCancel={() => {
                setActiveTab('recap');
              }}
              isSaving={isSaving}
            />
          )}

          {activeTab === 'history' && (
            <HistoryView
              reports={reports}
              onViewReport={(date) => {
                setSelectedDate(date);
                setActiveTab('recap');
              }}
              onNewReport={openNewInput}
            />
          )}

          {activeTab === 'surat_jalan' && (
            <SuratJalanView
              entries={suratJalanEntries}
              onSave={handleSaveSuratJalan}
              onSaveBatch={handleSaveSuratJalanBatch}
            />
          )}

          {activeTab === 'data_supir' && (
            <DataSupirView
              entries={driverLogEntries}
              onSave={handleSaveDriverLog}
              onDelete={handleDeleteDriverLog}
              onClearAll={handleClearAllDriverLogs}
              isLoading={isLoadingDriverLogs}
            />
          )}

          {activeTab === 'live_tv' && (
            <LiveTvView
              entries={driverLogEntries}
              isLoading={isLoadingDriverLogs}
              onGoToDataSupir={() => setActiveTab('data_supir')}
            />
          )}

          {activeTab === 'ijin_menginap' && (
            <IjinMenginapView
              entries={ijinMenginapEntries}
              driverLogs={driverLogEntries}
              onSave={handleSaveIjinMenginap}
              onDelete={handleDeleteIjinMenginap}
              isLoading={isLoadingIjinMenginap}
            />
          )}

          {activeTab === 'admin_otp' && isAdmin && (
            <AdminOtpView
              adminEmail={user.email || ADMIN_OTP_EMAIL}
              requests={allOtpRequests}
              secretsByUid={allOtpSecrets}
              isLoading={isLoadingAdminOtp}
              onIssueOtp={(targetUid) =>
                issueOtpForUser(targetUid, user.email || ADMIN_OTP_EMAIL)
              }
              onReject={(targetUid) =>
                rejectOtpRequest(targetUid, user.email || ADMIN_OTP_EMAIL)
              }
              onRevoke={(targetUid) =>
                revokeOtpAccess(targetUid, user.email || ADMIN_OTP_EMAIL)
              }
              onDelete={(targetUid) => deleteOtpRequest(targetUid)}
              onNotify={showToast}
            />
          )}
        </main>
      </div>

      {/* Subtle Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white text-xs sm:text-sm font-medium px-4 py-3 rounded-xl shadow-lg border border-slate-700 no-print">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
