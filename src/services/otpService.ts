import {
  collection,
  doc,
  getDocFromServer,
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
  ADMIN_OTP_EMAIL,
  OtpRequestFormState,
  OtpRequestRecord,
  OtpRequestStatus,
  OtpSecretRecord,
  VALIDATION_LIMITS,
} from '../types/delivery';
import { handleFirestoreError, OperationType } from './deliveryService';

const OTP_REQUESTS_COLLECTION = 'otp_requests';
const OTP_SECRETS_COLLECTION = 'otp_secrets';
const OTP_VALIDITY_MINUTES = 30;

function parseOtpStatus(raw: unknown): OtpRequestStatus {
  if (raw === 'otp_issued' || raw === 'verified' || raw === 'rejected') {
    return raw;
  }
  return 'pending';
}

function mapOtpRequestDoc(
  id: string,
  d: Record<string, unknown>,
  hasPendingWrites = false
): OtpRequestRecord {
  const expiresAtTs = d.expiresAt instanceof Timestamp ? d.expiresAt.toMillis() : null;
  const createdAtTs = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : undefined;
  const updatedAtTs = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : undefined;

  return {
    id,
    ownerId: String(d.ownerId || ''),
    email: String(d.email || ''),
    displayName: String(d.displayName || ''),
    phone: String(d.phone || ''),
    note: String(d.note || ''),
    status: parseOtpStatus(d.status),
    submittedOtp: String(d.submittedOtp || ''),
    approvedBy: String(d.approvedBy || ''),
    expiresAtMs: expiresAtTs,
    createdAtMs: createdAtTs,
    updatedAtMs: updatedAtTs,
    hasPendingWrites,
  };
}

