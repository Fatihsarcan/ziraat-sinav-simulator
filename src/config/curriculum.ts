/**
 * MUFREDAT
 * ========
 * Kategori ve alt konu agaci. Soru uretimi, adaptif secim ve konu bazli
 * analiz bu agaci kullanir.
 *
 * KAYNAK GUVENILIRLIGI:
 *  - `official: true`  -> 23.09.2026 tarihli resmi Ziraat Bankasi ilani Ek-1'de
 *                         birebir gecen konu basligi.
 *  - `official: false` -> Resmi ilanda gecmez; gecmis banka sinavlari ve
 *                         hazirlik kaynaklarindan turetilmis makul alt basliktir.
 *                         Uygulamada "turetilmis" olarak isaretlenir.
 *
 * Alt konular (subtopics) HICBIR durumda resmi degildir; teknik alanda resmi
 * olan sey yalnizca 8 ana kategoridir.
 */

import type { CefrLevel, SectionId } from "./exam-config.ts";

export interface CategoryConfig {
  /** Kararli anahtar; `questions.category` bu degeri tutar. */
  readonly key: string;
  readonly label: string;
  readonly section: SectionId;
  /** Bolum icindeki alt-bolum anahtari (exam-config subsections ile eslesir). */
  readonly subsection: string;
  readonly official: boolean;
  readonly subtopics: readonly string[];
  /** Gercek sinav simulasyonunda bu kategoriden sorulacak soru sayisi. */
  readonly examQuestionCount: number;
}

// ---------------------------------------------------------------------------
// 3. BOLUM — Bilgisayar, Bilisim ve Yapay Zeka (resmi 8 konu basligi)
// 40 soru / 8 kategori = kategori basina 5 soru.
// ---------------------------------------------------------------------------

