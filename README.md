# Ziraat Bankası 2026 Uzman Yardımcılığı — Kişisel Sınav Simülatörü

> ⚠️ **Gayriresmî proje.** T.C. Ziraat Bankası A.Ş. ile hiçbir bağlantısı yoktur. Sorular
> özgün olarak hazırlanmıştır; resmî sınav sorusu değildir. Ücretsiz ve açık kaynaktır (MIT).

Tek kullanıcılı, **tamamen yerel** çalışan bir sınav hazırlık sistemi. Login, üyelik,
abonelik, rol sistemi yoktur. Bütün veriler bu bilgisayardaki tek bir SQLite dosyasında
durur.

- Resmî 2026 sınav formatını birebir simüle eder (140 soru / 160 dakika / 3 bölüm / barajlar)
- Geçmiş performansı hatırlar, yanlışları analiz eder, zayıf konuları tespit eder
- Daha önce **doğru cevapladığın soruları tekrar tekrar sormaz**
- İsteğe bağlı olarak web araştırmasıyla **yeni ve özgün sorular üretir**

---

## İçindekiler

1. [Sınav formatı ve kaynağı](#1-sınav-formatı-ve-kaynağı)
2. [Kurulum](#2-kurulum)
3. [Çalıştırma](#3-çalıştırma)
4. [Veritabanı nerede?](#4-veritabanı-nerede)
5. [Yedekleme ve geri yükleme](#5-yedekleme-ve-geri-yükleme)
6. [Soru üretimi nasıl çalışır?](#6-soru-üretimi-nasıl-çalışır)
6b. [Kaynak hiyerarşisi, çıkmış sorular ve stil profili](#6b-kaynak-hiyerarşisi-çıkmış-sorular-ve-stil-profili)
7. [API anahtarı nasıl eklenir?](#7-api-anahtarı-nasıl-eklenir)
8. [Soru seçimi nasıl çalışır?](#8-soru-seçimi-nasıl-çalışır)
9. [Ustalık (mastery) nasıl hesaplanır?](#9-ustalık-mastery-nasıl-hesaplanır)
10. [Hazırlık (readiness) skoru nasıl hesaplanır?](#10-hazırlık-readiness-skoru-nasıl-hesaplanır)
11. [Puanlama ve baraj kuralı](#11-puanlama-ve-baraj-kuralı)
12. [Mimari](#12-mimari)
13. [Testler](#13-testler)
14. [Varsayımlar ve bilinen sınırlar](#14-varsayımlar-ve-bilinen-sınırlar)

---

## 1. Sınav formatı ve kaynağı

**Birincil kaynak:** T.C. Ziraat Bankası A.Ş. — *"Uzman Yardımcısı İşe Alım Sınavı Başvuru
Koşulları"*, 23.09.2026 tarihli resmî ilan
([PDF](https://www.ziraatbank.com.tr/tr/Bankamiz-ZB/insan-kaynaklari/Documents/zb-uzman-yard%c4%b1mcisi-23092026.pdf)).

| | Soru | Baraj |
|---|---|---|
| **1. Bölüm** — Genel Kültür (20) + Genel Yetenek (40) | 60 | %60 (≥ 36 doğru) |
| **2. Bölüm** — İngilizce | 40 | %60 (≥ 24 doğru) |
| **3. Bölüm** — Bilgisayar, Bilişim ve Yapay Zekâ | 40 | %50 (≥ 20 doğru) |
| **TOPLAM** | **140** | ayrıca toplam puan ≥ **60** |

Süre: **160 dakika**, tek oturum. Sınav tarihi: **24 Ekim 2026, 14:00** (Ayarlar'dan
değiştirilebilir).

> **Not:** İlk talep metnindeki dağılım (Genel Kültür 60 + Genel Yetenek 20 = 80) resmî
> ilanla uyuşmuyordu ve kendi içinde de tutarsızdı (80+40+40 = 160 ≠ 140). Uygulama resmî
> ilandaki **60 (GK 20 + GY 40) / 40 / 40** dağılımını kullanır.

3. Bölüm'ün resmî 8 konu başlığı (ilan Ek-1):

1. Algoritma ve Programlama Mantığı
2. Veri Yapıları ve Problem Çözme
3. Veri Tabanı ve SQL
4. Yazılım Mühendisliği ve Sistem Geliştirme
5. Bilgisayar Ağları ve İşletim Sistemleri
6. Bilgi Güvenliği Temelleri
7. Veri Analitiği, Yapay Zekâ ve Makine Öğrenmesi Temelleri
8. Sistem Analizi ve Dijital Teknoloji Uygulamaları

Kaynakların tam listesi ve erişim tarihleri uygulama içindeki **Kaynaklar** sayfasındadır.
Resmî olan bilgiler ile türetilmiş varsayımlar orada açıkça ayrılmıştır.

---

## 2. Kurulum

**Gereksinim:** Node.js **22.5 veya üzeri** (SQLite için yerleşik `node:sqlite` modülü
kullanılır; native derleme, Python veya Visual Studio Build Tools gerekmez).

```bash
cd ziraat-sinav-simulator
npm install
npm run db:migrate   # veritabanı şemasını oluşturur
npm run db:seed      # 165 soruluk başlangıç bankasını yükler
```

`db:seed` idempotenttir — tekrar çalıştırmak kopya soru eklemez.

Başlangıç bankası elle yazılmış ve doğrulanmıştır; **API anahtarı olmadan da tam bir
140 soruluk sınav çözülebilir.**

---

## 3. Çalıştırma

```bash
npm run dev     # geliştirme sunucusu — http://localhost:3000
```

Günlük kullanım için üretim derlemesi daha hızlıdır:

```bash
npm run build
npm start
```

### Sayfalar

| Sayfa | Ne yapar |
|---|---|
| **Dashboard** | Hazırlık skoru, sınava kalan gün, gelişim grafiği, günlük çalışma önerisi |
| **Gerçek Sınav** | 140 soruluk resmî simülasyon; gerçek zamanlı sayaç, otomatik teslim |
| **Çalışma** | Bölüm / özel / zayıf konu / zayıflıklarımı çalış / eski yanlışları tekrar çöz / **çıkmış sorular** |
| **Yanlışlarım** | Yanlış soru defteri + **yanlış yapılan kavramlar** (kavramdan yeni soru üretme) |
| **Soru Bankası** | Soruları görüntüle, Onaylı/Beklemede/Reddedildi filtresi, kalite skoru, yeni soru üret |
| **Çıkmış Sorular** | PDF/JSON/TXT içe aktarma, insan onay kuyruğu, Exam Style Profile |
| **Sınav Geçmişi** | Tüm oturumlar; iki sınavı karşılaştırma |
| **Analiz** | Trendler, baraj durumu, alt konu ustalığı, süre kullanımı |
| **Kaynaklar** | A–E güven seviyelerine göre kaynaklar, yıl/bölüm kırılımı, açık varsayımlar |
| **Ayarlar** | Sınav tarihi/süresi/barajları, yedekleme, dışa/içe aktarım |

### İngilizce bölümünde açıklamalar

İngilizce sorularının açıklaması İngilizce yazılır (dil sorusunu kendi dilinde
tartışmak öğrenme açısından daha doğru). Her açıklamanın **Türkçe karşılığı** ayrıca
tutulur ve arayüzde İngilizce metnin hemen **altında** "Türkçe açıklama" başlığıyla
gösterilir — yanlış defterinde, sınav sonucu incelemesinde ve soru bankasında.

- Veritabanı alanı: `questions.explanation_tr` (migration 3). Türkçe yazılan
  bölümlerde (Genel Kültür/Yetenek, Teknik) boş kalır, ikinci blok hiç basılmaz.
- Üretimde `explanationTr` İngilizce bölüm için **zorunlu** alandır; gelmezse soru
  atılmaz, elle tamamlanmak üzere `review_needed` olur.
- Çeviri soruları (EN-TR / TR-EN) zaten Türkçe açıklandığı için ikinci blok almaz.

### Sınav ekranı kısayolları

`A` `B` `C` `D` şık seçimi · `←` `→` gezinme · `F` işaretle.
Seçili şıkka tekrar tıklamak cevabı boşaltır.

### Sayaç nasıl çalışır?

Sınav başlarken `exam_sessions.deadline_at` veritabanına yazılır. Kalan süre **her zaman
sunucu saatine göre** bu değerden hesaplanır:

- Sayfayı yenilesen bile süre sıfırlanmaz.
- Sekmeyi kapatıp sonra açsan bile süre işlemiş olur.
- Süre dolduğunda sınav **otomatik teslim edilir**. Tarayıcı kapalıysa bile, uygulamayı
  bir sonraki açışında `autoSubmitAllExpired()` süresi dolmuş oturumları kapatır.

İstemci sayacı her 20 saniyede bir sunucuyla yeniden hizalanır; cevaplar 4 saniyede bir
ve her soru geçişinde kaydedilir (sayfa kapanırken `sendBeacon` ile son bir kez daha).

---

## 4. Veritabanı nerede?

```
ziraat-sinav-simulator/data/ziraat.db
```

Tek dosyadır, kopyalanarak taşınabilir. Yeri değiştirmek için:

```bash
# .env.local
ZSS_DB_PATH=D:/yedek/ziraat.db
```

Tablolar: `questions`, `exam_sessions`, `exam_session_questions`, `exam_answers`,
`mistake_history`, `topic_mastery`, `sources`, `settings`, `generation_log`.

---

## 5. Yedekleme ve geri yükleme

**Ayarlar → Veri Yönetimi** üzerinden iki bağımsız yol:

| Yöntem | Ne verir | Geri yükleme |
|---|---|---|
| **Veritabanını yedekle** | `backups/ziraat-<tarih>.db` — birebir kopya | Dosyayı `data/ziraat.db` üzerine kopyala |
| **JSON olarak dışa aktar** | İnsan okunabilir, taşınabilir | **JSON içe aktar** (birleştir / değiştir) |

Komut satırından:

```bash
npm run db:backup
```

İçe aktarım `INSERT OR IGNORE` kullanır: aynı dosyayı iki kez yüklemek kopya oluşturmaz.
`replace` modu ayarlar hariç mevcut veriyi temizleyip yeniden yükler.

> `.gitignore` içinde `data/` ve `backups/` hariç tutulmuştur — sınav geçmişin yanlışlıkla
> bir depoya gitmez.

---

## 6. Soru üretimi nasıl çalışır?

Soru bankası sabit değildir. **Soru Bankası** sayfasından üretim çalıştırılabilir.
Hedef basit bir "AI soru üreticisi" değil, şu zinciri işleten bir hazırlık motorudur:

```
2026 RESMÎ MÜFREDAT + ÇIKMIŞ ZİRAAT SORULARI + BENZER BANKA SINAVLARI
        ↓
EXAM STYLE MODEL  (ölçülen stil profili)
        ↓
YÜKSEK KALİTELİ ÖZGÜN SORULAR  (üret → bağımsız çöz → müfredat denetimi → skorla)
        ↓
KULLANICI PERFORMANSI  (mastery + kavram bazlı yanlış takibi)
        ↓
ADAPTİF ÇALIŞMA
```

Pipeline beş aşamalıdır:

```
1. ARAŞTIR   → Anthropic'in sunucu taraflı `web_search` aracıyla gerçek web araştırması.
               Öncelik: resmî dokümantasyon, standart kuruluşları (RFC/ISO/W3C/NIST),
               üniversite kaynakları. Telifli sınav soruları kopyalanmaz; yalnızca
               kavram, tanım ve olgu toplanır. Kaynak URL'leri kaydedilir.

2. ÜRET      → Araştırma özetine DAYANARAK özgün çoktan seçmeli sorular üretilir
               (yapılandırılmış JSON çıktı, şema garantili). Prompt'a şunlar gömülür:
               resmî 2026 konu başlığı + müfredat otoritesi uyarısı, alt konu listesi,
               EXAM STYLE PROFILE (ölçülen uzunluk/tip/zorluk hedefleri), geçmiş
               sorulardan STİL ÖRNEKLERİ ("kopyalama, aynı beceriyi farklı senaryoyla
               ölç" talimatıyla), bankada zaten ölçülen kavramlar ve kullanıcının o
               kategorideki ustalık durumu.

3. DOĞRULA   → BAĞIMSIZ bir denetim çağrısı. Denetçi, üreticinin hangi şıkkı doğru
               işaretlediğini ve açıklamasını GÖRMEZ; soruyu kendisi çözer.
               Cevaplar uyuşmazsa soru REDDEDİLİR.

4. DENETLE   → İKİNCİ doğrulama aşaması. Bu denetçi doğru cevabı ve açıklamayı GÖRÜR;
               amacı çözmek değil sınava uygunluğu ölçmek: 2026 müfredatı kapsamında mı,
               çeldiriciler makul mü, zorluk etiketi gerçekçi mi, açıklama işaretlenen
               cevapla tutarlı mı, bilgi eskimiş mi. Müfredat dışı soru REDDEDİLİR.

5. SKORLA/ELE → Deterministik kod kontrolleri (aynı iki şık, "hepsi/hiçbiri", yetersiz
               açıklama, uzunluk ipucu, cevap sızıntısı) + tekrar kontrolü +
               kalite skoru (0-100).
```

Sonuç her soru için bir `quality_status` **ve** bir `quality_score` değeridir:

| Durum | Anlamı |
|---|---|
| `verified` (arayüzde **Onaylı**) | Tüm kontrollerden temiz geçti — **yalnızca bunlar sınava girer** |
| `review_needed` (arayüzde **Beklemede**) | Küçük şüphe var — bankada kalır, sınava alınmaz |
| `rejected` (arayüzde **Reddedildi**) | Ciddi kusur — kullanılmaz |

**Kalite skoru** ayrı bir kapıdır: `verified` olsa bile skoru **70**'in altındaki soru
gerçek sınav havuzuna girmez. LLM doğrulaması yapılmamış sorular (elle yazılmış başlangıç
bankası, içe aktarılan çıkmış sorular) tavan olarak **85** alır — doğrulanmamış bir soru
hiçbir zaman doğrulanmış bir sorudan yüksek puan alamaz.

### Tekrar (duplicate) engeli

İki seviye çalışır:

1. **Birebir** — normalize edilmiş metnin SHA-256 özeti. Veritabanında `UNIQUE`.
   Şık sırası değiştirilmiş aynı soru da yakalanır.
2. **Anlamsal** — token imzası benzerliği (Jaccard). Aynı kategori içinde:
   - benzerlik ≥ 0.60 → tekrar
   - aynı alt konu + **aynı doğru cevap metni** + benzerlik ≥ 0.30 → kavram tekrarı

Böylece şu ikisi aynı soru sayılır:

> "What protocol resolves domain names to IP addresses?"
> "Which network service translates domain names into IP addresses?"

İmza yalnızca soru kökünü değil **şıkları da** içerir ve sayılar korunur — aksi hâlde
"Aşağıdaki cümlelerin hangisinde **yazım** yanlışı vardır?" ile "... **noktalama**
yanlışı vardır?" veya iki farklı örüntü sorusu yanlışlıkla tekrar sayılıyordu.

### Anlamsal tekrarın sınırı

İmza iki granülarite ile karşılaştırılır: normal (7 karakter gövdeleme) ve **kabalaştırılmış**
(5 karakter). Türkçe çekim ekleri yüzünden "katman**da**" → `katmand` ve "katman**ıyla**" →
`katmani` ayrı token oluyordu; 5 karaktere kırpınca ikisi de `katma` olur. Kavram tekrarı
kontrolü ayrıca **yalnızca soru kökü** üzerinden de ölçülür (çeldiriciler değişmiş olabilir),
ama bu yalnızca *aynı alt konu + aynı doğru cevap* koşulu sağlandığında devreye girer.
Böylece şunlar da aynı soru sayılır:

> "TCP hangi katmanda çalışır?"
> "TCP protokolü OSI modelinin hangi katmanıyla ilişkilidir?"

### Eşik ve plan

Her kategori için bir doluluk eşiği vardır (teknik kategoriler 40, genel/İngilizce 80
doğrulanmış soru). Eşiğin altındaki kategoriler **Soru Bankası** sayfasında listelenir ve
"eksiği en büyük kategoriden başla" mantığıyla bir üretim planı çıkarılır.

**Sınav başlatmak üretimi beklemez.** Sınav yalnızca mevcut `verified` sorulardan kurulur;
soru yetersizse uygulama bunu açıkça söyler ve eksiği kategori kategori gösterir. Uydurma
soru üretilmez.

---

## 6b. Kaynak hiyerarşisi, çıkmış sorular ve stil profili

### Kaynak güven seviyeleri (A–E)

Her soru ve her referans bir güven seviyesi taşır. **Kaynağı bilinmeyen hiçbir şey "resmî"
ya da "doğrulanmış çıkmış soru" olarak işaretlenmez.**

| Seviye | Ne | Çıkmış soru olarak sunulur mu? |
|---|---|---|
| **A** | Resmî ilan / soru kitapçığı / cevap anahtarı (Ziraat, ÖSYM, İstanbul Ü.) | Evet |
| **B** | Çıkmış soru arşivi (kaynağı belirtilmiş derleme) | Evet |
| **C** | Aday hatırlaması (forum, video, sosyal medya) | Hayır — "hatırlanan" olarak etiketlenir |
| **D** | Benzer banka sınavları (VakıfBank, Halkbank vb.) | Hayır — yalnızca stil referansı |
| **E** | Bu uygulamanın ürettiği özgün sorular | Hayır |

Stil profilinde her seviyenin ağırlığı farklıdır (A = 1.0 … D = 0.35). **Kaynaklar** sayfası
bu beş seviyeyi ayrı ayrı, yıl ve bölüm kırılımıyla gösterir.

### Çıkmış soruları içe aktarma

**Çıkmış Sorular** sayfasından PDF / JSON / TXT yüklenir. Boru hattı:

```
ham kaynak → ayrıştır → soru tespit → bölüm sınıflandır → konu sınıflandır
→ cevap tespit (varsa) → doğrula → tekrar kontrolü → İNSAN ONAY KUYRUĞU → onaylı set
```

- **Cevap uydurulmaz.** Cevap anahtarı yoksa `correctIndex = null`, `answerConfidence = 0`
  olarak saklanır ve o soru soru bankasına **terfi edemez** — önce doğru şıkkı elle
  işaretlemen gerekir.
- **Konu sınıflandırma** deterministiktir (API anahtarı gerekmez). Nadir terimlere ağırlık
  verilir, böylece "sistem" / "işlem" gibi müfredatın her yerinde geçen sözcükler soruyu
  yanlış konuya çekmez. Bağlanamayan soru **tahmin edilmez**, boş bırakılır.
- **PDF**: gömülü metin çıkarılır (harici bağımlılık yok). Taranmış (görüntü) PDF'ten metin
  çıkmaz — bu durum sessizce geçiştirilmez, açıkça uyarılır.
- **5 şık → 4 şık**: uygulama formatı resmî 2026 formatına sadık kalır (4 şık). Eski
  sınavlardaki fazla şık terfi sırasında çıkarılır ve bu **not düşülür**; orijinal hâli
  referans kaydında bozulmadan durur.

### Çıkmış sorular gerçek sınava karışmaz

Onaylanan sorular soru bankasına `historical = 1` ile girer:

- **Gerçek Sınav Simülasyonu** ve normal çalışma havuzlarına **girmez**.
- Yalnızca **Çalışma → Çıkmış Sorular** modunda sorulur; kaynağı ve yılı gösterilir.
- İstisna: daha önce yanlış yaptıysan **Eski Yanlışları Tekrar Çöz** modunda çıkabilir.

### Exam Style Profile

Referans sorulardan ölçülen stil hedefleri (`style_profiles` tablosu, bölüm bazlı):
ortalama soru kökü ve şık uzunluğu, soru tipi dağılımı (kavram / uygulama / kod okuma /
SQL / tanım / senaryo / hesaplama / sözel muhakeme / tablo-grafik / dil bilgisi / kelime /
okuduğunu anlama), olumsuz soru ("hangisi değildir") oranı, zorluk dağılımı, tahmini çözüm
süresi ve alt konu dağılımı.

**Az örnekten kesin istatistik çıkarılmaz.** Her profil `sampleSize` ve `confidence` taşır;
örneklem küçükken ölçüm varsayılan (varsayım) profille **harmanlanır** ve bu oran hem
arayüzde hem üretim promptunda açıkça yazılır ("bu değerlerin %20'si ölçümden, %80'i
varsayımdan gelir"). Referans veri hiç yoksa profil tamamen varsayımdır ve öyle etiketlenir.

### Yanlış yapılan kavramdan yeni soru

Her soru bir **kavram** etiketi taşır ("JOIN türleri — left outer" gibi). Yanlış yapıldığında
soru değil **kavram** kaydedilir. **Yanlışlarım** sayfasındaki "Yanlış Yaptığın Kavramlar"
tablosundan tek tıkla o kavramı farklı senaryoyla ölçen **yeni** sorular üretilir; aynı soru
tekrar sorulmaz. Birebir eski soruyu çözmek istersen **Eski Yanlışları Tekrar Çöz** modu
bunun için durur.

---

## 7. API anahtarı nasıl eklenir?

Soru üretimi **opsiyoneldir**. Anahtar yoksa uygulama bunu açıkça bildirir ve mevcut soru
bankasıyla normal şekilde çalışmaya devam eder — web araştırması **taklit edilmez**.

Proje kökünde `.env.local` oluştur:

```bash
ANTHROPIC_API_KEY=sk-ant-...
ZSS_GENERATION_MODEL=claude-opus-5   # opsiyonel, varsayılan budur
```

Sunucuyu yeniden başlat. Anahtar yalnızca ortam değişkeninden okunur; **hiçbir zaman
kaynak koda veya veritabanına yazılmaz** (`.env.local` zaten `.gitignore` içindedir).

Komut satırından üretim:

```bash
npm run generate            # eksiği en büyük 3 kategori için otomatik plan
npm run generate -- --help  # seçenekler
```

---

## 8. Soru seçimi nasıl çalışır?

Amaç: **cevabı değil konuyu öğrenmek.** Her aday soru puanlanır:

```
skor = 1.0
     + 3.0 × (hiç sorulmadıysa 1)
     + 2.2 × zayıflık            (zayıflık = (100 − ustalık) / 100)
     + 1.8 × yanlış yoğunluğu    (o alt konudaki son 30 gündeki yanlışlar)
     + 1.0 × bayatlık            (son sorulmasından bu yana geçen süre, 30 günde dolar)
     − 2.6 × bilinirlik          (doğru bilme oranı × örnek güveni)
```

Öncelik sırası doğal olarak şu hâle gelir:

1. Hiç görülmemiş sorular
2. Zayıf konulardan sorular
3. Geçmişte yanlış yapılan **kavramlardan** sorular
4. Uzun süredir görülmemiş eski sorular
5. …ve en sonda: **daha önce doğru cevaplanmış sorular**

Seçim yapılırken alt konu çeşitliliği korunur (önce her alt konudan en iyi soru, sonra
ikinci tur). Skorlara küçük bir rastgelelik çarpanı uygulanır; böylece sıralama korunur
ama her sınav birebir aynı olmaz.

**Adaptif ağırlık resmî yapıyı bozmaz.** Gerçek sınav simülasyonunda kategori kotaları
resmî blueprint'ten gelir ve değişmez; adaptif ağırlık yalnızca bölüm **içindeki** konu
seçimini etkiler.

### "Zayıflıklarımı Çalış" ile "Eski Yanlışları Tekrar Çöz" farkı

Bunlar bilerek ayrı iki moddur:

- **Zayıflıklarımı Çalış** → yanlış yaptığın **konulardan yeni** sorular. Aynı soruların
  kendisi gelmez. Amaç cevabı ezberlemek değil konuyu öğrenmek.
- **Eski Yanlışları Tekrar Çöz** → gerçekten yanlış yaptığın **aynı sorular**.

Bir soruyu sonradan doğru çözsen bile eski yanlış kaydı **silinmez**, yalnızca "çözüldü"
olarak işaretlenir — geçmiş korunur.

---

## 9. Ustalık (mastery) nasıl hesaplanır?

Her `(kategori, alt konu)` çifti için 0–100 arası bir skor tutulur. İki bileşen vardır:

**1) EWMA — son cevaplar daha ağır**

```
ewma' = ewma + α × (sonuç − ewma)          sonuç = doğru ? 1 : 0
```

α asimetriktir ve zorluğa göre ölçeklenir:

| Durum | α |
|---|---|
| Doğru cevap | 0.22 |
| Yanlış cevap | 0.35 (daha hızlı — bilmediğin konu daha güçlü sinyaldir) |
| Zor + doğru, ya da kolay + yanlış | × 1.3 (daha bilgilendirici) |
| Kolay + doğru, ya da zor + yanlış | × 0.8 (daha az bilgilendirici) |
| Boş bırakma | × 0.7 (yanlıştan daha yumuşak) |

**2) Güven — örnek büyüklüğü**

```
güven   = n / (n + 5)
ustalık = 100 × (güven × ewma + (1 − güven) × 0.5)
```

Az denemede skor 50'ye (bilgisizlik öncülü) çekilir. Bu sayede **tek bir doğru cevap
ustalığı 100 yapamaz**:

> Hiç denenmemiş bir konuda ilk (orta zorluk) doğru cevap:
> ewma 0.50 → 0.61, güven 1/6 = 0.167
> ustalık = 100 × (0.167 × 0.61 + 0.833 × 0.50) = **51.8**

Bantlar: `< 55` zayıf · `55–70` orta · `70–85` iyi · `≥ 85` güçlü.

Algoritma deterministiktir; `explainMastery()` her skorun gerekçesini metin olarak üretir
ve arayüzde gösterilir.

---

## 10. Hazırlık (readiness) skoru nasıl hesaplanır?

0–100 arası, altı bileşenin **ağırlıklı ortalaması**. Rastgele hiçbir şey yoktur; her
bileşen gerekçesiyle birlikte Dashboard ve Analiz sayfalarında gösterilir.

| # | Bileşen | Ağırlık | Nasıl |
|---|---|---|---|
| 1 | **Baraj Güvenliği** | %35 | Her bölümün barajına göre konumu; `0.7 × en zayıf + 0.3 × ortalama` |
| 2 | **Güncel Puan Seviyesi** | %25 | Son 3 sınavın ortalaması, 60 barajına göre |
| 3 | **Konu Ustalığı** | %20 | Alt konu ustalıklarının deneme sayısıyla ağırlıklı ortalaması |
| 4 | **Trend** | %10 | Son 5 sınavın puan eğimi (en küçük kareler) |
| 5 | **İstikrar** | %5 | Son 5 sınavın standart sapması (düşük sapma = yüksek puan) |
| 6 | **Zaman Yönetimi** | %5 | Son sınavın süre kullanımı değerlendirmesi |

Baraj güvenliği hesabı, bölüm başına:

```
marj  = doğruluk − gereken oran           (örn. 0.68 − 0.60 = +0.08)
değer = clamp(50 + marj × 250, 0, 100)    (+0.20 marj → 100, −0.20 → 0)
```

**Veri yoksa uydurulmaz:** hesaplanamayan bileşenler dışarıda bırakılır ve kalan
ağırlıklar yeniden normalize edilir. Hiç gerçek sınav yoksa skor yalnızca konu
ustalığından türetilir ve `sampleSize = 0` olarak raporlanır; arayüz "yeterli veri yok"
uyarısı gösterir.

---

## 11. Puanlama ve baraj kuralı

```
puan = (doğru × 1 − yanlış × ceza) / toplam × 100        ceza varsayılan = 0
```

Sonuç **PASS** ise ve yalnızca ise:

```
her bölümün barajı ayrı ayrı tutuyor   VE   toplam puan ≥ 60
```

Bir bölüm barajı tutmazsa toplam puan yüksek olsa bile sonuç **FAIL**'dir ve sonuç
ekranında nedeni açıkça yazılır:

```
GENEL      52 / 60   %86.7   PASS
İNGİLİZCE  22 / 40   %55.0   FAIL   ← gereken: en az 24 doğru (%60)
TEKNİK     31 / 40   %77.5   PASS
Toplam puan 75 — fakat İngilizce barajı tutmadı → FAIL
```

---

## 12. Mimari

```
src/
  config/            Merkezî sınav konfigürasyonu + müfredat (TEK doğruluk kaynağı)
    exam-config.ts     140 / 160 / bölümler / barajlar / puanlama — magic number yok
    curriculum.ts      Kategori + alt konu ağacı; resmî/türetilmiş ayrımı
    load-config.ts     Kullanıcı override'larını varsayılanların üzerine uygular
  core/              Saf iş mantığı (veritabanından bağımsız, test edilebilir)
    scoring.ts         Puan, baraj, zaman analizi
    mastery.ts         EWMA + güven algoritması
    readiness.ts       6 bileşenli hazırlık skoru
    selection.ts       Adaptif soru seçimi
    dedup.ts           Tekrar tespiti
    exam-engine.ts     Orkestrasyon (oturum başlat / cevapla / teslim et)
    analytics.ts       Dashboard, trend, karşılaştırma, günlük öneri
  db/
    client.ts          node:sqlite bağlantısı (WAL, foreign keys)
    migrations.ts      Sıralı, idempotent şema migration'ları
    repos/             Tablo başına repository
    seed/              Elle yazılmış 165 soruluk başlangıç bankası
  question-engine/
    llm-client.ts      Anthropic istemcisi; anahtar yoksa AÇIKÇA devre dışı
    prompts.ts         Araştır / üret / bağımsız doğrula prompt'ları
    generator.ts       4 aşamalı pipeline
    quality.ts         Deterministik kalite kontrolleri
  app/               Next.js App Router — sayfalar (RSC) + /api route handler'ları
  lib/               Biçimlendirme, sunucu yardımcıları, yedekleme
tests/               node:test ile 115 test
scripts/             migrate / seed / backup / generate
```

**İlkeler**

- Sınav sabitleri yalnızca `exam-config.ts`'te. Kod hiçbir yerde `140`, `160`, `60`
  yazmaz; her şey `loadExamConfig()` üzerinden okunur.
- İş mantığı UI bileşenlerinin içinde değil `core/` altındadır ve veritabanından
  bağımsız saf fonksiyonlardır.
- Sayfalar React Server Component'tir ve `core/` modüllerini doğrudan çağırır; route
  handler'lar yalnızca istemcinin gerçekten ihtiyaç duyduğu mutasyonlar için vardır.
- Repository pattern yalnızca gerçekten gerektiği yerde (tablo erişimi) kullanılır;
  gereksiz factory / abstraction katmanı yoktur.

---

## 13. Testler

```bash
npm test          # 170 test
npm run typecheck # tsc --noEmit
npm run build     # üretim derlemesi
```

Kapsam:

| Alan | Neler doğrulanıyor |
|---|---|
| Konfigürasyon | 140 = 60+40+40, barajlar, gereken doğru sayıları, override tutarlılığı |
| Puanlama | Ceza katsayısı, **"toplam puan yüksek ama bir baraj tutmuyor → FAIL"**, sınır durumları |
| Zaman analizi | Süre kullanım oranı, yavaş/hızlı sorular, bölüm payları |
| Ustalık | Tek doğru cevap 100 yapmaz, yanlış daha hızlı düşürür, zorluk etkisi, 0–100 sınırı |
| Hazırlık | Ağırlık toplamı 1, veri yokken normalize etme, baraj riski tespiti, trend/istikrar |
| Tekrar tespiti | Birebir, kavram tekrarı (DNS örneği), **yanlış pozitif olmaması** |
| Kalite kontrolü | Aynı şık, "hiçbiri", yetersiz açıklama, uzunluk ipucu, cevap sızıntısı |
| Sınav motoru | 140 soruluk kağıt, bölüm dağılımı, cevap sızıntısı olmaması, soru tekrarı olmaması |
| Sayaç | Sayfa yenilemede sıfırlanmama, **otomatik teslim**, toplu kurtarma |
| Seçim | Yeni sorular önce, doğru bilinenler sonra, kota aşılmaması, shortfall raporu |
| Yedekleme | Dışa aktarım bütünlüğü, içe aktarım, kopya oluşturmama |
| Migration | İdempotentlik, tüm tabloların varlığı |
| Stil profili | Örneklem küçükken güvenin düşük kalması, ölçüm/varsayım harmanı, kaynak seviyesi ağırlığı |
| Stil sınıflandırma | SQL/kod/okuma tipleri, olumsuz kök tespiti, süre tahmini |
| Kavramlar | Kavram türetme, sözcük sırasından bağımsızlık, tazelik/çözülmemişlik önceliği |
| Anlamsal tekrar | **TCP/OSI parafraz örneği**, kabalaştırmanın sayıları bozmaması, yanlış pozitif olmaması |
| Kalite skoru | Doğrulama yokken tavan, cevap uyuşmazlığında sıfır, müfredat dışında eşik altı |
| Çıkmış soru içe aktarma | 5 şıklı ayrıştırma, cevap anahtarı eşleme, **cevap uydurmama**, kopya engeli |
| Konu sınıflandırma | Nadir terim ağırlığı (ACID örneği), bağlanamayanın boş bırakılması |
| Terfi ve ayrım | 5→4 şık kırpma + not düşme, **çıkmış soruların gerçek sınava girmemesi**, C seviyesinin çıkmış sayılmaması |

---

## 14. Varsayımlar ve bilinen sınırlar

Resmî ilanda **bulunmayan** ve bu uygulamada varsayım olarak işaretlenen noktalar:

| Konu | Durum |
|---|---|
| **İngilizce CEFR seviyesi** | Resmî ilan belirtmiyor. Sorulardaki A2/B1/B2/C1 etiketleri uygulamanın kendi kalibrasyonudur, resmî iddia değildir. |
| **İngilizce soru türleri** | Cloze test, paragraf tamamlama, okuduğunu anlama vb. resmî ilanda yok; hazırlık kaynaklarından türetilmiştir. |
| **GK / GY alt konuları** | Resmî değil. Resmî olan yalnızca bölüm adları ve soru sayıları. |
| **Teknik alt konular** | Resmî değil. Resmî olan yalnızca Ek-1'deki 8 ana başlık. |
| **Yanlışın doğruyu götürmesi** | İlanda belirtilmiyor → ceza katsayısı 0 kabul edildi (Ayarlar'dan değiştirilebilir). |

Diğer sınırlar:

- Uygulama **tek kullanıcılıdır** ve kimlik doğrulaması yoktur; yalnızca `localhost`
  üzerinde çalıştırılmalıdır.
- Aynı anda yalnızca **bir aktif oturum** olabilir; yeni sınav başlatmak için mevcut
  oturumu bitirmek veya iptal etmek gerekir.
- Soru üretimi ağ ve API anahtarı gerektirir. İkisi de yoksa üretim **kapalıdır**;
  sınav ve çalışma mevcut bankayla sorunsuz çalışmaya devam eder.
- Üretilen sorular bağımsız doğrulamadan geçse de **%100 doğruluk garantisi yoktur**;
  Soru Bankası sayfasından şüpheli soruları "İnceleme gerekli" ya da "Reddedildi" olarak
  işaretleyebilirsin.
