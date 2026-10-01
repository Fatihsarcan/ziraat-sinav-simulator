/**
 * EXAM STYLE ANALYZER
 * ===================
 * Toplanan gecmis/referans sorulardan olculebilir bir stil profili cikarir ve
 * bunu uretim prompt'una gomulebilecek bir metne cevirir.
 *
 * TEMEL ILKE (sartname #3): AZ SAYIDA ornekten KESIN istatistik cikarilmaz.
 * Her profil `sampleSize` ve `confidence` tasir; ornek yetersizse olculen
 * degerler varsayilan (varsayim) profille HARMANLANIR ve bu acikca yazilir.
 *
 * Bu modul saftir (DB bilmez) — `node --test` ile dogrudan test edilir.
 */

import {
  DEFAULT_STYLE_METRICS,
  DEFAULT_STYLE_MIX,
  STYLE_TYPE_KEYS,
  STYLE_CONFIDENCE_LABEL,
  styleConfidenceFor,
  styleTypeLabel,
  styleWeightFor,
  type SourceLevel,
  type StyleConfidence,
  type StyleType,
} from "../config/exam-style.ts";
import type { Difficulty, SectionId } from "../config/exam-config.ts";
import { DIFFICULTIES } from "../config/exam-config.ts";
import { normalizeText } from "./dedup.ts";

// ---------------------------------------------------------------------------
// Girdi
// ---------------------------------------------------------------------------

/** Stil analizine giren tek bir gozlem (referans soru ya da mevcut banka sorusu). */
export interface StyleObservation {
  section: SectionId;
  category: string | null;
  subtopic: string | null;
  sourceLevel: SourceLevel | null;
  styleType: StyleType | null;
  isNegative: boolean;
  difficulty: Difficulty | null;
  estimatedSeconds: number | null;
  stemChars: number;
  optionChars: readonly number[];
  optionCount: number;
}

export interface StyleProfile {
  scope: string;
  section: SectionId | null;
  sampleSize: number;
  /** Agirlikli ornek buyuklugu (A seviyesi 1.0, D seviyesi 0.35 ...). */
  weightedSampleSize: number;
  confidence: StyleConfidence;
  /** Olculen degerlerin karisimdaki payi (0 = tamamen varsayim, 1 = tamamen olcum). */
  measuredShare: number;

  avgStemChars: number;
  avgOptionChars: number;
  avgOptionCount: number;
  negativeRatio: number;
  avgSeconds: number;

  styleMix: Readonly<Partial<Record<StyleType, number>>>;
  difficultyMix: Readonly<Record<Difficulty, number>>;
  subtopicMix: Readonly<Record<string, number>>;

  /** Insan tarafindan okunacak uyarilar ("ornek az", "yalniz D seviyesi" vb.). */
  notes: readonly string[];
}

// ---------------------------------------------------------------------------
// Profil hesabi
// ---------------------------------------------------------------------------

function mean(values: readonly number[], fallback: number): number {
  const usable = values.filter((v) => Number.isFinite(v) && v > 0);
  if (usable.length === 0) return fallback;
  return usable.reduce((a, b) => a + b, 0) / usable.length;
}

/** Olculen degeri varsayilana dogru cekme: ornek azaldikca varsayim agir basar. */
function blend(measured: number, assumed: number, share: number): number {
  return measured * share + assumed * (1 - share);
}

function normalizeMix(counts: Map<string, number>): Record<string, number> {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of counts) out[key] = value / total;
  return out;
}

/**
 * Olculen orani varsayilanla harmanla. Varsayilanda olmayan bir anahtar
 * olculmusse aynen korunur (yeni soru tipi kesfedilmis olabilir).
 */
function blendMix(
  measured: Record<string, number>,
  assumed: Readonly<Record<string, number>>,
  share: number,
): Record<string, number> {
  const keys = new Set([...Object.keys(measured), ...Object.keys(assumed)]);
  const raw: Record<string, number> = {};
  let total = 0;
  for (const key of keys) {
    const value = blend(measured[key] ?? 0, assumed[key] ?? 0, share);
    if (value > 0) {
      raw[key] = value;
      total += value;
    }
  }
  if (total <= 0) return { ...assumed };
  for (const key of Object.keys(raw)) raw[key] = raw[key]! / total;
  return raw;
}

export interface BuildProfileOptions {
  scope: string;
  section: SectionId | null;
}

