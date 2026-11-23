<!-- roller: administrator, academic_manager, teacher -->
# 15 · Kontrol ve raporlar

> Menüde: **Kontrol ve raporlar**
<!-- kod: `src/pages/control.tsx`, `src/checks.ts` -->

## Amaç

Okulda eksik kalan işleri tek yerde görmek. Örneğin planı olmayan bir ders, yoklaması alınmamış geçmiş bir ders ya da gönderilmemiş bir değerlendirme. Her eksiğin sorumlu öğretmeni gösterilir ve **Çöz** düğmesi sorunun düzeltileceği ekranı açar. Ayrıca yönetim için öğretmen ve ders bazında özet raporlar bu ekrandadır.

Ekran iki sekmeden oluşur: **Eksikler** ve **Raporlar**.

## Kimler kullanır

| İşlem | Yönetici | Akademik yönetici | Öğretmen | Rehberlik | Veli |
|-------|:-------:|:-----------------:|:--------:|:---------:|:----:|
| **Eksikler** sekmesi | ✓ | ✓ | Kendi dersleri | — | — |
| **Raporlar** sekmesi | ✓ | ✓ | — | — | — |

Gecikmiş ödemeler kontrolünü yalnız yönetici görür.

## Ön koşullar

Sınıflar, dersler ve öğretmen atamaları tanımlı olmalı ([Sınıflar ve dersler](05-siniflar-ve-dersler.md)).

## Kurulum adımları

Ayrı bir kurulum yoktur.

## Günlük kullanım

### Eksikler
Üstte dört özet kart görünür. Her kartın altında ilgili kontroller yer alır:

**Ders planı ve öğretmen**
- Öğretmeni olmayan ders
- Planı olmayan ders
- Hiç ders tarihi olmayan ders
- İleride tarihi kalmamış ders
- Öğrencisi olmayan ders

**Yoklama ve müfredat**
- Yoklaması alınmamış geçmiş dersler
- Haftası geçmiş ama işlenmemiş kazanımlar
- Onay bekleyen müfredat değişiklikleri

**Değerlendirme ve karne**
- Gönderilmemiş dönem değerlendirmeleri
- Yayınlanmamış karneler

**Öğrenci ve veli**
- Hiçbir derse kayıtlı olmayan öğrenciler
- Velisi olmayan öğrenciler
- Paketi olmayan öğrenciler
- Gecikmiş ödemeler (yalnız yönetici görür)

Filtreler: **Karne dönemi**, **Seviye**, **Sınıf**, **Öğretmen** ve arama kutusu.

Her satırın bir rengi vardır:
- Kırmızı: **acil**
- Turuncu: **önemli**
- Sarı: **takip**

Satırda sorumlu öğretmen de yazar. **Çöz** düğmesi sorunun düzeltileceği ekranı açar.

Öğretmen yalnız kendi derslerine ait satırları görür.


### Raporlar
Yalnız yönetim bu sekmeyi görür. Üstteki **Karne dönemi**, **Seviye**, **Sınıf** ve **Öğretmen** süzgeçleri tüm sayıları ve grafikleri birlikte değiştirir.
- **Özet sayılar:** Yoklama tamamlanma, Devam oranı (geç / gelmedi ayrımıyla), Değerlendirme gönderim, Müfredat ilerleme, Aktif öğrenci, Aktif ders, Haftalık ders saati.
- **Haftalık yapılan ders** (son 12 hafta) ve **Yoklama eğilimi** (haftalık yoklama tamamlanma % ve devam oranı %). Grafiğin üzerine gelince o haftanın değeri görünür.
- **Öğretmen karşılaştırma** ve **Ders karşılaştırma:** **Yoklama % / Değerlendirme % / Müfredat %** düğmeleriyle grafiği değiştirin; altındaki tabloda sütun başlığına tıklayarak sıralayın.
- **Seviyeye göre öğrenci**, **Sınıfa göre öğrenci**, **Seviyeye göre devam oranı**.
- Her grafikte **Tablo görünümü** aynı sayıları tablo olarak gösterir.
- Telefonda grafikler alt alta dizilir, tablolar kart görünümüne geçer.
- **Excel'e aktar** ile raporu Excel dosyası olarak indirirsiniz.


## Sık sorunlar

**"Ders planı yok" görünüyor.** Dersi açın → **Planı düzenle**. Ayrıntı: [Sınıflar ve dersler → Ders planı](05-siniflar-ve-dersler.md).

**Öğretmen satırları görmüyor.** Öğretmen yalnız kendi derslerini görür. Dersin öğretmeni atanmış olmalı ([Öğretmen atamaları](05-siniflar-ve-dersler.md)).

**Raporlar sekmesi yok.** Raporlar yalnız yönetim tarafından görülür.

## Değişiklik geçmişi

| Tarih | Değişiklik |
|-------|------------|
| 2026-11-15 | İlk sürüm: **Eksikler** ve **Raporlar** sekmeleri. |
| 2026-11-16 | **Raporlar** yenilendi: özet sayılar, haftalık grafikler, öğretmen/ders karşılaştırması, seviye ve sınıf dağılımı; telefona uygun tablolar. |
