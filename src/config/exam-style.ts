/**
 * SINAV STILI VE KAYNAK GUVEN HIYERARSISI
 * =======================================
 * Bu dosya iki seyi tanimlar:
 *
 *  1. KAYNAK SEVIYELERI (A-E). Bir sorunun/referansin nereden geldigi ve ne
 *     kadar guvenilir sayildigi. Kaynagi bilinmeyen hicbir sey "resmi" ya da
 *     "dogrulanmis cikmis soru" olarak isaretlenemez.
 *
 *  2. SORU STILI TAKSONOMISI. Gecmis sorularin analizinden cikan
 *     `examStyleProfile` bu etiketler uzerinden hesaplanir ve uretim
 *     prompt'una geri beslenir.
 *
 * ONEMLI ILKE (sartname #2 ve #15): 2026 resmi mufredati her seyin ustundedir.
 * Eski bir sinavda cok sorulan bir konu 2026 mufredatinda yoksa uretimde
 * agirlik ALMAZ; stil referansi olarak kullanilabilir ama icerik otoritesi
 * olamaz.
 */

import type { Difficulty, SectionId } from "./exam-config.ts";
import { TECHNICAL_CATEGORIES } from "./curriculum.ts";

// ---------------------------------------------------------------------------
// 1. Kaynak hiyerarsisi
// ---------------------------------------------------------------------------

export type SourceLevel = "A" | "B" | "C" | "D" | "E";

export interface SourceLevelConfig {
  readonly level: SourceLevel;
  readonly key: string;
  readonly label: string;
  readonly description: string;
  /** Stil profili hesabinda bu seviyedeki ornege verilen agirlik. */
  readonly styleWeight: number;
  /**
   * Bu seviyedeki bir soru "gercek cikmis soru" olarak sunulabilir mi?
   * Yalnizca A ve B. C (aday hatirlamasi) "hatirlanan" olarak etiketlenir.
   */
  readonly claimableAsPastQuestion: boolean;
}

export const SOURCE_LEVELS: readonly SourceLevelConfig[] = [
  {
    level: "A",
    key: "official",
    label: "A — Resmî",
    description:
      "Ziraat Bankası veya sınavı yapan kurum (ÖSYM / İstanbul Üniversitesi) tarafından " +
      "yayımlanmış resmî ilan, soru kitapçığı veya cevap anahtarı.",
    styleWeight: 1.0,
    claimableAsPastQuestion: true,
  },
  {
    level: "B",
    key: "historical",
    label: "B — Çıkmış soru arşivi",
    description:
      "Eski Ziraat Bankası sınavlarına ait olduğu belirtilen soru arşivleri (PDF, arşiv dosyası). " +
      "Resmî yayın değil; kaynağı belirtilmiş geçmiş soru derlemesi.",
    styleWeight: 0.85,
    claimableAsPastQuestion: true,
  },
  {
    level: "C",
    key: "recall",
    label: "C — Aday hatırlaması",
    description:
      "Sınava girmiş adayların forum, video veya sosyal medyada hatırladığı sorular ve " +
      "sınav izlenimleri. Doğruluğu teyit edilmemiştir.",
    styleWeight: 0.5,
    claimableAsPastQuestion: false,
  },
  {
    level: "D",
    key: "similar_bank",
    label: "D — Benzer banka sınavları",
    description:
      "VakıfBank, Halkbank vb. benzer uzman yardımcılığı / BT sınavlarından alınan soru tarzı " +
      "örnekleri. İçerik otoritesi değil, yalnızca stil referansıdır.",
    styleWeight: 0.35,
    claimableAsPastQuestion: false,
  },
  {
    level: "E",
    key: "generated",
    label: "E — Üretilmiş",
    description:
      "2026 resmî müfredatı + yukarıdaki kaynakların stil analizi kullanılarak bu uygulama " +
      "tarafından üretilmiş özgün sorular.",
    styleWeight: 0,
    claimableAsPastQuestion: false,
  },
] as const;

export const SOURCE_LEVEL_KEYS = SOURCE_LEVELS.map((l) => l.level);

export function sourceLevel(level: string | null | undefined): SourceLevelConfig {
  return SOURCE_LEVELS.find((l) => l.level === level) ?? SOURCE_LEVELS[4]!;
}

/** Stil profili agirligi; bilinmeyen seviye 0 agirlik alir. */
export function styleWeightFor(level: string | null | undefined): number {
  return SOURCE_LEVELS.find((l) => l.level === level)?.styleWeight ?? 0;
}

export type OriginalOrGenerated = "original" | "generated";

/** Referans kaydinin inceleme durumu (sartname #13). */
export type ReviewState = "pending" | "approved" | "rejected";

// ---------------------------------------------------------------------------
// 2. Soru stili taksonomisi
// ---------------------------------------------------------------------------

