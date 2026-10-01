/**
 * REFERANS SORU INCELEME VE TERFI (sartname #13, #4A)
 * ===================================================
 * Ice aktarilan sorular once `pending` kuyrugunda bekler. Kullanici
 * onayladiginda soru ana bankaya "cikmis soru" (historical) olarak TERFI eder
 * ve boylece mevcut sinav motoru (oturum, ustalik, yanlis defteri) hicbir
 * degisiklige gerek kalmadan uzerinde calisir.
 *
 * TERFI ON KOSULLARI — hicbiri esnetilmez:
 *  1. Dogru cevap BILINIYOR olmali (`correctIndex !== null`). Cevabi bilinmeyen
 *     soru sorulamaz; uydurulmaz.
 *  2. Bolum, kategori ve alt konu belli olmali (gerekirse kullanici secer).
 *  3. Ana bankada birebir ayni soru olmamali.
 *
 * SECENEK SAYISI: Uygulama formati 4 secenektir (resmi 2026 formati korunur).
 * Eski sinavlarda 5 secenek yaygindir. Bu durumda YANLIS seceneklerden biri
 * cikarilir ve bu ISLEM KAYIT ALTINA ALINIR (`quality_notes`), boylece sorunun
 * orijinalinden farkli oldugu gizlenmez. Orijinal 5 secenekli hali
 * `reference_questions` icinde bozulmadan durur.
 */

import type { DB } from "../db/client.ts";
import { getDb, nowIso, transaction } from "../db/client.ts";
import { getCategory } from "../config/curriculum.ts";
import { sourceLevel, QUALITY_SCORE } from "../config/exam-style.ts";
import type { Difficulty, OptionKey, ReviewState, SectionId } from "../core/types.ts";
import { OPTION_KEYS } from "../config/exam-config.ts";
import { classifyStyle, detectNegativeStem, estimateSeconds } from "../core/style-profile.ts";
import { deriveConcept } from "../core/concepts.ts";
import { insertQuestion, type NewQuestion } from "../db/repos/questions.ts";
import {
  getReferenceQuestion,
  setReferencePromotedQuestion,
  setReferenceReviewState,
  type ReferenceQuestion,
} from "../db/repos/reference.ts";
import { upsertSource } from "../db/repos/sources.ts";
import { checkQuality, deterministicQualityScore } from "./quality.ts";

export interface PromoteOverrides {
  section?: SectionId;
  category?: string;
  subtopic?: string;
  difficulty?: Difficulty;
  /** Kullanici dogru cevabi elle isaretlediyse (0 tabanli). */
  correctIndex?: number;
  explanation?: string;
  timeSensitive?: boolean;
}

export type PromoteResult =
  | { ok: true; questionId: number; trimmedOption: string | null }
  | { ok: false; message: string };

/**
 * 5 (veya daha fazla) secenegi 4'e indirir: sondan baslayarak DOGRU OLMAYAN
 * ilk secenek cikarilir. Dogru cevabin indeksi buna gore guncellenir.
 */
export function trimToFourOptions(
  options: readonly string[],
  correctIndex: number,
): { options: string[]; correctIndex: number; removed: string | null } {
  const working = [...options];
  let answer = correctIndex;
  let removed: string | null = null;

  while (working.length > 4) {
    let removeAt = -1;
    for (let i = working.length - 1; i >= 0; i -= 1) {
      if (i !== answer) {
        removeAt = i;
        break;
      }
    }
    if (removeAt === -1) break; // olamaz ama sonsuz donguye karsi
    removed = working[removeAt]!;
    working.splice(removeAt, 1);
    if (removeAt < answer) answer -= 1;
  }

  return { options: working, correctIndex: answer, removed };
}

