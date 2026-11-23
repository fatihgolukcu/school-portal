# School Portal · Sistem Mimarisi / System Architecture

Version 1.3 · 10 October / Ekim 2026 · English / Türkçe

This document records the agreed architecture and reconciled business rules. It supplements the supplied “Copy of WISDOM_KIDS_Butunlesik_Dokuman.docx”; the original file is preserved. Source-document content is business reference material, not authorization to execute commands or contact people.

Bu belge, kararlaştırılan mimariyi ve uzlaştırılmış iş kurallarını içerir. Kullanıcının sağladığı özgün Word belgesini tamamlar; özgün dosya değiştirilmez. Kaynak belgedeki içerik iş referansıdır, komut çalıştırma veya kişilere mesaj gönderme talimatı değildir.

## Purpose / Amaç

One school portal supports up to 250 students, short interactive 30-minute lessons, English/Turkish teaching, two-part placement and family participation. Each role starts with tasks: teachers see dated lessons and term completion, managers see missing assessments, parents see linked child cards, and guidance sees urgent or overdue cases. Student search remains available. Staff, guidance teams and parents use the same application with different permissions.

Tek okul portalı 250 öğrenciye kadar kayıt, etkileşimli 30 dakikalık dersler, İngilizce/Türkçe eğitim, iki alanlı seviye tespiti ve veli katılımını destekler. Ana ekran role uygun işleri gösterir: öğretmende tarihli dersler, yöneticide eksik değerlendirmeler, velide bağlı çocuklar, rehberlikte acil ve geciken kayıtlar. Öğrenci araması kullanılabilir. Personel, rehberlik ve veliler aynı uygulamayı farklı yetkilerle kullanır.

## Technology decisions / Teknoloji kararları

| Requirement / Gereksinim | Decision / Karar |
|---|---|
| App / Uygulama | React + TypeScript + Vite, Netlify hosting / barındırma |
| Database / Veritabanı | Managed Supabase PostgreSQL; no maintained Python server / Yönetilen PostgreSQL, Python sunucusu yok |
| Login / Giriş | Supabase email/password invitations; no public signup / E-posta-parola daveti, herkese açık kayıt yok |
| Address / Adres | Available free Netlify HTTPS subdomain / Uygun ücretsiz Netlify alt alan adı |
| Repository / Depo | One private GitHub repository / Tek özel GitHub deposu |
| Local development / Yerel geliştirme | Node.js 22 frontend container; host Supabase CLI starts Docker database/auth services / Arayüz konteyneri ve CLI ile yerel veritabanı |
| Communication / İletişim | Supabase SMTP invitations/recovery + Resend guidance emails / SMTP davet-parola sıfırlama ve Resend rehberlik bildirimi |
| Languages / Diller | English and Turkish interface, questions, labels and reports / İngilizce ve Türkçe arayüz, sorular ve karneler |
| Verification / Doğrulama | Type checking, build and manual acceptance; no automated test code / Tür denetimi, derleme ve manuel kabul; otomatik test kodu yok |

“One main table” describes the user experience. A single physical database table would duplicate attendance, guardians and payments, so repeating data is stored in small linked tables. Dimensions and school reference values are maintained in the portal without code changes.

“Tek ana tablo” kullanıcı deneyimini tanımlar. Yoklama, veli ve ödeme geçmişi tek fiziksel tabloda çoğalacağı için tekrarlanan veriler küçük ilişkili tablolarda saklanır. Boyutlar ve okul tanımları kod değiştirmeden portaldan yönetilir.

## Completed module tables / Tamamlanan modül tabloları

