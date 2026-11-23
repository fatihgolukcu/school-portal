<!-- roller: administrator, academic_manager, teacher, guidance -->
# 05 · Sınıflar ve dersler

> Menüde: **Sınıflar ve dersler**
<!-- kod: `src/pages/operations.tsx` (`ClassesPage`) -->

## Amaç

Her sınıfın derslerini, öğretmen atamalarını, sınıf listesini (kayıtlı öğrenciler), ders planını ve ders takvimini (planlanan dersler) yönetmek.

**Terimler:** *Sınıf* bir öğrenci grubudur (ör. "Sınıf 1"). *Ders* sınıf × konu eşleşmesidir (ör. "Sınıf 1 · Uzmanlık"). Yoklama ve değerlendirme her zaman bir **ders** üzerinden yapılır.

## Kimler kullanır

| İşlem | Yönetici | Akademik yönetici | Öğretmen | Rehberlik | Veli |
|-------|:-------:|:-----------------:|:--------:|:---------:|:----:|
| Dersleri görme | ✓ | ✓ | Kendi dersleri | ✓ | Çocuğunun dersleri |
| **Öğretmen atamaları** | ✓ | ✓ | — | — | — |
| **Sınıfı düzenle**, **Öğrenci ekle**, **Kaydı sonlandır** | ✓ | ✓ | — | — | — |
| **Ders planla** (haftalık plan), **Takvime uygula** | ✓ | ✓ | Kendi dersi | — | — |
| **Tek seferlik ders ekle**, ders tarihini **Düzenle** | ✓ | ✓ | Kendi dersi | — | — |

## Ön koşullar

[Okul ayarları → Sınıflar](01-okul-ayarlari.md): sınıf, seviye ve dersleri tanımlı olmalı. Öğretmenler davet edilmiş olmalı.

## Kurulum adımları

1. **Öğretmen atamaları** tablosunda her sınıfın her dersi için öğretmen seçin. Seçim hemen kaydedilir. Öğretmensiz dersler turuncu görünür.


2. Ders kartına tıklayın → **Sınıf listesi → Öğrenci ekle**. Açılan pencerede:
   - Arama kutusuna adın veya öğrenci numarasının bir kısmını yazın; liste daralır.
   - Bir veya birden çok öğrenciyi işaretleyin (**Görünenlerin tümünü seç** hepsini işaretler). Her adın altında öğrencinin numarası ve aldığı diğer dersler görünür.
   - Başlangıç tarihini kontrol edip **Seçilenleri kaydet (n)**'e basın. Kaydedilemeyen öğrenci olursa pencere açık kalır ve nedeni yazılır.


