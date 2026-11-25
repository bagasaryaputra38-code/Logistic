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
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  SURAT_JALAN_VENDORS,
  SuratJalanEntry,
  SuratJalanFormState,
  SuratJalanPayload,
  SuratJalanVendor,
  VALIDATION_LIMITS,
} from '../types/delivery';
import {
  downloadCsvFile,
  downloadXlsxFile,
  getLocalDateStamp,
} from '../utils/csvExport';
import { handleFirestoreError, OperationType } from './deliveryService';
import {
  normalizeSheetDate,
  ParsedSheetSuratJalanRow,
  parseVendorCell,
} from './googleSheetsService';

const COLLECTION_NAME = 'surat_jalan';

function isValidVendor(v: string): v is SuratJalanVendor {
  return (SURAT_JALAN_VENDORS as readonly string[]).includes(v);
}

export function getNextSuratJalanNoForDate(
  entries: Array<{ tanggal: string; no?: number }>,
  tanggal: string
): number {
  const sameDate = entries.filter((e) => e.tanggal === tanggal);
  if (sameDate.length === 0) return 1;
  const maxExplicitNo = sameDate.reduce((max, item) => {
    const n = Number(item.no) || 0;
    return n > max ? n : max;
  }, 0);
  const nextNo = Math.max(maxExplicitNo, sameDate.length) + 1;
  return Math.min(nextNo, VALIDATION_LIMITS.MAX_SURAT_JALAN_NO);
}

export function sanitizeSuratJalanPayload(
  ownerId: string,
  no: number,
  form: SuratJalanFormState
): SuratJalanPayload {
  if (!VALIDATION_LIMITS.ID_REGEX.test(ownerId) || ownerId.length > VALIDATION_LIMITS.MAX_ID_LENGTH) {
    throw new Error('Owner ID tidak valid.');
  }
  if (!VALIDATION_LIMITS.DATE_REGEX.test(form.tanggal)) {
    throw new Error('Format tanggal surat jalan tidak valid.');
  }
  const safeNo = Math.min(
    Math.max(Math.trunc(Number(no) || 1), 1),
    VALIDATION_LIMITS.MAX_SURAT_JALAN_NO
  );
  const cleanDo = (form.noDO || '').trim().slice(0, VALIDATION_LIMITS.MAX_DO_LENGTH);
  if (!cleanDo) {
    throw new Error('No Delivery Order wajib diisi.');
  }
  if (!isValidVendor(form.vendor)) {
    throw new Error('Silakan pilih Nama Vendor yang valid.');
  }
  const cleanCustomVendor =
    form.vendor === 'Lainnya'
      ? (form.customVendor || '').trim().slice(0, VALIDATION_LIMITS.MAX_VENDOR_LENGTH)
      : '';
  const cleanDokumen =
    (form.dokumen || '').trim().slice(0, VALIDATION_LIMITS.MAX_DOKUMEN_LENGTH) || 'TERKIRIM';

  return {
    ownerId,
    no: safeNo,
    tanggal: form.tanggal,
    noDO: cleanDo,
    vendor: form.vendor,
    customVendor: cleanCustomVendor,
    dokumen: cleanDokumen,
  };
}

export function buildSuratJalanId(uid: string): string {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  const rand = Math.random().toString(36).slice(2, 8);
  return `sj_${safeUid}_${Date.now()}_${rand}`;
}

