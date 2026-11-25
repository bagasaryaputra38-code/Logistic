import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { auth, googleProvider, setSheetsAccessToken } from '../firebase';
import { submitOtpRequest, verifyMyOtpCode } from '../services/otpService';
import { ADMIN_OTP_EMAIL, isAdminEmail, OtpRequestRecord } from '../types/delivery';

interface AuthGateViewProps {
  currentUser: User | null;
  otpRequest: OtpRequestRecord | null;
  isLoadingOtpStatus: boolean;
  onAuthChanged: () => Promise<void> | void;
}

type AuthMode = 'login' | 'register';

function mapFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const msg = err instanceof Error ? err.message : String(err);

  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Login Email & Kata Sandi belum diaktifkan di Firebase Console (Authentication → Sign-in method). Aktifkan Email/Password atau langsung gunakan tombol Google di bawah.';
    case 'auth/unauthorized-domain':
      return 'Domain aplikasi belum terdaftar di Authorized Domains pada Firebase Console (Authentication → Settings).';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email atau kata sandi tidak sesuai.';
    case 'auth/invalid-email':
      return 'Format alamat email tidak valid.';
    case 'auth/email-already-in-use':
      return 'Email ini sudah terdaftar. Silakan pindah ke tab Masuk.';
    case 'auth/weak-password':
      return 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan dalam waktu singkat. Tunggu beberapa menit lalu coba lagi.';
    case 'auth/popup-closed-by-user':
      return '';
    default:
      return msg || 'Terjadi kesalahan autentikasi. Silakan coba lagi.';
  }
}

