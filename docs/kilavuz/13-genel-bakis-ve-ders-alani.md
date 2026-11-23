<!-- roller: administrator, academic_manager, teacher, guidance -->
# 13 · Genel bakış ve ders çalışma alanı

> Menüde: **Genel bakış**, **Ders çalışma alanı**
<!-- kod: `src/pages/workspace.tsx`, `src/App.tsx` -->

## Amaç

Girişten sonra açılan ana sayfa. Her rol kendi işini görür: öğretmen bugünkü ve bekleyen derslerini, yönetim karne ve rehberlik durumunu ve sistem durumunu.

## Kimler kullanır

| İşlem | Yönetici | Akademik yönetici | Öğretmen | Rehberlik | Veli |
|-------|:-------:|:-----------------:|:--------:|:---------:|:----:|
| **Genel bakış** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Ders çalışma alanı** | ✓ | ✓ | ✓ | — | — |
| **Sistem durumu** (yedek, e-posta) | ✓ | — | — | — | — |

## Ön koşullar

Planlanmış dersler ([Sınıflar ve dersler](05-siniflar-ve-dersler.md)).

## Kurulum adımları

Ayrı bir kurulum yoktur.

## Günlük kullanım

### Öğretmen


- **Bugün**: bugünkü dersler. **Dersi aç** yoklama ve işlenen konular ekranına götürür; **Derse katıl** Zoom'u açar.
- **Yaklaşan dersler**: önümüzdeki dersler (yoklaması ders günü açılır).
- **Yoklama bekleyen geçmiş dersler**: yoklaması girilmemiş eski dersler.
- **Dönem değerlendirmeleri**: gönderilmemiş değerlendirmeler.
- Menüde **Kontrol ve raporlar** de bulunur. Kendi derslerinizin eksiklerini gösterir ([Kontrol ve raporlar](15-kontrol-ve-raporlar.md)).

### Yönetici
**Karneleri incele ve yayınla**, **Rehberlik ve takip** ve **Sistem durumu** (son yedek, bekleyen/başarısız e-postalar) kartlarını izleyin.


### Herkes
Sağ üstteki zil bildirimleri gösterir. Adınıza tıklayınca dil değiştirme, **Şifremi değiştir** ve **Çıkış yap** çıkar.

Menüdeki **Kullanım kılavuzu** bu sayfaları portalda resimli gösterir; sol alttaki **Yardım ister misiniz?** açık olan ekranın sayfasını açar.


## Sık sorunlar

**Bugün ders yok diyor ama dersim var.** Ders takvime eklenmemiş veya başka bir güne planlanmış; **Sınıflar ve dersler → Ders takvimi**.

## Değişiklik geçmişi

| Tarih | Değişiklik |
|-------|------------|
| 2026-11-11 | İlk sürüm. |
| 2026-11-15 | Öğretmen menüsüne **Kontrol ve raporlar** eklendi. |