| Module / Modül | Essential fields and workflow / Temel alanlar ve süreç |
|---|---|
| Student / Öğrenci | Automatic immutable student number (ST-000001), name, surname, DoB, teaching language, registration date, optional student phone, parent name/phone/email, active/archive status / Otomatik ve değişmez öğrenci numarası (ST-000001), ad, soyad, doğum tarihi, eğitim dili, kayıt tarihi, isteğe bağlı öğrenci telefonu, veli adı-telefonu-e-postası, aktif/arşiv durumu |
| Guardians / Veliler | Login profile and many-to-many student links; siblings and multiple guardians / Giriş profili ve öğrenci ilişkileri; kardeşler ve birden fazla veli |
| Teachers / Öğretmenler | Name, contact, languages, active status, assigned classes/subjects / Ad, iletişim, diller, aktif durum, atanan sınıf ve dersler |
| Placement / Seviye tespiti | Date, assessor, Specialist reading level, Knowledge track level, note / Tarih, değerlendiren, Uzmanlık seviyesi seviyesi, Bilgi rotası seviyesi, not |
| Classes / Sınıflar | Year, subject, language, level, teacher, Zoom URL, timetable, enrollment dates / Yıl, ders, dil, seviye, öğretmen, Zoom bağlantısı, zaman çizelgesi, kayıt tarihleri |
| Sessions / Oturumlar | Dated 30-minute lessons linked to class; attendance roster / Sınıfa bağlı tarihli 30 dakikalık dersler ve yoklama listesi |
| Curriculum / Müfredat | Subject, level, question code, EN/TR text, type, teaching order, taught state / Ders, seviye, soru kodu, iki dilde metin, tür, öğretim sırası, işlenme durumu |
| Packages / Paketler | EN/TR name, included subjects, weekly allowance, price, currency, active flag / İki dilde ad, dersler, haftalık ders hakkı, fiyat, para birimi, aktiflik |
| Attendance / Yoklama | Student/session, present-late-absent, lateness, camera/mic observation, participation, excused reason / Öğrenci-oturum, geldi-geç-yok, gecikme, kamera-mikrofon gözlemi, katılım, mazeret |
| Assessments / Değerlendirme | Student, period, teacher, immutable form version, answers, strengths, development, parent advice / Öğrenci, dönem, öğretmen, sabit form sürümü, cevaplar, güçlü yönler, gelişim alanı, veli önerisi |
| Reports / Karneler | Four annual periods plus optional summer period, draft/submitted/published, calculation snapshot, comments, revision and publication history / Dört dönem, taslak-gönderildi-yayınlandı, hesap özeti, yorum, sürüm ve yayın geçmişi |
| Guidance / Rehberlik | Selected student profile/number, risk category, report topic, description, evidence, assignee, reporting teacher, workflow stage, review deadline, plan shared with parents, follow-up, outcome / Seçilen öğrenci profili-numarası, risk kategorisi, rapor konusu, açıklama, kanıt, sorumlu, bildiren öğretmen, süreç aşaması, inceleme süresi, veliyle paylaşılan plan, takip, sonuç |
| Payments / Ödemeler | Monthly charges, fee overrides, currency, due date, payment date/reference, allocation, reversal / Aylık borç, ücret istisnası, para birimi, vade, ödeme tarihi-referansı, mahsup, iptal-düzeltme |
| Administration / Yönetim | Profiles/roles, school timezone, years/periods, dimensions, configuration versions, notification status, audit / Profiller-yetkiler, saat dilimi, yıllar-dönemler, boyutlar, yapılandırma sürümleri, bildirim ve denetim |

Initial subjects: Language Skills, History, Stories & Biographies, Values Education, Knowledge Track. The document's 49 criteria are seeded with stable identifiers and translated labels. Specialist level codes C1, C2, C3, T1, T2 and T3 are retained without invented definitions. Initial packages: Full Package / Tam Paket, Specialist School / Uzmanlık Okulu, Weekend School / Hafta Sonu Okulu. Prices are administrator maintained.

Başlangıç dersleri yukarıdaki beş derstir. Kaynak belgedeki 49 ölçüt, sabit kimlik ve çevirileriyle başlangıç verisidir. C1–C3 ve T1–T3 Uzmanlık seviye kodlarına kaynakta olmayan anlamlar eklenmez. Üç başlangıç paketi için fiyatları yönetici belirler.

## Relationships and data flow / İlişkiler ve veri akışı

