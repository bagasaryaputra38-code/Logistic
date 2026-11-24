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
  IjinMenginapEntry,
  IjinMenginapFormState,
  IjinMenginapPayload,
  VALIDATION_LIMITS,
} from '../types/delivery';
import { formatIndonesianDate } from '../utils/deliveryCalculations';
import { handleFirestoreError, OperationType } from './deliveryService';

const COLLECTION_NAME = 'ijin_menginap';

export function getNextIjinMenginapNoForDate(
  entries: Array<{ tanggalSurat: string; no: number }>,
  tanggalSurat: string
): number {
  const sameDate = entries.filter((e) => e.tanggalSurat === tanggalSurat);
  if (sameDate.length === 0) return 1;
  const maxNo = sameDate.reduce((max, item) => (item.no > max ? item.no : max), 0);
  return Math.min(maxNo + 1, VALIDATION_LIMITS.MAX_IJIN_MENGINAP_NO);
}

export function sanitizeIjinMenginapPayload(
  ownerId: string,
  no: number,
  form: IjinMenginapFormState
): IjinMenginapPayload {
  if (!VALIDATION_LIMITS.ID_REGEX.test(ownerId) || ownerId.length > VALIDATION_LIMITS.MAX_ID_LENGTH) {
    throw new Error('Owner ID tidak valid.');
  }
  if (!VALIDATION_LIMITS.DATE_REGEX.test(form.tanggalSurat)) {
    throw new Error('Format tanggal surat harus YYYY-MM-DD.');
  }
  if (!VALIDATION_LIMITS.DATE_REGEX.test(form.tanggalMenginap)) {
    throw new Error('Format tanggal menginap harus YYYY-MM-DD.');
  }
  const tanggalMenginapSampai = (form.tanggalMenginapSampai || '').trim().slice(0, 10);
  if (tanggalMenginapSampai) {
    if (!VALIDATION_LIMITS.DATE_REGEX.test(tanggalMenginapSampai)) {
      throw new Error('Format tanggal sampai dengan (s/d) harus YYYY-MM-DD.');
    }
    if (tanggalMenginapSampai < form.tanggalMenginap) {
      throw new Error('Tanggal sampai dengan (s/d) tidak boleh lebih awal dari tanggal mulai menginap.');
    }
  }

  const safeNo = Math.min(
    Math.max(Math.trunc(Number(no) || 1), 1),
    VALIDATION_LIMITS.MAX_IJIN_MENGINAP_NO
  );

  const tempatSurat = (form.tempatSurat || 'Bekasi')
    .trim()
    .slice(0, VALIDATION_LIMITS.MAX_TEMPAT_SURAT_LENGTH);
  const namaSupir = (form.namaSupir || '')
    .trim()
    .slice(0, VALIDATION_LIMITS.MAX_SUPIR_LENGTH);
  const transporter = (form.transporter || '')
    .trim()
    .slice(0, VALIDATION_LIMITS.MAX_TRANSPORTER_LENGTH);
  const noPolisi = (form.noPolisi || '')
    .trim()
    .toUpperCase()
    .slice(0, VALIDATION_LIMITS.MAX_NO_MOBIL_LENGTH);
  const alasanMenginap = (form.alasanMenginap || '')
    .trim()
    .slice(0, VALIDATION_LIMITS.MAX_ALASAN_MENGINAP_LENGTH);

  const namaPemohon = (form.namaPemohon || '')
    .trim()
    .slice(0, VALIDATION_LIMITS.MAX_PENANDATANGAN_LENGTH);
  const namaDiketahui = (form.namaDiketahui || '')
    .trim()
    .slice(0, VALIDATION_LIMITS.MAX_PENANDATANGAN_LENGTH);
  const namaDisetujui = (form.namaDisetujui || '')
    .trim()
    .slice(0, VALIDATION_LIMITS.MAX_PENANDATANGAN_LENGTH);

  if (!tempatSurat) throw new Error('Kota / tempat surat wajib diisi.');
  if (!namaSupir) throw new Error('Nama Supir wajib diisi.');
  if (!transporter) throw new Error('Transporter wajib diisi.');
  if (!noPolisi) throw new Error('No Polisi Kendaraan wajib diisi.');
  if (!alasanMenginap) throw new Error('Alasan Menginap wajib diisi.');

  return {
    ownerId,
    no: safeNo,
    tanggalSurat: form.tanggalSurat,
    tempatSurat,
    namaSupir,
    transporter,
    noPolisi,
    tanggalMenginap: form.tanggalMenginap,
    tanggalMenginapSampai,
    alasanMenginap,
    namaPemohon,
    namaDiketahui,
    namaDisetujui,
  };
}

