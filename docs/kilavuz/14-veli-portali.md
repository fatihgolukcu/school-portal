<!-- roller: parent, administrator -->
# 14 · Veli portalı

> Veli rolüyle girişte görünen ekranlar
<!-- kod: `src/App.tsx`, `src/pages/*` (rol filtreli) -->

## Amaç

Velinin çocuğunun derslerini, yoklamasını, yayınlanmış karnelerini, paylaşılan rehberlik adımlarını, ders materyallerini ve ödemelerini tek yerden görmesi.

## Kimler kullanır

| İşlem | Yönetici | Akademik yönetici | Öğretmen | Rehberlik | Veli |
|-------|:-------:|:-----------------:|:--------:|:---------:|:----:|
| Veli portalını kullanma | — | — | — | — | ✓ |
| Veliyi davet etme / çocuk bağlama | ✓ | — | — | — | — |

Hem personel hem veli olan kişiler sağ üstteki menüden **Görünüm** seçerek veli görünümüne geçebilir.

## Ön koşullar

Veli davet edilmiş ve çocuğu bağlanmış olmalı ([Ekip ve kullanıcılar](03-ekip-ve-kullanicilar.md), [Öğrenciler ve veliler](04-ogrenciler-ve-veliler.md)).

## Kurulum adımları

1. Yönetici veliyi **Veli** rolüyle davet eder ve **Çocukları ilişkilendir** listesinden öğrenciyi seçer.
2. Veli davet e-postasındaki bağlantıdan şifresini belirler (kullanıcı adı hesabında şifreyi yönetici verir).

## Günlük kullanım

### Veli


- **Çocuklarım**: ders ve yoklama özeti.
- **Karneler**: yalnızca yayınlanmış karneler.
- **Rehberlik ve destek**: okulun paylaştığı adımlar ve görüşme notları.
- **Ders materyalleri**: çocuğun derslerine ait dosyalar.
- **Ödemeler**: bakiye ve ödeme geçmişi.
- Şifre değiştirme: sağ üst → **Şifremi değiştir**.

## Sık sorunlar

**Veli çocuğunu göremiyor.** Veli hesabına çocuk bağlanmamış: öğrenci profili → **Veli ekle**.

**Karne görünmüyor.** Karne henüz **Yayınla** ile yayınlanmamış.

## Değişiklik geçmişi

| Tarih | Değişiklik |
|-------|------------|
| 2026-11-11 | İlk sürüm. |