| Relationship / İlişki | Meaning / Anlam |
|---|---|
| Profile ↔ Student / Profil ↔ Öğrenci | Guardian join records allow many children and many guardians / Veli ilişkisi çok çocuk ve çok veli sağlar |
| Teacher → Class → Session / Öğretmen → Sınıf → Oturum | Teacher assignment determines write access; session stores actual date / Öğretmen ataması yazma yetkisini, oturum gerçek tarihi belirler |
| Student ↔ Class / Öğrenci ↔ Sınıf | Dated enrollments preserve transfer history / Tarihli kayıtlar sınıf değişikliği geçmişini korur |
| Package ↔ Subject / Paket ↔ Ders | Package subjects determine report coverage / Paket dersleri karne kapsamını belirler |
| Configuration → Assessment → Report / Yapılandırma → Değerlendirme → Karne | Each submission records its form version; each report records the calculation version / Her gönderim form, her karne hesaplama sürümünü tutar |
| Report → Parent snapshot / Karne → Veli özeti | Published labels, bars and approved comments live separately from raw marks / Yayınlanmış etiketler, çubuklar ve yorumlar ham notlardan ayrı tutulur |
| Guidance → Notes and shared actions / Rehberlik → Notlar ve paylaşılan eylemler | Private notes and parent-visible actions are separate records / Özel notlar ile veliye açık eylemler ayrıdır |
| Payment ↔ Charge / Ödeme ↔ Borç | Allocations support partial payments only in matching currency / Mahsuplar aynı para biriminde kısmi ödemeyi destekler |

The browser authenticates using the public Supabase key and user session. Database row policies and transactional RPC operations validate access and calculate results. Only Netlify functions hold service credentials. Attendance/assessment submission evaluates guidance rules; a five-minute scheduled function checks deadlines and processes claimed email outbox rows. Email contains an authenticated case link without private notes or student details.

Tarayıcı herkese açık Supabase anahtarı ve kullanıcı oturumuyla çalışır. Satır erişim politikaları ve işlemsel veritabanı fonksiyonları yetkiyi doğrular ve hesapları yapar. Servis anahtarları yalnız Netlify işlevlerindedir. Yoklama-değerlendirme gönderiminde rehberlik kuralları çalışır; beş dakikalık zamanlayıcı süreleri ve e-posta kuyruğunu işler. E-posta, özel not veya öğrenci ayrıntısı olmadan kimlik doğrulamalı kayıt bağlantısı içerir.

## Permission matrix / Yetki matrisi

| Role / Rol | Access / Erişim |
|---|---|
| Administrator / Yönetici | All records, users, configuration, finance and publication / Tüm kayıtlar, kullanıcılar, yapılandırma, maliye ve yayınlama |
| Academic manager / Akademik yönetici | School-wide academic records, report approval, guidance escalation and academic reporting / Okul akademik kayıtları, karne onayı, rehberlik yükseltme ve akademik raporlar |
| Teacher / Öğretmen | Assigned classes/students, attendance, assessments, referrals and relevant shared actions / Atanan sınıf-öğrenciler, yoklama, değerlendirme, yönlendirme ve ilgili paylaşılan eylemler |
| Guidance / Rehberlik | Guidance queue, case notes/actions and relevant academic history / Rehberlik kuyruğu, görüşme notları-eylemler ve ilgili akademik geçmiş |
| Parent / Veli | Linked children, schedules, published reports, attendance summaries, shared actions and family balances / Bağlı çocuklar, ders programı, yayınlanan karneler, yoklama özeti, paylaşılan eylemler ve aile bakiyeleri |

Multiple roles may be assigned. Roles are stored in protected database profiles, never trusted from user-editable metadata. Public registration and student accounts are not part of this version. Restricting rows alone does not hide private columns, so parent-safe data uses separate tables/read interfaces.

Bir kullanıcıya birden fazla rol atanabilir. Yetkiler korumalı veritabanı profilindedir; kullanıcının değiştirebildiği metadata yetki kaynağı değildir. Herkese açık kayıt ve öğrenci hesabı bu sürümde yoktur. Satır kısıtlaması tek başına özel sütunları saklamadığı için veliye uygun veriler ayrı tablolarda/arayüzlerde sunulur.

## Configuration and grading / Yapılandırma ve notlandırma

Question types: text, number, scored scale, yes/no, choice and date. Each includes a stable code, EN/TR label, required state and validation. Guided calculations support average, weighted average, categorical mapping and bands. Trigger conditions support thresholds, consecutive occurrences, windows, minimum observations and AND/OR groups; no arbitrary executable expressions.

