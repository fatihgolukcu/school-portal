<!-- roller: administrator, academic_manager, teacher, guidance -->
# 04 · Öğrenciler ve veliler

> Menüde: **Öğrenciler** (velide **Çocuklarım**)
<!-- kod: `src/pages/operations.tsx` (`StudentsPage`), `src/pages/studentImport.tsx` -->

## Amaç

Öğrenci kaydı, profil bilgileri, veli bağlantısı, seviye tespiti ve sınıf kayıt geçmişi.

## Kimler kullanır

| İşlem | Yönetici | Akademik yönetici | Öğretmen | Rehberlik | Veli |
|-------|:-------:|:-----------------:|:--------:|:---------:|:----:|
| Öğrenci listesini görme | ✓ | ✓ | Kendi öğrencileri | ✓ | Kendi çocukları |
| **Öğrenci kaydet**, **Toplu yükle**, profil düzenleme | ✓ | ✓ | — | — | — |
| **Veli ekle** | ✓ | — | — | — | — |
| **Seviye kaydet** (seviye tespiti) | ✓ | ✓ | ✓ | — | — |
| **Dışa aktar** | ✓ | ✓ | — | — | — |

## Ön koşullar

[Okul ayarları](01-okul-ayarlari.md): seviyeler, paketler ve akademik yıl.

## Kurulum adımları

### Tek öğrenci
1. **Öğrenciler → Öğrenci kaydet**.
2. Ad soyad, doğum tarihi veya yaş, ders dili, **Ana sınıf seviyesi**, ülke, paket ve **Kontak hoca** bilgilerini girin. Öğrenci numarası otomatik verilir.
3. Kaydedin.


### Toplu yükleme
1. **Toplu yükle → Şablonu indir**.
2. Şablonu doldurup yükleyin. Hatalı satırlar listelenir; **Düzeltilecek satırları indir** ile düzeltip tekrar yükleyin.

### Veliyi bağlama
Öğrenci profilinde **Aile** sekmesi → **Veli ekle** (mevcut veli hesabını bağlar) veya **Davet gönder** (yeni veli hesabı açar, yalnız yönetici). Ayrıntı: [Ekip ve kullanıcılar](03-ekip-ve-kullanicilar.md).


Derse kayıt **Eğitim** sekmesinden yapılır.


## Günlük kullanım

### Yönetici / Akademik yönetici


- Listeyi dil, seviye, dönem ve durum filtreleriyle daraltın.
- **Yaş** sütunu "14 yaş" yazar. Doğum tarihi tahminiyse yanında "(tahmini)" yazar.
- **Eklenme tarihi** sütunu, öğrencinin sisteme eklendiği günü gösterir.
- Sütun başlığına tıklayın: ilk tıklama A→Z, ikinci tıklama Z→A sıralar. Aynı sıralama profildeki **Eğitim** ve **Yoklama** tablolarında da çalışır.
- Profilde **Sınıfa kaydet** ile öğrenciyi bir derse kaydedin; **Sınıflar ve kayıt geçmişi** bölümünde eski kayıtlar görünür.
- Ayrılan öğrenciyi silmeyin; durumunu **Okuldan ayrıldı** yapın. Öğrenci sınıf listelerinde, öğrenci sayılarında ve yoklamada görünmez; geçmişi raporlarda ve öğrenci sayfasında kalır. Geri dönerse durumunu **Aktif** yapın.

### Öğretmen
Öğrenci profilinde **Seviye tespiti** ekleyebilir, yoklama geçmişini görebilir. **Notlar (yalnızca personel)** alanı veliye gösterilmez.

## Sık sorunlar

**Öğrenci yoklama listesinde yok.** Öğrenci o derse kaydedilmemiş veya kayıt başlangıç tarihi ders tarihinden sonra. Profilden **Sınıfa kaydet**.

## Değişiklik geçmişi

| Tarih | Değişiklik |
|-------|------------|
| 2026-11-11 | İlk sürüm. |
| 2026-11-17 | Yaş sütunu "14 yaş" biçiminde ve tahmini doğum tarihi işaretiyle; **Eklenme tarihi** sütunu; sütun başlığına tıklayarak sıralama. |
| 2026-11-14 | Durum **Arşivlenmiş** yerine **Okuldan ayrıldı**; bu öğrenciler sınıf listesi, sayı ve yoklamada görünmez. |