export type StyleType =
  | "concept"
  | "application"
  | "code_reading"
  | "sql_query"
  | "definition"
  | "scenario"
  | "calculation"
  | "verbal_reasoning"
  | "data_interpretation"
  | "language_grammar"
  | "language_vocabulary"
  | "language_reading";

export interface StyleTypeConfig {
  readonly key: StyleType;
  readonly label: string;
  /** Hangi bolumlerde anlamli oldugu. */
  readonly sections: readonly SectionId[];
  /** Prompt'a yazilan kisa tarif. */
  readonly brief: string;
}

export const STYLE_TYPES: readonly StyleTypeConfig[] = [
  {
    key: "concept",
    label: "Kavram",
    sections: ["technical", "general"],
    brief: "Bir kavramın ayırt edici özelliğini ölçer; ezber tanım değil, kavrayış ister.",
  },
  {
    key: "application",
    label: "Uygulama / problem",
    sections: ["technical", "general"],
    brief: "Verilen bir durumda ne olacağını, hangi seçimin doğru olduğunu sorar.",
  },
  {
    key: "code_reading",
    label: "Kod okuma",
    sections: ["technical"],
    brief: "Sözde kod veya kod parçası verilir; çıktısı, karmaşıklığı veya hatası sorulur.",
  },
  {
    key: "sql_query",
    label: "SQL sorgusu",
    sections: ["technical"],
    brief: "Tablo(lar) ve bir sorgu verilir; sonucu, hatası veya doğru sorgu sorulur.",
  },
  {
    key: "definition",
    label: "Tanım / bilgi",
    sections: ["technical", "general"],
    brief: "Doğrudan bilgi sorusu. Gerçek sınavda azınlıkta kalmalıdır.",
  },
  {
    key: "scenario",
    label: "Senaryo",
    sections: ["technical", "general"],
    brief: "Bankacılık/iş bağlamında bir senaryo kurar, doğru yaklaşımı sorar.",
  },
  {
    key: "calculation",
    label: "Hesaplama",
    sections: ["technical", "general"],
    brief: "Sayısal işlem gerektirir; hesap makinesi olmadan çözülebilmelidir.",
  },
  {
    key: "verbal_reasoning",
    label: "Sözel muhakeme",
    sections: ["general"],
    brief: "Paragraf, anlam, sözel mantık, sıralama ve çıkarım.",
  },
  {
    key: "data_interpretation",
    label: "Tablo / grafik yorumlama",
    sections: ["general"],
    brief: "Tablo veya grafik verisi verilir, yorumlanması istenir.",
  },
  {
    key: "language_grammar",
    label: "Dil bilgisi (EN)",
    sections: ["english"],
    brief: "Tense, modal, clause, preposition, connector.",
  },
  {
    key: "language_vocabulary",
    label: "Kelime (EN)",
    sections: ["english"],
    brief: "Vocabulary, collocation, phrasal verb, sentence completion.",
  },
  {
    key: "language_reading",
    label: "Okuduğunu anlama (EN)",
    sections: ["english"],
    brief: "Parça verilir; anlama, çıkarım, cloze veya paragraf tamamlama sorulur.",
  },
] as const;

export const STYLE_TYPE_KEYS = STYLE_TYPES.map((s) => s.key);

export function styleTypesForSection(section: SectionId): readonly StyleTypeConfig[] {
  return STYLE_TYPES.filter((s) => s.sections.includes(section));
}

export function styleTypeLabel(key: string): string {
  return STYLE_TYPES.find((s) => s.key === key)?.label ?? key;
}

export function isStyleType(value: unknown): value is StyleType {
  return typeof value === "string" && STYLE_TYPE_KEYS.includes(value as StyleType);
}

// ---------------------------------------------------------------------------
// 3. Varsayilan stil profili (referans veri YOKKEN kullanilir)
// ---------------------------------------------------------------------------

/**
 * VARSAYIM — Referans (cikmis soru) veri seti bos oldugunda kullanilacak
 * baslangic karisimi. Bunlar OLCULMUS degil, benzer banka sinavlarinin genel
 * yapisindan turetilmis makul varsayimlardir ve profile `confidence: "none"`
 * ile etiketlenir. Referans soru yuklendikce olculen degerler bunlarin yerini
 * alir.
 */
export const DEFAULT_STYLE_MIX: Readonly<Record<SectionId, Readonly<Partial<Record<StyleType, number>>>>> = {
  technical: {
    concept: 0.3,
    application: 0.25,
    code_reading: 0.12,
    sql_query: 0.1,
    definition: 0.13,
    scenario: 0.07,
    calculation: 0.03,
  },
  general: {
    verbal_reasoning: 0.3,
    calculation: 0.25,
    definition: 0.2,
    data_interpretation: 0.1,
    concept: 0.1,
    scenario: 0.05,
  },
  english: {
    language_grammar: 0.35,
    language_vocabulary: 0.35,
    language_reading: 0.3,
  },
};