Soru türleri: metin, sayı, puan ölçeği, evet/hayır, seçim ve tarih. Her soruda sabit kod, iki dilde etiket, zorunluluk ve doğrulama bulunur. Hesaplama düzenleyicisi ortalama, ağırlıklı ortalama, kategori-puan eşlemesi ve seviyeleri; tetikleyiciler eşik, ardışıklık, zaman aralığı, asgari gözlem ve VE/VEYA gruplarını destekler. Serbest çalıştırılabilir kod kullanılmaz.

Draft → preview → publish. Published configurations are immutable; edits create a new version. Historical submissions keep their original references. Recalculating an existing report draft requires an explicit preview and confirmation, and published report snapshots do not change.

Taslak → önizleme → yayın. Yayınlanan yapılandırma değiştirilemez; düzenleme yeni sürüm oluşturur. Eski gönderimler özgün sürümlerini korur. Mevcut karne taslağını yeniden hesaplama açık önizleme ve onay gerektirir; yayınlanan karne özeti değişmez.

| Component / Bileşen | Initial rule / Başlangıç kuralı |
|---|---|
| Overall / Genel | 30% discipline + 50% academic + 20% effort / %30 disiplin + %50 akademik + %20 çaba |
| Discipline / Disiplin | 40% attendance + 30% participation + 30% behaviour / %40 devam + %30 katılım + %30 davranış |
| Attendance / Devam | Present=5; late ≥5 minutes=3; unexcused absent=0 / Geldi=5; ≥5 dk geç=3; mazeretsiz yok=0 |
| Participation / Katılım | Equal mean of A3 active participation and A4 engagement / A3 aktif katılım ve A4 derse ilginin eşit ortalaması |
| Behaviour / Davranış | Mean of A5 criteria / A5 ölçütlerinin ortalaması |
| Academic / Akademik | Equal mean of enrolled subject means, taught criteria only / Kayıtlı ders ortalamalarının eşit ortalaması, yalnız işlenmiş ölçütler |
| Effort / Çaba | Mean of submitted A6 assessments / Gönderilen A6 değerlendirmelerinin ortalaması |

Weekly values average applicable sessions; period criteria average within their form, and completed assessments from different teachers contribute equally. Excused absence is excluded and breaks an unexcused sequence. Camera/microphone affects alerts, not marks. Untaught criteria are explicitly excluded. Missing required assessment data blocks report publication rather than becoming zero. Round the final result to two decimals before applying bands.

Haftalık puanlar ilgili oturumlarda, dönem ölçütleri kendi formunda ortalanır; farklı öğretmenlerin tamamlanan değerlendirmeleri eşit ağırlıktadır. Mazeretli yokluk dışlanır ve mazeretsiz diziyi keser. Kamera/mikrofon gözlemi notu değil uyarıyı etkiler. İşlenmeyen ölçütler açıkça dışlanır. Zorunlu değerlendirme eksikliği sıfır sayılmaz; karne yayınını engeller. Seviyeden önce sonuç iki ondalığa yuvarlanır.

Progress bands / İlerleme aralıkları: below / altı 2.50; 2.50–2.99; 3.00–3.99; 4.00–4.49; 4.50–5.00. Parents see labelled progress bars and approved comments; staff retain the underlying calculation.

## Guidance workflow / Rehberlik süreci

### Create a request / Talep oluşturma

The manual request form follows the supplied process in this order. The student number identifies the selected existing profile; staff do not type or generate a new student number in this form.

Manuel talep formu, paylaşılan akışı aşağıdaki sırayla izler. Öğrenci numarası seçilen mevcut profili tanımlar; personel bu formda yeni numara yazmaz veya üretmez.

| Step / Adım | Field or action / Alan veya işlem |
|---|---|
| 1. Create request / Talep oluştur | Open the guidance request form / Rehberlik talep formunu aç |
| 2. Student profile selection / Öğrenci profili seçimi | Select an authorized student by name and student number, for example ST-000001 / Yetki kapsamındaki öğrenciyi adı ve öğrenci numarasıyla seç; örneğin ST-000001 |
| 3. Risk category / Risk kategorisi | Choose Red, Orange or Yellow / Kırmızı, Turuncu veya Sarı seç |
| 4. Report topic / Rapor konusu | Enter the report topic in its own text field / Rapor konusunu ayrı metin alanına gir |
| 5. Description / Açıklama | Enter the supporting description in its own text field, then submit / Destekleyici açıklamayı ayrı metin alanına gir ve gönder |

