import React, { useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  KeyRound,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  ADMIN_OTP_EMAIL,
  OtpRequestRecord,
  OtpRequestStatus,
  OtpSecretRecord,
} from '../types/delivery';

interface AdminOtpViewProps {
  adminEmail: string;
  requests: OtpRequestRecord[];
  secretsByUid: Record<string, OtpSecretRecord>;
  isLoading: boolean;
  onIssueOtp: (targetUserId: string) => Promise<{ otpCode: string; expiresAtMs: number }>;
  onReject: (targetUserId: string) => Promise<void>;
  onRevoke: (targetUserId: string) => Promise<void>;
  onDelete: (targetUserId: string) => Promise<void>;
  onNotify: (msg: string) => void;
}

type StatusFilter = 'all' | OtpRequestStatus;

const STATUS_META: Record<
  OtpRequestStatus,
  { label: string; textClass: string; dotClass: string }
> = {
  pending: {
    label: 'Menunggu OTP',
    textClass: 'text-amber-700',
    dotClass: 'bg-amber-500',
  },
  otp_issued: {
    label: 'OTP Diterbitkan',
    textClass: 'text-blue-700',
    dotClass: 'bg-blue-600',
  },
  verified: {
    label: 'Terverifikasi',
    textClass: 'text-emerald-700',
    dotClass: 'bg-emerald-600',
  },
  rejected: {
    label: 'Ditolak',
    textClass: 'text-red-700',
    dotClass: 'bg-red-500',
  },
};

