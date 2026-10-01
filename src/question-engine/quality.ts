/**
 * DETERMINISTIK KALITE KONTROLU
 * =============================
 * LLM'e guvenmeden, kod ile yapilabilen kontroller. Bir soru bu kontrollerden
 * gecemezse `rejected`; supheli durumlarda `review_needed` olur ve GERCEK
 * SINAVA ALINMAZ (sadece `verified` sorular secim havuzuna girer).
 */

import { normalizeText } from "../core/dedup.ts";
import type { Difficulty, OptionKey } from "../core/types.ts";
import { DIFFICULTY_SECONDS, QUALITY_SCORE } from "../config/exam-style.ts";

export interface QualityCandidate {
  questionText: string;
  passage?: string | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: OptionKey;
  explanation: string;
  sourceUrl?: string | null;
}

/**
 * blocker -> soru reddedilir.
 * warning -> soru `review_needed` olur ve gercek sinava alinmaz.
 * info    -> yalnizca kaydedilir, karari ETKILEMEZ. Yanlis pozitif orani
 *            yuksek olan kontroller bu seviyede tutulur.
 */
export type IssueSeverity = "blocker" | "warning" | "info";

export interface QualityIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
}

export interface QualityReport {
  issues: QualityIssue[];
  blockers: QualityIssue[];
  warnings: QualityIssue[];
  infos: QualityIssue[];
  verdict: "pass" | "review" | "reject";
}

/**
 * "Hepsi" / "Hicbiri" gibi belirsizlik ureten secenek kaliplari.
 *
 * DIKKAT: Bu kaliplar NORMALIZE EDILMIS metne uygulanir (kucuk harf + Turkce
 * karakter sadelestirme). Ham metne uygulandiginda "Hiçbiri" yakalanmiyordu.
 * Kaliplar dar tutulur: "A ve B" yalnizca secenegin TAMAMI buysa yakalanir,
 * aksi halde "kimlik dogrulama ve yetkilendirme" gibi mesru secenekler
 * yanlislikla reddedilir.
 */
const AMBIGUOUS_OPTION_PATTERNS = [
  /\ball of the above\b/,
  /\bnone of the above\b/,
  /\bboth a and b\b/,
  /\bhepsi\b/,
  /\bhicbiri\b/,
  /yukaridakilerin\s+(tumu|hepsi)/,
  /^[abcd]\s+ve\s+[abcd]$/,
];

/** Soru koku belirsizlik sinyalleri (normalize edilmis metne uygulanir). */
const VAGUE_STEM_PATTERNS = [
  /\bmight\b/,
  /\bgenerally speaking\b/,
  /\bbazen\b/,
  /\bgenellikle\b.*\bhangisi\b/,
];

const MIN_QUESTION_LENGTH = 15;
const MIN_EXPLANATION_LENGTH = 40;
/** Dogru secenek digerlerinden bu oranda uzunsa "uzunluk ipucu" uyarisi. */
const LENGTH_CUE_RATIO = 2.2;
/** Uzunluk ipucu yalnizca dogru secenek mutlak olarak da uzunken anlamlidir. */
const LENGTH_CUE_MIN_CHARS = 30;

