export type MtdMode = 'auto' | 'manual';

export type SegmentKey = 'projectForming' | 'industri' | 'isbsRitel' | 'others';

export interface SegmentMeta {
  key: SegmentKey;
  label: string;
  shortLabel: string;
  waJktLabel: string;
  waTotalJktLabel: string;
  waSmgLabel: string;
  waTotalSmgLabel: string;
  waCombinedLabel: string;
}

export const SEGMENTS: SegmentMeta[] = [
  {
    key: 'projectForming',
    label: 'Project Forming',
    shortLabel: 'Project Forming',
    waJktLabel: 'Project forming(Jkt)',
    waTotalJktLabel: 'Total Project forming(Jkt)',
    waSmgLabel: 'Project forming(Smg)',
    waTotalSmgLabel: 'Total Project forming (Smg)',
    waCombinedLabel: 'Total Project forming Jkt&Smg',
  },
  {
    key: 'industri',
    label: 'Industri',
    shortLabel: 'Industri',
    waJktLabel: 'Industri (Jkt)',
    waTotalJktLabel: 'Total Industri (Jkt)',
    waSmgLabel: 'Industri (Smg)',
    waTotalSmgLabel: 'Total Industri (Smg)',
    waCombinedLabel: 'Total Industri Jkt&Smg',
  },
  {
    key: 'isbsRitel',
    label: 'ISBS Ritel',
    shortLabel: 'ISBS Ritel',
    waJktLabel: 'ISBS Ritel (Jkt )',
    waTotalJktLabel: 'Total ISBS Ritel (Jkt)',
    waSmgLabel: 'ISBS (Smg)',
    waTotalSmgLabel: 'Total ISBS (Smg)',
    waCombinedLabel: 'Total Delv ISBS Jkt&Smg',
  },
  {
    key: 'others',
    label: 'Others',
    shortLabel: 'Others',
    waJktLabel: 'Others (Jkt )',
    waTotalJktLabel: 'Total Others (Jkt)',
    waSmgLabel: 'Others (Smg)',
    waTotalSmgLabel: 'Total Others (Smg)',
    waCombinedLabel: 'Total Delv Others Jkt&Smg',
  },
];

export interface DeliveryReportPayload {
  ownerId: string;
  date: string;
  monthKey: string;
  dailyJktTotal: number;
  dailySmgTotal: number;
  jktProjectForming: number;
  jktIndustri: number;
  jktIsbsRitel: number;
  jktOthers: number;
  smgProjectForming: number;
  smgIndustri: number;
  smgIsbsRitel: number;
  smgOthers: number;
  mtdMode: MtdMode;
  mtdJktProjectForming: number;
  mtdJktIndustri: number;
  mtdJktIsbsRitel: number;
  mtdJktOthers: number;
  mtdSmgProjectForming: number;
  mtdSmgIndustri: number;
  mtdSmgIsbsRitel: number;
  mtdSmgOthers: number;
  mtdJktTotal: number;
  mtdSmgTotal: number;
  mtdCombinedTotal: number;
  notes: string;
}

export interface DeliveryReport extends DeliveryReportPayload {
  id: string;
  createdAtMs?: number;
  updatedAtMs?: number;
  isSample?: boolean;
}

export interface DeliveryFormState {
  date: string;
  dailyJktTotal: number;
  dailySmgTotal: number;
  jktProjectForming: number;
  jktIndustri: number;
  jktIsbsRitel: number;
  jktOthers: number;
  smgProjectForming: number;
  smgIndustri: number;
  smgIsbsRitel: number;
  smgOthers: number;
  mtdMode: MtdMode;
  mtdJktProjectForming: number;
  mtdJktIndustri: number;
  mtdJktIsbsRitel: number;
  mtdJktOthers: number;
  mtdSmgProjectForming: number;
  mtdSmgIndustri: number;
  mtdSmgIsbsRitel: number;
  mtdSmgOthers: number;
  mtdJktTotal: number;
  mtdSmgTotal: number;
  mtdCombinedTotal: number;
  notes: string;
}

export const SURAT_JALAN_VENDORS = [
  'Nur Jaya',
  'Saudara Makmur',
  'Adil Jaya',
  'Satya Ragam (SR)',
  'Peta Patria',
  'Sejahtera Pelita Mitra (SPM)',
  'Trikusuma Jaya Perkasa (TJP)',
  'Lainnya',
] as const;

