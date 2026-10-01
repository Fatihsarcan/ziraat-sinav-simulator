/**
 * MERKEZI SINAV KONFIGURASYONU
 * =============================
 * Uygulamadaki TUM sinav sabitleri burada tanimlidir. Kodun baska hicbir
 * yerinde 140 / 160 / 60 / 40 gibi sayilar hard-code edilmez.
 *
 * Kaynak: T.C. Ziraat Bankasi A.S. "Uzman Yardimcisi Ise Alim Sinavi Basvuru
 * Kosullari", 23.09.2026 tarihli resmi ilan PDF'i.
 * https://www.ziraatbank.com.tr/tr/Bankamiz-ZB/insan-kaynaklari/Documents/zb-uzman-yard%c4%b1mcisi-23092026.pdf
 *
 * Kullanici ayarlar ekranindan sinav tarihini ve (gerekirse) dagilimi
 * degistirebilir; runtime override'lar `settings` tablosunda saklanir ve
 * `loadExamConfig()` tarafindan bu varsayilanlarin uzerine uygulanir.
 */

export type SectionId = "general" | "english" | "technical";
export type OptionKey = "A" | "B" | "C" | "D";
export type Difficulty = "easy" | "medium" | "hard";
export type CefrLevel = "A2" | "B1" | "B2" | "C1";
export type QualityStatus = "verified" | "review_needed" | "rejected";

export const OPTION_KEYS: readonly OptionKey[] = ["A", "B", "C", "D"] as const;
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"] as const;
export const CEFR_LEVELS: readonly CefrLevel[] = ["A2", "B1", "B2", "C1"] as const;

/** Bir bolum icindeki alt-bolum (orn. Genel Kultur / Genel Yetenek). */
export interface SubsectionConfig {
  /** Kararli anahtar; veritabaninda `questions.category` ile eslesir. */
  readonly key: string;
  readonly label: string;
  readonly questionCount: number;
}

export interface SectionConfig {
  readonly id: SectionId;
  /** Resmi ilandaki bolum numarasi (1, 2, 3). */
  readonly ordinal: number;
  readonly label: string;
  readonly shortLabel: string;
  readonly questionCount: number;
  /** Bolum baraji: dogru oraninin bu degerin altina dusmemesi gerekir. */
  readonly passRatio: number;
  readonly subsections: readonly SubsectionConfig[];
}

export interface ExamConfig {
  readonly version: string;
  readonly examName: string;
  /** Hedef sinav tarihi/saati (yerel saat, ISO 8601). Ayarlardan degistirilebilir. */
  readonly examDate: string;
  readonly totalQuestions: number;
  readonly durationMinutes: number;
  readonly sections: readonly SectionConfig[];
  readonly thresholds: {
    /** Toplam puan baraji (0-100). */
    readonly overallScore: number;
    /** Bolum bazli oran barajlari; `sections[].passRatio` ile ayni degerler. */
    readonly bySection: Readonly<Record<SectionId, number>>;
  };
  readonly scoring: {
    /**
     * VARSAYIM: Resmi ilan yanlis cevabin dogruyu goturdugunu BELIRTMIYOR.
     * Bu yuzden ceza katsayisi 0 kabul edildi; puan = dogru/toplam * 100.
     * Farkli bir kural ogrenilirse tek satirda degistirilebilir.
     */
    readonly penaltyPerWrong: number;
    readonly pointsPerCorrect: number;
    readonly maxScore: number;
  };
  readonly practice: {
    readonly allowedQuestionCounts: readonly number[];
    readonly defaultQuestionCount: number;
  };
  /** Soru bankasi bu esigin altina duserse uretim onerilir. */
  readonly questionBank: {
    readonly minPerSubsection: number;
    readonly minPerTechnicalCategory: number;
    readonly generationBatchSize: number;
  };
}