export function buildStyleProfile(
  observations: readonly StyleObservation[],
  options: BuildProfileOptions,
): StyleProfile {
  const { scope, section } = options;
  const sampleSize = observations.length;
  const weightedSampleSize = observations.reduce(
    (acc, o) => acc + styleWeightFor(o.sourceLevel),
    0,
  );
  const confidence = styleConfidenceFor(weightedSampleSize);

  // Olcumun agirligi: 40 agirlikli ornekte tam olcume gecilir.
  const measuredShare = Math.max(0, Math.min(1, weightedSampleSize / 40));

  const defaultsSection: SectionId = section ?? "technical";
  const metricDefaults = DEFAULT_STYLE_METRICS[defaultsSection];
  const mixDefaults = DEFAULT_STYLE_MIX[defaultsSection] as Record<string, number>;

  const stem = mean(observations.map((o) => o.stemChars), metricDefaults.stemChars);
  const optionChars = mean(
    observations.flatMap((o) => [...o.optionChars]),
    metricDefaults.optionChars,
  );
  const optionCount = mean(observations.map((o) => o.optionCount), 4);
  const seconds = mean(
    observations.map((o) => o.estimatedSeconds ?? 0),
    metricDefaults.seconds,
  );
  const negativeRatio =
    sampleSize === 0
      ? metricDefaults.negativeRatio
      : observations.filter((o) => o.isNegative).length / sampleSize;

  const styleCounts = new Map<string, number>();
  for (const o of observations) {
    if (!o.styleType) continue;
    styleCounts.set(o.styleType, (styleCounts.get(o.styleType) ?? 0) + 1);
  }

  const difficultyCounts = new Map<string, number>();
  for (const o of observations) {
    if (!o.difficulty) continue;
    difficultyCounts.set(o.difficulty, (difficultyCounts.get(o.difficulty) ?? 0) + 1);
  }

  const subtopicCounts = new Map<string, number>();
  for (const o of observations) {
    if (!o.subtopic) continue;
    subtopicCounts.set(o.subtopic, (subtopicCounts.get(o.subtopic) ?? 0) + 1);
  }

  const measuredDifficulty = normalizeMix(difficultyCounts);
  const difficultyMix = {} as Record<Difficulty, number>;
  const assumedDifficulty: Record<string, number> = { easy: 0.3, medium: 0.5, hard: 0.2 };
  const blendedDifficulty = blendMix(measuredDifficulty, assumedDifficulty, measuredShare);
  for (const d of DIFFICULTIES) difficultyMix[d] = blendedDifficulty[d] ?? 0;

  const notes: string[] = [];
  if (sampleSize === 0) {
    notes.push(
      "Referans soru yok — profil tamamen VARSAYIMDIR, ölçüm değildir. " +
        "Çıkmış soru içe aktarınca burası gerçek ölçüme döner.",
    );
  } else if (confidence === "none" || confidence === "low") {
    notes.push(
      `Örneklem küçük (${sampleSize} soru, ağırlıklı ${weightedSampleSize.toFixed(1)}). ` +
        "Oranlar yön gösterir, kesin istatistik değildir.",
    );
  }
  const levels = new Set(observations.map((o) => o.sourceLevel ?? "?"));
  if (sampleSize > 0 && !levels.has("A") && !levels.has("B")) {
    notes.push(
      "Örneklemde resmî (A) veya çıkmış soru arşivi (B) kaynağı yok; " +
        "profil yalnızca aday hatırlaması / benzer banka sınavlarına dayanıyor.",
    );
  }
  if (sampleSize > 0 && styleCounts.size === 0) {
    notes.push("Hiçbir referans sorunun stil tipi sınıflandırılamadı.");
  }

  const styleMixBlended = blendMix(normalizeMix(styleCounts), mixDefaults, measuredShare);
  const styleMix: Partial<Record<StyleType, number>> = {};
  for (const [key, value] of Object.entries(styleMixBlended)) {
    if (STYLE_TYPE_KEYS.includes(key as StyleType)) styleMix[key as StyleType] = value;
  }

  return {
    scope,
    section,
    sampleSize,
    weightedSampleSize,
    confidence,
    measuredShare,
    avgStemChars: Math.round(blend(stem, metricDefaults.stemChars, measuredShare)),
    avgOptionChars: Math.round(blend(optionChars, metricDefaults.optionChars, measuredShare)),
    avgOptionCount: Number(optionCount.toFixed(2)),
    negativeRatio: Number(
      blend(negativeRatio, metricDefaults.negativeRatio, measuredShare).toFixed(3),
    ),
    avgSeconds: Math.round(blend(seconds, metricDefaults.seconds, measuredShare)),
    styleMix,
    difficultyMix,
    subtopicMix: normalizeMix(subtopicCounts),
    notes,
  };
}

// ---------------------------------------------------------------------------
// Prompt metni
// ---------------------------------------------------------------------------

