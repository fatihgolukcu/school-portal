<!-- roller: administrator, academic_manager, teacher, guidance, parent -->
# 12 · Ders materyalleri

> Menüde: **Ders materyalleri**
<!-- kod: `src/pages/materials.tsx` -->

## Amaç

Derslere ait dosya ve bağlantıları tek yerde toplamak. Bir materyal bir **ders (konu)** için eklenir. İsterseniz bir **Seviye** ve/veya **Sınıf**a daraltırsınız. O konunun o kapsamdaki tüm dersleri materyali görür.

Materyal iki türde olabilir:
- **Dosya**: PDF, Word, PowerPoint, Excel, resim veya ses. En fazla 25 MB.
- **Bağlantı**: Google Drive, YouTube veya web sayfası. Videoları YouTube ya da Drive bağlantısı olarak eklersiniz.

## Kimler kullanır

| İşlem | Yönetici | Akademik yönetici | Öğretmen | Rehberlik | Veli |
|-------|:-------:|:-----------------:|:--------:|:---------:|:----:|
| **Materyal ekle** | ✓ | ✓ | Okuttuğu dersler | — | — |
| **Yeni sürüm yükle**, **Velilere aç/kapat**, **Arşivle** | ✓ | ✓ | Yalnız kendi eklediği | — | — |
| Materyali açma | ✓ | ✓ | Okuttuğu dersler | Görür | Görünür olanları |

Materyali yalnız ekleyen kişi veya yönetim değiştirebilir ve arşivleyebilir.

## Ön koşullar

Ders ve öğretmen ataması ([Sınıflar ve dersler](05-siniflar-ve-dersler.md)). Dosya depolama kurulumu: [SETUP.md](../SETUP.md).

## Kurulum adımları

Ayrı bir kurulum yoktur.

## Günlük kullanım

### Materyal ekleme
1. **Materyal ekle**'ye basın.
2. **Tür** seçin: **Dosya** (bilgisayarınızdan yüklersiniz) veya **Bağlantı**.
3. **Ders** seçin. İsterseniz **Seviye** ve **Sınıf** seçin. Boş bırakırsanız materyali dersin tüm seviye ve sınıfları görür.
4. Gerekirse **Kazanımlar** seçin ve **Hafta** girin (ikisi de isteğe bağlıdır). Seçtiğiniz kazanımda materyal, [Müfredat](07-mufredat.md) sayfasında o kazanımın altında görünür.
5. **Veliler görebilsin** varsayılan olarak açıktır. Velinin görmesini istemiyorsanız kapatın.
6. **Başlık** yazın ve kaydedin.


### Listeyi süzme
Üstteki filtrelerle listeyi daraltın: **Ders**, **Seviye**, **Sınıf**, **Hafta** ve arama kutusu.

### Kartlardaki düğmeler
- **Aç**: materyali açar.
- **Yeni sürüm yükle**: yalnız dosyalarda görünür. Dosyanın yeni sürümünü yükler.
- **Velilere aç/kapat**: materyalin veliye görünüp görünmediğini değiştirir.
- **Arşivle**: materyali arşive kaldırır.

Yükleme yarıda kalırsa **Tamamlanmamış yüklemeler → Yüklemeye devam et** ile devam edin.


## Sık sorunlar

**Dosya yüklenmiyor.** Dosya 25 MB'ı geçmemeli. Daha büyükse Google Drive'a koyup **Bağlantı** olarak ekleyin.

**Materyal listede görünmüyor.** Filtreleri kontrol edin (**Ders**, **Seviye**, **Sınıf**, **Hafta**). Materyal arşivlenmiş de olabilir.

**Veli materyali görmüyor.** Materyalin **Veliler görebilsin** seçeneği kapalı olabilir. Ya da materyal çocuğunun dersine ait değildir.

## Değişiklik geçmişi

| Tarih | Değişiklik |
|-------|------------|
| 2026-11-11 | İlk sürüm. |
| 2026-11-15 | Materyal artık ders (konu) bazında; isteğe bağlı Seviye ve Sınıf; Bağlantı türü; Kazanımlar ve Hafta; veli görünürlüğü. |