The database automatically assigns each student an immutable, unique number using the ST-000001 format, including existing students during migration. Requests reference the student record's internal identifier; the visible number is a lookup aid. Topic and description are stored separately. Only authorized staff can submit a request, and the server validates student access and the selected risk category. After submission, the request enters the existing guidance queue and review/follow-up workflow below. A red request also follows the urgent notification rule. Request details remain internal unless an authorized staff member separately shares a guidance action with the parent.

Veritabanı her öğrenciye ST-000001 biçiminde benzersiz ve değişmez numarayı otomatik verir; geçiş sırasında mevcut öğrenciler de numaralandırılır. Talep, öğrenci kaydının iç kimliğine bağlanır; görünen numara bulmayı kolaylaştırır. Konu ve açıklama ayrı saklanır. Yalnız yetkili personel talep gönderebilir; sunucu öğrenci erişimini ve risk kategorisini doğrular. Gönderilen talep mevcut rehberlik kuyruğuna, aşağıdaki inceleme ve takip sürecine girer. Kırmızı talep acil bildirim kuralını da izler. Yetkili personelin ayrıca veliyle paylaştığı rehberlik eylemleri dışında talep ayrıntıları kurum içinde kalır.

### Automatic rules and follow-up / Otomatik kurallar ve takip

| Severity / Önem | Initial triggers / Başlangıç tetikleyicileri |
|---|---|
| Red / Kırmızı | Three consecutive unexcused absences in same class; total <2.50; urgent manual referral; measured orange condition still failing after 14 days / Aynı sınıfta ardışık üç mazeretsiz yokluk; genel <2,50; acil manuel yönlendirme; 14 gün sonra devam eden ölçülmüş turuncu koşul |
| Orange / Turuncu | Attendance <60%; three camera/mic incidents in 21 days; A3/A4 ≤2.50; A5 ≤3 or item ≤2; subject ≤3; total 2.50–2.99 / Devam <%60; 21 günde üç kamera-mikrofon olayı; A3/A4 ≤2,50; A5 ≤3 veya ölçüt ≤2; ders ≤3; genel 2,50–2,99 |
| Yellow / Sarı | Academic item ≤2 when subject mean >3 (an excused mark alone no longer opens a case) / Ders ortalaması >3 iken akademik ölçüt ≤2 (mazeretli işaretleme tek başına artık vaka açmaz) |

Weekly average rules start after at least three applicable observations. Excused records suppress urgent contributions. Repeat detection appends evidence to the same open student/issue/class ticket. The shared queue remains unassigned until staff assign it.

Haftalık ortalama kuralları en az üç ilgili gözlemden sonra çalışır. Mazeret acil katkıyı baskılar. Yinelenen tespit aynı öğrenci-konu-sınıf açık kaydına kanıt ekler. Ortak kuyruktaki kayıt personel atayıncaya kadar atanmamıştır.

Manual and automatic requests use the same required workflow. Risk severity is separate from workflow stage: an urgent alert may raise risk and notify management, but does not skip required findings or close the case. Naming a review teacher is optional; the shared plan replaces separate mandatory meeting stages.

Manuel ve otomatik talepler aynı zorunlu süreci izler. Risk önem derecesi süreç aşamasından ayrıdır: acil uyarı riski artırıp yönetimi bilgilendirebilir, ancak gerekli bulguları atlatmaz veya kaydı kapatmaz. İnceleme öğretmeni isteğe bağlıdır; ortak plan ayrı zorunlu görüşme aşamalarının yerini alır.

