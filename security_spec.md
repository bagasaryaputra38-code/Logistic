# Security Specification: Delivery Logistic & Admin OTP Access Gate

## 1. Data Invariants
1. Administrator OTP adalah `bagasaryaputra38@gmail.com` (case-insensitive via `.lower()`, wajib `email_verified == true`).
2. Pengguna non-admin hanya dapat membaca/menulis `/delivery_reports/{reportId}`, `/surat_jalan/{entryId}`, `/driver_logs/{entryId}`, dan `/ijin_menginap/{entryId}` jika memiliki dokumen `/otp_requests/{request.auth.uid}` dengan `status == 'verified'`. Semua akun terverifikasi (admin & pengguna yang lolos OTP) berbagi workspace data operasional yang sama secara real-time.
3. Kode OTP 6 digit disimpan terpisah di `/otp_secrets/{userId}` yang hanya dapat dibaca dan ditulis oleh administrator (`isAdmin()`). Pengguna biasa tidak memiliki izin baca maupun tulis ke `/otp_secrets/{userId}`.
4. Pengguna hanya dapat membuat dan memperbarui dokumen `/otp_requests/{userId}` miliknya sendiri (`request.auth.uid == userId`), dan transisi `otp_issued` -> `verified` hanya diizinkan oleh aturan Firestore apabila `submittedOtp` cocok persis dengan `/otp_secrets/{userId}.otpCode` dan `expiresAt > request.time`.
5. Saat administrator menerbitkan OTP (`status == 'otp_issued'`), aturan `existsAfter` dan `getAfter` memastikan `/otp_secrets/{userId}` ditulis secara atomik dalam batch yang sama.
6. Document IDs (`reportId`, `entryId`, `userId`) wajib cocok dengan `^[a-zA-Z0-9_\-]+$` (maks 128 karakter).
7. Semua field wajib dan opsional dikontrol ketat melalui `hasAll` + `hasOnly` saat `create` dan `affectedKeys().hasOnly(...)` saat `update`. `ownerId` dan `createdAt` bersifat immutable.
8. Query `list` pada `/otp_requests` tetap dibatasi per `ownerId == request.auth.uid || isAdmin()`, sementara `/delivery_reports`, `/surat_jalan`, `/driver_logs`, dan `/ijin_menginap` hanya terbuka untuk `isVerifiedUser()`.

## 2. Red Team Attack Payloads
1. **Unauthenticated Write**: Akses atau tulis dokumen tanpa `request.auth` -> `PERMISSION_DENIED`.
2. **Self-Approval Bypass**: Pengguna non-admin mencoba menulis `/otp_requests/{uid}` langsung dengan `status: 'verified'` -> `PERMISSION_DENIED`.
3. **Secret Snooping**: Pengguna non-admin mencoba membaca `/otp_secrets/{uid}` untuk melihat kode OTP sendiri -> `PERMISSION_DENIED`.
4. **Wrong / Expired OTP Submission**: Pengguna mengirim `submittedOtp` yang salah atau melewati `expiresAt` -> `PERMISSION_DENIED`.
5. **Unverified Admin Email Spoof**: Akun dengan email `bagasaryaputra38@gmail.com` tetapi `email_verified == false` mencoba membaca `/otp_secrets` atau menyetujui permintaan OTP -> `PERMISSION_DENIED`.
6. **Cross-Tenant Request Tampering**: User A mencoba membaca, mengubah, atau menghapus `/otp_requests/{userB}` -> `PERMISSION_DENIED`.
7. **Unverified Data Access**: Pengguna yang baru mendaftar (`otp_requests.status == 'pending'`) mencoba membaca/menulis/melakukan list `/delivery_reports` atau `/surat_jalan` -> `PERMISSION_DENIED`.
8. **Orphaned OTP Issue**: Admin mencoba mengubah status menjadi `otp_issued` tanpa menulis `/otp_secrets/{userId}` dalam batch yang sama -> `PERMISSION_DENIED`.
9. **Blanket List Query**: Pengguna non-admin melakukan `list` pada `/otp_requests` tanpa filter `ownerId == uid` -> `PERMISSION_DENIED`.
10. **Shadow Field / ID Poisoning / Client Timestamp Forgery**: Menyisipkan field tambahan, ID dengan slash/spasi, atau timestamp palsu -> `PERMISSION_DENIED`.
