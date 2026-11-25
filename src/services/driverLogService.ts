import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  DriverLogEntry,
  DriverLogFormState,
  DriverLogPayload,
  VALIDATION_LIMITS,
} from '../types/delivery';
import {
  downloadCsvFile,
  downloadXlsxFile,
  getCsvDayName,
  getLocalDateStamp,
} from '../utils/csvExport';
import { handleFirestoreError, OperationType } from './deliveryService';

const COLLECTION_NAME = 'driver_logs';

export function getNextDriverNoForDate(
  entries: Array<{ tanggal: string; no: number }>,
  tanggal: string
): number {
  const sameDate = entries.filter((e) => e.tanggal === tanggal);
  if (sameDate.length === 0) return 1;
  const maxNo = sameDate.reduce((max, item) => (item.no > max ? item.no : max), 0);
  return Math.min(maxNo + 1, VALIDATION_LIMITS.MAX_DRIVER_NO);
}

export interface DriverDurationInfo {
  totalMinutes: number;
  hours: number;
  minutes: number;
  isOvernight: boolean;
  formatted: string;
  rangeLabel: string;
}

export function calculateDriverDuration(
  jamMasuk?: string | null,
  jamKeluar?: string | null
): DriverDurationInfo | null {
  const masuk = (jamMasuk || '').trim();
  const keluar = (jamKeluar || '').trim();

  if (!VALIDATION_LIMITS.TIME_REGEX.test(masuk) || !VALIDATION_LIMITS.TIME_REGEX.test(keluar)) {
    return null;
  }

  const [inH, inM] = masuk.split(':').map(Number);
  const [outH, outM] = keluar.split(':').map(Number);
  const masukTotal = inH * 60 + inM;
  const keluarTotal = outH * 60 + outM;

  const isOvernight = keluarTotal < masukTotal;
  const totalMinutes = isOvernight
    ? 24 * 60 - masukTotal + keluarTotal
    : keluarTotal - masukTotal;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  let formatted: string;
  if (hours > 0 && minutes > 0) {
    formatted = `${hours} jam ${minutes} mnt`;
  } else if (hours > 0) {
    formatted = `${hours} jam`;
  } else {
    formatted = `${minutes} mnt`;
  }

  return {
    totalMinutes,
    hours,
    minutes,
    isOvernight,
    formatted,
    rangeLabel: `${masuk} - ${keluar}`,
  };
}

export function formatAverageDurationMinutes(totalMinutesAvg: number): string {
  if (!Number.isFinite(totalMinutesAvg) || totalMinutesAvg < 0) return '-';
  const rounded = Math.round(totalMinutesAvg);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours > 0 && minutes > 0) return `${hours} jam ${minutes} mnt`;
  if (hours > 0) return `${hours} jam`;
  return `${minutes} mnt`;
}

function normalizeTime(raw: string): string {
  const trimmed = (raw || '').trim().slice(0, 5);
  if (!trimmed) return '';
  if (!VALIDATION_LIMITS.TIME_REGEX.test(trimmed)) {
    throw new Error('Format jam harus HH:mm (contoh: 08:30).');
  }
  return trimmed;
}

export function sanitizeDriverLogPayload(
  ownerId: string,
  no: number,
  form: DriverLogFormState
): DriverLogPayload {
  if (!VALIDATION_LIMITS.ID_REGEX.test(ownerId) || ownerId.length > VALIDATION_LIMITS.MAX_ID_LENGTH) {
    throw new Error('Owner ID tidak valid.');
  }
  if (!VALIDATION_LIMITS.DATE_REGEX.test(form.tanggal)) {
    throw new Error('Format tanggal input supir harus YYYY-MM-DD.');
  }

  const safeNo = Math.min(Math.max(Math.trunc(Number(no) || 1), 1), VALIDATION_LIMITS.MAX_DRIVER_NO);
  const jamMasuk = normalizeTime(form.jamMasuk);
  const jamKeluar = normalizeTime(form.jamKeluar);

  const noMobil = (form.noMobil || '')
    .trim()
    .toUpperCase()
    .slice(0, VALIDATION_LIMITS.MAX_NO_MOBIL_LENGTH);
  const supir = (form.supir || '').trim().slice(0, VALIDATION_LIMITS.MAX_SUPIR_LENGTH);
  const jenisKendaraan = (form.jenisKendaraan || '')
    .trim()
    .slice(0, VALIDATION_LIMITS.MAX_JENIS_KENDARAAN_LENGTH);
  const transporter = (form.transporter || '')
    .trim()
    .slice(0, VALIDATION_LIMITS.MAX_TRANSPORTER_LENGTH);
  const keterangan = (form.keterangan || '')
    .trim()
    .slice(0, VALIDATION_LIMITS.MAX_KETERANGAN_LENGTH);

  if (!noMobil) throw new Error('No Mobil wajib diisi.');
  if (!supir) throw new Error('Nama Supir wajib diisi.');
  if (!jenisKendaraan) throw new Error('Jenis Kendaraan wajib diisi.');
  if (!transporter) throw new Error('Transporter wajib diisi.');

  return {
    ownerId,
    no: safeNo,
    tanggal: form.tanggal,
    jamMasuk,
    jamKeluar,
    noMobil,
    supir,
    jenisKendaraan,
    transporter,
    keterangan,
  };
}

export function buildDriverLogId(uid: string): string {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  const rand = Math.random().toString(36).slice(2, 8);
  return `drv_${safeUid}_${Date.now()}_${rand}`;
}