export const EXAM_CONFIG: ExamConfig = {
  version: "2026-09-23",
  examName: "Ziraat Bankasi Uzman Yardimcisi Yazili Sinavi",
  examDate: "2026-10-24T14:00:00",
  totalQuestions: 140,
  durationMinutes: 160,
  sections: [
    {
      id: "general",
      ordinal: 1,
      label: "Genel Kultur ve Genel Yetenek",
      shortLabel: "Genel",
      questionCount: 60,
      passRatio: 0.6,
      subsections: [
        { key: "Genel Kultur", label: "Genel Kultur", questionCount: 20 },
        { key: "Genel Yetenek", label: "Genel Yetenek", questionCount: 40 },
      ],
    },
    {
      id: "english",
      ordinal: 2,
      label: "Ingilizce",
      shortLabel: "Ingilizce",
      questionCount: 40,
      passRatio: 0.6,
      subsections: [{ key: "Ingilizce", label: "Ingilizce", questionCount: 40 }],
    },
    {
      id: "technical",
      ordinal: 3,
      label: "Bilgisayar, Bilisim ve Yapay Zeka",
      shortLabel: "Teknik",
      questionCount: 40,
      passRatio: 0.5,
      subsections: [
        // Teknik bolumde alt-bolum = resmi 8 konu basligi (bkz. curriculum.ts).
        // Soru sayilari orada TECHNICAL_BLUEPRINT ile dagitilir.
        { key: "Bilgisayar, Bilisim ve Yapay Zeka", label: "Teknik", questionCount: 40 },
      ],
    },
  ],
  thresholds: {
    overallScore: 60,
    bySection: { general: 0.6, english: 0.6, technical: 0.5 },
  },
  scoring: {
    penaltyPerWrong: 0,
    pointsPerCorrect: 1,
    maxScore: 100,
  },
  practice: {
    allowedQuestionCounts: [5, 10, 20, 40],
    defaultQuestionCount: 20,
  },
  questionBank: {
    minPerSubsection: 80,
    minPerTechnicalCategory: 40,
    generationBatchSize: 8,
  },
};

// ---------------------------------------------------------------------------
// Turetilmis yardimcilar — hesaplama yapan her yer bunlari kullanir.
// ---------------------------------------------------------------------------

export function getSection(config: ExamConfig, id: SectionId): SectionConfig {
  const section = config.sections.find((s) => s.id === id);
  if (!section) throw new Error(`Bilinmeyen bolum: ${id}`);
  return section;
}

export function durationSeconds(config: ExamConfig): number {
  return config.durationMinutes * 60;
}

/** Bir bolumden gecmek icin gereken minimum dogru sayisi (yukari yuvarlanir). */
export function requiredCorrect(section: SectionConfig): number {
  return Math.ceil(section.questionCount * section.passRatio);
}

/** Konfigurasyonun kendi icinde tutarli olup olmadigini dogrular. */
export function validateExamConfig(config: ExamConfig): string[] {
  const problems: string[] = [];
  const sectionSum = config.sections.reduce((acc, s) => acc + s.questionCount, 0);
  if (sectionSum !== config.totalQuestions) {
    problems.push(
      `Bolum soru sayilari toplami (${sectionSum}) totalQuestions (${config.totalQuestions}) ile eslesmiyor.`,
    );
  }
  for (const section of config.sections) {
    const subSum = section.subsections.reduce((acc, s) => acc + s.questionCount, 0);
    if (subSum !== section.questionCount) {
      problems.push(
        `"${section.label}" alt-bolum toplami (${subSum}) bolum soru sayisi (${section.questionCount}) ile eslesmiyor.`,
      );
    }
    if (config.thresholds.bySection[section.id] !== section.passRatio) {
      problems.push(`"${section.label}" baraj orani thresholds.bySection ile eslesmiyor.`);
    }
  }
  if (Number.isNaN(Date.parse(config.examDate))) {
    problems.push(`examDate gecerli bir tarih degil: ${config.examDate}`);
  }
  return problems;
}