function formatExpiry(ms?: number | null): string {
  if (!ms) return '';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

export const AuthGateView: React.FC<AuthGateViewProps> = ({
  currentUser,
  otpRequest,
  isLoadingOtpStatus,
  onAuthChanged,
}) => {
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  // Login / Register fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Admin OTP request fields
  const [reqName, setReqName] = useState('');
  const [reqPhone, setReqPhone] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [editingRequest, setEditingRequest] = useState(false);

  // UI feedback
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [emailPasswordDisabled, setEmailPasswordDisabled] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (currentUser) {
      setReqName(otpRequest?.displayName || currentUser.displayName || '');
      setReqPhone(otpRequest?.phone || '');
      setReqNote(otpRequest?.note || '');
    }
  }, [currentUser, otpRequest]);

  const handleModeSwitch = (mode: AuthMode) => {
    setAuthMode(mode);
    setErrorMsg(null);
    setEmailPasswordDisabled(false);
    setInfoMsg(null);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setEmailPasswordDisabled(false);
    setInfoMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Alamat email wajib diisi.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Kata sandi minimal 6 karakter.');
      return;
    }

    if (authMode === 'register') {
      if (!fullName.trim()) {
        setErrorMsg('Nama lengkap wajib diisi untuk pendaftaran.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Konfirmasi kata sandi tidak cocok.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (authMode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await updateProfile(cred.user, { displayName: fullName.trim() });
        if (isAdminEmail(cleanEmail)) {
          await sendEmailVerification(cred.user);
          setInfoMsg(
            `Tautan verifikasi email administrator telah dikirim ke ${cleanEmail}. Verifikasi email Anda untuk masuk sebagai Admin.`
          );
        } else {
          setInfoMsg('Akun berhasil dibuat. Lanjutkan dengan mengirim permintaan OTP ke administrator.');
        }
        await onAuthChanged();
      } else {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        await onAuthChanged();
      }
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      if (code === 'auth/operation-not-allowed') {
        setEmailPasswordDisabled(true);
        setErrorMsg(
          'Pendaftaran dengan Email & Kata Sandi belum diaktifkan di Firebase Console. Silakan klik tombol Google di atas untuk mendaftar/masuk langsung, lalu ajukan OTP ke administrator.'
        );
      } else {
        const friendly = mapFirebaseAuthError(err);
        if (friendly) setErrorMsg(friendly);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setErrorMsg(null);
    setEmailPasswordDisabled(false);
    setInfoMsg(null);
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Masukkan alamat email Anda terlebih dahulu untuk reset kata sandi.');
      return;
    }

    setIsSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setInfoMsg(`Tautan pengaturan ulang kata sandi telah dikirim ke ${cleanEmail}.`);
    } catch (err) {
      const friendly = mapFirebaseAuthError(err);
      if (friendly) setErrorMsg(friendly);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setEmailPasswordDisabled(false);
    setInfoMsg(null);
    setIsSubmitting(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const oauthCred = GoogleAuthProvider.credentialFromResult(cred);
      if (oauthCred?.accessToken) {
        setSheetsAccessToken(oauthCred.accessToken, cred.user.uid);
      }
      if (authMode === 'register' && fullName.trim() && cred.user && !cred.user.displayName) {
        await updateProfile(cred.user, { displayName: fullName.trim() });
      }
      await onAuthChanged();
    } catch (err) {
      const friendly = mapFirebaseAuthError(err);
      if (friendly) setErrorMsg(friendly);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckAdminEmailVerification = async () => {
    if (!currentUser) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setIsSubmitting(true);
    try {
      await currentUser.reload();
      if (auth.currentUser?.emailVerified) {
        await onAuthChanged();
      } else {
        setErrorMsg(
          'Email administrator masih belum terverifikasi. Klik tautan di inbox/spam Anda lalu coba lagi.'
        );
      }
    } catch (err) {
      const friendly = mapFirebaseAuthError(err);
      if (friendly) setErrorMsg(friendly);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendAdminVerificationEmail = async () => {
    if (!currentUser || resendCooldown > 0) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setIsSubmitting(true);
    try {
      await sendEmailVerification(currentUser);
      setResendCooldown(60);
      setInfoMsg(`Tautan verifikasi baru dikirim ke ${currentUser.email}.`);
    } catch (err) {
      const friendly = mapFirebaseAuthError(err);
      if (friendly) setErrorMsg(friendly);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitOtpRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setErrorMsg(null);
    setInfoMsg(null);

    if (!reqName.trim()) {
      setErrorMsg('Nama lengkap wajib diisi.');
      return;
    }
    if (reqPhone.trim().length < 6) {
      setErrorMsg('Masukkan nomor HP / WhatsApp yang aktif (minimal 6 digit).');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitOtpRequest(
        currentUser.uid,
        currentUser.email || '',
        {
          displayName: reqName,
          phone: reqPhone,
          note: reqNote,
        },
        Boolean(otpRequest)
      );
      setEditingRequest(false);
      setOtpInput('');
      setInfoMsg(
        `Permintaan OTP berhasil dikirim ke Administrator (${ADMIN_OTP_EMAIL}).`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengirim permintaan OTP.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestNewOtpFromIssued = async () => {
    if (!currentUser || !otpRequest) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setIsSubmitting(true);
    try {
      await submitOtpRequest(
        currentUser.uid,
        currentUser.email || '',
        {
          displayName: otpRequest.displayName || currentUser.displayName || 'Pengguna',
          phone: otpRequest.phone || '-',
          note: otpRequest.note || '',
        },
        true
      );
      setOtpInput('');
      setInfoMsg(`Permintaan OTP ulang telah dikirim ke ${ADMIN_OTP_EMAIL}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengirim ulang permintaan OTP.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyAdminOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setErrorMsg(null);
    setInfoMsg(null);

    const cleanCode = otpInput.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setErrorMsg('Masukkan 6 digit kode OTP yang diberikan administrator.');
      return;
    }

    setIsSubmitting(true);
    try {
      await verifyMyOtpCode(currentUser.uid, cleanCode);
      await onAuthChanged();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Verifikasi OTP gagal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setEditingRequest(false);
    setOtpInput('');
    await signOut(auth);
  };

  const isUnverifiedAdminAccount = Boolean(
    currentUser && isAdminEmail(currentUser.email) && !currentUser.emailVerified
  );

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 lg:p-10">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {/* Left Operations Brand Panel */}
        <div className="lg:col-span-5 bg-slate-900 text-white p-7 sm:p-10 flex flex-col justify-between gap-8">
          <div className="space-y-6">
            <div className="space-y-2.5">
              <div className="inline-flex items-center bg-white rounded-xl px-3.5 py-2 shadow-sm">
                <div className="h-12 w-48 overflow-hidden flex items-center justify-center">
                  <img
                    src="/assets/aistudio/image_fccbe718.png"
                    alt="LOGISTIC FUMIRA"
                    className="w-full h-full object-cover object-center"
                  />
                </div>
              </div>
              <div className="text-xs italic font-medium text-slate-300">
                Delivering On Time, Every Time.
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-snug text-balance">
                Sistem Rekapitulasi Pengiriman &amp; Surat Jalan
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                Masuk atau daftarkan akun Anda terlebih dahulu, lalu ajukan permintaan kode OTP
                kepada Administrator sebelum mengakses laporan pengiriman dan surat jalan.
              </p>
            </div>
          </div>

          <div className="space-y-4 border-t border-white/10 pt-6 text-xs sm:text-sm text-slate-300">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <span>
                Administrator OTP resmi:{' '}
                <strong className="text-white break-all">{ADMIN_OTP_EMAIL}</strong>
              </span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <span>
                Seluruh laporan harian JKT &amp; SMG, salinan WA, dan Data Surat Jalan tersimpan
                aman di Cloud.
              </span>
            </div>
          </div>
        </div>

        {/* Right Auth Portal */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
          {isUnverifiedAdminAccount && currentUser ? (
            /* Security guard: Admin email signed up via password must verify email ownership */
            <div className="space-y-5 max-w-md mx-auto w-full">
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <Mail className="w-5 h-5" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-xl font-bold text-slate-900">
                  Verifikasi Email Administrator
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Akun administrator{' '}
                  <strong className="text-slate-900">{currentUser.email}</strong> harus
                  memverifikasi kepemilikan email atau masuk dengan tombol{' '}
                  <strong className="text-slate-900">Google</strong> sebelum mengelola permintaan
                  OTP.
                </p>
              </div>

              {errorMsg && (
                <div className="rounded-lg px-3.5 py-2.5 text-xs font-medium flex items-start gap-2 border bg-red-50 border-red-200 text-red-800">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {infoMsg && (
                <div className="rounded-lg px-3.5 py-2.5 text-xs font-medium flex items-start gap-2 border bg-emerald-50 border-emerald-200 text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{infoMsg}</span>
                </div>
              )}

              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleCheckAdminEmailVerification}
                  className="w-full h-11 inline-flex items-center justify-center gap-2 px-4 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Saya Sudah Verifikasi Email Admin
                </button>

                <button
                  type="button"
                  disabled={isSubmitting || resendCooldown > 0}
                  onClick={handleResendAdminVerificationEmail}
                  className="w-full h-10 inline-flex items-center justify-center gap-2 px-4 border border-slate-200 bg-white text-slate-700 text-xs sm:text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {resendCooldown > 0
                    ? `Kirim Ulang Tautan (${resendCooldown} dtk)`
                    : 'Kirim Ulang Email Verifikasi'}
                </button>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full h-10 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Ganti Akun / Kembali ke Login
                </button>
              </div>
            </div>
          ) : currentUser ? (
            /* Step 2: Signed-in non-admin user -> Admin OTP Request & Verification */
            <div className="space-y-5 max-w-md mx-auto w-full">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">
                    Akun Terhubung
                  </div>
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {currentUser.displayName || currentUser.email}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{currentUser.email}</div>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 cursor-pointer shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Ganti Akun
                </button>
              </div>

              {errorMsg && (
                <div className="rounded-lg px-3.5 py-2.5 text-xs font-medium flex items-start gap-2 border bg-red-50 border-red-200 text-red-800">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {infoMsg && (
                <div className="rounded-lg px-3.5 py-2.5 text-xs font-medium flex items-start gap-2 border bg-emerald-50 border-emerald-200 text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{infoMsg}</span>
                </div>
              )}

              {isLoadingOtpStatus || (otpRequest?.status === 'verified' && otpRequest.hasPendingWrites) ? (
                <div className="py-10 flex flex-col items-center justify-center gap-2 text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin text-blue-700" />
                  <span className="text-xs sm:text-sm">
                    {otpRequest?.status === 'verified'
                      ? 'Menyinkronkan verifikasi OTP dengan server...'
                      : 'Memeriksa status permintaan OTP...'}
                  </span>
                </div>
              ) : otpRequest?.status === 'otp_issued' && !editingRequest ? (
                /* OTP Issued by Admin -> Enter 6-digit OTP */
                <form onSubmit={handleVerifyAdminOtp} className="space-y-4">
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-blue-800">
                      <KeyRound className="w-4 h-4 shrink-0" />
                      <span>Kode OTP Telah Diterbitkan Administrator</span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      Administrator <strong>{ADMIN_OTP_EMAIL}</strong> sudah menerbitkan kode OTP 6
                      digit untuk akun Anda. Masukkan kode yang dikirimkan oleh administrator.
                    </p>
                    {otpRequest.expiresAtMs && (
                      <p className="text-[11px] text-blue-800 font-medium tabular-nums">
                        Berlaku hingga: {formatExpiry(otpRequest.expiresAtMs)}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="admin-otp-input"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Masukkan Kode OTP (6 Digit)
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="admin-otp-input"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        required
                        autoFocus
                        placeholder="000000"
                        value={otpInput}
                        onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full h-12 pl-10 pr-4 rounded-lg border border-slate-300 bg-white text-center font-mono tabular-nums text-lg tracking-[0.45em] font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || otpInput.length !== 6}
                    className="w-full h-11 inline-flex items-center justify-center gap-2 px-4 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowRight className="w-4 h-4" />
                    )}
                    {isSubmitting ? 'Memverifikasi...' : 'Verifikasi OTP & Masuk'}
                  </button>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleRequestNewOtpFromIssued}
                      className="font-medium text-blue-700 hover:underline cursor-pointer"
                    >
                      Minta Ulang Kode OTP
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingRequest(true)}
                      className="font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Ubah Data Pemohon
                    </button>
                  </div>
                </form>
              ) : otpRequest?.status === 'pending' && !editingRequest ? (
                /* Waiting for Admin Approval */
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span>Menunggu Persetujuan &amp; Kode OTP dari Administrator</span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      Permintaan Anda sedang menunggu penerbitan kode OTP 6 digit oleh Administrator{' '}
                      <strong className="text-slate-900">{ADMIN_OTP_EMAIL}</strong>. Halaman ini
                      akan otomatis diperbarui segera setelah administrator menerbitkan OTP.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Nama Pemohon</span>
                      <span className="font-semibold text-slate-900 text-right">
                        {otpRequest.displayName}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">No. HP / WhatsApp</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums text-right">
                        {otpRequest.phone}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Catatan</span>
                      <span className="text-slate-800 text-right">{otpRequest.note || '-'}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setEditingRequest(true)}
                    className="w-full h-10 inline-flex items-center justify-center gap-2 px-4 border border-slate-300 bg-white text-slate-700 text-xs sm:text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Ubah Data &amp; Kirim Ulang Permintaan
                  </button>
                </div>
              ) : (
                /* Initial or Rejected / Edit Form -> Request OTP from Admin */
                <form onSubmit={handleSubmitOtpRequest} className="space-y-4">
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-slate-900">
                      Permintaan OTP ke Administrator
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      Lengkapi data di bawah untuk meminta kode OTP 6 digit dari Administrator{' '}
                      <strong className="text-slate-900">{ADMIN_OTP_EMAIL}</strong>.
                    </p>
                  </div>

                  {otpRequest?.status === 'rejected' && (
                    <div className="rounded-lg px-3.5 py-2.5 text-xs font-medium flex items-start gap-2 border bg-red-50 border-red-200 text-red-800">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        Permintaan OTP sebelumnya ditolak oleh administrator. Perbarui data Anda
                        lalu ajukan ulang permintaan.
                      </span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label
                      htmlFor="req-fullname"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Nama Lengkap
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="req-fullname"
                        type="text"
                        required
                        maxLength={100}
                        placeholder="Nama lengkap Anda"
                        value={reqName}
                        onChange={(e) => setReqName(e.target.value)}
                        className="w-full h-11 pl-10 pr-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="req-phone"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Nomor HP / WhatsApp (Untuk Menerima OTP)
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="req-phone"
                        type="tel"
                        required
                        maxLength={30}
                        placeholder="081234567890"
                        value={reqPhone}
                        onChange={(e) => setReqPhone(e.target.value)}
                        className="w-full h-11 pl-10 pr-3.5 rounded-lg border border-slate-300 bg-white text-sm font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="req-note"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Cabang / Divisi / Catatan (Opsional)
                    </label>
                    <input
                      id="req-note"
                      type="text"
                      maxLength={200}
                      placeholder="Contoh: Operasional Pengiriman Jakarta"
                      value={reqNote}
                      onChange={(e) => setReqNote(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 h-11 inline-flex items-center justify-center gap-2 px-4 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      {isSubmitting ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <KeyRound className="w-4 h-4" />
                      )}
                      {isSubmitting ? 'Mengirim...' : 'Kirim Permintaan OTP ke Admin'}
                    </button>
                    {editingRequest && (
                      <button
                        type="button"
                        onClick={() => setEditingRequest(false)}
                        className="h-11 px-4 border border-slate-300 bg-white text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 cursor-pointer"
                      >
                        Batal
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* Step 1: Login / Register Portal */
            <div className="space-y-5 max-w-md mx-auto w-full">
              {/* Top Mode Switcher: Masuk / Daftar */}
              <div className="flex items-center p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => handleModeSwitch('login')}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    authMode === 'login'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Masuk
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch('register')}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    authMode === 'register'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Daftar Akun
                </button>
              </div>

              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-900">
                  {authMode === 'login' ? 'Masuk ke Akun Anda' : 'Buat Akun Baru'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-500">
                  {authMode === 'login'
                    ? `Gunakan akun Google (instan) atau Email & Kata Sandi. Pengguna baru memerlukan OTP dari administrator (${ADMIN_OTP_EMAIL}).`
                    : `Daftar cepat dengan akun Google, lalu ajukan permintaan OTP ke administrator (${ADMIN_OTP_EMAIL}).`}
                </p>
              </div>

              {/* Primary Google Sign-In / Register Button */}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleGoogleSignIn}
                className="w-full h-11 inline-flex items-center justify-center gap-2.5 px-4 border border-slate-300 bg-white text-slate-900 text-sm font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer shadow-2xs"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                {authMode === 'login' ? 'Masuk dengan Google' : 'Daftar Cepat dengan Google'}
              </button>

              {/* Divider */}
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-slate-400">atau gunakan Email &amp; Sandi</span>
                </div>
              </div>

              {errorMsg && (
                <div className="rounded-lg px-3.5 py-2.5 text-xs font-medium space-y-2 border bg-red-50 border-red-200 text-red-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                  {emailPasswordDisabled && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleGoogleSignIn}
                      className="w-full h-9 inline-flex items-center justify-center gap-2 px-3 bg-slate-900 text-white text-xs font-semibold rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      {authMode === 'login' ? 'Masuk dengan Google Sekarang' : 'Daftar dengan Google Sekarang'}
                    </button>
                  )}
                </div>
              )}

              {infoMsg && (
                <div className="rounded-lg px-3.5 py-2.5 text-xs font-medium flex items-start gap-2 border bg-emerald-50 border-emerald-200 text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{infoMsg}</span>
                </div>
              )}

              {/* Email & Password Form */}
              <form onSubmit={handleEmailAuth} className="space-y-3.5">
                {authMode === 'register' && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="email-fullname"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Nama Lengkap
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="email-fullname"
                        type="text"
                        required
                        maxLength={100}
                        placeholder="Nama lengkap Anda"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full h-11 pl-10 pr-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-email"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Alamat Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="nama@perusahaan.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-11 pl-10 pr-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="auth-password"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Kata Sandi
                    </label>
                    {authMode === 'login' && (
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                      >
                        Lupa sandi?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                      placeholder="Minimal 6 karakter"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-11 pl-3.5 pr-10 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {authMode === 'register' && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="auth-confirm-password"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Konfirmasi Kata Sandi
                    </label>
                    <input
                      id="auth-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      placeholder="Ulangi kata sandi"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 inline-flex items-center justify-center gap-2 px-4 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  {isSubmitting
                    ? 'Memproses...'
                    : authMode === 'login'
                      ? 'Masuk dengan Email'
                      : 'Daftar dengan Email'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
