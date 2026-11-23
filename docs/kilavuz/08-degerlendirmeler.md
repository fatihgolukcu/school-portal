<!-- roller: administrator, academic_manager, teacher -->
# 08 · Değerlendirmeler

> Menüde: **Değerlendirmeler**
<!-- kod: `src/pages/academic.tsx` (`AssessmentsPage`) -->

## Amaç

Dönem sonunda her öğrenci için ders kazanımlarını, derse ilgiyi, davranışı ve çabayı puanlamak; aileye not yazmak. Gönderilen değerlendirmeler karneyi oluşturur.

## Kimler kullanır

| İşlem | Yönetici | Akademik yönetici | Öğretmen | Rehberlik | Veli |
|-------|:-------:|:-----------------:|:--------:|:---------:|:----:|
| Değerlendirme doldurma ve gönderme | ✓ | ✓ | Kendi dersleri | — | — |

## Ön koşullar

- [Sorular ve kurallar](02-sorular-ve-kurallar.md)da yayınlanmış değerlendirme formu.
- [Okul ayarları](01-okul-ayarlari.md)nda karne dönemi.

## Kurulum adımları

Ayrı bir kurulum yoktur.

## Günlük kullanım

### Öğretmen
1. **Sınıf**, **Öğrenci** ve **Karne dönemi** seçin.
2. Üstteki **İlerleme** kartı kaç zorunlu yanıtın kaldığını gösterir:
   - Bölüm etiketleri (ör. *Tarih · 11*, *Derse ilgi · 3*, *Aileye not · 3*) o bölümün ilk eksik sorusuna götürür.
   - **İlk eksik soruya git** sıradaki eksik soruya götürür.
   - Tam liste **Eksikleri listele** altında kapalı durur.


3. Sorular bölüm başlıklarıyla gruplanmıştır. Eksik sorular solda turuncu çizgiyle işaretlidir. Puan rehberi soruların üstündedir: 1 yakın destek gerekiyor · 3 gelişiyor · 5 düzenli ve güvenli.


4. Henüz işlenmemiş ders kazanımında **Henüz işlenmedi** kutusunu işaretleyin.
5. **Aileye bir not**: Güçlü yönler, Gelişim alanları, Veliye öneriler (zorunlu).
6. **Taslağı kaydet** veya **Kaydet ve sonraki öğrenci**. Taslak kurum içinde kalır.
7. Bitince **Değerlendirmeyi gönder**. Değerlendirme incelemeye gider; karneyi yönetim yayımlar ([Karneler](09-karneler.md)).

## Sık sorunlar

**Gönder butonu hata veriyor.** İlerleme kartında eksik kalan yanıt var; **İlk eksik soruya git**.

**"Başka yerde değişti" uyarısı.** Aynı taslak başka bir sekmede değişmiş; kendi değişikliklerinizi kontrol edip son taslağı yükleyin.

## Değişiklik geçmişi

| Tarih | Değişiklik |
|-------|------------|
| 2026-11-11 | İlk sürüm. Eksik yanıtlar tekrar eden uzun liste yerine bölüm sayıları ve kapalı liste olarak gösterilir; sorular bölüm başlıklarıyla gruplanır. |