export function checkQuality(candidate: QualityCandidate): QualityReport {
  const issues: QualityIssue[] = [];
  const options: Record<OptionKey, string> = {
    A: candidate.optionA,
    B: candidate.optionB,
    C: candidate.optionC,
    D: candidate.optionD,
  };
  const entries = Object.entries(options) as [OptionKey, string][];

  // 1. Bos alanlar.
  if (candidate.questionText.trim().length < MIN_QUESTION_LENGTH) {
    issues.push({
      code: "question_too_short",
      severity: "blocker",
      message: "Soru koku cok kisa veya bos.",
    });
  }
  for (const [key, value] of entries) {
    if (value.trim().length === 0) {
      issues.push({
        code: "empty_option",
        severity: "blocker",
        message: `${key} secenegi bos.`,
      });
    }
  }
  if (candidate.explanation.trim().length < MIN_EXPLANATION_LENGTH) {
    issues.push({
      code: "explanation_too_short",
      severity: "blocker",
      message: "Aciklama yetersiz; dogru cevabin NEDEN dogru oldugu anlatilmali.",
    });
  }

  // 2. Secenekler birbirinden farkli olmali (ayni anda iki dogru olmasin).
  const normalized = entries.map(([key, value]) => [key, normalizeText(value)] as const);
  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      if (normalized[i]![1] === normalized[j]![1] && normalized[i]![1].length > 0) {
        issues.push({
          code: "duplicate_options",
          severity: "blocker",
          message: `${normalized[i]![0]} ve ${normalized[j]![0]} secenekleri ayni — iki cevap ayni anda dogru olur.`,
        });
      }
    }
  }

  // 3. Belirsizlik ureten secenek kaliplari.
  for (const [key, value] of entries) {
    const normalizedOption = normalizeText(value);
    if (AMBIGUOUS_OPTION_PATTERNS.some((p) => p.test(normalizedOption))) {
      issues.push({
        code: "ambiguous_option",
        severity: "blocker",
        message: `${key} secenegi "hepsi/hicbiri" tipinde — tek net dogru cevap kuralini bozar.`,
      });
      break;
    }
  }

  // 4. Belirsiz soru koku.
  const normalizedStem = normalizeText(candidate.questionText);
  if (VAGUE_STEM_PATTERNS.some((p) => p.test(normalizedStem))) {
    issues.push({
      code: "vague_stem",
      severity: "warning",
      message: "Soru koku belirsiz ifadeler iceriyor; tek dogru cevap tartismali olabilir.",
    });
  }

  // 5. Uzunluk ipucu (dogru secenek bariz uzun).
  const lengths = entries.map(([key, value]) => ({ key, length: value.trim().length }));
  const correctLength = lengths.find((l) => l.key === candidate.correctAnswer)?.length ?? 0;
  const otherMax = Math.max(...lengths.filter((l) => l.key !== candidate.correctAnswer).map((l) => l.length), 1);
  if (correctLength > LENGTH_CUE_MIN_CHARS && correctLength > otherMax * LENGTH_CUE_RATIO) {
    issues.push({
      code: "length_cue",
      severity: "warning",
      message: "Dogru secenek digerlerinden belirgin sekilde uzun — cevap tahmin edilebilir hale gelir.",
    });
  }

  // 6. Aciklama dogru secenegin metnini aniyor mu?
  //
  //    Bu kontrol bilerek `info` seviyesindedir ve karari ETKILEMEZ.
  //    Olculen 166 soruluk baslangic bankasinda yanlis pozitif orani cok
  //    yuksek cikti: dil bilgisi ve bosluk doldurma sorularinda aciklama
  //    secenegin metnini degil ARKASINDAKI KURALI anlatir ("has updated" ->
  //    "present perfect"), kisaltmalarda da ayni durum olusur ("Turkiye
  //    Cumhuriyet Merkez Bankasi" -> "TCMB"). Bu yuzden icerigi engelleyen
  //    bir kontrol olarak kullanilmiyor, yalnizca not dusuluyor.
  const correctText = normalizeText(options[candidate.correctAnswer]);
  const explanationNorm = normalizeText(candidate.explanation);
  const correctTokens = correctText.split(" ").filter((t) => t.length > 3);
  const mentioned =
    correctTokens.length === 0 || correctTokens.some((t) => explanationNorm.includes(t));
  if (!mentioned) {
    issues.push({
      code: "explanation_no_option_mention",
      severity: "info",
      message: "Aciklama dogru secenegin metnini birebir anmiyor (kurali anlatiyor olabilir).",
    });
  }

  // 7. Soru kokunun cevabi sizdirmamasi.
  const stemNorm = normalizeText(`${candidate.passage ?? ""} ${candidate.questionText}`);
  if (correctText.length > 6 && stemNorm.includes(correctText)) {
    issues.push({
      code: "answer_leak",
      severity: "warning",
      message: "Dogru cevabin metni soru kokunde/parcada aynen geciyor.",
    });
  }

  const blockers = issues.filter((i) => i.severity === "blocker");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  return {
    issues,
    blockers,
    warnings,
    infos,
    verdict: blockers.length > 0 ? "reject" : warnings.length > 0 ? "review" : "pass",
  };
}

// ---------------------------------------------------------------------------
// KALITE SKORU (0-100)
// ---------------------------------------------------------------------------