/** VARSAYIM — olculmus veri yokken kullanilan uzunluk/sure beklentileri. */
export const DEFAULT_STYLE_METRICS: Readonly<
  Record<SectionId, { stemChars: number; optionChars: number; seconds: number; negativeRatio: number }>
> = {
  technical: { stemChars: 190, optionChars: 55, seconds: 75, negativeRatio: 0.12 },
  general: { stemChars: 170, optionChars: 40, seconds: 65, negativeRatio: 0.15 },
  english: { stemChars: 140, optionChars: 30, seconds: 55, negativeRatio: 0.05 },
};

/**
 * Ornek sayisi -> istatistik guveni. Az sayida eski sorudan kesin istatistik
 * cikarilmaz (sartname #3).
 */
export const STYLE_CONFIDENCE_THRESHOLDS = {
  low: 10,
  medium: 40,
  high: 120,
} as const;

export type StyleConfidence = "none" | "low" | "medium" | "high";

export function styleConfidenceFor(sampleSize: number): StyleConfidence {
  if (sampleSize <= 0) return "none";
  if (sampleSize < STYLE_CONFIDENCE_THRESHOLDS.low) return "none";
  if (sampleSize < STYLE_CONFIDENCE_THRESHOLDS.medium) return "low";
  if (sampleSize < STYLE_CONFIDENCE_THRESHOLDS.high) return "medium";
  return "high";
}

export const STYLE_CONFIDENCE_LABEL: Readonly<Record<StyleConfidence, string>> = {
  none: "örneklem yetersiz (varsayılan profil kullanılıyor)",
  low: "düşük (yön gösterir, kesin değil)",
  medium: "orta",
  high: "yüksek",
};

// ---------------------------------------------------------------------------
// 4. 2026 mufredat otoritesi
// ---------------------------------------------------------------------------

/**
 * Resmi 2026 teknik konu basliklari. Uretimde ve mufredat denetiminde
 * OTORITE budur; `curriculum.ts` ile tek kaynaktan turetilir ki iki yerde
 * ayri liste tutulmasin.
 */
export const OFFICIAL_2026_TECHNICAL_TOPICS: readonly string[] = TECHNICAL_CATEGORIES.filter(
  (c) => c.official,
).map((c) => c.label);

export function isOfficial2026Topic(categoryKey: string): boolean {
  return TECHNICAL_CATEGORIES.some((c) => c.key === categoryKey && c.official);
}

/** Uretim prompt'una gomulen mufredat otorite metni. */
export function curriculumAuthorityBlock(section: SectionId): string {
  if (section !== "technical") {
    return (
      "MUFREDAT OTORITESI: 23.09.2026 tarihli resmi Ziraat Bankasi ilani. Bu bolumde resmi olan " +
      "yalnizca BOLUM ADI ve SORU SAYISIDIR; alt konular gecmis banka sinavlarindan turetilmistir. " +
      "Alt konu listesi disina cikma."
    );
  }
  return (
    "MUFREDAT OTORITESI: 23.09.2026 tarihli resmi Ziraat Bankasi ilani Ek-1. 3. Bolumun resmi " +
    "konu basliklari YALNIZCA sunlardir:\n" +
    OFFICIAL_2026_TECHNICAL_TOPICS.map((t, i) => `${i + 1}. ${t}`).join("\n") +
    "\nBu basliklarin disina CIKMA. Eski sinavlarda sorulmus olsa bile 2026 mufredatinda yer " +
    "almayan bir konudan soru URETME."
  );
}

// ---------------------------------------------------------------------------
// 5. Kalite skoru esikleri
// ---------------------------------------------------------------------------

export const QUALITY_SCORE = {
  /** Gercek sinav havuzuna girmek icin gereken minimum skor. */
  minForExam: 70,
  /** LLM dogrulamasi olmadan hesaplanan skorun tavani (seed/import backfill). */
  deterministicCap: 85,
  /** Ceza katsayilari. */
  penalty: {
    warning: 12,
    info: 3,
    ambiguous: 20,
    outdated: 15,
    weakDistractors: 15,
    curriculumDrift: 25,
    difficultyMismatch: 8,
    explanationMismatch: 12,
  },
} as const;

/** Zorluk etiketi ile beklenen cozum suresi araligi (saniye) — makullugu denetlenir. */
export const DIFFICULTY_SECONDS: Readonly<Record<Difficulty, { min: number; max: number }>> = {
  easy: { min: 15, max: 70 },
  medium: { min: 30, max: 120 },
  hard: { min: 50, max: 240 },
};