function percent(value: number): string {
  return `%${Math.round(value * 100)}`;
}

/**
 * Profili uretim prompt'una gomulecek metne cevirir.
 * Guven dusukse bunu ACIKCA yazar ki model "bu kesin istatistik" sanmasin.
 */
export function describeStyleProfile(profile: StyleProfile): string {
  const lines: string[] = [];

  lines.push(
    `Ornek sayisi: ${profile.sampleSize} referans soru ` +
      `(agirlikli ${profile.weightedSampleSize.toFixed(1)}), guven: ${STYLE_CONFIDENCE_LABEL[profile.confidence]}.`,
  );
  if (profile.measuredShare < 0.999) {
    lines.push(
      `DIKKAT: Asagidaki degerlerin ${percent(profile.measuredShare)} kadari OLCUMDEN, ` +
        `${percent(1 - profile.measuredShare)} kadari VARSAYIMDAN gelir. Kesin kural degil, HEDEF olarak kullan.`,
    );
  }

  lines.push(`- Ortalama soru koku uzunlugu: ~${profile.avgStemChars} karakter`);
  lines.push(`- Ortalama secenek uzunlugu: ~${profile.avgOptionChars} karakter`);
  lines.push(`- Ortalama cozum suresi hedefi: ~${profile.avgSeconds} saniye`);
  lines.push(`- Olumsuz ("hangisi DEGILDIR") soru orani: ${percent(profile.negativeRatio)}`);

  const styleEntries = Object.entries(profile.styleMix)
    .filter(([, v]) => v > 0.01)
    .sort((a, b) => b[1] - a[1]);
  if (styleEntries.length > 0) {
    lines.push("- Soru tipi dagilimi hedefi:");
    for (const [key, value] of styleEntries) {
      lines.push(`    ${styleTypeLabel(key)}: ${percent(value)}`);
    }
  }

  const diffEntries = Object.entries(profile.difficultyMix).filter(([, v]) => v > 0.01);
  if (diffEntries.length > 0) {
    lines.push(
      `- Zorluk dagilimi hedefi: ${diffEntries.map(([k, v]) => `${k} ${percent(v)}`).join(", ")}`,
    );
  }

  const topSubtopics = Object.entries(profile.subtopicMix)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  if (topSubtopics.length > 0) {
    lines.push(
      `- Gecmis sinavlarda en cok gorulen alt konular: ${topSubtopics
        .map(([k, v]) => `${k} (${percent(v)})`)
        .join(", ")}`,
    );
    lines.push(
      "  NOT: Bu yalnizca gecmis EGILIMDIR. 2026 mufredatinda olmayan bir konuya agirlik VERME.",
    );
  }

  for (const note of profile.notes) lines.push(`- UYARI: ${note}`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Otomatik stil siniflandirma (LLM'siz, deterministik)
// ---------------------------------------------------------------------------

/** "hangisi degildir", "hangisi yanlistir", "which is NOT" gibi olumsuz kalip. */
const NEGATIVE_PATTERNS = [
  /\bdegildir\b/,
  /\bdegil\b/,
  /\byanlistir\b/,
  /\byanlis\b/,
  /\bsoylenemez\b/,
  /\bolamaz\b/,
  /\bharic\b/,
  /\bdisinda\b/,
  /\bwhich .*\bnot\b/,
  /\bexcept\b/,
  /\bleast likely\b/,
  /\bincorrect\b/,
];

export function detectNegativeStem(stem: string): boolean {
  const normalized = normalizeText(stem);
  return NEGATIVE_PATTERNS.some((p) => p.test(normalized));
}

const SQL_PATTERNS = /\b(select|insert|update|delete|join|group by|having|where|inner|left outer)\b/;
const CODE_PATTERNS = /(\bfor\s*\(|\bwhile\s*\(|\bdef\s|\bfunction\s|\breturn\b|\bprint\b|\bif\s*\(|=>|\{\s*\n|;\s*$)/m;
const CALC_PATTERNS = /(\d+\s*[%+\-*/x]\s*\d+|\byuzde\b|\bkac\b|\btoplam\b|\bortalama\b|\bkacincidir\b)/;
const TABLE_PATTERNS = /(\btablo\b|\bgrafik\b|\bsutun\b|\bsatir\b|\bveriler\b.*\bgore\b)/;
const DEFINITION_PATTERNS = /(\basagidakilerden hangisi\b.*\btanim\b|\bne demektir\b|\bnedir\b|\bkavrami\b)/;
const SCENARIO_PATTERNS = /(\bbir banka\b|\bsirket\b|\bekip\b|\bmusteri\b|\bproje\b|\bsenaryo\b|\bdurumda\b)/;

/**
 * Bir soruyu stil tipine yerlestirir.
 *
 * Kasitli olarak KABA bir siniflandiricidir: amac istatistik cikarmak, tek tek
 * soruyu mukemmel etiketlemek degil. Uretici model kendi `styleType` etiketini
 * verdiginde ONUN etiketi tercih edilir; bu fonksiyon yalnizca etiket yoksa
 * (ornegin ice aktarilan eski sorularda) devreye girer.
 */
export function classifyStyle(input: {
  section: SectionId;
  questionText: string;
  passage?: string | null;
  subtopic?: string | null;
}): StyleType {
  const haystack = normalizeText(`${input.passage ?? ""} ${input.questionText}`);
  const subtopic = normalizeText(input.subtopic ?? "");

  if (input.section === "english") {
    if (input.passage && input.passage.length > 180) return "language_reading";
    if (/reading|cloze|paragraph|passage/.test(subtopic)) return "language_reading";
    if (/grammar|tense|modal|clause|preposition|conjunction|conditional/.test(subtopic)) {
      return "language_grammar";
    }
    return "language_vocabulary";
  }

  if (input.section === "technical") {
    if (SQL_PATTERNS.test(haystack)) return "sql_query";
    if (input.passage && CODE_PATTERNS.test(input.passage)) return "code_reading";
    if (/sozde kod|pseudocode|algoritma|kod/.test(haystack) && input.passage) return "code_reading";
    if (SCENARIO_PATTERNS.test(haystack)) return "scenario";
    if (CALC_PATTERNS.test(haystack)) return "calculation";
    if (DEFINITION_PATTERNS.test(haystack)) return "definition";
    return /hangisi dogrudur|ne olur|sonucu|ciktisi|davranis/.test(haystack)
      ? "application"
      : "concept";
  }

  // general
  if (TABLE_PATTERNS.test(haystack)) return "data_interpretation";
  if (CALC_PATTERNS.test(haystack)) return "calculation";
  if (/paragraf|cumle|sozcuk|anlam|paragrafta|paragrafa/.test(haystack)) return "verbal_reasoning";
  if (/mantik|siralama|cikarim|akil yurutme/.test(subtopic)) return "verbal_reasoning";
  if (SCENARIO_PATTERNS.test(haystack)) return "scenario";
  if (DEFINITION_PATTERNS.test(haystack)) return "definition";
  return "concept";
}

/** Stil tipine gore taban cozum suresi (saniye) — sure butcesi tahmini icin. */
const STYLE_BASE_SECONDS: Readonly<Record<StyleType, number>> = {
  concept: 50,
  application: 70,
  code_reading: 110,
  sql_query: 100,
  definition: 35,
  scenario: 80,
  calculation: 90,
  verbal_reasoning: 75,
  data_interpretation: 95,
  language_grammar: 40,
  language_vocabulary: 35,
  language_reading: 70,
};

/**
 * Sorunun cozulmesi icin gereken yaklasik sure.
 * Taban sure stil tipinden gelir, metin uzunluguna gore olceklenir
 * (200 karakter referans; her 100 ek karakter ~%12 ekler).
 */
export function estimateSeconds(styleType: StyleType | string, stemChars: number): number {
  const base = STYLE_BASE_SECONDS[styleType as StyleType] ?? 60;
  const lengthFactor = 1 + Math.max(0, stemChars - 200) / 100 * 0.12;
  return Math.round(base * Math.min(2.2, lengthFactor));
}

/** Bir gozlem nesnesi kurar (uzunluk olcumlerini tek yerde yapar). */
export function observationFrom(input: {
  section: SectionId;
  category?: string | null;
  subtopic?: string | null;
  sourceLevel?: SourceLevel | null;
  styleType?: StyleType | null;
  difficulty?: Difficulty | null;
  estimatedSeconds?: number | null;
  questionText: string;
  passage?: string | null;
  options: readonly string[];
}): StyleObservation {
  return {
    section: input.section,
    category: input.category ?? null,
    subtopic: input.subtopic ?? null,
    sourceLevel: input.sourceLevel ?? null,
    styleType:
      input.styleType ??
      classifyStyle({
        section: input.section,
        questionText: input.questionText,
        passage: input.passage,
        subtopic: input.subtopic,
      }),
    isNegative: detectNegativeStem(input.questionText),
    difficulty: input.difficulty ?? null,
    estimatedSeconds: input.estimatedSeconds ?? null,
    stemChars: `${input.passage ?? ""}${input.questionText}`.trim().length,
    optionChars: input.options.map((o) => o.trim().length),
    optionCount: input.options.length,
  };
}