/**
 * Yalnizca deterministik kontrollerden hesaplanan skor.
 *
 * LLM dogrulamasi olmadigi icin TAVAN uygulanir: kod ile yakalanamayan
 * olgusal hatalar hala mumkun oldugundan bu skor asla "mukemmel" olamaz.
 * Seed sorularin ve ice aktarilan sorularin baslangic skoru budur.
 */
export function deterministicQualityScore(report: QualityReport): number {
  if (report.blockers.length > 0) return 0;
  let score: number = QUALITY_SCORE.deterministicCap;
  score -= report.warnings.length * QUALITY_SCORE.penalty.warning;
  score -= report.infos.length * QUALITY_SCORE.penalty.info;
  return Math.max(0, Math.min(QUALITY_SCORE.deterministicCap, Math.round(score)));
}

/** Bagimsiz denetcinin (2. asama) sonucundan skora yansiyan kisim. */
export interface VerifierSignals {
  /** Denetcinin bagimsiz cozumu ureticininkiyle ayni mi? */
  answerAgrees: boolean;
  ambiguous: boolean;
  possiblyOutdated: boolean;
  /** 0-1. */
  confidence: number;
}

/** Mufredat/zorluk/celdirici denetiminin (3. asama) sonucundan yansiyan kisim. */
export interface AuditSignals {
  /** 2026 resmi mufredati kapsaminda mi? */
  withinCurriculum: boolean;
  /** Zorluk etiketi makul mu? */
  difficultyReasonable: boolean;
  /** Celdiriciler makul mu (sacma derecede kolay degil mi)? */
  distractorsPlausible: boolean;
  /** Aciklama, isaretlenen dogru cevapla tutarli mi? */
  explanationConsistent: boolean;
  /** 0-1. */
  confidence: number;
}

export interface QualityScoreInput {
  report: QualityReport;
  verifier?: VerifierSignals | null;
  audit?: AuditSignals | null;
  /** Zorluk etiketi ve tahmini sure tutarliligi icin. */
  difficulty?: Difficulty | null;
  estimatedSeconds?: number | null;
}

export interface QualityScoreResult {
  score: number;
  /** Skoru asagi ceken gerekceler — kullaniciya gosterilir. */
  reasons: string[];
}

/**
 * Tum asamalari birlestiren nihai kalite skoru.
 *
 * Tasarim karari: LLM dogrulamasi YOKSA skor deterministik tavanda kalir
 * (85). Boylece "dogrulanmamis" bir soru hicbir zaman "dogrulanmis" bir
 * sorudan yuksek puan alamaz, ama esigin (70) uzerinde kalarak kullanilabilir
 * olmaya devam eder.
 */
