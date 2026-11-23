<!-- roller: administrator, academic_manager, teacher -->
# 07 · Müfredat (işlenen konular)

> Menüde: **Müfredat**
<!-- kod: `src/pages/academic.tsx` (`CurriculumPage`) -->

## Amaç

Her derste hangi kazanımların işlendiğini kaydetmek ve her kazanımın hangi hafta işleneceğini takip etmek. Değerlendirme formunda henüz işlenmemiş kazanımlar **Henüz işlenmedi** olarak işaretlenebilir; karnede bu konular hesaba katılmaz.

## Kimler kullanır

| İşlem | Yönetici | Akademik yönetici | Öğretmen | Rehberlik | Veli |
|-------|:-------:|:-----------------:|:--------:|:---------:|:----:|
| İşlenen konuları kaydetme | ✓ | ✓ | Kendi dersleri | — | — |
| Değişiklik onayı | ✓ | ✓ | — | — | — |

## Ön koşullar

- [Sorular ve kurallar](02-sorular-ve-kurallar.md)da yayınlanmış değerlendirme soruları (ders kazanımları).
- Haftaların hesaplanması için [ders planı](05-siniflar-ve-dersler.md#ders-planı).

## Kurulum adımları

Kazanımlar değerlendirme sorularından gelir; ayrı kurulum yoktur.

## Günlük kullanım

### Öğretmen
Yoklamayı gönderdikten sonra **İşlenen konular** butonu ile bu sayfaya gelin, işlenen kazanımları işaretleyip kaydedin.

Her kazanım satırında iki yeni bilgi vardır:
- **Hafta**: kazanımın hangi hafta işleneceği. 1. hafta, ders planının başlangıç tarihidir.
- **Materyaller (n)**: kazanıma bağlı materyal sayısı. Düğmeye tıklayınca kazanımın altında bir liste açılır. Her materyal için şunları görürsünüz:
  - materyal adı (tıklayınca açılır) ve hafta,
  - **Velilere açık** veya **Velilere kapalı** rozeti,
  - listenin sonunda **+ Materyal** düğmesi.

  Birden çok kazanımın materyalleri aynı anda açık kalabilir. **+ Materyal**, o kazanım ve haftası önceden doldurulmuş bir materyal formu açar ([Ders materyalleri](12-ders-materyalleri.md)). Kazanımın materyali yoksa listede yalnız **+ Materyal** görünür (düzenleme yetkisi olanlara).


Sayfanın üstündeki kartta **Bu hafta: N. hafta** yazar.

Haftası geçmiş ama işlenmediği işaretlenmemiş bir kazanımın satırı vurgulanır ve **Planlanan hafta geçti** yazar. Bu kazanımlar ayrıca [Kontrol ve raporlar](15-kontrol-ve-raporlar.md) ekranında listelenir.

### Akademik yönetici
Onay bekleyen değişiklikleri inceleyip onaylayın.


## Sık sorunlar

**Kazanım listesi boş.** Dersin konusu için yayınlanmış soru yok; [Sorular ve kurallar](02-sorular-ve-kurallar.md).

**Hafta sütunu boş.** Dersin ders planı yok. [Sınıflar ve dersler](05-siniflar-ve-dersler.md) sayfasında **Planı düzenle** ile planı kurun.

**"Planlanan hafta geçti" görünüyor ama kazanım işlendi.** Kazanımı işlenenler olarak işaretleyip kaydedin.

## Değişiklik geçmişi

| Tarih | Değişiklik |
|-------|------------|
| 2026-11-11 | İlk sürüm. |
| 2026-11-15 | **Hafta** ve **Materyaller** sütunları; **Bu hafta** kartı; **Planlanan hafta geçti** uyarısı. |
| 2026-11-17 | **Materyaller (n)** düğmesi kazanımın altında açılır liste olarak gösterilir; birden çok kazanım aynı anda açık kalabilir; velilere açık/kapalı rozeti. |