export const TECHNICAL_CATEGORIES: readonly CategoryConfig[] = [
  {
    key: "Algoritma ve Programlama Mantigi",
    label: "Algoritma ve Programlama Mantigi",
    section: "technical",
    subsection: "Bilgisayar, Bilisim ve Yapay Zeka",
    official: true,
    examQuestionCount: 5,
    subtopics: [
      "Sozde kod (pseudocode) okuma",
      "Kosullu ifadeler ve mantik operatorleri",
      "Donguler ve dongu degismezleri",
      "Ozyineleme (recursion)",
      "Fonksiyonlar, parametre gecisi ve kapsam",
      "Zaman ve alan karmasikligi (Big-O)",
      "Hata ayiklama ve izleme (trace)",
      "Sayi sistemleri ve bit islemleri",
      "Nesne yonelimli programlama temelleri",
      "Diziler ve string islemleri",
    ],
  },
  {
    key: "Veri Yapilari ve Problem Cozme",
    label: "Veri Yapilari ve Problem Cozme",
    section: "technical",
    subsection: "Bilgisayar, Bilisim ve Yapay Zeka",
    official: true,
    examQuestionCount: 5,
    subtopics: [
      "Dizi ve bagli liste",
      "Yigin (stack) ve kuyruk (queue)",
      "Agaclar ve ikili arama agaci",
      "Yigit (heap) ve oncelik kuyrugu",
      "Hash tablolari ve carpisma cozumu",
      "Graf gosterimi, BFS ve DFS",
      "Siralama algoritmalari",
      "Arama algoritmalari",
      "Aclik/ozyinelemeli problem cozme stratejileri",
      "Dinamik programlama temelleri",
    ],
  },
  {
    key: "Veri Tabani ve SQL",
    label: "Veri Tabani ve SQL",
    section: "technical",
    subsection: "Bilgisayar, Bilisim ve Yapay Zeka",
    official: true,
    examQuestionCount: 5,
    subtopics: [
      "SELECT ve filtreleme (WHERE)",
      "JOIN turleri",
      "GROUP BY ve HAVING",
      "Alt sorgular ve CTE",
      "Pencere fonksiyonlari (window functions)",
      "Indeksler ve sorgu performansi",
      "Normalizasyon ve normal formlar",
      "Kisitlar (PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK)",
      "Transaction ve ACID",
      "Izolasyon seviyeleri ve kilitleme",
      "Iliskisel model ve ER diyagrami",
      "NoSQL temelleri ve CAP teoremi",
    ],
  },
  {
    key: "Yazilim Muhendisligi ve Sistem Gelistirme",
    label: "Yazilim Muhendisligi ve Sistem Gelistirme",
    section: "technical",
    subsection: "Bilgisayar, Bilisim ve Yapay Zeka",
    official: true,
    examQuestionCount: 5,
    subtopics: [
      "Yazilim gelistirme yasam dongusu (SDLC)",
      "Scrum ve Agile uygulamalari",
      "Gereksinim analizi ve dokumantasyon",
      "Tasarim desenleri (design patterns)",
      "SOLID ilkeleri",
      "Test turleri ve test piramidi",
      "Surum kontrolu ve dallanma stratejileri",
      "CI/CD ve DevOps temelleri",
      "Mimari yaklasimlar (katmanli, mikroservis, olay tabanli)",
      "Kod kalitesi, teknik borc ve refactoring",
      "API tasarimi (REST/SOAP/GraphQL)",
    ],
  },
  {
    key: "Bilgisayar Aglari ve Isletim Sistemleri",
    label: "Bilgisayar Aglari ve Isletim Sistemleri",
    section: "technical",
    subsection: "Bilgisayar, Bilisim ve Yapay Zeka",
    official: true,
    examQuestionCount: 5,
    subtopics: [
      "OSI ve TCP/IP katman modelleri",
      "TCP ve UDP karsilastirmasi",
      "IP adresleme ve alt ag (subnetting)",
      "DNS",
      "DHCP",
      "HTTP ve HTTPS",
      "Yonlendirme (routing) ve anahtarlama",
      "NAT, firewall ve VPN",
      "Islem (process) ve is parcacigi (thread)",
      "Zamanlama algoritmalari (scheduling)",
      "Bellek yonetimi ve sanal bellek",
      "Dosya sistemleri",
      "Kilitlenme (deadlock) ve senkronizasyon",
    ],
  },
  {
    key: "Bilgi Guvenligi Temelleri",
    label: "Bilgi Guvenligi Temelleri",
    section: "technical",
    subsection: "Bilgisayar, Bilisim ve Yapay Zeka",
    official: true,
    examQuestionCount: 5,
    subtopics: [
      "CIA ucgeni (gizlilik, butunluk, erisilebilirlik)",
      "Simetrik ve asimetrik sifreleme",
      "Ozet fonksiyonlari (hashing) ve dijital imza",
      "PKI ve sertifikalar",
      "Kimlik dogrulama ve yetkilendirme (IAM)",
      "Cok faktorlu kimlik dogrulama",
      "Yaygin zafiyetler (OWASP Top 10)",
      "SQL injection ve XSS",
      "Sosyal muhendislik ve oltalama",
      "Guvenlik politikalari ve KVKK/GDPR temelleri",
      "Log yonetimi ve olay mudahale",
      "Bankacilikta guvenlik standartlari",
    ],
  },
  {
    key: "Veri Analitigi, Yapay Zeka ve Makine Ogrenmesi Temelleri",
    label: "Veri Analitigi, Yapay Zeka ve Makine Ogrenmesi",
    section: "technical",
    subsection: "Bilgisayar, Bilisim ve Yapay Zeka",
    official: true,
    examQuestionCount: 5,
    subtopics: [
      "Betimsel istatistik ve veri on isleme",
      "Denetimli ogrenme (siniflandirma, regresyon)",
      "Denetimsiz ogrenme (kumeleme, boyut indirgeme)",
      "Model degerlendirme metrikleri",
      "Asiri ogrenme (overfitting) ve duzenlilestirme",
      "Egitim/dogrulama/test ayrimi ve capraz dogrulama",
      "Yapay sinir aglari temelleri",
      "Derin ogrenme ve buyuk dil modelleri",
      "Dogal dil isleme temelleri",
      "Veri ambari, ETL ve is zekasi",
      "Buyuk veri teknolojileri",
      "Yapay zeka etigi ve aciklanabilirlik",
    ],
  },
  {
    key: "Sistem Analizi ve Dijital Teknoloji Uygulamalari",
    label: "Sistem Analizi ve Dijital Teknoloji Uygulamalari",
    section: "technical",
    subsection: "Bilgisayar, Bilisim ve Yapay Zeka",
    official: true,
    examQuestionCount: 5,
    subtopics: [
      "Sistem analizi surec ve teknikleri",
      "Is sureci modelleme (BPMN)",
      "UML diyagramlari",
      "Fizibilite ve maliyet-fayda analizi",
      "Bulut bilisim modelleri (IaaS/PaaS/SaaS)",
      "Sanallastirma ve konteynerlestirme",
      "Dijital donusum ve otomasyon (RPA)",
      "Odeme sistemleri ve finansal teknolojiler",
      "Blokzincir temelleri",
      "Acik bankacilik ve API ekonomisi",
      "Nesnelerin interneti (IoT)",
      "Is surekliligi ve felaket kurtarma",
    ],
  },
];

// ---------------------------------------------------------------------------
// 1. BOLUM — Genel Kultur (20 soru) ve Genel Yetenek (40 soru)
// Kategoriler resmi degildir; gecmis banka sinavlarinin yapisindan turetilmistir.
// ---------------------------------------------------------------------------

