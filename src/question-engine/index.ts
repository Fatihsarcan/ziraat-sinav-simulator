import type { DB } from "../db/client.ts";
import { getDb } from "../db/client.ts";
import { loadExamConfig } from "../config/load-config.ts";
import { ALL_CATEGORIES, getCategory } from "../config/curriculum.ts";
import { bankCoverage } from "../db/repos/questions.ts";
import { generateForCategory, listGenerationLog, type GenerationOutcome } from "./generator.ts";
import { generationStatus } from "./llm-client.ts";
import type { BankCoverage } from "../core/types.ts";
import { conceptGaps } from "../core/exam-engine.ts";

export { generationStatus, listGenerationLog, generateForCategory };
export type { GenerationOutcome };

/**
 * SORU URETIM KUYRUGU
 * ===================
 * Tek kullanicili yerel bir uygulama icin dagitik bir kuyruk mimarisi
 * gereksizdir. Kullanilan model basit ve yeterlidir:
 *
 *  - Bankanin doluluk durumu `coverageReport()` ile her an olculebilir.
 *  - Esigin altindaki kategoriler `generationPlan()` ile siralanir.
 *  - `runGenerationPlan()` bunlari SIRAYLA isler ve ilerlemeyi geri bildirir.
 *  - Islem sunucu tarafinda calisir; kullanici sinav baslatirken beklemez,
 *    cunku sinav yalnizca MEVCUT `verified` sorulardan kurulur ve soru
 *    yetersizse acikca hata verir (uydurma soru uretilmez).
 */

export interface CoverageReport {
  categories: (BankCoverage & { label: string; official: boolean; deficit: number })[];
  totalDeficit: number;
  belowThreshold: number;
}

export function coverageReport(db: DB = getDb()): CoverageReport {
  const config = loadExamConfig(db);
  const thresholds = {
    general: config.questionBank.minPerSubsection,
    technical: config.questionBank.minPerTechnicalCategory,
  };
  const rows = bankCoverage(thresholds, db);
  const byCategory = new Map(rows.map((r) => [r.category, r]));

  const categories = ALL_CATEGORIES.map((category) => {
    const row = byCategory.get(category.key);
    const threshold =
      category.section === "technical" ? thresholds.technical : thresholds.general;
    const verified = row?.verified ?? 0;
    return {
      section: category.section,
      category: category.key,
      label: category.label,
      official: category.official,
      verified,
      reviewNeeded: row?.reviewNeeded ?? 0,
      unseen: row?.unseen ?? 0,
      threshold,
      belowThreshold: verified < threshold,
      deficit: Math.max(0, threshold - verified),
    };
  });

  return {
    categories,
    totalDeficit: categories.reduce((a, c) => a + c.deficit, 0),
    belowThreshold: categories.filter((c) => c.belowThreshold).length,
  };
}

export interface PlanStep {
  section: BankCoverage["section"];
  category: string;
  label: string;
  count: number;
  deficit: number;
}

/** Eksigi en buyuk kategoriden baslayarak uretim plani cikarir. */
export function generationPlan(
  options: { maxSteps?: number; batchSize?: number } = {},
  db: DB = getDb(),
): PlanStep[] {
  const config = loadExamConfig(db);
  const batchSize = options.batchSize ?? config.questionBank.generationBatchSize;
  const report = coverageReport(db);

  return report.categories
    .filter((c) => c.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit)
    .slice(0, options.maxSteps ?? 8)
    .map((c) => ({
      section: c.section,
      category: c.category,
      label: c.label,
      count: Math.min(batchSize, c.deficit),
      deficit: c.deficit,
    }));
}

export interface PlanRunResult {
  steps: { step: PlanStep; outcome: GenerationOutcome }[];
  totalAccepted: number;
  totalReviewNeeded: number;
  totalRejected: number;
  totalDuplicates: number;
  aborted: boolean;
  error: string | null;
}