function explanationFor(reference: ReferenceQuestion, override?: string): string {
  const provided = (override ?? reference.explanation ?? "").trim();
  if (provided.length >= 40) return provided;

  const level = sourceLevel(reference.sourceLevel);
  const year = reference.sourceYear ? ` (${reference.sourceYear})` : "";
  const base =
    `Bu soru "${reference.sourceName}"${year} kaynağından içe aktarılmış ` +
    `${level.label} seviyesinde bir referans sorudur. Kaynakta soruya ait bir çözüm ` +
    `açıklaması yer almıyordu; doğru cevap kaynağın cevap anahtarına dayanmaktadır.`;
  return provided.length > 0 ? `${provided}\n\n${base}` : base;
}

export function promoteReferenceQuestion(
  referenceId: number,
  overrides: PromoteOverrides = {},
  db: DB = getDb(),
): PromoteResult {
  const reference = getReferenceQuestion(referenceId, db);
  if (!reference) return { ok: false, message: `Referans soru bulunamadı: #${referenceId}` };
  if (reference.promotedQuestionId) {
    return {
      ok: false,
      message: `Bu soru zaten soru bankasına aktarılmış (#${reference.promotedQuestionId}).`,
    };
  }

  const correctIndex = overrides.correctIndex ?? reference.correctIndex;
  if (correctIndex === null || correctIndex === undefined) {
    return {
      ok: false,
      message:
        "Doğru cevap bilinmiyor. Kaynakta cevap anahtarı yoktu ve uygulama cevap uydurmaz — " +
        "doğru şıkkı elle işaretlemeden bu soru sınavda kullanılamaz.",
    };
  }
  if (correctIndex < 0 || correctIndex >= reference.options.length) {
    return { ok: false, message: "İşaretlenen doğru cevap seçenek aralığının dışında." };
  }

  const category = overrides.category ?? reference.category;
  if (!category) {
    return {
      ok: false,
      message: "Kategori belirlenmemiş. Soruyu bir müfredat kategorisine bağlamadan aktaramam.",
    };
  }
  const categoryConfig = getCategory(category);
  if (!categoryConfig) return { ok: false, message: `Bilinmeyen kategori: ${category}` };

  const section = overrides.section ?? categoryConfig.section;
  const subtopic = overrides.subtopic ?? reference.subtopic ?? categoryConfig.subtopics[0] ?? category;

  const trimmed = trimToFourOptions(reference.options, correctIndex);
  if (trimmed.options.length < 4) {
    return {
      ok: false,
      message: `Soruda yalnızca ${trimmed.options.length} seçenek var; uygulama formatı 4 seçenek gerektiriyor.`,
    };
  }

  const correctKey = OPTION_KEYS[trimmed.correctIndex] as OptionKey | undefined;
  if (!correctKey) return { ok: false, message: "Doğru cevap harfi hesaplanamadı." };

  const notes: string[] = [];
  if (trimmed.removed) {
    notes.push(
      `Orijinali ${reference.options.length} seçenekliydi; uygulama formatı 4 seçenek olduğu için ` +
        `şu yanlış seçenek çıkarıldı: "${trimmed.removed}". Orijinal hali referans kaydında (#${reference.id}) duruyor.`,
    );
  }
  if (reference.answerConfidence < 0.9) {
    notes.push(
      `Doğru cevap güveni ${reference.answerConfidence.toFixed(2)} — kaynağın cevap anahtarına dayanıyor.`,
    );
  }

  const explanation = explanationFor(reference, overrides.explanation);
  const styleType =
    reference.styleType ??
    classifyStyle({
      section,
      questionText: reference.questionText,
      passage: reference.passage,
      subtopic,
    });

  const report = checkQuality({
    questionText: reference.questionText,
    passage: reference.passage,
    optionA: trimmed.options[0]!,
    optionB: trimmed.options[1]!,
    optionC: trimmed.options[2]!,
    optionD: trimmed.options[3]!,
    correctAnswer: correctKey,
    explanation,
  });
  if (report.blockers.length > 0) {
    return {
      ok: false,
      message: `Kalite kontrolünden geçemedi: ${report.blockers.map((b) => b.message).join(" | ")}`,
    };
  }
  notes.push(...report.warnings.map((w) => w.message));

  const level = sourceLevel(reference.sourceLevel);
  const newQuestion: NewQuestion = {
    section,
    category,
    subtopic,
    difficulty: overrides.difficulty ?? reference.difficulty ?? "medium",
    cefrLevel: null,
    questionText: reference.questionText,
    passage: reference.passage,
    optionA: trimmed.options[0]!,
    optionB: trimmed.options[1]!,
    optionC: trimmed.options[2]!,
    optionD: trimmed.options[3]!,
    correctAnswer: correctKey,
    explanation,
    source: reference.sourceName,
    sourceUrl: reference.sourceUrl,
    origin: "import",
    qualityStatus: "verified",
    qualityNotes: notes.length > 0 ? notes.join(" | ") : null,
    timeSensitive: overrides.timeSensitive ?? reference.timeSensitive,
    concept: deriveConcept({
      subtopic,
      correctOptionText: trimmed.options[trimmed.correctIndex] ?? "",
    }),
    styleType,
    isNegative: detectNegativeStem(reference.questionText),
    estimatedSeconds:
      reference.estimatedSeconds ?? estimateSeconds(styleType, reference.questionText.length),
    qualityScore: deterministicQualityScore(report),
    sourceLevel: reference.sourceLevel,
    sourceName: reference.sourceName,
    sourceYear: reference.sourceYear,
    answerConfidence: reference.answerConfidence,
    // Bu bir GERCEK/ESKI sorudur: gercek sinav simulasyonuna karismaz,
    // yalnizca "Cikmis Sorular" modunda sorulur.
    historical: level.claimableAsPastQuestion,
    referenceId: reference.id,
    lastVerifiedAt: nowIso(),
  };

  return transaction(db, () => {
    const outcome = insertQuestion(newQuestion, db);
    if (!outcome.ok) {
      return {
        ok: false as const,
        message: outcome.verdict.reason ?? "Bu soru zaten soru bankasında var.",
      };
    }

    if (reference.sourceUrl) {
      upsertSource(
        {
          title: reference.sourceName,
          url: reference.sourceUrl,
          kind: reference.sourceLevel === "A" ? "official" : "third_party",
          reliability:
            reference.sourceLevel === "A" ? "high" : reference.sourceLevel === "B" ? "medium" : "low",
          accessedAt: nowIso(),
          notes: `${level.label} — çıkmış soru kaynağı.`,
        },
        db,
      );
    }

    setReferenceReviewState(reference.id, "approved", null, db);
    setReferencePromotedQuestion(reference.id, outcome.id, db);

    return { ok: true as const, questionId: outcome.id, trimmedOption: trimmed.removed };
  });
}

/** Onay/ret. `approved` ayrica soruyu ana bankaya terfi ettirir. */
export function reviewReferenceQuestion(
  referenceId: number,
  state: ReviewState,
  options: { notes?: string | null; overrides?: PromoteOverrides } = {},
  db: DB = getDb(),
): { ok: boolean; message: string; questionId?: number } {
  if (state === "approved") {
    const result = promoteReferenceQuestion(referenceId, options.overrides ?? {}, db);
    if (!result.ok) return { ok: false, message: result.message };
    return {
      ok: true,
      questionId: result.questionId,
      message: result.trimmedOption
        ? `Onaylandı ve soru bankasına eklendi (#${result.questionId}). Fazla şık çıkarıldı, not düşüldü.`
        : `Onaylandı ve soru bankasına eklendi (#${result.questionId}).`,
    };
  }

  setReferenceReviewState(referenceId, state, options.notes ?? null, db);
  return {
    ok: true,
    message: state === "rejected" ? "Reddedildi." : "Beklemeye alındı.",
  };
}

export { QUALITY_SCORE };