| Step / Adım | Required action / Gerekli işlem |
|---|---|
| 1. New → Review / Yeni → İnceleme | Record what was found; naming the teacher you spoke to is optional / Bulguları kaydet; görüşülen öğretmeni belirtmek isteğe bağlıdır |
| 2. Review → Plan / İnceleme → Plan | Record the plan agreed with the parents; it is shared with linked parents / Veliyle kararlaştırılan planı kaydet; bağlı velilerle paylaşılır |
| 3. Plan → Follow-up / Plan → Takip | Set the next follow-up date (default 14 days) / Sonraki takip tarihini belirle (varsayılan 14 gün) |
| 4. Follow-up / Takip | Resolve and close, continue follow-up with a new date, or pass to management / Çözüldü olarak kapat, yeni tarihle takibe devam et veya yönetime aktar |
| Management review / Yönetim incelemesi | Only administrator/academic manager continues follow-up or explicitly closes unresolved / Yalnız yönetici-akademik yönetici takibe devam ettirir veya kaydı çözülmeden kapatır |

Since October 2026 the process has five steps (new, review, plan, follow-up, closed). Each transition requires a recorded finding of 3–5,000 characters, and the database enforces the permitted transitions. Review notes stay internal; the plan is automatically shared with linked parents, who see shared updates as a timeline. The existing coarse status remains for compatibility, and ordinary status edits cannot bypass the detailed stages. An unresolved case stays open until management explicitly closes it; no timer closes unresolved cases.

Her geçiş 3–5.000 karakterlik bulgu kaydı gerektirir. Veritabanı izin verilen geçişleri uygular. Takip tarihi varsayılan olarak 14 gün sonradır ve değiştirilebilir; yeniden değerlendirmede zorunlu bekleme yoktur. Yeniden değerlendirme vadesi portalda görünür. Özel görüşme notları kurum içinde kalır; mutabık kalınan eylemler bağlı velilerle otomatik paylaşılır. Mevcut genel durum uyumluluk için korunur; normal durum düzenlemesi ayrıntılı aşamaları atlatamaz. Çözülemeyen kayıt yönetim açıkça kapatana kadar açık kalır; hiçbir zamanlayıcı bu kayıtları kapatmaz.

Unreviewed cases become overdue at 48 elapsed hours and escalate to management at 72 hours. Manual orange cases need an explicit “no improvement” finding before progress-based escalation. Risk escalation changes severity and sends alerts while preserving the required workflow. Red cases and management escalations enter a retryable email queue; repeat management-review events can each notify management.

İncelenmeyen kayıt 48 saat sonra gecikmiş olur; 72 saatte yönetim bilgilendirilir. Manuel turuncu kayıt için ilerlememe kaynaklı yükseltmede açık “gelişme yok” bulgusu gerekir. Risk yükseltmesi önem derecesini değiştirip uyarı gönderir; zorunlu süreç korunur. Kırmızı ve yönetim yükseltmeleri yeniden denenen e-posta kuyruğuna girer; yinelenen yönetim incelemesi olayları ayrı bildirim oluşturabilir.

## Reports and payments / Karneler ve ödemeler

Create four editable date periods per academic year. Teachers submit complete drafts; administrator/academic manager publishes. A correction creates a numbered replacement and preserves the old staff audit version. Parents cannot read drafts or internal numeric marks.

Her akademik yıl için düzenlenebilir dört tarih aralığı oluşturulur. Öğretmen tamamlanan taslağı gönderir; yönetici/akademik yönetici yayınlar. Düzeltme numaralı yeni sürüm oluşturur, önceki sürüm denetim için saklanır. Veli taslak ve iç sayısal notları okuyamaz.

Monthly dues are previewed and generated in bulk with duplicate-month protection. Individual fees may override package prices. Record partial payments and allocations; currency must match. Balances derive from charges, payments and allocations. Corrections retain history. Totals are separate for each currency; online payment collection, exchange conversion and accounting integration are excluded.

Aylık aidatlar önizlenip toplu oluşturulur; aynı ay yinelenmez. Öğrenci ücreti paket fiyatından farklı olabilir. Kısmi ödeme ve mahsup kaydedilir; para birimi aynı olmalıdır. Bakiye borç-ödeme-mahsuptan hesaplanır. Düzeltmeler geçmişi korur. Para birimleri ayrı toplamlanır; çevrim içi tahsilat, kur dönüşümü ve muhasebe bağlantısı kapsam dışıdır.

