<!-- roller: administrator, academic_manager -->
# 02 · Sorular ve kurallar

> Menüde: **Sorular ve kurallar**
<!-- kod: `src/pages/configuration.tsx` (`ConfigurationPage`) -->

## Amaç

Öğretmenin doldurduğu değerlendirme formunu, karne notunun nasıl hesaplandığını ve hangi durumlarda rehberlik uyarısı açılacağını belirler. Her değişiklik bir **sürüm** olarak saklanır; **Yayınla** demeden kimse yeni sürümü görmez.

## Kimler kullanır

| İşlem | Yönetici | Akademik yönetici | Öğretmen | Rehberlik | Veli |
|-------|:-------:|:-----------------:|:--------:|:---------:|:----:|
| Soruları düzenleme, önizleme, yayınlama | ✓ | ✓ | — | — | — |

## Ön koşullar

[Okul ayarları](01-okul-ayarlari.md)nda dersler tanımlı olmalı.

## Kurulum adımları

Üstteki sekmeler:

### Değerlendirme soruları
- Sorular **bileşenlere** ayrılır. Ekranda kod yerine adlar görünür:

| Ekranda | Kayıttaki kod | Ne ölçer |
|---------|---------------|----------|
| Ders adı (ör. Hikâyeler ve Biyografiler, Rehberlik) | B1–B6 | Dersin kazanımları |
| **Derse ilgi** | A4 | Odaklanma, etkinlikler, öğretmenle iletişim |
| **Davranış** | A5 | Arkadaşlara saygı, ders düzenine uyum… |
| **Gelişim ve çaba** | A6 | Çaba sorusu ve aileye notlar |
| **Diğer sorular** | custom | Not hesabına girmez |

- Soruyu açıp Türkçe/İngilizce metnini, türünü (**Puan ölçeği**, **Metin**, **Evet / Hayır**…) ve zorunlu olup olmadığını değiştirin. **Kazanım ekle** ile yeni soru ekleyin.


### Not hesaplama
Karne puanı üç kademede hesaplanır; her kartta ağırlıkların toplamı **%100** olmalıdır:

1. **Genel not** = Akademik + Disiplin + Gelişim ve çaba
2. **Disiplin bileşeni** = Yoklama + Katılım + Davranış
3. **Katılım bileşeni** = **Ders içi katılım puanı** + **Derse ilgi**
   - *Ders içi katılım puanı*: öğretmenin her derste yoklamayla girdiği 1–5 puanın ortalaması (eskiden "A3" olarak görünüyordu).
   - *Derse ilgi*: değerlendirme formundaki derse ilgi sorularının ortalaması (eskiden "A4").


### Rehberlik tetikleyicileri
**Kural ekle** / **Koşul ekle** ile otomatik uyarılar tanımlanır. Örnek: "Ardışık devamsızlık ≥ 3 → turuncu uyarı" veya "Ders içi katılım ortalaması ≤ 2,5".

### Yayınlama
Değişiklikten sonra **Önizle** ile kontrol edin, sonra **Yayınla**. Yayınlanmış sürüm geri değiştirilemez; yeni sürüm oluşur.

## Günlük kullanım

### Akademik yönetici
Dönem başında soruları kontrol edin. Dönem ortasında soru değiştirmek yerine bir sonraki dönem için yeni sürüm hazırlayın.

## Sık sorunlar

**"Ağırlıklar toplamı %100 olmalıdır" hatası.** Kartın altındaki **Toplam** 100 olana kadar değerleri düzeltin.

**Öğretmen yeni soruyu görmüyor.** Sürüm **Yayınla** ile yayınlanmamış.

## Değişiklik geçmişi

| Tarih | Değişiklik |
|-------|------------|
| 2026-11-11 | İlk sürüm. A3/A4 gibi kodlar yerine okunabilir bileşen adları ve açıklamaları gösterilir. |