3. **Sınıfı düzenle** ile dil, Zoom bağlantısı, gün/saat ve **Seviye** bilgisini kontrol edin. Dersin **Sınıfı düzenle** penceresinde seviye listesi konuya göre değişir: Uzmanlık'de yalnız C/T kodları, diğer derslerde sınıf seviyeleri çıkar.
4. Üstteki **Ders planla** ile [ders planını](#ders-planı) kurun: gün ve saati seçin, tarihler her hafta için kendiliğinden eklenir. Plan dışında yalnız bir ek tarih gerekiyorsa pencerenin altındaki **Tek seferlik ders ekle** bağlantısını kullanın.


## Günlük kullanım

### Ders planı
Ders sayfasındaki **Ders planı** kartı şunları gösterir: başlangıç ve bitiş tarihi, hafta sayısı, haftalık saatler (ör. "Cumartesi 10:00 · 40 dk"), haftalık toplam süre ve atlanan haftalar.

**Ders planla** veya **Planı düzenle** (yönetim veya dersin öğretmeni):
1. **Başlangıç tarihi** ve **Bitiş tarihi** seçin. Plansız bir derste başlangıç bugündür. Bitiş tarihi boşsa eğitim yılının sonu kullanılır.
2. **Gün**, **Saat** ve **Süre (dk)** ile haftalık ders saatlerini girin; dersin bilinen günü ve saati hazır gelir. Birden çok saat için **+ Saat ekle**. Saatler okul saatidir.
3. **Atlanacak haftalar (tatil vb.)** alanına ders yapılmayacak haftaları ekleyin.

Hepsi isteğe bağlıdır ve plan sonradan değiştirilebilir.

**Kaydet ve önizle** planı kaydeder ve takvimde kaç tarihin ekleneceğini ve kaldırılacağını gösterir. Geçmiş tarihler korunur. Ardından:
- **Takvime uygula**: tarihleri **Ders takvimi**'ne yazar.
- **Şimdilik uygulama**: yalnız planı saklar, takvim değişmez.

Plan yeniden düzenlenince şunlar **silinmez**: geçmiş tarihler, yoklaması alınmış tarihler, **Tek seferlik ders ekle** ile eklenen ve tarihi elle değiştirilen tarihler.

**Ders takvimi**'nde her tarihin yanında "N. hafta" yazar.


### Bir ders tarihini değiştirmek
**Ders takvimi**'nde tarihin yanındaki **Düzenle** → yeni **tarih**, **saat (okul saati)** ve **süre** → **Devam**. Açılan onay penceresinde eski ve yeni tarih yan yana görünür; **Onayla** ile kaydedilir, **Vazgeç** ile hiçbir şey değişmez.
- Yalnız o tarih değişir; haftalık plan aynı kalır ve plan yeniden uygulansa da eski saat geri eklenmez.
- Yoklaması alınmış veya iptal edilmiş tarihte **Düzenle** görünmez.


### Seviyeye göre çalışma
Sınıflara seviye verildiyse listenin üstünde **Seviye** filtresi (**Tüm seviyeler**) çıkar. Filtre hem ders kartlarını hem öğretmen atamaları tablosunu daraltır. Kartlarda ve sınıf başlıklarında seviye etiketi görünür.


### Öğrenci ayrıldığında
Ders sayfasında öğrencinin yanındaki **Kaydı sonlandır**. Kayıt bugün biter, geçmiş yoklamalar korunur. Öğrenci sınıf listesinden çıkar ve listenin altındaki kapalı **Kaydı sonlanan öğrenciler (n)** bölümüne taşınır; tüm geçmiş öğrencinin profilindeki **Eğitim** sekmesinde de görünür.

Durumu **Okuldan ayrıldı** olan öğrenciler sınıf listelerinde, kartlardaki öğrenci sayısında ve yoklamada görünmez; geçmişleri raporlarda ve öğrenci sayfasında kalır.

### Pasif dersler
Sınıfta işareti kaldırılan (pasif/arşivlenen) dersler **Sınıflar ve dersler** sayfasında gizlenir. Görmek için **Arşivlenenleri göster** kutusunu işaretleyin.

## Sık sorunlar

**Ders planı yok.** Dersi açın → **Planı düzenle**. Plan kurulunca tarihler **Takvime uygula** ile takvime yazılır.

**Planladığım ders yoklamada görünmüyor.** İleri tarihli dersler yoklamada **Yaklaşan** başlığı altında listelenir, yoklama ders günü açılır. Ders iptal edildiyse listelenmez. Bkz. [Yoklama](06-yoklama.md).

**Öğretmen dersi göremiyor.** **Öğretmen atamaları** tablosunda o derse öğretmen seçilmemiş.

## Değişiklik geçmişi

| Tarih | Değişiklik |
|-------|------------|
| 2026-11-11 | İlk sürüm. **Seviye** filtresi, kartlarda ve başlıklarda seviye etiketi. |
| 2026-11-14 | Öğrenci kaydetmede arama ve çoklu seçim; kaydı sonlanan öğrenciler ayrı, kapalı bölümde. |
| 2026-11-15 | **Ders planı** eklendi: başlangıç/bitiş, haftalık saatler, atlanan haftalar; **Kaydet ve önizle**, **Takvime uygula**, **Şimdilik uygulama**. Ders takviminde "N. hafta" bilgisi. |
| 2026-11-16 | **Ders planla** artık haftalık planı açar (gün/saat seçilir, tarihler kendiliğinden eklenir); tek tarih için **Tek seferlik ders ekle**. Ders tarihinde **Düzenle** ve onay penceresi. Sınıf listesinde **Kaydet** yerine **Öğrenci ekle**. |
| 2026-11-14 | Uzmanlık dersinde seviye listesi yalnız C/T kodları; pasif dersler gizli (**Arşivlenenleri göster**); **Okuldan ayrıldı** öğrenciler sınıf listesi, sayı ve yoklamada görünmez. |
