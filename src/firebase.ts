import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export const SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'] as const;

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
SHEETS_SCOPES.forEach((scope) => {
  googleProvider.addScope(scope);
});

const sheetsConsentProvider = new GoogleAuthProvider();
SHEETS_SCOPES.forEach((scope) => {
  sheetsConsentProvider.addScope(scope);
});
sheetsConsentProvider.setCustomParameters({
  prompt: 'consent select_account',
});

// In-memory only cache for Google Workspace OAuth access token (never stored in localStorage/sessionStorage)
let cachedSheetsAccessToken: string | null = null;
let cachedTokenUid: string | null = null;
const tokenListeners = new Set<(hasToken: boolean) => void>();

function notifyTokenListeners() {
  const hasToken = Boolean(cachedSheetsAccessToken);
  tokenListeners.forEach((listener) => listener(hasToken));
}

onAuthStateChanged(auth, (user) => {
  if (!user || (cachedTokenUid && cachedTokenUid !== user.uid)) {
    cachedSheetsAccessToken = null;
    cachedTokenUid = null;
    notifyTokenListeners();
  }
});

export function setSheetsAccessToken(token: string | null | undefined, uid?: string | null): void {
  if (token) {
    cachedSheetsAccessToken = token;
    cachedTokenUid = uid ?? auth.currentUser?.uid ?? null;
  } else {
    cachedSheetsAccessToken = null;
    cachedTokenUid = null;
  }
  notifyTokenListeners();
}

export function clearSheetsAccessToken(): void {
  cachedSheetsAccessToken = null;
  cachedTokenUid = null;
  notifyTokenListeners();
}

export function getSheetsAccessToken(): string | null {
  return cachedSheetsAccessToken;
}

export function subscribeSheetsTokenStatus(listener: (hasToken: boolean) => void): () => void {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
}

export async function connectGoogleSheets(): Promise<string> {
  const currentUser = auth.currentUser;
  const usesGoogleProvider = Boolean(
    currentUser?.providerData.some((p) => p.providerId === 'google.com')
  );

  let result;
  if (currentUser && usesGoogleProvider) {
    try {
      result = await reauthenticateWithPopup(currentUser, sheetsConsentProvider);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      if (code === 'auth/user-mismatch') {
        throw new Error(
          `Pilih akun Google yang sama dengan akun login saat ini (${currentUser.email || 'akun aktif'}).`
        );
      }
      throw err;
    }
  } else {
    result = await signInWithPopup(auth, sheetsConsentProvider);
  }

  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error(
      'Gagal memperoleh izin akses Google Sheets. Pastikan jendela pop-up tidak diblokir dan izin akses spreadsheet diberikan.'
    );
  }

  setSheetsAccessToken(credential.accessToken, result.user.uid);
  return credential.accessToken;
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: the client is offline.');
      return false;
    }
    return true;
  }
}

testConnection();
