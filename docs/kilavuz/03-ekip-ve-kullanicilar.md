<!-- roller: administrator, academic_manager -->
# 03 · Ekip ve kullanıcılar

> Menüde: **Ekibimiz**
<!-- kod: `src/pages/operations.tsx` (`PeoplePage`, `AccountTools`), `netlify/functions/invite.ts`, `netlify/functions/manage-user.ts` -->

## Amaç

Personeli ve velileri portala davet etmek, rollerini vermek, şifrelerini yönetmek, ayrılanları arşivlemek ve hatalı açılmış hesapları silmek.

## Kimler kullanır

| İşlem | Yönetici | Akademik yönetici | Öğretmen | Rehberlik | Veli |
|-------|:-------:|:-----------------:|:--------:|:---------:|:----:|
| Ekip listesini görme | ✓ | ✓ | — | — | — |
| Davet etme, rol verme, arşivleme | ✓ | — | — | — | — |
| Başkasına yeni şifre belirleme / sıfırlama bağlantısı | ✓ | — | — | — | — |
| Kişiyi silme | ✓ | — | — | — | — |
| **Şifremi değiştir** (kendi şifresi) | ✓ | ✓ | ✓ | ✓ | ✓ |

## Ön koşullar

E-postayla davet için e-posta gönderimi kurulmuş olmalı ([SETUP.md](../SETUP.md)). Kullanıcı adıyla hesap açmak için e-posta gerekmez.

## Kurulum adımları

### Kişi davet etme
1. **Ekibimiz → Kişi davet et**.
2. Hesap türünü seçin:
   - **E-posta daveti**: kişiye davet e-postası gider, şifresini kendisi belirler.
   - **Kullanıcı adı ve şifre**: hesap hemen açılır, e-posta gitmez. Kullanıcı adını ve şifreyi kişiye siz iletirsiniz.
3. Ad soyad, dil ve **rolleri** seçin. Bir kişinin birden çok rolü olabilir (ör. Öğretmen + Rehberlik).
4. **Veli** rolü seçilirse **Çocukları ilişkilendir** listesinden öğrencileri işaretleyin.
5. **Davet gönder** / **Hesap oluştur**.


### Roller
| Rol | Ne yapar |
|-----|----------|
| **Yönetici** | Her şey: ayarlar, ekip, ödemeler, karne yayınlama |
| **Akademik yönetici** | Sorular, öğretmen atamaları, müfredat onayı, karne inceleme |
| **Öğretmen** | Kendi derslerinin yoklaması, değerlendirmesi, işlenen konular |
| **Rehberlik** | Rehberlik vakaları ve veli görüşmeleri |
| **Veli** | Kendi çocuğunun bilgileri ([Veli portalı](14-veli-portali.md)) |

## Günlük kullanım

Ekip listesinde **Eklenme tarihi** sütunu, kişinin sisteme eklendiği günü gösterir. Sütun başlığına tıklayın: ilk tıklama A→Z, ikinci tıklama Z→A sıralar.

### Yönetici — kişiyi düzenleme
Listede kişinin adına tıklayın. **Ekip üyesini düzenle** penceresinde ad, telefon, dil, roller ve durum değiştirilir; **Kaydet** ile kaydedilir.


### Yönetici — şifre işlemleri
Aynı pencerede **Hesap ve şifre** bölümünü açın:
- **Yeni şifre belirle**: yeni şifreyi iki kez yazın (en az 10 karakter) ve butona basın. Şifre hemen geçerli olur; kişiye özel olarak iletin. Unutulan şifreler ve kullanıcı adı hesapları için bunu kullanın.
- **Şifre sıfırlama bağlantısı gönder**: yalnız e-posta hesaplarında görünür. Kişiye şifresini kendisinin belirleyeceği bir bağlantı gider.


### Yönetici — ayrılan personel: arşivleme
**Durum → Arşivlenmiş** seçip kaydedin. Kişi giriş yapamaz ama geçmiş kayıtları (yoklama, karne…) korunur. Arşivlenenler listede varsayılan olarak gizlidir; görmek için **Arşivlenenleri göster** kutusunu işaretleyin. Geri almak için **Durum → Aktif**.

### Yönetici — hatalı / deneme hesabını silme
1. Kişiyi açın → **Kişiyi sil** bölümü → **Kişiyi sil** → onaylayın.
2. Hesabın **hiç okul kaydı yoksa** (ders, yoklama, değerlendirme, karne, ödeme, rehberlik notu, materyal) kişi ve giriş hesabı kalıcı olarak silinir. Veli bağlantıları ve taslaklar da birlikte silinir.
3. Kaydı varsa silinmez; ekranda **Bunun yerine arşivle** butonu çıkar.
4. Kendi hesabınızı ve son aktif yöneticiyi silemezsiniz.

### Şifremi değiştir (herkes)
Sağ üstteki adınıza tıklayın → **Şifremi değiştir** → mevcut şifre, yeni şifre (en az 10 karakter) ve tekrarı → **Şifreyi değiştir**.


## Sık sorunlar

**Kişi giriş yapamıyor.** Durumu **Arşivlenmiş** olabilir veya hiç rolü yoktur. Kullanıcı adı hesabıysa **Yeni şifre belirle** ile yeni şifre verin.

**"Bu kişinin okul kayıtları var" uyarısı.** Kişi ders vermiş veya kayıt girmiş; geçmiş bozulmasın diye silinmez. **Bunun yerine arşivle** kullanın.

**Davet e-postası gelmedi.** Spam klasörüne bakın; gerekirse **Şifre sıfırlama bağlantısı gönder** ile yeni bağlantı gönderin.

## Değişiklik geçmişi

| Tarih | Değişiklik |
|-------|------------|
| 2026-11-11 | İlk sürüm. Yöneticiye yeni şifre belirleme, sıfırlama bağlantısı, kişi silme; herkese **Şifremi değiştir**; arşivlenenler varsayılan gizli. |
| 2026-11-17 | Listeye **Eklenme tarihi** sütunu eklendi; sütun başlığına tıklayarak A→Z / Z→A sıralama. |