function formatDateTimeId(ms?: number | null): string {
  if (!ms) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

export const AdminOtpView: React.FC<AdminOtpViewProps> = ({
  adminEmail,
  requests,
  secretsByUid,
  isLoading,
  onIssueOtp,
  onReject,
  onRevoke,
  onDelete,
  onNotify,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const counts = useMemo(() => {
    const summary = {
      all: requests.length,
      pending: 0,
      otp_issued: 0,
      verified: 0,
      rejected: 0,
    };
    requests.forEach((req) => {
      summary[req.status] += 1;
    });
    return summary;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return requests.filter((req) => {
      if (statusFilter !== 'all' && req.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        req.displayName.toLowerCase().includes(q) ||
        req.email.toLowerCase().includes(q) ||
        req.phone.toLowerCase().includes(q) ||
        req.note.toLowerCase().includes(q)
      );
    });
  }, [requests, searchTerm, statusFilter]);

  const copyText = async (text: string, key: string, toastText: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      onNotify(toastText);
      setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr));
      }, 2000);
    } catch {
      onNotify('Gagal menyalin ke clipboard.');
    }
  };

  const handleIssue = async (req: OtpRequestRecord) => {
    setBusyUid(req.ownerId);
    setConfirmDeleteUid(null);
    try {
      const { otpCode } = await onIssueOtp(req.ownerId);
      onNotify(`OTP ${otpCode} diterbitkan untuk ${req.displayName}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menerbitkan OTP.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleReject = async (req: OtpRequestRecord) => {
    setBusyUid(req.ownerId);
    setConfirmDeleteUid(null);
    try {
      await onReject(req.ownerId);
      onNotify(`Permintaan OTP ${req.displayName} ditolak.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menolak permintaan.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleRevoke = async (req: OtpRequestRecord) => {
    setBusyUid(req.ownerId);
    setConfirmDeleteUid(null);
    try {
      await onRevoke(req.ownerId);
      onNotify(`Akses ${req.displayName} direset. Pengguna harus meminta OTP ulang.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mereset akses pengguna.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleDelete = async (req: OtpRequestRecord) => {
    setBusyUid(req.ownerId);
    try {
      await onDelete(req.ownerId);
      setConfirmDeleteUid(null);
      onNotify(`Data permintaan ${req.displayName} dihapus.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menghapus data permintaan.');
    } finally {
      setBusyUid(null);
    }
  };

  const filterTabs: Array<{ id: StatusFilter; label: string; count: number }> = [
    { id: 'all', label: 'Semua', count: counts.all },
    { id: 'pending', label: 'Menunggu', count: counts.pending },
    { id: 'otp_issued', label: 'OTP Terbit', count: counts.otp_issued },
    { id: 'verified', label: 'Terverifikasi', count: counts.verified },
    { id: 'rejected', label: 'Ditolak', count: counts.rejected },
  ];

  return (
    <div className="space-y-5">
      {/* Administrator Overview Card */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-blue-700 text-xs font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Administrator Permintaan OTP</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              Pusat Persetujuan &amp; Penerbitan Kode OTP
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Akun administrator aktif:{' '}
              <strong className="text-slate-900">{adminEmail || ADMIN_OTP_EMAIL}</strong>. Terbitkan
              kode OTP 6 digit lalu kirimkan kepada pengguna agar dapat masuk ke website Delivery
              Logistic.
            </p>
          </div>
        </div>

        {/* Summary Counters */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-5">
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs font-medium text-slate-500">Menunggu Persetujuan</div>
            <div className="mt-1 text-2xl font-bold text-amber-700 tabular-nums">
              {counts.pending}
            </div>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs font-medium text-slate-500">OTP Diterbitkan</div>
            <div className="mt-1 text-2xl font-bold text-blue-700 tabular-nums">
              {counts.otp_issued}
            </div>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs font-medium text-slate-500">Pengguna Terverifikasi</div>
            <div className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
              {counts.verified}
            </div>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-xs font-medium text-slate-500">Permintaan Ditolak</div>
            <div className="mt-1 text-2xl font-bold text-slate-700 tabular-nums">
              {counts.rejected}
            </div>
          </div>
        </div>
      </section>

      {/* Filter & Search Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {filterTabs.map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              );
            })}
          </div>

          <div className="relative w-full md:w-72 shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama, email, atau no HP..."
              className="w-full h-9 pl-9 pr-3 text-xs sm:text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Requests List */}
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-700" />
            <span className="text-sm">Memuat daftar permintaan OTP...</span>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="py-12 text-center space-y-1.5 border border-dashed border-slate-200 rounded-xl">
            <KeyRound className="w-7 h-7 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">
              Belum ada permintaan OTP yang sesuai
            </p>
            <p className="text-xs text-slate-500">
              Permintaan OTP dari pengguna yang baru mendaftar atau masuk akan muncul otomatis di
              sini.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
            {filteredRequests.map((req) => {
              const statusMeta = STATUS_META[req.status];
              const secret = secretsByUid[req.ownerId];
              const isBusy = busyUid === req.ownerId;
              const isExpired =
                req.status === 'otp_issued' &&
                Boolean(secret?.expiresAtMs && secret.expiresAtMs < Date.now());
              const waMessage = secret
                ? `Halo ${req.displayName},\n\nBerikut kode OTP Anda untuk masuk ke website Delivery Logistic:\n*${secret.otpCode}*\n\nBerlaku hingga ${formatDateTimeId(secret.expiresAtMs)}.\nJangan bagikan kode ini kepada siapa pun.`
                : '';

              return (
                <div
                  key={req.ownerId}
                  className="p-4 sm:p-5 bg-white hover:bg-slate-50/70 transition-colors flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                >
                  {/* Left: User Info */}
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm sm:text-base font-semibold text-slate-900">
                        {req.displayName}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusMeta.textClass}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${statusMeta.dotClass}`} />
                        {statusMeta.label}
                      </span>
                      {isExpired && (
                        <span className="text-xs font-semibold text-red-600">
                          (OTP Kedaluwarsa — Terbitkan Ulang)
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600">
                      <div className="truncate">
                        <span className="text-slate-400">Email:</span>{' '}
                        <span className="font-medium text-slate-800">{req.email}</span>
                      </div>
                      <div className="tabular-nums">
                        <span className="text-slate-400">No. HP / WA:</span>{' '}
                        <span className="font-mono font-medium text-slate-800">{req.phone}</span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-slate-400">Catatan:</span>{' '}
                        <span className="text-slate-700">{req.note || '-'}</span>
                      </div>
                      <div className="sm:col-span-2 flex items-center gap-1.5 text-[11px] text-slate-400 tabular-nums">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>Diperbarui: {formatDateTimeId(req.updatedAtMs)}</span>
                      </div>
                    </div>

                    {/* Issued OTP Secret Panel (Visible only to Admin) */}
                    {req.status === 'otp_issued' && secret && (
                      <div className="mt-2 p-3 rounded-lg bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="text-[11px] font-semibold text-blue-800 uppercase tracking-wide">
                            Kode OTP 6 Digit (Kirim ke Pengguna)
                          </div>
                          <div className="flex items-baseline gap-3">
                            <span className="font-mono tabular-nums text-xl font-bold tracking-[0.3em] text-slate-900">
                              {secret.otpCode}
                            </span>
                            <span className="text-[11px] text-slate-600 tabular-nums">
                              Berlaku s/d {formatDateTimeId(secret.expiresAtMs)}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              copyText(
                                secret.otpCode,
                                `code_${req.ownerId}`,
                                `Kode OTP ${secret.otpCode} disalin.`
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 text-blue-800 text-xs font-medium rounded-lg hover:bg-blue-100/60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                          >
                            {copiedKey === `code_${req.ownerId}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            Salin Kode
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              copyText(
                                waMessage,
                                `wa_${req.ownerId}`,
                                `Pesan WhatsApp OTP untuk ${req.displayName} disalin.`
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white text-xs font-medium rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                          >
                            {copiedKey === `wa_${req.ownerId}` ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <MessageSquare className="w-3.5 h-3.5" />
                            )}
                            Salin Pesan WA
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: Admin Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {req.status !== 'verified' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleIssue(req)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {isBusy ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <KeyRound className="w-3.5 h-3.5" />
                        )}
                        {req.status === 'otp_issued' ? 'Buat OTP Baru' : 'Terbitkan OTP'}
                      </button>
                    )}

                    {req.status === 'verified' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleRevoke(req)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold rounded-lg hover:bg-amber-100 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset / Minta OTP Ulang
                      </button>
                    )}

                    {(req.status === 'pending' || req.status === 'otp_issued') && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleReject(req)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 bg-white text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <XCircle className="w-3.5 h-3.5 text-red-600" />
                        Tolak
                      </button>
                    )}

                    {confirmDeleteUid === req.ownerId ? (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDelete(req)}
                          className="px-2.5 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Yakin Hapus
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmDeleteUid(null)}
                          className="px-2.5 py-2 border border-slate-200 bg-white text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setConfirmDeleteUid(req.ownerId)}
                        aria-label={`Hapus permintaan ${req.displayName}`}
                        className="p-2 border border-slate-200 bg-white text-slate-500 hover:text-red-600 hover:border-red-200 rounded-lg transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