export function subscribeSharedSuratJalan(
  onData: (entries: SuratJalanEntry[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(collection(db, COLLECTION_NAME));

  return onSnapshot(
    q,
    (snapshot) => {
      const rawItems = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const createdAtTs = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : undefined;
        const updatedAtTs = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : undefined;
        const rawVendor = String(d.vendor || 'Lainnya');
        const hasExplicitNo = typeof d.no === 'number' && Number.isFinite(d.no) && d.no >= 1;

        return {
          id: docSnap.id,
          ownerId: String(d.ownerId || ''),
          explicitNo: hasExplicitNo ? Math.trunc(d.no) : null,
          tanggal: String(d.tanggal || ''),
          noDO: String(d.noDO || ''),
          vendor: isValidVendor(rawVendor) ? rawVendor : ('Lainnya' as SuratJalanVendor),
          customVendor: String(d.customVendor || ''),
          dokumen: String(d.dokumen || 'TERKIRIM'),
          createdAtMs: createdAtTs,
          updatedAtMs: updatedAtTs,
        };
      });

      const orderedForFallback = [...rawItems].sort((a, b) => {
        const dateCmp = a.tanggal.localeCompare(b.tanggal);
        if (dateCmp !== 0) return dateCmp;
        return (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0);
      });

      const perDateFallbackCounter = new Map<string, number>();
      const assignedNoMap = new Map<string, number>();

      orderedForFallback.forEach((item) => {
        const currentMax = perDateFallbackCounter.get(item.tanggal) ?? 0;
        const resolvedNo = item.explicitNo !== null ? item.explicitNo : currentMax + 1;
        perDateFallbackCounter.set(item.tanggal, Math.max(currentMax, resolvedNo));
        assignedNoMap.set(item.id, resolvedNo);
      });

      const items: SuratJalanEntry[] = rawItems.map(({ explicitNo: _omit, ...rest }) => ({
        ...rest,
        no: assignedNoMap.get(rest.id) ?? 1,
      }));

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

export async function saveSuratJalanEntry(
  uid: string,
  form: SuratJalanFormState,
  existingEntry?: SuratJalanEntry | null,
  minNextNo?: number
): Promise<{ id: string; no: number }> {
  let assignedNo: number;

  if (
    existingEntry &&
    !existingEntry.isLocal &&
    existingEntry.tanggal === form.tanggal &&
    typeof existingEntry.no === 'number' &&
    existingEntry.no >= 1
  ) {
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
      const cloudNext = getNextSuratJalanNoForDate(existingForDate, form.tanggal);
      assignedNo = Math.max(cloudNext, minNextNo ?? 1);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
    }
  }

  const payload = sanitizeSuratJalanPayload(uid, assignedNo, form);

  if (existingEntry && !existingEntry.isLocal) {
    const entryId = existingEntry.id;
    const docRef = doc(db, COLLECTION_NAME, entryId);
    try {
      const { ownerId: _omitOwner, ...updatableFields } = payload;
      await updateDoc(docRef, {
        ...updatableFields,
        updatedAt: serverTimestamp(),
      });
      return { id: entryId, no: payload.no };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${entryId}`);
    }
  } else {
    const entryId = buildSuratJalanId(uid);
    const docRef = doc(db, COLLECTION_NAME, entryId);
    try {
      await setDoc(docRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { id: entryId, no: payload.no };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${COLLECTION_NAME}/${entryId}`);
    }
  }
}

export async function saveSuratJalanBatch(
  uid: string,
  items: SuratJalanFormState[],
  minNextNoByDate?: Map<string, number>
): Promise<
  Array<{
    id: string;
    no: number;
    tanggal: string;
    noDO: string;
    vendor: SuratJalanVendor;
    customVendor: string;
    dokumen: string;
  }>
> {
  if (items.length === 0) return [];

  const uniqueDates = Array.from(new Set(items.map((item) => item.tanggal)));
  const nextNoMap = new Map<string, number>();

  try {
    await Promise.all(
      uniqueDates.map(async (tanggal) => {
        const sameDateQ = query(
          collection(db, COLLECTION_NAME),
          where('tanggal', '==', tanggal)
        );
        const snap = await getDocs(sameDateQ);
        const existingForDate = snap.docs.map((docSnap) => ({
          tanggal: String(docSnap.data().tanggal || tanggal),
          no: Number(docSnap.data().no) || 0,
        }));
        const cloudNext = getNextSuratJalanNoForDate(existingForDate, tanggal);
        const sheetMin = minNextNoByDate?.get(tanggal) ?? 1;
        nextNoMap.set(tanggal, Math.max(cloudNext, sheetMin));
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
  }

  const prepared = items.map((form, idx) => {
    const currentNext = nextNoMap.get(form.tanggal) ?? 1;
    const assignedNo = Math.min(currentNext, VALIDATION_LIMITS.MAX_SURAT_JALAN_NO);
    nextNoMap.set(form.tanggal, assignedNo + 1);

    const payload = sanitizeSuratJalanPayload(uid, assignedNo, form);
    const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    const rand = Math.random().toString(36).slice(2, 6);
    const entryId = `sj_${safeUid}_${Date.now()}_${idx}_${rand}`;

    return { entryId, payload };
  });

  const chunkSize = 400;
  for (let start = 0; start < prepared.length; start += chunkSize) {
    const chunk = prepared.slice(start, start + chunkSize);
    const batch = writeBatch(db);
    chunk.forEach(({ entryId, payload }) => {
      const docRef = doc(db, COLLECTION_NAME, entryId);
      batch.set(docRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  }

  return prepared.map(({ entryId, payload }) => ({
    id: entryId,
    no: payload.no,
    tanggal: payload.tanggal,
    noDO: payload.noDO,
    vendor: payload.vendor,
    customVendor: payload.customVendor,
    dokumen: payload.dokumen,
  }));
}

export async function deleteSuratJalanEntry(entryId: string): Promise<void> {
  if (!VALIDATION_LIMITS.ID_REGEX.test(entryId)) {
    throw new Error('ID surat jalan tidak valid.');
  }
  const docRef = doc(db, COLLECTION_NAME, entryId);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${entryId}`);
  }
}

function splitCsvLine(line: string, delimiter = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseSuratJalanCsvText(csvText: string): ParsedSheetSuratJalanRow[] {
  const cleanText = csvText.replace(/^\uFEFF/, '').trim();
  if (!cleanText) return [];

  const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const sampleLine = lines[0] || '';
  const semicolonCount = (sampleLine.match(/;/g) || []).length;
  const commaCount = (sampleLine.match(/,/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ';' : ',';

  const firstCols = splitCsvLine(lines[0], delimiter).map((c) => c.toLowerCase());
  const hasHeader =
    firstCols[0]?.includes('tanggal') ||
    firstCols[0]?.startsWith('no') ||
    firstCols.some((c) => c.includes('delivery order'));
  const noFirst = hasHeader && firstCols[0]?.startsWith('no') && firstCols[1]?.includes('tanggal');

  const startIdx = hasHeader ? 1 : 0;
  const rows: ParsedSheetSuratJalanRow[] = [];
  const perDateCounter = new Map<string, number>();

  for (let i = startIdx; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i], delimiter);
    if (cols.length < 3) continue;

    const rawDate = noFirst ? cols[1] ?? '' : cols[0] ?? '';
    const rawNo = noFirst ? cols[0] ?? '' : cols[1] ?? '';
    const rawDo = (cols[2] ?? '').trim();
    const rawVendor = (cols[3] ?? '').trim();
    const rawDokumen = (cols[4] ?? '').trim() || 'TERKIRIM';

    const tanggal = normalizeSheetDate(rawDate);
    if (!tanggal || !rawDo) continue;

    const currentMax = perDateCounter.get(tanggal) ?? 0;
    const parsedNo = Number.parseInt(rawNo, 10);
    const no = Number.isFinite(parsedNo) && parsedNo >= 1 ? parsedNo : currentMax + 1;
    perDateCounter.set(tanggal, Math.max(currentMax, no));

    const { vendor, customVendor } = parseVendorCell(rawVendor);
    rows.push({
      no,
      tanggal,
      noDO: rawDo,
      vendor,
      customVendor,
      dokumen: rawDokumen,
    });
  }

  return rows;
}

export async function importSuratJalanBatch(
  uid: string,
  rowsToImport: ParsedSheetSuratJalanRow[],
  existingEntries: SuratJalanEntry[]
): Promise<{ importedCount: number; skippedCount: number }> {
  const existingKeys = new Set(
    existingEntries.map((e) => `${e.tanggal}__${e.noDO.trim().toLowerCase()}`)
  );

  const uniqueNewRows: ParsedSheetSuratJalanRow[] = [];
  let skippedCount = 0;

  rowsToImport.forEach((row) => {
    const key = `${row.tanggal}__${row.noDO.trim().toLowerCase()}`;
    if (existingKeys.has(key)) {
      skippedCount += 1;
      return;
    }
    existingKeys.add(key);
    uniqueNewRows.push(row);
  });

  if (uniqueNewRows.length === 0) {
    return { importedCount: 0, skippedCount };
  }

  const chunkSize = 400;
  for (let start = 0; start < uniqueNewRows.length; start += chunkSize) {
    const chunk = uniqueNewRows.slice(start, start + chunkSize);
    const batch = writeBatch(db);

    chunk.forEach((row, idx) => {
      const payload = sanitizeSuratJalanPayload(uid, row.no, {
        tanggal: row.tanggal,
        noDO: row.noDO,
        vendor: row.vendor,
        customVendor: row.customVendor,
        dokumen: row.dokumen || 'TERKIRIM',
      });
      const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 36);
      const rand = Math.random().toString(36).slice(2, 6);
      const entryId = `sj_imp_${safeUid}_${Date.now()}_${start + idx}_${rand}`;
      const docRef = doc(db, COLLECTION_NAME, entryId);
      batch.set(docRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  }

  return { importedCount: uniqueNewRows.length, skippedCount };
}

export function exportSuratJalanCsv(entries: SuratJalanEntry[]): void {
  const headers = ['Tanggal', 'No', 'No Delivery Order', 'Nama Vendor', 'Dokumen'];

  const ordered = [...entries].sort((a, b) => {
    const dateCmp = a.tanggal.localeCompare(b.tanggal);
    if (dateCmp !== 0) return dateCmp;
    return a.no - b.no;
  });

  const rows = ordered.map((item) => {
    const vendorCell =
      item.vendor === 'Lainnya' && item.customVendor
        ? `${item.vendor} (${item.customVendor})`
        : item.vendor;
    return [
      item.tanggal,
      item.no,
      item.noDO,
      vendorCell,
      item.dokumen || 'TERKIRIM',
    ];
  });

  downloadCsvFile(`DATA_SURAT_JALAN_BALIK_${getLocalDateStamp()}.csv`, headers, rows);
}

export function exportSuratJalanXlsx(entries: SuratJalanEntry[]): void {
  const headers = ['Tanggal', 'No', 'No Delivery Order', 'Nama Vendor', 'Dokumen'];

  const ordered = [...entries].sort((a, b) => {
    const dateCmp = a.tanggal.localeCompare(b.tanggal);
    if (dateCmp !== 0) return dateCmp;
    return a.no - b.no;
  });

  const rows = ordered.map((item) => {
    const vendorCell =
      item.vendor === 'Lainnya' && item.customVendor
        ? `${item.vendor} (${item.customVendor})`
        : item.vendor;
    return [
      item.tanggal,
      item.no,
      item.noDO,
      vendorCell,
      item.dokumen || 'TERKIRIM',
    ];
  });

  downloadXlsxFile(`DATA_SURAT_JALAN_BALIK_${getLocalDateStamp()}.xlsx`, [
    {
      sheetName: 'Surat Jalan',
      headers,
      rows,
      textColumnIndices: [0, 2],
    },
  ]);
}