function generateSixDigitOtp(): string {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return String(100000 + (arr[0] % 900000));
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function subscribeMyOtpRequest(
  uid: string,
  onData: (record: OtpRequestRecord | null) => void,
  onError: (error: Error) => void
): () => void {
  const docRef = doc(db, OTP_REQUESTS_COLLECTION, uid);

  return onSnapshot(
    docRef,
    { includeMetadataChanges: true },
    (docSnap) => {
      if (!docSnap.exists()) {
        onData(null);
        return;
      }
      onData(
        mapOtpRequestDoc(
          docSnap.id,
          docSnap.data() as Record<string, unknown>,
          docSnap.metadata.hasPendingWrites
        )
      );
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, `${OTP_REQUESTS_COLLECTION}/${uid}`);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function submitOtpRequest(
  uid: string,
  email: string,
  form: OtpRequestFormState,
  hasExistingDoc: boolean
): Promise<void> {
  if (!VALIDATION_LIMITS.ID_REGEX.test(uid) || uid.length > VALIDATION_LIMITS.MAX_ID_LENGTH) {
    throw new Error('UID pengguna tidak valid.');
  }

  const cleanEmail = (email || `${uid}@user.local`)
    .trim()
    .slice(0, VALIDATION_LIMITS.MAX_EMAIL_LENGTH);
  const cleanName = form.displayName.trim().slice(0, VALIDATION_LIMITS.MAX_DISPLAY_NAME_LENGTH);
  const cleanPhone = form.phone.trim().slice(0, VALIDATION_LIMITS.MAX_PHONE_LENGTH);
  const cleanNote = form.note.trim().slice(0, VALIDATION_LIMITS.MAX_OTP_NOTE_LENGTH);

  if (cleanEmail.length < 3) {
    throw new Error('Alamat email akun tidak valid.');
  }
  if (cleanName.length < 1) {
    throw new Error('Nama lengkap wajib diisi.');
  }
  if (cleanPhone.length < 6) {
    throw new Error('Nomor HP / WhatsApp minimal 6 karakter.');
  }

  const docRef = doc(db, OTP_REQUESTS_COLLECTION, uid);

  if (hasExistingDoc) {
    try {
      await updateDoc(docRef, {
        email: cleanEmail,
        displayName: cleanName,
        phone: cleanPhone,
        note: cleanNote,
        status: 'pending',
        submittedOtp: '',
        approvedBy: '',
        expiresAt: null,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${OTP_REQUESTS_COLLECTION}/${uid}`);
    }
  } else {
    try {
      await setDoc(docRef, {
        ownerId: uid,
        email: cleanEmail,
        displayName: cleanName,
        phone: cleanPhone,
        note: cleanNote,
        status: 'pending',
        submittedOtp: '',
        approvedBy: '',
        expiresAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${OTP_REQUESTS_COLLECTION}/${uid}`);
    }
  }
}

export async function verifyMyOtpCode(uid: string, rawCode: string): Promise<void> {
  const cleanCode = rawCode.replace(/\D/g, '').slice(0, VALIDATION_LIMITS.OTP_CODE_LENGTH);
  if (!VALIDATION_LIMITS.OTP_CODE_REGEX.test(cleanCode)) {
    throw new Error('Masukkan 6 digit kode OTP yang valid.');
  }

  const docRef = doc(db, OTP_REQUESTS_COLLECTION, uid);
  try {
    await updateDoc(docRef, {
      status: 'verified',
      submittedOtp: cleanCode,
      updatedAt: serverTimestamp(),
    });
    // Ensure server has committed the verified status before unlocking shared collection listeners
    await getDocFromServer(docRef);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : '';
    if (
      code === 'permission-denied' ||
      msg.toLowerCase().includes('permission') ||
      msg.toLowerCase().includes('insufficient permissions')
    ) {
      throw new Error(
        `Kode OTP salah atau sudah kedaluwarsa. Periksa kembali kode dari administrator (${ADMIN_OTP_EMAIL}) atau minta ulang OTP.`
      );
    }
    handleFirestoreError(error, OperationType.UPDATE, `${OTP_REQUESTS_COLLECTION}/${uid}`);
  }
}

export function subscribeAllOtpRequests(
  onData: (records: OtpRequestRecord[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(collection(db, OTP_REQUESTS_COLLECTION));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: OtpRequestRecord[] = snapshot.docs.map((docSnap) =>
        mapOtpRequestDoc(docSnap.id, docSnap.data() as Record<string, unknown>)
      );

      const priorityOrder: Record<OtpRequestStatus, number> = {
        pending: 0,
        otp_issued: 1,
        rejected: 2,
        verified: 3,
      };

      items.sort((a, b) => {
        const pDiff = priorityOrder[a.status] - priorityOrder[b.status];
        if (pDiff !== 0) return pDiff;
        return (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0);
      });

      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, OTP_REQUESTS_COLLECTION);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeAllOtpSecrets(
  onData: (secretsByUid: Record<string, OtpSecretRecord>) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(collection(db, OTP_SECRETS_COLLECTION));

  return onSnapshot(
    q,
    (snapshot) => {
      const map: Record<string, OtpSecretRecord> = {};
      snapshot.docs.forEach((docSnap) => {
        const d = docSnap.data();
        const expiresAtMs = d.expiresAt instanceof Timestamp ? d.expiresAt.toMillis() : 0;
        const updatedAtMs = d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : undefined;
        map[docSnap.id] = {
          id: docSnap.id,
          ownerId: String(d.ownerId || ''),
          otpCode: String(d.otpCode || ''),
          issuedBy: String(d.issuedBy || ''),
          expiresAtMs,
          updatedAtMs,
        };
      });
      onData(map);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, OTP_SECRETS_COLLECTION);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function issueOtpForUser(
  targetUserId: string,
  adminEmail: string
): Promise<{ otpCode: string; expiresAtMs: number }> {
  if (!VALIDATION_LIMITS.ID_REGEX.test(targetUserId)) {
    throw new Error('UID pengguna target tidak valid.');
  }

  const otpCode = generateSixDigitOtp();
  const expiresAtMs = Date.now() + OTP_VALIDITY_MINUTES * 60 * 1000;
  const expiresAtTs = Timestamp.fromMillis(expiresAtMs);
  const cleanAdminEmail = adminEmail.trim().slice(0, VALIDATION_LIMITS.MAX_EMAIL_LENGTH);

  const batch = writeBatch(db);
  const secretRef = doc(db, OTP_SECRETS_COLLECTION, targetUserId);
  const requestRef = doc(db, OTP_REQUESTS_COLLECTION, targetUserId);

  batch.set(secretRef, {
    ownerId: targetUserId,
    otpCode,
    issuedBy: cleanAdminEmail,
    expiresAt: expiresAtTs,
    updatedAt: serverTimestamp(),
  });

  batch.update(requestRef, {
    status: 'otp_issued',
    submittedOtp: '',
    approvedBy: cleanAdminEmail,
    expiresAt: expiresAtTs,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return { otpCode, expiresAtMs };
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `${OTP_REQUESTS_COLLECTION}/${targetUserId}`
    );
  }
}

export async function rejectOtpRequest(
  targetUserId: string,
  adminEmail: string
): Promise<void> {
  if (!VALIDATION_LIMITS.ID_REGEX.test(targetUserId)) {
    throw new Error('UID pengguna target tidak valid.');
  }

  const requestRef = doc(db, OTP_REQUESTS_COLLECTION, targetUserId);
  const cleanAdminEmail = adminEmail.trim().slice(0, VALIDATION_LIMITS.MAX_EMAIL_LENGTH);

  try {
    await updateDoc(requestRef, {
      status: 'rejected',
      submittedOtp: '',
      approvedBy: cleanAdminEmail,
      expiresAt: null,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${OTP_REQUESTS_COLLECTION}/${targetUserId}`);
  }
}

export async function revokeOtpAccess(
  targetUserId: string,
  adminEmail: string
): Promise<void> {
  if (!VALIDATION_LIMITS.ID_REGEX.test(targetUserId)) {
    throw new Error('UID pengguna target tidak valid.');
  }

  const requestRef = doc(db, OTP_REQUESTS_COLLECTION, targetUserId);
  const cleanAdminEmail = adminEmail.trim().slice(0, VALIDATION_LIMITS.MAX_EMAIL_LENGTH);

  try {
    await updateDoc(requestRef, {
      status: 'pending',
      submittedOtp: '',
      approvedBy: cleanAdminEmail,
      expiresAt: null,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${OTP_REQUESTS_COLLECTION}/${targetUserId}`);
  }
}

export async function deleteOtpRequest(targetUserId: string): Promise<void> {
  if (!VALIDATION_LIMITS.ID_REGEX.test(targetUserId)) {
    throw new Error('UID pengguna target tidak valid.');
  }

  const batch = writeBatch(db);
  batch.delete(doc(db, OTP_REQUESTS_COLLECTION, targetUserId));
  batch.delete(doc(db, OTP_SECRETS_COLLECTION, targetUserId));

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `${OTP_REQUESTS_COLLECTION}/${targetUserId}`
    );
  }
}

// Keep unused query/where import warning away or expose owner-scoped helper if needed
export function subscribeOwnerOtpList(
  uid: string,
  onData: (records: OtpRequestRecord[]) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(collection(db, OTP_REQUESTS_COLLECTION), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      onData(
        snapshot.docs.map((docSnap) =>
          mapOtpRequestDoc(docSnap.id, docSnap.data() as Record<string, unknown>)
        )
      );
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, OTP_REQUESTS_COLLECTION);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}