export const GENERAL_CATEGORIES: readonly CategoryConfig[] = [
  {
    key: "Genel Kultur",
    label: "Genel Kultur",
    section: "general",
    subsection: "Genel Kultur",
    official: true, // Bolum adi resmi; alt konular turetilmis.
    examQuestionCount: 20,
    subtopics: [
      "Turkiye tarihi",
      "Inkilap tarihi ve Ataturk ilkeleri",
      "Dunya tarihi",
      "Turkiye cografyasi",
      "Dunya cografyasi",
      "Anayasa ve vatandaslik bilgisi",
      "Temel hukuk kavramlari",
      "Ekonomi ve bankacilik genel kulturu",
      "Guncel olaylar",
      "Uluslararasi kuruluslar",
      "Bilim ve teknoloji",
      "Sanat, edebiyat ve kultur",
    ],
  },
  {
    key: "Genel Yetenek",
    label: "Genel Yetenek",
    section: "general",
    subsection: "Genel Yetenek",
    official: true, // Bolum adi resmi; alt konular turetilmis.
    examQuestionCount: 40,
    subtopics: [
      "Sozcukte ve cumlede anlam",
      "Paragraf ve anlatim",
      "Dil bilgisi ve yazim kurallari",
      "Sozel mantik ve akil yurutme",
      "Sayilar ve temel islemler",
      "Rasyonel sayilar, oran-oranti ve yuzde",
      "Denklem ve esitsizlikler",
      "Problemler (yas, isci, hiz, karisim, kar-zarar)",
      "Kume, fonksiyon ve islem",
      "Permutasyon, kombinasyon ve olasilik",
      "Tablo ve grafik yorumlama",
      "Sayisal mantik ve oruntu",
      "Mantiksal cikarim ve siralama problemleri",
    ],
  },
];

// ---------------------------------------------------------------------------
// 2. BOLUM — Ingilizce (40 soru)
// ---------------------------------------------------------------------------

export const ENGLISH_CATEGORIES: readonly CategoryConfig[] = [
  {
    key: "Ingilizce",
    label: "Ingilizce",
    section: "english",
    subsection: "Ingilizce",
    official: true, // Bolum adi resmi; soru turleri turetilmis.
    examQuestionCount: 40,
    subtopics: [
      "Vocabulary",
      "Contextual vocabulary",
      "Phrasal verbs and collocations",
      "Grammar - tenses",
      "Grammar - modals and passives",
      "Grammar - conditionals (if clauses)",
      "Grammar - relative and noun clauses",
      "Grammar - prepositions",
      "Grammar - conjunctions and connectors",
      "Sentence completion",
      "Cloze test",
      "Paragraph completion",
      "Reading comprehension",
      "Irrelevant sentence",
      "Translation (EN-TR)",
      "Translation (TR-EN)",
    ],
  },
];

export const ALL_CATEGORIES: readonly CategoryConfig[] = [
  ...GENERAL_CATEGORIES,
  ...ENGLISH_CATEGORIES,
  ...TECHNICAL_CATEGORIES,
];

/**
 * Gercek sinav simulasyonu icin kategori bazli soru dagilimi.
 * exam-config'teki bolum soru sayilariyla tutarli olmasi test edilir.
 */
export const EXAM_BLUEPRINT: readonly { category: string; count: number }[] =
  ALL_CATEGORIES.map((c) => ({ category: c.key, count: c.examQuestionCount }));

export function getCategory(key: string): CategoryConfig | undefined {
  return ALL_CATEGORIES.find((c) => c.key === key);
}

export function categoriesForSection(section: SectionId): readonly CategoryConfig[] {
  return ALL_CATEGORIES.filter((c) => c.section === section);
}

export function subtopicsFor(categoryKey: string): readonly string[] {
  return getCategory(categoryKey)?.subtopics ?? [];
}

/**
 * VARSAYIM — Ingilizce CEFR dagilimi.
 * Resmi ilan Ingilizce bolumu icin CEFR seviyesi BELIRTMIYOR. Asagidaki dagilim
 * gecmis banka uzman/mufettis yardimciligi sinavlarinin genel zorluk
 * profilinden turetilmis bir tahmindir ve uygulamada "varsayim" olarak
 * etiketlenir. Resmi bir aciklama cikarsa burasi guncellenmelidir.
 */
export const ENGLISH_CEFR_MIX: Readonly<Record<CefrLevel, number>> = {
  A2: 0.1,
  B1: 0.35,
  B2: 0.4,
  C1: 0.15,
};

/** Zorluk dagilimi varsayimi (tum bolumler icin ayni). */
export const DIFFICULTY_MIX = {
  easy: 0.3,
  medium: 0.5,
  hard: 0.2,
} as const;
