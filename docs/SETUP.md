# Setup · Kurulum

## 1. Local prerequisites

Install Node.js 22, Git, Docker Desktop, and the Supabase CLI. Start Docker before Supabase. Run commands from the repository root. The Supabase CLI can be invoked with `npx supabase`; see the [official local development guide](https://supabase.com/docs/guides/local-development/cli/getting-started).

```sh
npm ci
npx supabase start
```

Copy `.env.example` to `.env`. From `supabase status`, populate the two browser values and two server Supabase values. Keep keys in the untracked `.env` file. `SUPABASE_URL` and `VITE_SUPABASE_URL` refer to the same project. Start `npm run dev` for UI development or `npx netlify-cli dev` for UI plus invitations. The local email inbox is available at the address printed by Supabase; this does not send messages to real parents.

Docker alternative for the UI: `docker compose up --build`. Supabase continues to run in the containers started by its host CLI. Browser requests use `127.0.0.1:54321` on the host, so leave the browser URL unchanged. The Compose service intentionally contains no service-role key. Use host Netlify Dev for function development. Bind mounts refresh `src/` and `public/`; rebuild when dependencies change. `docker compose down` stops the frontend without deleting the Supabase database; `npx supabase stop` stops the database stack.

Only for a disposable local database, `npx supabase db reset` reapplies all migrations and seed data and **deletes its current data**. Do not use reset for a live database.

## 2. Create the live Supabase project

Create a school-owned Supabase project in a suitable region and save the database password in the school's password manager. Apply the committed migrations in filename order through the CLI:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Reference data, including all 49 criteria, is applied by migration `202610030005_reference_data.sql`; `seed.sql` is intentionally a no-op, so `--include-seed` is not required. Apply every committed migration, including the student-number and guidance-request migration. Confirm the initial subjects, packages, Specialist level codes and published assessment configuration before creating students. The academic year is 2026–2027. An administrator must enter four reporting-period date ranges, package prices, class schedules and the school's timezone before use.

Disable public email signup in Authentication settings. Keep email/password login enabled. In the local configuration, `[auth].enable_signup = false` blocks public registration while `[auth.email].enable_signup = true` keeps the email provider enabled for sign-in, invitations and recovery. Do not disable that provider when disabling public registration. All regular accounts are invited. Never grant roles based on editable user metadata.

## 3. Email sender and authentication

Verify a school-controlled sending domain in Resend, including the DNS records that Resend requests. Use a sender such as `School Portal <school@verified-school-domain>`. Netlify's free subdomain cannot serve as a school-owned sender domain. Configure Supabase custom SMTP with the Resend SMTP credentials from the provider dashboard; set sender name/address consistently. The function `RESEND_API_KEY` is used for guidance notifications, while Supabase SMTP sends invitation/password recovery emails. See [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

Set Supabase Authentication Site URL to the final Netlify site origin. Add that origin and `https://YOUR_SITE.netlify.app/?invite=1` to the allowed redirect URLs. Add localhost origins only in a separate development project. In invitation and recovery templates, use the supplied `{{ .ConfirmationURL }}` link rather than building token URLs manually. The invitation function supplies `language` and `full_name` metadata. A bilingual template can branch on `{{ if eq .Data.language "tr" }}` and must also handle missing language by showing English.

Paste `docs/email-templates/invite.html` into Supabase's Invite user template and `docs/email-templates/recovery.html` into Reset password. Use the bilingual subjects “School Portal invitation / School Portal daveti” and “Reset your password / Parolanızı yenileyin”. The templates choose their body language from the account's invitation metadata and fall back to English. Disable link tracking on authentication emails so the provider does not rewrite the confirmation link. [Email template reference](https://supabase.com/docs/guides/auth/auth-email-templates)

## 4. First administrator

In the Supabase Authentication dashboard, create the school's first account with a temporary strong password or invite it after SMTP is ready. Copy that user's UUID. The database auth trigger creates a profile with no roles. Run the following once in the trusted SQL Editor, replacing only the UUID and name:

```sql
update public.profiles
set roles = array['administrator'], full_name = 'School Administrator', active = true
where id = 'REPLACE_WITH_AUTH_USER_UUID'::uuid;
```

Verify exactly one intended row was updated. Sign in, change the temporary password, and invite further staff/parents through Administration. An invitation to an existing account reuses that account and merges new roles/student links; it does not delete existing child links. Active administrators alone may invite accounts. A user may hold multiple staff roles.

## 5. GitHub and Netlify

Create a **private** repository under the school owner's GitHub account. Review `.gitignore`; `.env`, caches, provider keys and student exports must not be committed. If the directory is not already a repository:

```sh
git init -b main
git add .
git commit -m "Build bilingual School Portal portal"
git remote add origin https://github.com/YOUR_ORG/school-portal-portal.git
git push -u origin main
```

Import that repository in Netlify. Use `npm run build`, publish directory `dist`, and the committed `netlify.toml`. Select an available site name for the free HTTPS address. Configure variables by scope:

| Variable | Scope | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | Build | Public project API URL |
| `VITE_SUPABASE_ANON_KEY` | Build | Anon/publishable key only |
| `SUPABASE_URL` | Functions | Same project API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Functions | Server service-role key |
| `RESEND_API_KEY` | Functions | Restricted email-sending API key |
| `EMAIL_FROM` | Functions | Verified sender address |
| `URL` | Netlify automatic | Canonical deployed origin; `.env` overrides only for local development |

Do not expose live service secrets to untrusted preview deployments. Use a separate development Supabase project for previews. After configuration changes, redeploy. In Netlify's Functions page, confirm `notifications` is scheduled every five minutes. Production schedules are UTC and run only on published deploys; local development and previews require manual invocation. [Scheduled functions reference](https://docs.netlify.com/build/functions/scheduled-functions/)

## 5a. Import the real roster (optional)

The school's teacher matrix and student list are personal data, so they are never committed.
Save them as tab-separated text in the git-ignored `private/` folder:

- `private/teachers.tsv` with columns `Ders`, `Tr`, `İng`.
- `private/students.tsv` with the registration sheet's columns, from `Öğrenci` to `Veli`.

Apply all migrations first, then check the plan and import:

```sh
node scripts/import-roster.mjs --dry-run
node scripts/import-roster.mjs
```

The script needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`. It creates teacher
username accounts (for example `havva`) without a password, one class per subject, language
and level, and one Specialist class per teacher and language. It then enrols each student. Ages
become an estimated birth date of 1 January. "Yeni Kayıt" maps to the 2026–2027 term and
"Eski Kayıt" to 2025–2026. Re-running skips records that already exist. Replace the placeholder
Give each teacher a password with the query in section 5c, or replace the hidden address with a
real email under Our team and invite them.

**Türkçe:** Gerçek öğrenci ve öğretmen listeleri kişisel veridir ve depoya eklenmez. Dosyaları
`private/` klasörüne sekmeyle ayrılmış metin olarak kaydedin, önce `--dry-run` ile kontrol edin,
sonra içe aktarın.

## 5b. Student registration and family access

For individual registrations, save the student on **Students** to open their detail. Add an existing parent or send an administrator-only invitation from **Family**; enroll the student in a class group from **Learning**. Repeated membership requests reuse existing records. Older family setup links open the same student's Family tab.

**Türkçe:** Öğrenciler bölümünde kaydı tamamlayınca öğrenci detayı açılır. **Aile** sekmesinden veli ekleyin veya yönetici olarak davet gönderin; **Eğitim** sekmesinden sınıfa kaydedin. Bu işlemler tekrarlandığında çift kayıt oluşmaz. Eski aile kurulumu bağlantıları aynı öğrencinin Aile sekmesini açar.

### Bulk import from Excel

On **Students**, administrators and academic managers click **Bulk import**:

1. **Download template** creates an Excel file with dropdowns for class level, package,
   teachers and registration type, and a help sheet in the chosen language.
2. Fill one student per row. Enter a birth date as DD.MM.YYYY, or only the age; an age is saved
   as 01.01 of the birth year. Give a parent name or phone. The grey example row is ignored.
3. Upload the file (.xlsx or .csv). The preview marks each row *Ready*, *Check* (imported with
   a note, such as a missing class) or *Skip* (an error or an existing student).
4. **Import** registers the students and places them in classes: everyone joins their Specialist
   teacher's Specialist class in their course language, and full-package students join the subject
   classes for their language and level. Create those classes first.
5. **Download rows to fix** returns skipped or failed rows with the reason, ready to correct and
   upload again.

Old `.xls` files are not supported; save as Excel Workbook (.xlsx).

## 5c. Username accounts

People can sign in with a username instead of an email. In **Our team → Invite**, choose
**Username & password**, enter a username (3–32 letters, numbers, dots, dashes, underscores)
and a password of at least 10 characters. No email is sent and the account works immediately.
Internally the account uses the hidden address `<username>@users.schoolportal.invalid`.

Username accounts cannot use "Forgot your password?". An administrator opens the person in
**Our team**, expands **Account and password** and uses **Set a new password** (email accounts
can also get **Email a reset link**). This requires migration `202611110001_user_admin.sql` and
the `manage-user` Netlify function. Signed-in users change their own password from the account
menu (**Change my password**).

Last resort only, if the portal itself is unavailable, reset it in the Supabase SQL Editor:

```sql
update auth.users
set encrypted_password = extensions.crypt('NewPassword123', extensions.gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now())
where email = 'username@users.schoolportal.invalid';
```

**Türkçe:** Öğrenciler sayfasındaki **Toplu yükle** ile Excel şablonunu indirip doldurun ve
yükleyin; önizlemeyi kontrol edip aktarın. Personel e-posta yerine kullanıcı adıyla da giriş
yapabilir; hesabı **Ekibimiz → Davet et → Kullanıcı adı ve şifre** ile oluşturun. Kullanıcı adı
hesaplarının şifresini yönetici **Ekibimiz → kişi → Hesap ve şifre → Yeni şifre belirle** ile
yeniler; SQL yalnız portal açılamıyorsa son çaredir. Ayrıntılar:
[kılavuz · Ekip ve kullanıcılar](kilavuz/03-ekip-ve-kullanicilar.md).

## 6. Launch checks and owner handover

Before deploying the 10 October usability UI, apply `202610100001_teacher_workspace.sql`, `202610100002_materials_operations.sql` and `202610100003_family_enrollment.sql` in order through the normal migration process. These create private draft RPCs, a private material bucket/policies, backup status records and atomic enrollment. See [local implementation evidence](IMPLEMENTATION_20261010.md), [teacher guide](TEACHER_QUICK_GUIDE.md) and [school-owned Google OAuth backup setup](BACKUP_AUTOMATION.md). Configure and verify backups before allowing live material uploads.

For the 17 November release apply `202611170001_delete_reports_payments.sql` after `202611160001` (deleting draft/submitted report cards, payments and charges with audit rows; also fixes the report trigger that silently blocked every report delete). Türkçe: 17 Kasım sürümü için `202611160001`'den sonra `202611170001_delete_reports_payments.sql` dosyasını uygulayın.

For the 16 November release apply `202611160001_session_changes.sql` after `202611150001` (a lesson date can be moved; `sessions.moved_from` keeps the planned time so re-applying the plan does not add it back; dates with attendance cannot move). Türkçe: 16 Kasım sürümü için `202611150001`'den sonra `202611160001_session_changes.sql` dosyasını uygulayın.

For the 15 November release apply `202611150001_materials_plans.sql` (subject-wide materials with links, outcomes, weeks and parent visibility; lesson plans with weekly slots and `plan_class_sessions`; outcome weeks). Türkçe: 15 Kasım sürümü için `202611150001_materials_plans.sql` dosyasını uygulayın.

For the 14 November release apply `202611140001_delete_class_group.sql` (adds **Sınıfı sil** for classes without records). Türkçe: 14 Kasım sürümü için `202611140001_delete_class_group.sql` dosyasını uygulayın.

For the 11 November release apply `202611110001_user_admin.sql` (account tools) and `202611110002_rehberlik_subject.sql` in order, and deploy the `manage-user` Netlify function. The second migration adds the **B6 · Rehberlik** subject with seven learning outcomes as a new published assessment version (open drafts are updated and renumbered after it; it is safe to re-run). It does not change classes or packages: tick Rehberlik for the classes that teach it in **Okul ayarları → Sınıflar** and add it to the right packages in **Okul ayarları → Paketler**, otherwise package students' report cards do not include it.

**Türkçe:** 11 Kasım sürümü için `202611110001_user_admin.sql` ve `202611110002_rehberlik_subject.sql` dosyalarını sırayla uygulayın ve `manage-user` Netlify işlevini yayınlayın. İkinci dosya **B6 · Rehberlik** dersini 7 kazanımıyla ekler. Sınıf ve paketleri değiştirmez: Rehberlik'i okutan sınıflarda **Okul ayarları → Sınıflar**'dan işaretleyin ve **Okul ayarları → Paketler**'de ilgili paketlere ekleyin.

For an existing school database with earlier migrations installed, [SUPABASE_USABILITY_UPDATE.sql](sql/SUPABASE_USABILITY_UPDATE.sql) combines those three exact migrations into one SQL Editor transaction. Copy the entire file into a new query and run once as `postgres`. Its preflight stops on missing prerequisites or already-installed usability objects; an error rolls back the update. Success returns `School Portal usability update installed successfully`. The SQL Editor route does not populate CLI migration history: record the three filenames in the operator register and reconcile that history before a later CLI `db push`. Regenerate the file with `node scripts/prepare-supabase-usability-sql.cjs` if the source migrations change.

Complete `docs/MANUAL_ACCEPTANCE.md` with real staff-owned verification accounts and synthetic student details. Confirm the role controls through direct API requests as well as screens. Confirm an invitation, password recovery email, red guidance alert and management escalation reach the intended inbox. Confirm the first encrypted backup can be restored into an isolated project before real records are entered.

The repository alone does not create provider accounts, reserve a domain or prove delivery. Record the production URL, project reference, repository owner, backup owner and renewal/usage review dates in the school's password manager or private operations register.

## Türkçe kurulum özeti

1. Node.js 22, Git ve Docker Desktop kurun; Docker'ı başlatın. `npm ci` ve `npx supabase start` çalıştırın. Yerel anahtarları `.env` dosyasına girin.
2. Okul adına Supabase projesi açın; CLI ile bağlanıp `npx supabase db push` çalıştırın. 49 ölçüt dahil başlangıç verileri 005 numaralı geçiştedir; `--include-seed` gerekmez. Öğrenci numarası ve rehberlik talebi dahil tüm geçişleri uygulayın. Genel kayıt olma özelliğini kapatın.
3. Okulun alan adını Resend'de doğrulayın. Supabase SMTP ve Netlify bildirim anahtarını ayarlayın. Ücretsiz Netlify adresi e-posta gönderim alan adı değildir.
4. İlk Auth hesabını oluşturun; yukarıdaki SQL ile yalnız bu hesabı yönetici yapın. Sonraki kullanıcıları portaldan davet edin.
5. Özel GitHub deposunu Netlify'a bağlayın. Tablodaki ortam değişkenlerini doğru kapsamlara girin. Auth dönüş adreslerini canlı siteyle eşleştirin.
6. Dört dönem tarihini, ücretleri, dersleri ve saat dilimini girin. Manuel kabul ve yedekten geri yükleme kontrolünü tamamlayın.
