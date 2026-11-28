import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  DeliveryFormState,
  DeliveryReport,
  DeliveryReportPayload,
  VALIDATION_LIMITS,
} from '../types/delivery';
import { INITIAL_NOV_19_SAMPLE, roundTon } from '../utils/deliveryCalculations';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const COLLECTION_NAME = 'delivery_reports';

function clampDaily(n: number): number {
  const rounded = roundTon(Number(n) || 0);
  return Math.min(Math.max(rounded, 0), VALIDATION_LIMITS.MAX_DAILY_TON);
}

function clampMtd(n: number): number {
  const rounded = roundTon(Number(n) || 0);
  return Math.min(Math.max(rounded, 0), VALIDATION_LIMITS.MAX_MTD_TON);
}

export function sanitizeDeliveryPayload(
  ownerId: string,
  form: DeliveryFormState
): DeliveryReportPayload {
  if (!VALIDATION_LIMITS.ID_REGEX.test(ownerId) || ownerId.length > VALIDATION_LIMITS.MAX_ID_LENGTH) {
    throw new Error('Owner ID tidak valid.');
  }
  if (!VALIDATION_LIMITS.DATE_REGEX.test(form.date)) {
    throw new Error('Format tanggal harus YYYY-MM-DD.');
  }
  const monthKey = form.date.slice(0, 7);
  if (!VALIDATION_LIMITS.MONTH_REGEX.test(monthKey)) {
    throw new Error('Format bulan tidak valid.');
  }

  return {
    ownerId,
    date: form.date,
    monthKey,
    dailyJktTotal: clampDaily(form.dailyJktTotal),
    dailySmgTotal: clampDaily(form.dailySmgTotal),
    jktProjectForming: clampDaily(form.jktProjectForming),
    jktIndustri: clampDaily(form.jktIndustri),
    jktIsbsRitel: clampDaily(form.jktIsbsRitel),
    jktOthers: clampDaily(form.jktOthers),
    smgProjectForming: clampDaily(form.smgProjectForming),
    smgIndustri: clampDaily(form.smgIndustri),
    smgIsbsRitel: clampDaily(form.smgIsbsRitel),
    smgOthers: clampDaily(form.smgOthers),
    mtdMode: form.mtdMode === 'manual' ? 'manual' : 'auto',
    mtdJktProjectForming: clampMtd(form.mtdJktProjectForming),
    mtdJktIndustri: clampMtd(form.mtdJktIndustri),
    mtdJktIsbsRitel: clampMtd(form.mtdJktIsbsRitel),
    mtdJktOthers: clampMtd(form.mtdJktOthers),
    mtdSmgProjectForming: clampMtd(form.mtdSmgProjectForming),
    mtdSmgIndustri: clampMtd(form.mtdSmgIndustri),
    mtdSmgIsbsRitel: clampMtd(form.mtdSmgIsbsRitel),
    mtdSmgOthers: clampMtd(form.mtdSmgOthers),
    mtdJktTotal: clampMtd(form.mtdJktTotal),
    mtdSmgTotal: clampMtd(form.mtdSmgTotal),
    mtdCombinedTotal: clampMtd(form.mtdCombinedTotal),
    notes: (form.notes || '').trim().slice(0, VALIDATION_LIMITS.MAX_NOTES_LENGTH),
  };
}

export function buildSharedReportId(date: string): string {
  const safeDate = date.replace(/[^0-9-]/g, '').slice(0, 10);
  return `shared_${safeDate}`;
}

