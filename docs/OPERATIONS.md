# Operations · İşletim

The new daily school-owned OAuth implementation and recovery procedure are in [BACKUP_AUTOMATION.md](BACKUP_AUTOMATION.md). Its configuration and real restore drill remain pending. The manual age procedure below is an alternative archive format, not the automated `.spenc` format.

## Ownership and costs

Name one school owner and a backup owner for Supabase, Netlify, GitHub, sender DNS and Resend. Store credentials in a shared school password manager, not Git. Review provider usage each week and before admitting a new cohort. Free plans can have quotas, pausing and email limits; this app does not purchase upgrades. Use the current provider dashboards as the source of truth rather than fixed price figures in documentation.

The five-minute notification schedule means up to 288 invocations per day. A paused site/project or exhausted quota interrupts email/deadline processing until service resumes. Review scheduled function duration/errors, outbox pending/failed items, oldest queued timestamp, overdue guidance count and SMTP failure logs. Supabase credentials and application secrets must be rotated after exposure.

Manual and automatically generated guidance cases share the same five steps: new, review, plan (shared with parents), follow-up, closed. Monitor overdue follow-ups separately from risk severity. The scheduler marks due work and raises risk alerts; it does not close unresolved cases or skip steps. Staff close a case when the follow-up shows improvement. Only management can explicitly close an unresolved case.

## Email queue

Attendance/assessment/referral actions create guidance records and enqueue urgent/escalation emails. The scheduled function calls `advance_guidance_deadlines`, claims at most five notifications and sends them concurrently with an eight-second provider timeout. A stable per-outbox ID is supplied as the Resend idempotency key. Database completion records success or exponential retry details; attempts stop after eight claims or a 23-hour retry window. Claims abandoned for five minutes can be reclaimed. Logs omit message bodies, tokens and recipient addresses.

Resend idempotency keys are time limited. Do not blindly reset old failed notifications: inspect provider delivery history first. A timeout can mean the provider accepted a message even when the app did not receive confirmation. After checking, create a deliberate new notification if another email is needed. [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys)

Netlify production schedules do not accept ordinary browser requests. For a one-off diagnostic, use the Netlify Functions “Run now” action; local Netlify Dev supports `netlify functions:invoke notifications`. Do not call scheduled delivery against live users simply to check a frontend build.

## Weekly encrypted backup

Use a private, encrypted staging directory **outside the repository**, a password-manager stored database connection, the Supabase CLI, `psql`, and [age](https://github.com/FiloSottile/age). Configure a dedicated age recipient; store its recovery identity separately. The recipient is public, but the private identity must remain in the password manager/offline recovery storage.

Pause school writes during the backup window so separately generated files agree. In the private staging directory, run these commands with `SCHOOL_DB_URL` already supplied securely in the process environment:

```powershell
npx supabase db dump --db-url $env:SCHOOL_DB_URL --role-only -f roles.sql
npx supabase db dump --db-url $env:SCHOOL_DB_URL -f schema.sql
npx supabase db dump --db-url $env:SCHOOL_DB_URL --data-only --use-copy -f data.sql
npx supabase db dump --db-url $env:SCHOOL_DB_URL --schema supabase_migrations -f history-schema.sql
npx supabase db dump --db-url $env:SCHOOL_DB_URL --schema supabase_migrations --data-only --use-copy -f history-data.sql
tar -cf school-portal-backup.tar roles.sql schema.sql data.sql history-schema.sql history-data.sql
age -r AGE_RECIPIENT -o school-portal-backup.tar.age school-portal-backup.tar
```

Stop if any command fails; check exit codes before proceeding. Give the encrypted archive a dated name, record its SHA-256 (`Get-FileHash`), database project reference, app commit and capture time, then copy it to the approved backup destination. Retain a school-agreed rotation (initial recommendation: eight weekly copies). Plaintext staging files contain children's information; after verifying encryption and restoring a sample, remove those exact files using the operating system's secure data-handling process. This guide does not run deletion for you.

Use Supabase's current [backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) for platform-managed schema details. Application data includes references to Auth IDs, so a public-schema-only export is insufficient. Verify `auth.users` and `auth.identities` are represented in the data backup. Export project configuration/SMTP redirect settings separately to the password manager. The new private learning-materials bucket stores attachments. The daily automation includes ready and archived object bytes; this manual database-only procedure requires separate object exports and checksum verification.

## Restoration drill

Create an **isolated fresh Supabase project**, disable scheduled notifications/email sending there, and keep it disconnected from the production frontend. Decrypt the archive into a private staging directory:

```powershell
age -d -i SCHOOL_RECOVERY_IDENTITY -o school-portal-backup.tar school-portal-backup.tar.age
tar -xf school-portal-backup.tar
psql --dbname $env:SCHOOL_RESTORE_DB_URL --single-transaction --set ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql
psql --dbname $env:SCHOOL_RESTORE_DB_URL --single-transaction --set ON_ERROR_STOP=1 --file history-schema.sql --file history-data.sql
```

The restore is for a fresh database, not an overwrite of a live project. Do not continue on SQL errors. Recreate the custom Auth user trigger from the committed schema migration if the managed-auth schema export did not include it. Restore Auth settings/SMTP/redirects using development addresses; never point a drill at real parent inboxes. Provider-generated keys and project URLs change and must be updated in the isolated app environment.

Compare counts for students, guardians, enrollments, attendance, assessments, reports, guidance, charges and payments to the recorded source counts. Confirm admin login, parent isolation, immutable published reports and matching-currency balances. Do not enable cron until stale outbox entries have been reviewed. Record the outcome and time needed to restore. A failed drill requires correction before relying on the backup.

## Updating and incident recovery

Apply additive database migrations before deploying compatible UI/functions. Keep the previous Netlify deploy available for rollback. Do not edit an already-applied migration or published form configuration; add a migration/configuration version. Back up before schema changes. A frontend rollback does not revert database migrations or sent emails.

If the site fails, check provider availability and limits, Supabase authentication logs, Netlify build/function logs, database migration state, allowed redirects, and whether environment variables were rebuilt into the frontend. Record changes in the owner's operations register. Avoid logging child records or service credentials while diagnosing.

## Türkçe işletim özeti

Okul; Supabase, Netlify, GitHub, DNS ve Resend için bir sorumlu ve yedek sorumlu belirler. Her hafta kullanım kotaları, bildirim kuyruğu ve gecikmiş rehberlik kayıtları kontrol edilir. Beş dakikalık zamanlayıcı günde en fazla 288 kez çalışır; ücretsiz planın durması işlemeyi etkiler.

Haftalık yedekler Git dışında özel alanda alınır, age ile şifrelenir ve kurtarma anahtarı ayrı saklanır. Veritabanı dışında Auth/SMTP/geri dönüş ayarları da parola yöneticisine kaydedilir. Yedek sırasında yazma işlemleri durdurulur. Her yedeğin tarih, proje, sürüm ve doğrulama bilgisi kaydedilir. Geri yükleme yalnız ayrı ve boş bir projede doğrulanır; bildirimler kapalı tutulur. Çocuk kayıtları veya anahtarlar günlük dosyalarına yazılmaz.