export function subscribeSharedDriverLogs(
  onData: (entries: DriverLogEntry[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(collection(db, COLLECTION_NAME));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: DriverLogEntry[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const createdAtTs = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : undefined;
        const updatedAtTs = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : undefined;

        return {
          id: docSnap.id,
          ownerId: String(d.ownerId || ''),
          no: Math.max(1, Math.trunc(Number(d.no) || 1)),
          tanggal: String(d.tanggal || ''),
          jamMasuk: String(d.jamMasuk || ''),
          jamKeluar: String(d.jamKeluar || ''),
          noMobil: String(d.noMobil || ''),
          supir: String(d.supir || ''),
          jenisKendaraan: String(d.jenisKendaraan || ''),
          transporter: String(d.transporter || ''),
          keterangan: String(d.keterangan || ''),
          createdAtMs: createdAtTs,
          updatedAtMs: updatedAtTs,
        };
      });

      items.sort((a, b) => {
        const dateCmp = b.tanggal.localeCompare(a.tanggal);
        if (dateCmp !== 0) return dateCmp;
        const noCmp = a.no - b.no;
        if (noCmp !== 0) return noCmp;
        return (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0);
      });

      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function saveDriverLogEntry(
  uid: string,
  form: DriverLogFormState,
  existingEntry?: DriverLogEntry | null
): Promise<string> {
  let assignedNo: number;

  if (existingEntry && !existingEntry.isLocal && existingEntry.tanggal === form.tanggal) {
    assignedNo = existingEntry.no;
  } else {
    try {
      const sameDateQ = query(
        collection(db, COLLECTION_NAME),
        where('tanggal', '==', form.tanggal)
      );
      const snap = await getDocs(sameDateQ);
      const existingForDate = snap.docs.map((docSnap) => ({
        tanggal: String(docSnap.data().tanggal || form.tanggal),
        no: Number(docSnap.data().no) || 0,
      }));
      assignedNo = getNextDriverNoForDate(existingForDate, form.tanggal);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
    }
  }

  const payload = sanitizeDriverLogPayload(uid, assignedNo, form);

  if (existingEntry && !existingEntry.isLocal) {
    const entryId = existingEntry.id;
    const docRef = doc(db, COLLECTION_NAME, entryId);
    try {
      const { ownerId: _omitOwner, ...updatableFields } = payload;
      await updateDoc(docRef, {
        ...updatableFields,
        updatedAt: serverTimestamp(),
      });
      return entryId;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${entryId}`);
    }
  } else {
    const entryId = buildDriverLogId(uid);
    const docRef = doc(db, COLLECTION_NAME, entryId);
    try {
      await setDoc(docRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return entryId;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${COLLECTION_NAME}/${entryId}`);
    }
  }
}

export async function deleteDriverLogEntry(entryId: string): Promise<void> {
  if (!VALIDATION_LIMITS.ID_REGEX.test(entryId)) {
    throw new Error('ID data supir tidak valid.');
  }
  const docRef = doc(db, COLLECTION_NAME, entryId);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${entryId}`);
  }
}

export function exportDriverLogsCsv(entries: DriverLogEntry[]): void {
  const headers = [
    'No',
    'Tanggal',
    'Hari',
    'Jam Masuk',
    'Jam Keluar',
    'Range Waktu',
    'Durasi',
    'No Mobil',
    'Supir',
    'Jenis Kendaraan',
    'Transporter',
    'Keterangan',
  ];

  const ordered = [...entries].sort((a, b) => {
    const dateCmp = a.tanggal.localeCompare(b.tanggal);
    if (dateCmp !== 0) return dateCmp;
    return a.no - b.no;
  });

  const rows = ordered.map((item) => {
    const dur = calculateDriverDuration(item.jamMasuk, item.jamKeluar);
    const durText = dur
      ? `${dur.formatted}${dur.isOvernight ? ' (+1 hari)' : ''}`
      : '-';

    return [
      item.no,
      item.tanggal,
      getCsvDayName(item.tanggal),
      item.jamMasuk || '-',
      item.jamKeluar || '-',
      dur ? dur.rangeLabel : '-',
      durText,
      item.noMobil,
      item.supir,
      item.jenisKendaraan,
      item.transporter,
      item.keterangan || '-',
    ];
  });

  downloadCsvFile(`data_supir_${getLocalDateStamp()}.csv`, headers, rows);
}

export function exportDriverLogsXlsx(entries: DriverLogEntry[]): void {
  const headers = [
    'No',
    'Tanggal',
    'Hari',
    'Jam Masuk',
    'Jam Keluar',
    'Range Waktu',
    'Durasi',
    'No Mobil',
    'Supir',
    'Jenis Kendaraan',
    'Transporter',
    'Keterangan',
  ];

  const ordered = [...entries].sort((a, b) => {
    const dateCmp = a.tanggal.localeCompare(b.tanggal);
    if (dateCmp !== 0) return dateCmp;
    return a.no - b.no;
  });

  const rows = ordered.map((item) => {
    const dur = calculateDriverDuration(item.jamMasuk, item.jamKeluar);
    const durText = dur
      ? `${dur.formatted}${dur.isOvernight ? ' (+1 hari)' : ''}`
      : '-';

    return [
      item.no,
      item.tanggal,
      getCsvDayName(item.tanggal),
      item.jamMasuk || '-',
      item.jamKeluar || '-',
      dur ? dur.rangeLabel : '-',
      durText,
      item.noMobil,
      item.supir,
      item.jenisKendaraan,
      item.transporter,
      item.keterangan || '-',
    ];
  });

  downloadXlsxFile(`data_supir_${getLocalDateStamp()}.xlsx`, [
    {
      sheetName: 'Data Supir',
      headers,
      rows,
      textColumnIndices: [1, 2, 3, 4, 5, 6, 7],
    },
  ]);
}