export function subscribeSharedReports(
  onData: (reports: DeliveryReport[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(collection(db, COLLECTION_NAME));

  return onSnapshot(
    q,
    (snapshot) => {
      const byDate = new Map<string, DeliveryReport>();

      snapshot.docs.forEach((docSnap) => {
        const d = docSnap.data();
        const createdAtTs = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : undefined;
        const updatedAtTs = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : undefined;

        const jktProjectForming = Number(d.jktProjectForming || 0);
        const jktIndustri = Number(d.jktIndustri || 0);
        const jktIsbsRitel = Number(d.jktIsbsRitel || 0);
        const jktOthers = Number(d.jktOthers || 0);
        const smgProjectForming = Number(d.smgProjectForming || 0);
        const smgIndustri = Number(d.smgIndustri || 0);
        const smgIsbsRitel = Number(d.smgIsbsRitel || 0);
        const smgOthers = Number(d.smgOthers || 0);

        const mtdJktTotal = Number(d.mtdJktTotal || 0);
        const mtdSmgTotal = Number(d.mtdSmgTotal || 0);

        const dailyJktTotal =
          d.dailyJktTotal !== undefined
            ? Number(d.dailyJktTotal)
            : roundTon(jktProjectForming + jktIndustri + jktIsbsRitel + jktOthers);
        const dailySmgTotal =
          d.dailySmgTotal !== undefined
            ? Number(d.dailySmgTotal)
            : roundTon(smgProjectForming + smgIndustri + smgIsbsRitel + smgOthers);
        const mtdCombinedTotal =
          d.mtdCombinedTotal !== undefined
            ? Number(d.mtdCombinedTotal)
            : roundTon(mtdJktTotal + mtdSmgTotal);

        const item: DeliveryReport = {
          id: docSnap.id,
          ownerId: String(d.ownerId || ''),
          date: String(d.date || ''),
          monthKey: String(d.monthKey || ''),
          dailyJktTotal,
          dailySmgTotal,
          jktProjectForming,
          jktIndustri,
          jktIsbsRitel,
          jktOthers,
          smgProjectForming,
          smgIndustri,
          smgIsbsRitel,
          smgOthers,
          mtdMode: d.mtdMode === 'manual' ? 'manual' : 'auto',
          mtdJktProjectForming: Number(d.mtdJktProjectForming || 0),
          mtdJktIndustri: Number(d.mtdJktIndustri || 0),
          mtdJktIsbsRitel: Number(d.mtdJktIsbsRitel || 0),
          mtdJktOthers: Number(d.mtdJktOthers || 0),
          mtdSmgProjectForming: Number(d.mtdSmgProjectForming || 0),
          mtdSmgIndustri: Number(d.mtdSmgIndustri || 0),
          mtdSmgIsbsRitel: Number(d.mtdSmgIsbsRitel || 0),
          mtdSmgOthers: Number(d.mtdSmgOthers || 0),
          mtdJktTotal,
          mtdSmgTotal,
          mtdCombinedTotal,
          notes: String(d.notes || ''),
          createdAtMs: createdAtTs,
          updatedAtMs: updatedAtTs,
        };

        const existingForDate = byDate.get(item.date);
        if (!existingForDate) {
          byDate.set(item.date, item);
        } else {
          const itemUpdated = item.updatedAtMs ?? 0;
          const prevUpdated = existingForDate.updatedAtMs ?? 0;
          if (
            itemUpdated > prevUpdated ||
            (itemUpdated === prevUpdated && item.id.startsWith('shared_'))
          ) {
            byDate.set(item.date, item);
          }
        }
      });

      const items = Array.from(byDate.values()).sort((a, b) =>
        b.date.localeCompare(a.date)
      );
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

export async function saveDeliveryReport(
  uid: string,
  form: DeliveryFormState
): Promise<string> {
  const payload = sanitizeDeliveryPayload(uid, form);
  const targetId = buildSharedReportId(payload.date);
  const docRef = doc(db, COLLECTION_NAME, targetId);

  let docExists = false;
  try {
    const snap = await getDoc(docRef);
    docExists = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${COLLECTION_NAME}/${targetId}`);
  }

  if (docExists) {
    throw new Error(
      `Laporan tanggal ${payload.date} sudah bersifat final dan tidak dapat diedit atau ditimpa.`
    );
  }

  try {
    await setDoc(docRef, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return targetId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${COLLECTION_NAME}/${targetId}`);
  }
}

export async function deleteDeliveryReport(reportId: string): Promise<void> {
  if (!VALIDATION_LIMITS.ID_REGEX.test(reportId) || reportId.length > VALIDATION_LIMITS.MAX_ID_LENGTH) {
    throw new Error('ID laporan delivery tidak valid.');
  }
  const docRef = doc(db, COLLECTION_NAME, reportId);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${reportId}`);
  }
}

export async function seedNov19ReportForUser(uid: string): Promise<string> {
  const s = INITIAL_NOV_19_SAMPLE;
  return saveDeliveryReport(uid, {
    date: s.date,
    dailyJktTotal: s.dailyJktTotal,
    dailySmgTotal: s.dailySmgTotal,
    jktProjectForming: s.jktProjectForming,
    jktIndustri: s.jktIndustri,
    jktIsbsRitel: s.jktIsbsRitel,
    jktOthers: s.jktOthers,
    smgProjectForming: s.smgProjectForming,
    smgIndustri: s.smgIndustri,
    smgIsbsRitel: s.smgIsbsRitel,
    smgOthers: s.smgOthers,
    mtdMode: s.mtdMode,
    mtdJktProjectForming: s.mtdJktProjectForming,
    mtdJktIndustri: s.mtdJktIndustri,
    mtdJktIsbsRitel: s.mtdJktIsbsRitel,
    mtdJktOthers: s.mtdJktOthers,
    mtdSmgProjectForming: s.mtdSmgProjectForming,
    mtdSmgIndustri: s.mtdSmgIndustri,
    mtdSmgIsbsRitel: s.mtdSmgIsbsRitel,
    mtdSmgOthers: s.mtdSmgOthers,
    mtdJktTotal: s.mtdJktTotal,
    mtdSmgTotal: s.mtdSmgTotal,
    mtdCombinedTotal: s.mtdCombinedTotal,
    notes: s.notes,
  });
}
