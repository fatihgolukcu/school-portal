<!-- roller: administrator, academic_manager, teacher, guidance -->
# 10 · Rehberlik ve destek

> Menüde: **Rehberlik ve destek**
<!-- kod: `src/pages/operations.tsx` (`GuidancePage`, `GuidanceWorkflow`) -->

## Amaç

Desteğe ihtiyaç duyan öğrencileri takip etmek. Vakalar otomatik (rehberlik tetikleyicileri) veya elle (**İstek oluştur**) açılır ve adım adım ilerler.

**Destek adımları:** Yeni istek → İnceleme → Plan ve veli görüşmesi → Takip → Kapandı (Çözüldü / Çözülmeden kapatıldı / Yönetim incelemesi).


## Kimler kullanır

| İşlem | Yönetici | Akademik yönetici | Öğretmen | Rehberlik | Veli |
|-------|:-------:|:-----------------:|:--------:|:---------:|:----:|
| **İstek oluştur** | ✓ | ✓ | ✓ | ✓ | — |
| Vakayı üstlenme, plan, kapatma | ✓ | ✓ | — | ✓ | — |
| Vakayı başkasına atama | ✓ | ✓ | — | — | — |
| Paylaşılan not ekleme | ✓ | ✓ | ✓ | ✓ | — |
| Paylaşılan adımları görme | ✓ | ✓ | ✓ | ✓ | Kendi çocuğu |

## Ön koşullar

Otomatik uyarılar için [Sorular ve kurallar → Rehberlik tetikleyicileri](02-sorular-ve-kurallar.md) tanımlı ve yayınlanmış olmalı. Rehberlik rolündeki kişiler [Ekibimiz](03-ekip-ve-kullanicilar.md)de olmalı.

## Kurulum adımları

Tetikleyici kurallarını kontrol edin (ör. ardışık devamsızlık, düşük katılım).

## Günlük kullanım

### Öğretmen
Endişe duyduğunuz öğrenci için **İstek oluştur**: kısa gerekçe ve önem (kırmızı / turuncu / sarı).

### Rehberlik
1. Kuyruktaki atanmamış vakayı üstlenin.
2. **Not veya veli bilgilendirmesi ekle** ile görüşmeleri ve ortak kararları kaydedin. *Paylaşılan* notlar velinin portalında görünür, özel notlar görünmez.
3. Takip tarihini girin; sonuçlandığında vakayı kapatın.

## Sık sorunlar

**Plan adımına geçemiyorum.** Önce en az bir gelişim adımı (**Ortak kararlar**) kaydedin ve takip tarihi girin.

## Değişiklik geçmişi

| Tarih | Değişiklik |
|-------|------------|
| 2026-11-11 | İlk sürüm. |