## Reconciled decisions / Uzlaştırılan kararlar

| Earlier ambiguity / Önceki belirsizlik | Adopted rule / Kabul edilen kural |
|---|---|
| Python database without server / Sunucusuz Python veritabanı | Supabase PostgreSQL/Auth; Python only generates this offline document / Supabase; Python yalnız çevrimdışı belge üretir |
| One big table / Tek büyük tablo | One student screen; normalized linked operational records / Tek öğrenci ekranı, ilişkili işlem kayıtları |
| Camera in grading / Notta kamera | Alert-only observation, no academic/attendance mark penalty / Yalnız uyarı gözlemi, nota etkisi yok |
| Absence exceptions / Yokluk istisnası | Exclude denominator and break unexcused sequence / Paydayı ve mazeretsiz diziyi etkiler |
| Missing or untaught / Eksik veya işlenmemiş | Untaught excluded; required missing blocks publishing / İşlenmemiş dışlanır, zorunlu eksik yayını engeller |
| Threshold and timing / Eşik ve süre | Round to two decimals, inclusive documented bands; 48/72 elapsed hours / İki ondalık ve belirtilen aralıklar; 48/72 gerçek saat |
| Editable dimensions / Düzenlenebilir boyutlar | Portal reference editors and immutable published form versions / Portal tanım editörleri ve değişmeyen yayın sürümleri |
| Manual guidance intake / Manuel rehberlik talebi | Create request → student profile/number → risk category → report topic → description; existing review and follow-up continue after submission / Talep oluştur → öğrenci profili-numarası → risk kategorisi → rapor konusu → açıklama; gönderimden sonra mevcut inceleme ve takip sürer |
| Follow-up for both request sources / İki talep kaynağı için takip | Same staged workflow for manual and automatic requests; review teacher optional, shared plan, editable follow-up date; unresolved cases stay open until explicit management closure / Manuel ve otomatik taleplerde aynı aşamalı süreç; inceleme öğretmeni isteğe bağlı, ortak plan, değiştirilebilir takip tarihi; çözülemeyen kayıt yalnız yönetimin açık kararıyla kapanır |
| Free hosting versus email / Ücretsiz barındırma ve e-posta | Free Netlify address; sender verification needs a school-controlled domain / Ücretsiz Netlify adresi, gönderici için okul alan adı |

## Operations and acceptance / İşletim ve kabul

Default academic year: 2026–2027. Default timezone: Europe/Warsaw, editable at setup; timestamps stored in UTC. Archive operational history rather than routinely delete it. Monitor provider limits, notification failures and overdue cases. Daily encrypted OAuth backup automation includes material bytes. Account setup and an isolated restoration drill are required; see BACKUP_AUTOMATION.md. Future school dates are blocked for final attendance for all roles. Free plans can pause or impose quotas; paid upgrades need an explicit school decision.

Varsayılan yıl 2026–2027, saat dilimi kurulumda değiştirilebilir Europe/Warsaw'dur; zamanlar UTC saklanır. İşlem geçmişi rutin silme yerine arşivlenir. Kota, bildirim hatası ve geciken kayıtlar izlenir. Günlük şifreli OAuth yedeği materyal dosyalarını içerir; hesap kurulumu ve ayrı projede geri yükleme doğrulaması gerekir. BACKUP_AUTOMATION.md belgesine bakın. Gelecek okul tarihleri için yoklama gönderimi tüm rollerde engellenir. Ücretsiz planlarda duraklama veya kota olabilir; ücretli yükseltme okul kararı gerektirir.

Acceptance covers role isolation, invitations, bilingual screens, exact grading boundaries, immutable history, referrals/deadlines, publication, payments, Docker, production build, email delivery and restoration. The detailed walkthrough is in MANUAL_ACCEPTANCE.md. No automated test code is implemented.

Kabul; yetki ayrımı, davetler, iki dil, not sınırları, sürüm geçmişi, rehberlik-süreler, yayın, ödeme, Docker, derleme, e-posta ve geri yüklemeyi kapsar. Ayrıntılı adımlar MANUAL_ACCEPTANCE.md dosyasındadır. Otomatik test kodu uygulanmaz.
