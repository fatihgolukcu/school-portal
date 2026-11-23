# School Portal Portal — Kullanım ve Kurulum Kılavuzu

> **Portalda:** Bu sayfalar portalın içinde de görünür: menüde **Kullanım kılavuzu** veya sol alttaki **Yardım ister misiniz?** (açık olan ekranın sayfasını açar). Herkes yalnız kendi rolünün sayfalarını görür. Bu README ve `_SABLON.md` portalda gösterilmez.

Bu kılavuz portalı **modül modül** anlatır: her modülün nasıl kurulduğu, günlük nasıl kullanıldığı ve **hangi rolün ne yaptığı**. Ekran ve buton adları Türkçe arayüzde göründüğü gibi **kalın** yazılmıştır.

> Yeni bir okul mu kuruyorsunuz? Önce [İlk kurulum sırası](00-ilk-kurulum.md) sayfasını izleyin.

## Modüller

| # | Modül | Menüde | Kimler görür |
|---|-------|--------|--------------|
| 00 | [İlk kurulum sırası](00-ilk-kurulum.md) | — | Yönetici |
| 01 | [Okul ayarları](01-okul-ayarlari.md) | **Okul ayarları** | Yönetici |
| 02 | [Sorular ve kurallar](02-sorular-ve-kurallar.md) | **Sorular ve kurallar** | Yönetici, Akademik yönetici |
| 03 | [Ekip ve kullanıcılar](03-ekip-ve-kullanicilar.md) | **Ekibimiz** | Yönetici, Akademik yönetici |
| 04 | [Öğrenciler ve veliler](04-ogrenciler-ve-veliler.md) | **Öğrenciler** | Tüm personel |
| 05 | [Sınıflar ve dersler](05-siniflar-ve-dersler.md) | **Sınıflar ve dersler** | Tüm personel |
| 06 | [Yoklama](06-yoklama.md) | **Yoklama** | Yönetici, Akademik yönetici, Öğretmen |
| 07 | [Müfredat (işlenen konular)](07-mufredat.md) | **Müfredat** | Yönetici, Akademik yönetici, Öğretmen |
| 08 | [Değerlendirmeler](08-degerlendirmeler.md) | **Değerlendirmeler** | Yönetici, Akademik yönetici, Öğretmen |
| 09 | [Karneler](09-karneler.md) | **Karneler** | Herkes (veli yalnız yayınlananı) |
| 10 | [Rehberlik ve destek](10-rehberlik.md) | **Rehberlik ve destek** | Personel; veli paylaşılanları |
| 11 | [Ödemeler](11-odemeler.md) | **Ödemeler** | Yönetici, Veli |
| 12 | [Ders materyalleri](12-ders-materyalleri.md) | **Ders materyalleri** | Yönetici, Akademik yönetici, Öğretmen, Rehberlik, Veli |
| 13 | [Genel bakış ve ders çalışma alanı](13-genel-bakis-ve-ders-alani.md) | **Genel bakış**, **Ders çalışma alanı** | Herkes / öğretmenler |
| 14 | [Veli portalı](14-veli-portali.md) | Veli girişi | Veli |
| 15 | [Kontrol ve raporlar](15-kontrol-ve-raporlar.md) | **Kontrol ve raporlar** | Yönetici, Akademik yönetici, Öğretmen (yalnız kendi dersleri) |

## Rol bazında yapılacaklar

### Yönetici
1. Okulu kurar: [Okul ayarları](01-okul-ayarlari.md) → [Sorular ve kurallar](02-sorular-ve-kurallar.md).
2. Ekibi davet eder, rolleri verir, şifre belirler ve hatalı hesapları siler: [Ekip ve kullanıcılar](03-ekip-ve-kullanicilar.md).
3. Öğrencileri ve velileri kaydeder: [Öğrenciler ve veliler](04-ogrenciler-ve-veliler.md).
4. Öğretmen atar, öğrencileri derslere kaydeder: [Sınıflar ve dersler](05-siniflar-ve-dersler.md).
5. Karneleri inceler ve yayınlar: [Karneler](09-karneler.md).
6. Aidat ve ödemeleri yönetir: [Ödemeler](11-odemeler.md).
7. Eksikleri ve raporları izler: [Kontrol ve raporlar](15-kontrol-ve-raporlar.md).

