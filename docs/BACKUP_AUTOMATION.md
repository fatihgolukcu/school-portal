# Daily school backup: OAuth setup and recovery

Implemented 10 October 2026; not connected to a school Google account or enabled on a hosted runner. The user selected a school-owned Google account with OAuth. Name a primary operator and a second recovery operator before activation. Keep credentials and recovery keys in school-controlled secret storage, outside Git and frontend variables.

The runner exports PostgreSQL public/Auth/Storage schemas as a custom archive, downloads ready and archived learning-material object bytes, writes SHA-256 manifests, compresses and encrypts with AES-256-GCM, authenticates a local decrypt roundtrip, then uploads using the Google account's refresh token. Remote size/MD5 verification confirms uploaded bytes; the admin home shows last verified upload. This does **not** prove a successful restore. Database backups alone exclude Storage bytes. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).

## Connect the school account

1. In a school-owned Google Cloud project enable Drive API and create an OAuth client for an operator-controlled authorization flow. Request `https://www.googleapis.com/auth/drive.file` and offline access. Use Google's supported authorization-code flow or OAuth Playground with **your own client credentials** and its registered redirect URI; obtain the refresh token privately. The scheduled runner refreshes tokens and does not run browser consent. [Google authorization flow](https://developers.google.com/identity/protocols/oauth2/web-server).
2. Create a dedicated folder through the same OAuth app, or select an existing folder through Google Picker so `drive.file` permits this app to access it. Merely copying the ID of an arbitrary My Drive folder does not grant this scope access. Set its ID as `BACKUP_DRIVE_FOLDER_ID`. Keep the folder school-owned and privately shared with the backup operator. [Drive scope rules](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
3. Complete the consent configuration appropriate to the school. External apps in Testing can receive refresh tokens expiring after seven days for these scopes; do not rely on such a token for ongoing automation. Tokens can also be revoked; operators must handle failed refreshes. [Google token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).
4. Generate a random 32-byte encryption key, store its base64 value as `BACKUP_ENCRYPTION_KEY`, and keep a separately accessible recovery copy. Record key rotations with archive dates; older backups require their original key. Do not print keys in CI or commit them.

## Configure the runner

Apply `202610100002_materials_operations.sql` first. The `.github/workflows/backup.yml` job uses Node 22, Docker's PostgreSQL 17 client and `tar`; set a client image matching or newer than the hosted PostgreSQL major. Use a direct connection or session pooler suitable for pg_dump, not the transaction pooler. Verify connectivity from the runner.

In GitHub's `school-backup` environment configure these secrets:

| Secret | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server-only object access and backup status writes |
| `BACKUP_DATABASE_URL` | PostgreSQL connection including credentials and required SSL settings |
| `BACKUP_ENCRYPTION_KEY` | Base64 32-byte key; never a `VITE_*` variable |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | School account's OAuth credentials |
| `BACKUP_DRIVE_FOLDER_ID` | App-authorized dedicated destination folder |
| `BACKUP_ALERT_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM` | Technical-owner failure email, verified sender |

Set the repository variable `SCHOOL_BACKUP_ENABLED=true` only after configuration, then dispatch a manual run. Scheduled execution is 02:15 UTC daily. Without the variable the job skips, including manual dispatch. Enable GitHub failed-workflow notifications for both operators; missing alert-email settings disable the optional Resend alert. A skipped or never-started job cannot send its own alert: review the admin stale-upload notice and runner schedule daily. Failure after upload (for example retention) marks the run failed; the Drive artifact may still be valid and needs operator review.

Initial retention keeps the newest copy for 14 distinct UTC days plus eight distinct UTC weeks, overlapping copies counted once. After a new verified upload, other artifacts bearing this app's marker and project scope in this specific folder are moved to Trash. The script never permanently deletes files. Trash still affects storage use; agree its handling and recovery targets with the school. Free capacity and runner allowances must be checked for the actual school accounts.

## Isolated restoration drill

Do not overwrite the live school database. Disable outbound notifications and cron in the isolated recovery environment and use synthetic/test inboxes. Preserve the encrypted original and record archive SHA-256, project, date and key identifier.

1. Supply the archive's encryption key securely in the process environment. Decrypt to a new private destination:

   ```sh
   node scripts/decrypt-backup.mjs school.tar.gz.spenc recovery.tar.gz
   ```

   The utility authenticates before exposing the archive and refuses existing output. Extract into a dedicated private staging directory. Verify `database.dump` and each manifest object against the recorded SHA-256 and size.
2. Inspect the custom archive with `pg_restore --list database.dump`. Raw dumps contain managed Auth/Storage objects. Build and review a restore list for the isolated Supabase version; do not blindly restore all managed definitions into an initialized hosted project. Use Supabase's [supported migration procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) to prepare managed schemas and reconcile permissions. Stop on unexplained errors. The script's archive is a recovery input, not a one-command hosted restore. This exact hosted restore remains to be rehearsed.
3. Restore application schema/data and necessary Auth records into that isolated target with the matching PostgreSQL toolchain. Reconcile app grants, functions, policies and triggers with the committed migrations; this dump omits ownership/ACLs and excludes migration-history schema and cluster roles. Preserve deployed app commit/migration history separately in the operator register. Restore project Auth/SMTP/redirect settings and any extension/configuration secrets from the password manager; provider keys and URLs change.
4. Recreate private buckets/policies. Restore each manifest object's bytes through the Storage API under its original object key, preserving its declared MIME type. Reconcile restored object metadata with the actual uploaded bytes; database metadata alone is insufficient. Incomplete uploads are excluded and should remain unavailable. Because objects are immutable, file export may contain versions created after the database snapshot: verify every ready/archived material referenced by the restored DB exists with matching bytes, and report harmless extra files separately.
5. Compare student/guardian/enrollment, attendance, assessment, report-version, guidance, payment and audit counts. Check administrator and parent login, unrelated-family denial, mixed-role family isolation, private material downloads, grading/history and EUR/PLN balances. Review stale notification-outbox entries before enabling schedules. Record operator, elapsed recovery time, failures and corrections. A second operator must reproduce the procedure before calling recovery accepted.

The legacy manual age procedure in OPERATIONS.md uses a different encryption format. `.spenc` archives require the included decrypt utility and their AES key. Temporary plaintext contains school records: use an encrypted operator disk and clean up only the explicitly created staging directory after acceptance.

## İşletim özeti

Okula ait Google hesabında OAuth çevrimdışı erişimi ve uygulamaya izin verilen özel klasör kurulur. Anahtarlar Git dışında saklanır; iki işletim sorumlusu belirlenir. İş yalnız yapılandırma sonrası etkinleştirilir. Günlük yedek veritabanı ve materyal dosyalarını şifreler, yükleme özetini doğrular. Yönetici ekranındaki doğrulanmış yükleme, geri yüklemenin başarılı olduğu anlamına gelmez. Bildirimler kapalı ayrı projede hesap, izin, geçmiş, bakiye ve dosya doğrulaması yapılmadan yedeğe güvenilmez.