export function computeQualityScore(input: QualityScoreInput): QualityScoreResult {
  const reasons: string[] = [];

  if (input.report.blockers.length > 0) {
    return {
      score: 0,
      reasons: input.report.blockers.map((b) => b.message),
    };
  }

  let score: number = QUALITY_SCORE.deterministicCap;
  for (const warning of input.report.warnings) {
    score -= QUALITY_SCORE.penalty.warning;
    reasons.push(warning.message);
  }
  score -= input.report.infos.length * QUALITY_SCORE.penalty.info;

  const { penalty } = QUALITY_SCORE;

  if (input.verifier) {
    if (!input.verifier.answerAgrees) {
      return {
        score: 0,
        reasons: [...reasons, "Bağımsız denetçi farklı bir cevap buldu."],
      };
    }
    // Denetci onayladiysa deterministik tavan kalkar.
    score = Math.min(100, score + (100 - QUALITY_SCORE.deterministicCap));
    if (input.verifier.ambiguous) {
      score -= penalty.ambiguous;
      reasons.push("Denetçi soruyu belirsiz buldu.");
    }
    if (input.verifier.possiblyOutdated) {
      score -= penalty.outdated;
      reasons.push("Denetçi bilginin güncelliğini yitirmiş olabileceğini bildirdi.");
    }
    // Guven 1.0'in altindaysa orantili kirpma (0.7 guven -> 9 puan).
    const confidenceGap = Math.max(0, 1 - input.verifier.confidence);
    if (confidenceGap > 0) {
      score -= Math.round(confidenceGap * 30);
      if (input.verifier.confidence < 0.8) {
        reasons.push(`Denetçi güveni düşük (${input.verifier.confidence.toFixed(2)}).`);
      }
    }
  } else {
    reasons.push(
      "Bağımsız LLM doğrulaması yapılmadı; skor deterministik tavanla sınırlı " +
        `(${QUALITY_SCORE.deterministicCap}).`,
    );
  }

  if (input.audit) {
    if (!input.audit.withinCurriculum) {
      score -= penalty.curriculumDrift;
      reasons.push("2026 resmî müfredatının dışına çıkıyor olabilir.");
    }
    if (!input.audit.distractorsPlausible) {
      score -= penalty.weakDistractors;
      reasons.push("Çeldiriciler zayıf — doğru cevap elemeyle kolayca bulunuyor.");
    }
    if (!input.audit.explanationConsistent) {
      score -= penalty.explanationMismatch;
      reasons.push("Açıklama, işaretlenen doğru cevapla tam tutarlı değil.");
    }
    if (!input.audit.difficultyReasonable) {
      score -= penalty.difficultyMismatch;
      reasons.push("Zorluk etiketi sorunun gerçek zorluğuyla uyuşmuyor.");
    }
  }

  // Zorluk etiketi ile tahmini sure tutarli mi? (deterministik capraz kontrol)
  if (input.difficulty && input.estimatedSeconds) {
    const band = DIFFICULTY_SECONDS[input.difficulty];
    if (input.estimatedSeconds < band.min || input.estimatedSeconds > band.max) {
      score -= penalty.difficultyMismatch;
      reasons.push(
        `Tahmini süre (${input.estimatedSeconds} sn) "${input.difficulty}" etiketiyle ` +
          `uyuşmuyor (beklenen ${band.min}-${band.max} sn).`,
      );
    }
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

/** Kaynak guvenilirligi: resmi/dokumantasyon/akademik alanlar tercih edilir. */
const TRUSTED_DOMAIN_PATTERNS: { pattern: RegExp; kind: string }[] = [
  { pattern: /\.gov(\.|$)/i, kind: "official" },
  { pattern: /\.gov\.tr(\/|$)/i, kind: "official" },
  { pattern: /\.edu(\.|$)/i, kind: "academic" },
  { pattern: /\.edu\.tr(\/|$)/i, kind: "academic" },
  { pattern: /\.ac\.uk(\/|$)/i, kind: "academic" },
  { pattern: /ziraatbank\.com\.tr/i, kind: "official" },
  { pattern: /developer\.mozilla\.org/i, kind: "documentation" },
  { pattern: /(^|\.)ietf\.org/i, kind: "standard" },
  { pattern: /(^|\.)rfc-editor\.org/i, kind: "standard" },
  { pattern: /(^|\.)iso\.org/i, kind: "standard" },
  { pattern: /(^|\.)w3\.org/i, kind: "standard" },
  { pattern: /(^|\.)nist\.gov/i, kind: "standard" },
  { pattern: /(^|\.)owasp\.org/i, kind: "documentation" },
  { pattern: /(^|\.)postgresql\.org/i, kind: "documentation" },
  { pattern: /(^|\.)sqlite\.org/i, kind: "documentation" },
  { pattern: /(^|\.)python\.org/i, kind: "documentation" },
  { pattern: /(^|\.)kernel\.org/i, kind: "documentation" },
  { pattern: /(^|\.)cambridge\.org/i, kind: "academic" },
  { pattern: /(^|\.)oxfordlearnersdictionaries\.com/i, kind: "documentation" },
  { pattern: /(^|\.)tdk\.gov\.tr/i, kind: "official" },
  { pattern: /(^|\.)mevzuat\.gov\.tr/i, kind: "official" },
  { pattern: /(^|\.)tuik\.gov\.tr/i, kind: "official" },
  { pattern: /(^|\.)tcmb\.gov\.tr/i, kind: "official" },
];

export function classifySource(
  url: string | null | undefined,
): { kind: "official" | "third_party" | "documentation" | "academic" | "standard"; reliability: "high" | "medium" | "low" } {
  if (!url) return { kind: "third_party", reliability: "low" };
  const match = TRUSTED_DOMAIN_PATTERNS.find((p) => p.pattern.test(url));
  if (match) {
    return {
      kind: match.kind as "official" | "documentation" | "academic" | "standard",
      reliability: "high",
    };
  }
  return { kind: "third_party", reliability: "medium" };
}