/** Plani sirayla calistirir. Bir adim hata verirse durur ve raporlar. */
export async function runGenerationPlan(
  plan: readonly PlanStep[],
  db: DB = getDb(),
): Promise<PlanRunResult> {
  const result: PlanRunResult = {
    steps: [],
    totalAccepted: 0,
    totalReviewNeeded: 0,
    totalRejected: 0,
    totalDuplicates: 0,
    aborted: false,
    error: null,
  };

  const status = generationStatus();
  if (!status.available) {
    result.aborted = true;
    result.error = status.reason;
    return result;
  }

  for (const step of plan) {
    const outcome = await generateForCategory(
      { section: step.section, category: step.category, count: step.count },
      db,
    );
    result.steps.push({ step, outcome });
    result.totalAccepted += outcome.accepted;
    result.totalReviewNeeded += outcome.reviewNeeded;
    result.totalRejected += outcome.rejected;
    result.totalDuplicates += outcome.duplicates;

    if (outcome.error) {
      result.aborted = true;
      result.error = outcome.error;
      break;
    }
  }

  return result;
}

/**
 * KAVRAM BAZLI URETIM (sartname #8)
 * ---------------------------------
 * Kullanici bir kavramda yanlis yapti: ayni soruyu tekrar sormak yerine AYNI
 * KAVRAMI farkli senaryoyla olcen YENI sorular uret.
 *
 * Model'e verilen baglam: kavram adi, alt konu, o kavramda bankada ZATEN olan
 * sorular (tekrarlanmasin diye) ve kullanicinin ustalik durumu.
 */
export async function generateForConcept(
  gap: { category: string; subtopic: string; concept: string },
  count: number,
  db: DB = getDb(),
): Promise<GenerationOutcome> {
  const categoryConfig = getCategory(gap.category);
  if (!categoryConfig) {
    return failedOutcome(count, `Bilinmeyen kategori: ${gap.category}`);
  }
  return generateForCategory(
    {
      section: categoryConfig.section,
      category: gap.category,
      subtopics: [gap.subtopic],
      count,
      focusConcept: { concept: gap.concept, subtopic: gap.subtopic },
    },
    db,
  );
}

/** Kullanicinin en oncelikli kavram bosluklarindan sirayla soru uretir. */
export async function generateForConceptGaps(
  options: { maxConcepts?: number; perConcept?: number } = {},
  db: DB = getDb(),
): Promise<{ concept: string; outcome: GenerationOutcome }[]> {
  const gaps = conceptGaps(options.maxConcepts ?? 5, db);
  const results: { concept: string; outcome: GenerationOutcome }[] = [];
  for (const gap of gaps) {
    const outcome = await generateForConcept(gap, options.perConcept ?? 4, db);
    results.push({ concept: gap.concept, outcome });
    if (outcome.error) break;
  }
  return results;
}

function failedOutcome(requested: number, error: string): GenerationOutcome {
  return {
    requested,
    generated: 0,
    accepted: 0,
    duplicates: 0,
    rejected: 0,
    reviewNeeded: 0,
    insertedIds: [],
    sourcesRecorded: 0,
    usedWebSearch: false,
    details: [],
    error,
  };
}

/** Belirli bir alt konudan yeni soru uretimi (Mistake Concepts destegi). */
export async function generateForSubtopic(
  category: string,
  subtopic: string,
  count: number,
  db: DB = getDb(),
): Promise<GenerationOutcome> {
  const categoryConfig = getCategory(category);
  if (!categoryConfig) {
    return {
      requested: count,
      generated: 0,
      accepted: 0,
      duplicates: 0,
      rejected: 0,
      reviewNeeded: 0,
      insertedIds: [],
      sourcesRecorded: 0,
      usedWebSearch: false,
      details: [],
      error: `Bilinmeyen kategori: ${category}`,
    };
  }
  return generateForCategory(
    { section: categoryConfig.section, category, subtopics: [subtopic], count },
    db,
  );
}
