import type { DB } from "../client.ts";
import { getDb, nowIso, transaction } from "../client.ts";
import { insertQuestion, type NewQuestion } from "../repos/questions.ts";
import { upsertSource } from "../repos/sources.ts";
import {
  checkQuality,
  classifySource,
  deterministicQualityScore,
} from "../../question-engine/quality.ts";
import { classifyStyle, detectNegativeStem, estimateSeconds } from "../../core/style-profile.ts";
import { deriveConcept } from "../../core/concepts.ts";
import { GENERAL_SEED } from "./general.ts";
import { ENGLISH_SEED } from "./english.ts";
import { TECHNICAL_SEED } from "./technical.ts";
import type { SeedQuestion } from "./types.ts";

export const ALL_SEED_QUESTIONS: SeedQuestion[] = [
  ...GENERAL_SEED,
  ...ENGLISH_SEED,
  ...TECHNICAL_SEED,
];

export interface SeedResult {
  attempted: number;
  inserted: number;
  duplicates: number;
  duplicateDetails: { question: string; reason: string }[];
  qualityFailures: { question: string; issues: string[] }[];
}

/**
 * Baslangic soru bankasini yukler.
 *
 * Sorular elle yazildigi icin `verified` olarak isaretlenir; yine de ayni
 * deterministik kalite kontrolunden gecirilir — bir sorun bulunursa
 * `review_needed` olur ve gercek sinava alinmaz.
 * Idempotenttir: tekrar calistirmak birebir kopyalari ekler degil, atlar.
 */
export function seedQuestions(db: DB = getDb()): SeedResult {
  const result: SeedResult = {
    attempted: ALL_SEED_QUESTIONS.length,
    inserted: 0,
    duplicates: 0,
    duplicateDetails: [],
    qualityFailures: [],
  };

  transaction(db, () => {
    for (const seed of ALL_SEED_QUESTIONS) {
      const report = checkQuality({
        questionText: seed.q,
        passage: seed.passage ?? null,
        optionA: seed.a,
        optionB: seed.b,
        optionC: seed.c,
        optionD: seed.d,
        correctAnswer: seed.correct,
        explanation: seed.explanation,
        sourceUrl: seed.sourceUrl,
      });

      if (report.blockers.length > 0) {
        result.qualityFailures.push({
          question: seed.q,
          issues: report.blockers.map((i) => i.message),
        });
        continue;
      }

      let sourceId: number | null = null;
      if (seed.sourceUrl) {
        const classification = classifySource(seed.sourceUrl);
        sourceId = upsertSource(
          {
            title: seed.source ?? seed.sourceUrl,
            url: seed.sourceUrl,
            kind: classification.kind,
            reliability: classification.reliability,
            accessedAt: nowIso(),
            notes: "Baslangic soru bankasinda kullanildi.",
          },
          db,
        );
      }

      // Stil/kavram alanlari seed sorularinda da doldurulur; boylece adaptif
      // secim, kavram bazli tekrar uretimi ve kalite esigi ilk gunden calisir.
      const styleType = classifyStyle({
        section: seed.section,
        questionText: seed.q,
        passage: seed.passage ?? null,
        subtopic: seed.subtopic,
      });
      const correctOption = { A: seed.a, B: seed.b, C: seed.c, D: seed.d }[seed.correct];

      const question: NewQuestion = {
        section: seed.section,
        category: seed.category,
        subtopic: seed.subtopic,
        difficulty: seed.difficulty,
        cefrLevel: seed.cefr ?? null,
        questionText: seed.q,
        passage: seed.passage ?? null,
        optionA: seed.a,
        optionB: seed.b,
        optionC: seed.c,
        optionD: seed.d,
        correctAnswer: seed.correct,
        explanation: seed.explanation,
        explanationTr: seed.explanationTr ?? null,
        source: seed.source ?? null,
        sourceUrl: seed.sourceUrl ?? null,
        sourceId,
        origin: "seed",
        generatorModel: null,
        // Uyari varsa gercek sinava girmesin diye review_needed yapilir.
        // `info` seviyesindeki notlar karari etkilemez, yalnizca kaydedilir.
        qualityStatus: report.warnings.length > 0 ? "review_needed" : "verified",
        qualityNotes:
          [...report.warnings, ...report.infos].map((i) => `[${i.severity}] ${i.message}`).join(" | ") ||
          null,
        timeSensitive: seed.timeSensitive ?? false,
        concept: deriveConcept({ subtopic: seed.subtopic, correctOptionText: correctOption }),
        styleType,
        isNegative: detectNegativeStem(seed.q),
        estimatedSeconds: estimateSeconds(styleType, `${seed.passage ?? ""}${seed.q}`.length),
        // Elle yazilmis sorular kaynak hiyerarsisinde E (uretilmis) seviyesidir;
        // LLM dogrulamasindan gecmedikleri icin skorlari deterministik tavanda kalir.
        qualityScore: deterministicQualityScore(report),
        sourceLevel: "E",
        sourceName: seed.source ?? null,
        historical: false,
      };

      const outcome = insertQuestion(question, db);
      if (outcome.ok) {
        result.inserted += 1;
      } else {
        result.duplicates += 1;
        result.duplicateDetails.push({
          question: seed.q,
          reason: outcome.verdict.reason ?? "Tekrar eden soru.",
        });
      }
    }
  });

  return result;
}
