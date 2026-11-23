<!-- roller: administrator, academic_manager, teacher, guidance -->
# 09 · Karneler

> Menüde: **Karneler**
<!-- kod: `src/pages/academic.tsx` (`ReportsPage`) -->

## Amaç

Gönderilen değerlendirmeler, yoklama ve katılım puanlarından karne puanını hesaplamak, incelemek ve veliye yayınlamak.

## Kimler kullanır

| İşlem | Yönetici | Akademik yönetici | Öğretmen | Rehberlik | Veli |
|-------|:-------:|:-----------------:|:--------:|:---------:|:----:|
| **Hesaplamayı önizle**, taslak kaydetme | ✓ | ✓ | — | — | — |
| İncelemeye **Gönder** | ✓ | ✓ | — | — | — |
| **Yayınla** | ✓ | — | — | — | — |
| **Sil** (taslak veya onay bekleyen karne) | ✓ | ✓ | Yalnız kendi hazırladığı taslak | — | — |
| Yayınlanan karneyi görme | ✓ | ✓ | ✓ | ✓ | Kendi çocuğu |

## Ön koşullar

O dönem için yoklamalar ve [değerlendirmeler](08-degerlendirmeler.md) gönderilmiş olmalı. Hesaplama kuralları [Sorular ve kurallar → Not hesaplama](02-sorular-ve-kurallar.md) sayfasındadır.

## Kurulum adımları

Ayrı bir kurulum yoktur.

## Günlük kullanım

### Yönetici / Akademik yönetici
1. **Öğrenci** ve **Karne dönemi** seçin → **Hesaplamayı önizle**.


2. **Yayınlamadan önce bu kayıtları tamamlayın** kutusu eksik kayıtları sade adlarla listeler (ör. *Yoklama: Sınıf 1 2026-11-09*, *Derse ilgi*, *Ders içi katılım puanı*).
3. **Taslağı kaydet / yeniden hesapla** → **Gönder** (onay bekliyor) → **Yayınla**. Yayınlanan sürüm değişmez; yeniden hesaplama yeni sürüm oluşturur.

### Karne silme
Yanlışlıkla oluşan karneyi **Taslak** veya **Onay bekliyor** durumundayken **Sil** ile kaldırabilirsiniz.
- **Yönetici** ve **Akademik yönetici** her iki durumdaki karneyi silebilir.
- **Öğretmen** yalnız kendi hazırladığı taslağı silebilir.
- Onay penceresi öğrenci, dönem ve sürümü gösterir. Onaylamak için **Sil** düğmesine basın.
- **Yayınlandı** karne silinemez. Veli bu karneye ulaşmıştır. Gerekirse yeni bir sürüm hazırlanır.

## Sık sorunlar

**"Giriş gerekiyor" görünüyor.** Listede gösterilen kayıtlar eksik; öğretmen yoklamayı veya değerlendirmeyi göndermeli.

## Değişiklik geçmişi

| Tarih | Değişiklik |
|-------|------------|
| 2026-11-11 | İlk sürüm. Eksik kayıt listesi A3/A4 kodları yerine sade adlarla gösterilir. |
| 2026-11-17 | **Sil** düğmesi: taslak ve onay bekleyen karneler silinebilir; yayınlanan karne silinemez. |
