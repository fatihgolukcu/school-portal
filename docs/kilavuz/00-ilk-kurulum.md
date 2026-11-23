<!-- roller: administrator -->
# 00 · İlk kurulum sırası

> Yeni bir okul (veya yeni eğitim yılı) için portalı baştan hazırlarken izlenecek sıra.

## Amaç

Modüller birbirine bağlıdır: ders planlamak için önce sınıf, sınıf için önce ders ve seviye gerekir. Bu sayfa doğru sırayı verir; ayrıntılar her modülün kendi sayfasındadır.

## Kimler kullanır

| İşlem | Yönetici | Akademik yönetici | Öğretmen | Rehberlik | Veli |
|-------|:-------:|:-----------------:|:--------:|:---------:|:----:|
| Kurulumun tamamı | ✓ | Kısmen (sorular, atamalar) | — | — | — |

## Ön koşullar

- Teknik kurulum yapılmış olmalı (Supabase, Netlify, e-posta). Bkz. [SETUP.md](../SETUP.md).
- İlk yönetici hesabı oluşturulmuş olmalı.

## Kurulum adımları

| Adım | Ne yapılır | Nerede | Sayfa |
|------|-----------|--------|-------|
| 1 | Akademik yılı ve karne dönemlerini girin | **Okul ayarları → Akademik yıllar / Karne dönemleri** | [01](01-okul-ayarlari.md) |
| 2 | Dersleri (Dil Becerileri, Tarih…) kontrol edin | **Okul ayarları → Dersler** | [01](01-okul-ayarlari.md) |
| 3 | Seviyeleri tanımlayın (başlangıç, orta, ileri…) | **Okul ayarları → Seviyeler** | [01](01-okul-ayarlari.md) |
| 4 | Sınıfları oluşturun; her sınıfa dil, **seviye** ve dersler seçin | **Okul ayarları → Sınıflar** | [01](01-okul-ayarlari.md) |
| 5 | Paketleri ve ücretleri tanımlayın | **Okul ayarları → Paketler** | [01](01-okul-ayarlari.md) |
| 6 | Değerlendirme sorularını ve not hesaplamasını kontrol edip **Yayınla** | **Sorular ve kurallar** | [02](02-sorular-ve-kurallar.md) |
| 7 | Öğretmenleri ve personeli davet edin | **Ekibimiz → Kişi davet et** | [03](03-ekip-ve-kullanicilar.md) |
| 8 | Öğrencileri tek tek veya **Toplu yükle** ile kaydedin; velileri bağlayın | **Öğrenciler** | [04](04-ogrenciler-ve-veliler.md) |
| 9 | Her derse öğretmen atayın; öğrencileri derse kaydedin | **Sınıflar ve dersler** | [05](05-siniflar-ve-dersler.md) |
| 10 | Dersleri planlayın (**Ders planla**) | **Sınıflar ve dersler → ders** | [05](05-siniflar-ve-dersler.md) |
| 11 | Aylık aidatları oluşturun | **Ödemeler** | [11](11-odemeler.md) |

Bu adımlar bitince öğretmenler [Yoklama](06-yoklama.md) ve [Değerlendirmeler](08-degerlendirmeler.md) ile çalışmaya başlayabilir.

## Günlük kullanım

Kurulumdan sonra günlük iş akışı için [kılavuz ana sayfasındaki](README.md#rol-bazında-yapılacaklar) rol listesine bakın.

## Sık sorunlar

**Ders planladım ama yoklamada göremiyorum.** Planlanan ders ileri bir tarihteyse yoklama listesinde **Yaklaşan** başlığı altında görünür, ancak yoklama ders günü açılır. Bkz. [Yoklama](06-yoklama.md).

**Öğretmen sınıfını göremiyor.** Derse öğretmen atanmamış olabilir: **Sınıflar ve dersler → Öğretmen atamaları**.

## Değişiklik geçmişi

| Tarih | Değişiklik |
|-------|------------|
| 2026-11-11 | İlk sürüm. |