### Akademik yönetici
1. Değerlendirme sorularını ve not hesaplamasını düzenler: [Sorular ve kurallar](02-sorular-ve-kurallar.md).
2. Öğretmen atamalarını ve ders planlarını takip eder: [Sınıflar ve dersler](05-siniflar-ve-dersler.md).
3. Müfredat onaylarını verir: [Müfredat](07-mufredat.md).
4. Karneleri inceler: [Karneler](09-karneler.md). Rehberlik vakalarını yönetir: [Rehberlik](10-rehberlik.md).
5. Eksikleri ve raporları izler: [Kontrol ve raporlar](15-kontrol-ve-raporlar.md).

### Öğretmen
1. Her ders: [Yoklama](06-yoklama.md) → [İşlenen konular](07-mufredat.md). Kısa rehber: [TEACHER_QUICK_GUIDE.md](../TEACHER_QUICK_GUIDE.md).
2. Dönem sonu: [Değerlendirmeler](08-degerlendirmeler.md).
3. Gerektiğinde: [Rehberlik isteği](10-rehberlik.md), [Ders materyalleri](12-ders-materyalleri.md).
4. Kendi derslerinin eksiklerini görür: [Kontrol ve raporlar](15-kontrol-ve-raporlar.md).
5. Kendi şifresini değiştirir: [Şifremi değiştir](03-ekip-ve-kullanicilar.md#şifremi-değiştir-herkes).

### Rehberlik
1. Vaka kuyruğunu takip eder, plan ve veli görüşmesini yürütür: [Rehberlik ve destek](10-rehberlik.md).

### Veli
1. Çocuğunun derslerini, karnelerini, paylaşılan rehberlik adımlarını ve ödemelerini görür: [Veli portalı](14-veli-portali.md).

## Bu kılavuzu güncelleme

Kılavuz, yeni özellik geldikçe **tek bir sayfayı** değiştirerek güncel kalacak şekilde düzenlenmiştir.

1. **Özellik hangi modüle ait?** İlgili `NN-modul.md` dosyasını açın. Yeni bir modülse [_SABLON.md](_SABLON.md) dosyasını kopyalayıp sıradaki numarayla adlandırın ve yukarıdaki tabloya ekleyin.
2. **Başlıkları değiştirmeyin.** Her sayfa aynı başlıkları kullanır: *Amaç · Kimler kullanır · Ön koşullar · Kurulum adımları · Günlük kullanım · Sık sorunlar · Değişiklik geçmişi*. Bilgiyi doğru başlığın altına yazın.
3. **Kim ne yapabilir değiştiyse** sayfadaki *Kimler kullanır* tablosunu ve bu dosyadaki *Rol bazında yapılacaklar* listesini güncelleyin.
4. **Buton adlarını arayüzden birebir kopyalayın** (kalın yazın). Arayüzde bir metin değişirse kılavuzda da arayın: `grep -rn "Eski buton adı" docs/kilavuz`.
5. Sayfanın sonundaki **Değişiklik geçmişi** tablosuna bir satır ekleyin (tarih · ne değişti).
6. **Rol satırı:** her sayfanın ilk satırı `<!-- roller: administrator, teacher -->` gibidir ve portalda sayfayı kimin göreceğini belirler. Roller: `administrator`, `academic_manager`, `teacher`, `guidance`, `parent`.
7. **Geliştirici notları** (`<!-- kod: … -->` gibi HTML yorumları) portalda gizlenir.
8. **Yeni ekran / yeni sayfa:** portaldaki **Yardım ister misiniz?** butonunun doğru sayfayı açması için `src/pages/guide.tsx` içindeki `guidePageFor` listesine `ekran → sayfa` satırı ekleyin.

## Ekran görüntüleri

Resimler `img/` klasöründedir ve **örnek okuldan** (gerçek öğrenci verisi olmadan) otomatik çekilir.

1. Geliştirme sunucusunu başlatın: `npm run dev`.
2. Başka bir terminalde: `npm run guide:screenshots` (tümü) veya `npm run guide:screenshots -- yoklama ekip-davet` (yalnız seçilenler).

Microsoft Edge veya Chrome gerekir; başka paket gerekmez. Ekran değiştiğinde komutu tekrar çalıştırmak yeterlidir.
