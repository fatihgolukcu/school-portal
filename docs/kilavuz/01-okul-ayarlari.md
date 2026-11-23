<!-- roller: administrator -->
# 01 · Okul ayarları

> Menüde: **Okul ayarları**
<!-- kod: `src/pages/configuration.tsx` (`SettingsPage`) -->

## Amaç

Okulun temel tanımları: sınıflar, dersler, seviyeler, paketler, akademik yıllar ve karne dönemleri. Diğer bütün modüller bu tanımları kullanır.

## Kimler kullanır

| İşlem | Yönetici | Akademik yönetici | Öğretmen | Rehberlik | Veli |
|-------|:-------:|:-----------------:|:--------:|:---------:|:----:|
| Ayarları görme ve değiştirme | ✓ | — | — | — | — |

## Ön koşullar

Yok. Kurulumun ilk adımıdır ([İlk kurulum sırası](00-ilk-kurulum.md)).

## Kurulum adımları

Sayfanın üstündeki sekmelerle tablo seçilir; **Yeni ekle** ile kayıt eklenir.


1. **Akademik yıllar** — Eğitim yılını ekleyin (ör. 2026–2027).
2. **Karne dönemleri** — Yıl içindeki dönemleri başlangıç/bitiş tarihleriyle girin. Yaz okulu 5. dönemdir. Değerlendirme veya karnesi olan dönemin tarihleri değiştirilemez.
3. **Dersler** — Dil Becerileri, Tarih gibi dersler. Her dersin kısa kodu (B1, B2…) değerlendirme sorularını derse bağlar; kodu değiştirmeyin.
4. **Seviyeler** — Üç tür vardır:
   - **Sınıf seviyesi** (Başlangıç / Orta / İleri): sınıfı belirler; sınıfları ve yoklama listelerini ayırmak için kullanılır.
   - **Uzmanlık seviyesi** (C1, C2, C3, T1, T2, T3): Uzmanlık dersinin kendi seviyesidir. Sınıf seviyesi Uzmanlık dersine uygulanmaz.
   - **Bilgi rotası**: öğrencinin seviye tespitinde kullanılır.


5. **Sınıflar** — Her sınıf için ad, dil, **seviye** ve okutulacak dersleri seçin. Seçilen her ders için otomatik olarak bir "ders" (sınıf × ders) oluşur; öğretmeni [Sınıflar ve dersler](05-siniflar-ve-dersler.md) sayfasında atanır. Sınıfın **Seviye** listesinde yalnız sınıf seviyeleri çıkar. **Düzenle**'de **Bu sınıfta okutulan dersler** altında **Uzmanlık** işaretliyse **Uzmanlık seviyesi** alanından C/T kodunu seçin.
6. **Paketler** — Ücret paketleri; pakete dahil dersler, sınıflar ve seviyeler (**Dahil edilen seviyeler**).

> **İpucu:** Sınıfa seviye verirseniz, **Sınıflar ve dersler** ve **Yoklama** sayfalarında **Seviye** filtresi otomatik çıkar ve listeler seviyeye göre gruplanır.

## Günlük kullanım

### Yönetici
Dönem başında yeni dönem/yıl ekleyin; yeni sınıf açıldığında **Sınıflar** sekmesinden ekleyin.

**Yanlışlıkla açılan sınıfı silme:** **Sınıflar** → sınıfın **Düzenle** → **Sınıfı sil** → onaylayın. Yalnız hiç öğrencisi, ders tarihi veya kaydı olmayan sınıf silinir (dersleriyle birlikte). Kaydı olan sınıf silinmez; pencerede **Bunun yerine arşivle** çıkar. Arşivlenen kayıtlar listede gizlenir; görmek için **Arşivlenenleri göster** kutusunu işaretleyin.


## Sık sorunlar

**Yoklamada seviye filtresi çıkmıyor.** Hiçbir sınıfa veya derse seviye atanmamış. **Sınıflar** sekmesinde sınıfa seviye seçin.

**Dönem tarihini değiştiremiyorum.** O döneme ait değerlendirme veya karne var; tarih korunur.

## Değişiklik geçmişi

| Tarih | Değişiklik |
|-------|------------|
| 2026-11-11 | İlk sürüm. Seviye listeleri artık kod yerine seviye adını gösterir. |
| 2026-11-14 | **Sınıfı sil** (kaydı olmayan sınıflar) ve **Arşivlenenleri göster**. |
| 2026-11-14 | Uzmanlık dersinin kendi seviyesi (**Uzmanlık seviyesi**: C1–C3, T1–T3); sınıf **Seviye** listesi yalnız sınıf seviyelerini gösterir. |
