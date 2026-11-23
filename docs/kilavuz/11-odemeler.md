<!-- roller: administrator -->
# 11 · Ödemeler

> Menüde: **Ödemeler**
<!-- kod: `src/pages/operations.tsx` (`FinancePage`) -->

## Amaç

Aylık aidatları ve diğer tahakkukları oluşturmak, ödemeleri kaydetmek, bakiyeleri izlemek. Para birimleri EUR ve PLN'dir.

## Kimler kullanır

| İşlem | Yönetici | Akademik yönetici | Öğretmen | Rehberlik | Veli |
|-------|:-------:|:-----------------:|:--------:|:---------:|:----:|
| Tahakkuk ekleme, ödeme alma, düzeltme | ✓ | — | — | — | — |
| **Sil** (borç veya tahsilat satırı) | ✓ | — | — | — | — |
| Bakiyeyi ve ödemeleri görme | ✓ | — | — | — | Kendi çocuğu |

## Ön koşullar

[Okul ayarları → Paketler](01-okul-ayarlari.md)nda paket ücretleri; öğrencilerin paketleri.

## Kurulum adımları

1. Gerekirse öğrenciye özel ücret veya burs için **Öğrenci ücreti belirle**.
2. Her ay **Aylık aidat oluştur**.

## Günlük kullanım

### Yönetici


- **Ödeme al**: öğrenci, tutar, tarih, referans. Ödeme en eski borca dağıtılır; kalan kısım **Dağıtılmamış** görünür.
- **Tahakkuk ekle**: aidat dışı ücretler.
- **Sadece borçlular** filtresiyle borçlu öğrencileri listeleyin.

### Hatalı kaydı düzeltme ya da silme
Borç ve tahsilat satırlarında iki işlem vardır:
- **Düzelt / iptal et**: kayıt görünür kalır ve *İptal* olarak işaretlenir. Doğru kayıt için normal yol budur.
- **Sil**: kaydı tamamen kaldırır. Kimin sildiği denetim kaydında tutulur. İptal edilmiş kayıtlar da silinebilir.

Tahsilat silinince borçla eşleşmeleri de kalkar. Borca bağlı aktif tahsilat varsa borç silinemez. Önce tahsilatı silin veya iptal edin, sonra borcu silin.


## Sık sorunlar

**Bakiye yanlış görünüyor.** İptal edilmiş ödeme veya dağıtılmamış tutar olabilir; öğrencinin **Ödeme kayıtları** bölümünü kontrol edin.

**"Bu borca bağlı tahsilat var; önce tahsilatı silin veya iptal edin."** Borç, aktif bir tahsilatla eşleşmiş. Önce o tahsilatı **Sil** ile kaldırın ya da **Düzelt / iptal et** ile iptal edin; sonra borcu silin.

## Değişiklik geçmişi

| Tarih | Değişiklik |
|-------|------------|
| 2026-11-11 | İlk sürüm. |
| 2026-11-17 | Borç ve tahsilat satırlarına **Sil** eklendi (yalnız yönetici); iptal ile silme farkı ve bağlı tahsilat kuralı. |