export function buildIjinMenginapId(uid: string): string {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  const rand = Math.random().toString(36).slice(2, 8);
  return `im_${safeUid}_${Date.now()}_${rand}`;
}

export function subscribeSharedIjinMenginap(
  onData: (entries: IjinMenginapEntry[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(collection(db, COLLECTION_NAME));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: IjinMenginapEntry[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const createdAtTs = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : undefined;
        const updatedAtTs = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : undefined;

        return {
          id: docSnap.id,
          ownerId: String(d.ownerId || ''),
          no: Math.max(1, Math.trunc(Number(d.no) || 1)),
          tanggalSurat: String(d.tanggalSurat || ''),
          tempatSurat: String(d.tempatSurat || 'Bekasi'),
          namaSupir: String(d.namaSupir || ''),
          transporter: String(d.transporter || ''),
          noPolisi: String(d.noPolisi || ''),
          tanggalMenginap: String(d.tanggalMenginap || ''),
          tanggalMenginapSampai: String(d.tanggalMenginapSampai || ''),
          alasanMenginap: String(d.alasanMenginap || ''),
          namaPemohon: String(d.namaPemohon || ''),
          namaDiketahui: String(d.namaDiketahui || ''),
          namaDisetujui: String(d.namaDisetujui || ''),
          createdAtMs: createdAtTs,
          updatedAtMs: updatedAtTs,
        };
      });

      items.sort((a, b) => {
        const dateCmp = b.tanggalSurat.localeCompare(a.tanggalSurat);
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

export async function saveIjinMenginapEntry(
  uid: string,
  form: IjinMenginapFormState,
  existingEntry?: IjinMenginapEntry | null
): Promise<string> {
  let assignedNo: number;

  if (existingEntry && !existingEntry.isLocal && existingEntry.tanggalSurat === form.tanggalSurat) {
    assignedNo = existingEntry.no;
  } else {
    try {
      const sameDateQ = query(
        collection(db, COLLECTION_NAME),
        where('tanggalSurat', '==', form.tanggalSurat)
      );
      const snap = await getDocs(sameDateQ);
      const existingForDate = snap.docs.map((docSnap) => ({
        tanggalSurat: String(docSnap.data().tanggalSurat || form.tanggalSurat),
        no: Number(docSnap.data().no) || 0,
      }));
      assignedNo = getNextIjinMenginapNoForDate(existingForDate, form.tanggalSurat);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTION_NAME);
    }
  }

  const payload = sanitizeIjinMenginapPayload(uid, assignedNo, form);

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
    const entryId = buildIjinMenginapId(uid);
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

export async function deleteIjinMenginapEntry(entryId: string): Promise<void> {
  if (!VALIDATION_LIMITS.ID_REGEX.test(entryId)) {
    throw new Error('ID surat ijin menginap tidak valid.');
  }
  const docRef = doc(db, COLLECTION_NAME, entryId);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${entryId}`);
  }
}

export function exportIjinMenginapCsv(entries: IjinMenginapEntry[]): void {
  const headers = [
    'No',
    'Tempat Surat',
    'Tanggal Surat',
    'Nama Supir',
    'Transporter',
    'No Polisi Kendaraan',
    'Tanggal Menginap',
    'Sampai Dengan (s/d)',
    'Alasan Menginap',
    'Pemohon (Warehouse Div)',
    'Diketahui (Sales & Marketing Div)',
    'Disetujui (HA & GS Div.)',
  ];
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;

  const rows = entries.map((item) =>
    [
      String(item.no),
      esc(item.tempatSurat || 'Bekasi'),
      esc(formatIndonesianDate(item.tanggalSurat)),
      esc(item.namaSupir),
      esc(item.transporter),
      esc(item.noPolisi),
      esc(formatIndonesianDate(item.tanggalMenginap)),
      esc(item.tanggalMenginapSampai ? formatIndonesianDate(item.tanggalMenginapSampai) : '-'),
      esc(item.alasanMenginap),
      esc(item.namaPemohon || ''),
      esc(item.namaDiketahui || ''),
      esc(item.namaDisetujui || ''),
    ].join(',')
  );

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `surat_ijin_menginap_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
