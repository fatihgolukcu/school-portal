<!-- roller: administrator, academic_manager, teacher -->
# 06 · Yoklama

> Menüde: **Yoklama** (ayrıca **Ders çalışma alanı** içinde)
<!-- kod: `src/pages/academic.tsx` (`AttendancePage`) -->

## Amaç

Her ders için öğrencinin geldi / geç geldi / gelmedi durumunu ve **ders içi katılım puanını** (1–5) kaydetmek. Bu kayıtlar karnedeki *Yoklama* ve *Ders içi katılım puanı* bölümlerini ve rehberlik uyarılarını besler.

## Kimler kullanır

| İşlem | Yönetici | Akademik yönetici | Öğretmen | Rehberlik | Veli |
|-------|:-------:|:-----------------:|:--------:|:---------:|:----:|
| Yoklama girme ve gönderme | ✓ (tüm dersler) | ✓ (tüm dersler) | Kendi dersleri | — | — |
| Yoklamayı görme | ✓ | ✓ | ✓ | — | Kendi çocuğu |

## Ön koşullar

- Ders için öğretmen atanmış ve öğrenciler kaydedilmiş olmalı ([Sınıflar ve dersler](05-siniflar-ve-dersler.md)).
- Ders **Ders planla** ile takvime eklenmiş olmalı.

## Kurulum adımları

Ayrı bir kurulum yoktur. Puanlama ağırlıkları [Sorular ve kurallar → Not hesaplama](02-sorular-ve-kurallar.md) sayfasındadır.

## Günlük kullanım

### Öğretmen
1. Sayfa açılınca kendiliğinden bir sınıf açılmaz. Üstte **Bugünkü dersler** kartları görünür: saat, ders ve seviye yazar. Yönetim için kartta öğretmen adı da yer alır. Karta tıklayın; o dersin yoklaması açılır.


   - Bugün ders yoksa kartların yerinde **Bugün planlı ders yok** yazar.
   - Bildirimden veya [Kontrol ve raporlar](15-kontrol-ve-raporlar.md) ekranındaki **Çöz** düğmesinden geldiyseniz ders doğrudan açılır.
   - Dersi kartlarda bulamıyorsanız **Seviye** → **Sınıf** → **Ders tarihi** seçimlerini kullanın. Sınıf listesi seviyelere göre gruplanır.


2. Ders listesi iki bölümdür:
   - **Bugün ve geçmiş**: yoklaması girilebilen dersler (**Kaydedildi** / **Planlandı**).
   - **Yaklaşan**: ileri tarihli dersler, *ders günü açılır*. Seçildiğinde sınıf listesi gösterilir ama yoklama ders gününe kadar kilitlidir.


3. Her öğrenciyi işaretleyin (**Herkesi katıldı işaretle** hızlı giriştir) ve katılım puanını verin: 1 yakın destek gerekiyor · 3 gelişiyor · 5 düzenli ve güvenli.


4. **Taslak kaydedildi** yazısını bekleyin, sonra **Yoklamayı gönder**.
5. Ardından **İşlenen konular** ([Müfredat](07-mufredat.md)).

Seçtiğiniz seviye bu tarayıcıda hatırlanır.

## Sık sorunlar

**14 Kasım'a ders ekledim, yoklamada çıkmıyor.** Ders ileri tarihli; **Yaklaşan** başlığı altında görünür ve yoklaması ders günü açılır. Gelecek tarihe yoklama girilemez (güvenlik kuralı).

**Hiç ders yok diyor.** Bu ders için takvime ders eklenmemiş: **Sınıflar ve dersler → Ders planla**.

**Öğrenci listede yok.** Öğrenci o tarihte derse kayıtlı değil. Bkz. [Öğrenciler](04-ogrenciler-ve-veliler.md).

## Değişiklik geçmişi

| Tarih | Değişiklik |
|-------|------------|
| 2026-11-11 | İlk sürüm. Yaklaşan dersler listede kilitli görünür; **Seviye** filtresi ve seviyeye göre gruplanmış sınıf listesi. |
| 2026-11-17 | Sayfa açılınca sınıf otomatik açılmaz; **Bugünkü dersler** kartları eklendi. **Çöz** ve bildirimden gelen ders doğrudan açılır. |