export type SuratJalanVendor = (typeof SURAT_JALAN_VENDORS)[number];

export const SURAT_JALAN_DOKUMEN_OPTIONS = ['TERKIRIM', 'PROSES', 'BELUM KEMBALI'] as const;

export interface SuratJalanPayload {
  ownerId: string;
  no: number;
  tanggal: string;
  noDO: string;
  vendor: SuratJalanVendor;
  customVendor: string;
  dokumen: string;
}

export interface SuratJalanEntry extends SuratJalanPayload {
  id: string;
  createdAtMs?: number;
  updatedAtMs?: number;
  isLocal?: boolean;
}

export interface SuratJalanFormState {
  tanggal: string;
  noDO: string;
  vendor: SuratJalanVendor | '';
  customVendor: string;
  dokumen: string;
}

export const ADMIN_OTP_EMAIL = 'bagasaryaputra38@gmail.com';

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === ADMIN_OTP_EMAIL);
}

export type OtpRequestStatus = 'pending' | 'otp_issued' | 'verified' | 'rejected';

export interface OtpRequestRecord {
  id: string;
  ownerId: string;
  email: string;
  displayName: string;
  phone: string;
  note: string;
  status: OtpRequestStatus;
  submittedOtp: string;
  approvedBy: string;
  expiresAtMs?: number | null;
  createdAtMs?: number;
  updatedAtMs?: number;
  hasPendingWrites?: boolean;
}

export interface OtpSecretRecord {
  id: string;
  ownerId: string;
  otpCode: string;
  issuedBy: string;
  expiresAtMs: number;
  updatedAtMs?: number;
}

export interface OtpRequestFormState {
  displayName: string;
  phone: string;
  note: string;
}

export const DRIVER_VEHICLE_TYPES = [
  'CDD',
  'CDD Long',
  'CDE',
  'Fuso',
  'Tronton',
  'Wingbox',
  'Trailer',
  'Pickup',
  'Blind Van',
  'Container 20ft',
  'Container 40ft',
] as const;

export interface DriverLogPayload {
  ownerId: string;
  no: number;
  tanggal: string;
  jamMasuk: string;
  jamKeluar: string;
  noMobil: string;
  supir: string;
  jenisKendaraan: string;
  transporter: string;
  keterangan: string;
}

export interface DriverLogEntry extends DriverLogPayload {
  id: string;
  createdAtMs?: number;
  updatedAtMs?: number;
  isLocal?: boolean;
}

export interface DriverLogFormState {
  tanggal: string;
  jamMasuk: string;
  jamKeluar: string;
  noMobil: string;
  supir: string;
  jenisKendaraan: string;
  transporter: string;
  keterangan: string;
}

export const VALIDATION_LIMITS = {
  MAX_DAILY_TON: 1000000,
  MAX_MTD_TON: 40000000,
  MAX_NOTES_LENGTH: 500,
  MAX_DO_LENGTH: 100,
  MAX_VENDOR_LENGTH: 100,
  MAX_DOKUMEN_LENGTH: 50,
  MAX_ID_LENGTH: 128,
  MAX_EMAIL_LENGTH: 160,
  MAX_DISPLAY_NAME_LENGTH: 100,
  MAX_PHONE_LENGTH: 30,
  MAX_OTP_NOTE_LENGTH: 200,
  MAX_DRIVER_NO: 100000,
  MAX_SURAT_JALAN_NO: 100000,
  MAX_NO_MOBIL_LENGTH: 30,
  MAX_SUPIR_LENGTH: 100,
  MAX_JENIS_KENDARAAN_LENGTH: 100,
  MAX_TRANSPORTER_LENGTH: 100,
  MAX_KETERANGAN_LENGTH: 300,
  OTP_CODE_LENGTH: 6,
  OTP_CODE_REGEX: /^[0-9]{6}$/,
  TIME_REGEX: /^([01]\d|2[0-3]):[0-5]\d$/,
  ID_REGEX: /^[a-zA-Z0-9_-]+$/,
  DATE_REGEX: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  MONTH_REGEX: /^\d{4}-(0[1-9]|1[0-2])$/,
} as const;
