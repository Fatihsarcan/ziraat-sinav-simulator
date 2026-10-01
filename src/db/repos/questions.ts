import type { DB, SqlParam } from "../client.ts";
import { fromSqlBool, getDb, nowIso, toSqlBool, transaction } from "../client.ts";
import type {
  BankCoverage,
  CefrLevel,
  Difficulty,
  OptionKey,
  QualityStatus,
  Question,
  QuestionOrigin,
  SectionId,
} from "../../core/types.ts";
import {
  buildContentHash,
  buildFingerprint,
  checkDuplicate,
  correctOptionText,
  type DuplicateVerdict,
  type ExistingQuestionSignature,
} from "../../core/dedup.ts";
import type { SourceLevel, StyleType } from "../../config/exam-style.ts";
import { QUALITY_SCORE } from "../../config/exam-style.ts";

interface QuestionRow {
  id: number;
  section: string;
  category: string;
  subtopic: string;
  difficulty: string;
  cefr_level: string | null;
  question_text: string;
  passage: string | null;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  explanation: string;
  source: string | null;
  source_url: string | null;
  source_id: number | null;
  origin: string;
  generator_model: string | null;
  quality_status: string;
  quality_notes: string | null;
  time_sensitive: number;
  stale_after: string | null;
  content_hash: string;
  fingerprint: string;
  created_at: string;
  verified_at: string | null;
  updated_at: string;
  times_asked: number;
  times_correct: number;
  times_wrong: number;
  last_asked_at: string | null;
  total_answer_ms: number;

  // migration 2
  concept: string | null;
  style_type: string | null;
  is_negative: number;
  estimated_seconds: number | null;
  skills_tested: string | null;
  quality_score: number | null;
  source_level: string | null;
  source_name: string | null;
  source_year: number | null;
  answer_confidence: number | null;
  historical: number;
  reference_id: number | null;
  last_verified_at: string | null;

  // migration 3
  explanation_tr: string | null;
}

export function mapQuestion(row: QuestionRow): Question {
  return {
    id: Number(row.id),
    section: row.section as SectionId,
    category: row.category,
    subtopic: row.subtopic,
    difficulty: row.difficulty as Difficulty,
    cefrLevel: (row.cefr_level as CefrLevel | null) ?? null,
    questionText: row.question_text,
    passage: row.passage,
    optionA: row.option_a,
    optionB: row.option_b,
    optionC: row.option_c,
    optionD: row.option_d,
    correctAnswer: row.correct_answer as OptionKey,
    explanation: row.explanation,
    explanationTr: row.explanation_tr ?? null,
    source: row.source,
    sourceUrl: row.source_url,
    sourceId: row.source_id === null ? null : Number(row.source_id),
    origin: row.origin as QuestionOrigin,
    generatorModel: row.generator_model,
    qualityStatus: row.quality_status as QualityStatus,
    qualityNotes: row.quality_notes,
    timeSensitive: fromSqlBool(row.time_sensitive),
    staleAfter: row.stale_after,
    contentHash: row.content_hash,
    fingerprint: row.fingerprint,
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
    updatedAt: row.updated_at,
    timesAsked: Number(row.times_asked),
    timesCorrect: Number(row.times_correct),
    timesWrong: Number(row.times_wrong),
    lastAskedAt: row.last_asked_at,
    totalAnswerMs: Number(row.total_answer_ms),

    concept: row.concept,
    styleType: (row.style_type as Question["styleType"]) ?? null,
    isNegative: fromSqlBool(row.is_negative),
    estimatedSeconds: row.estimated_seconds === null ? null : Number(row.estimated_seconds),
    skillsTested: parseSkills(row.skills_tested),
    qualityScore: row.quality_score === null ? null : Number(row.quality_score),
    sourceLevel: (row.source_level as Question["sourceLevel"]) ?? null,
    sourceName: row.source_name,
    sourceYear: row.source_year === null ? null : Number(row.source_year),
    answerConfidence: row.answer_confidence === null ? null : Number(row.answer_confidence),
    historical: fromSqlBool(row.historical),
    referenceId: row.reference_id === null ? null : Number(row.reference_id),
    lastVerifiedAt: row.last_verified_at,
  };
}

function parseSkills(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export interface NewQuestion {
  section: SectionId;
  category: string;
  subtopic: string;
  difficulty: Difficulty;
  cefrLevel?: CefrLevel | null;
  questionText: string;
  passage?: string | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: OptionKey;
  explanation: string;
  /** Ingilizce bolumde aciklamanin Turkce karsiligi; diger bolumlerde null. */
  explanationTr?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  sourceId?: number | null;
  origin: QuestionOrigin;
  generatorModel?: string | null;
  qualityStatus: QualityStatus;
  qualityNotes?: string | null;
  timeSensitive?: boolean;
  staleAfter?: string | null;
  verifiedAt?: string | null;

  // migration 2 — stil, kavram, kalite ve kaynak seviyesi
  concept?: string | null;
  styleType?: StyleType | null;
  isNegative?: boolean;
  estimatedSeconds?: number | null;
  skillsTested?: readonly string[] | null;
  qualityScore?: number | null;
  sourceLevel?: SourceLevel | null;
  sourceName?: string | null;
  sourceYear?: number | null;
  answerConfidence?: number | null;
  /** 1 = gercek/eski sinav sorusu; gercek sinav simulasyonuna girmez. */
  historical?: boolean;
  referenceId?: number | null;
  lastVerifiedAt?: string | null;
}

export type InsertOutcome =
  | { ok: true; id: number }
  | { ok: false; reason: "duplicate"; verdict: DuplicateVerdict };

/** Ayni kategorideki mevcut sorularin dedup imzalari. */
export function signaturesForCategory(
  category: string,
  db: DB = getDb(),
): ExistingQuestionSignature[] {
  const rows = db
    .prepare(
      `SELECT id, category, subtopic, fingerprint, content_hash, question_text,
              CASE correct_answer WHEN 'A' THEN option_a WHEN 'B' THEN option_b
                                  WHEN 'C' THEN option_c ELSE option_d END AS correct_text
       FROM questions WHERE category = ? AND quality_status != 'rejected'`,
    )
    .all(category) as unknown as {
    id: number;
    category: string;
    subtopic: string;
    fingerprint: string;
    content_hash: string;
    question_text: string;
    correct_text: string;
  }[];

  return rows.map((r) => ({
    id: Number(r.id),
    category: r.category,
    subtopic: r.subtopic,
    fingerprint: r.fingerprint,
    // Kok-imzasi saklanmaz, okurken uretilir: ek sutun/migration gerekmez ve
    // her zaman guncel metinle tutarlidir.
    stemFingerprint: buildFingerprint(r.question_text, null, []),
    contentHash: r.content_hash,
    correctOptionNormalized: correctOptionText({
      questionText: "",
      optionA: r.correct_text,
      optionB: "",
      optionC: "",
      optionD: "",
      correctAnswer: "A",
      category: r.category,
      subtopic: r.subtopic,
    }),
  }));
}

/**
 * Birebir ayni metne sahip soru bankanin HERHANGI bir yerinde var mi?
 *
 * `content_hash` tum tabloda UNIQUE oldugu icin bu kontrol kategoriyle
 * sinirlandirilamaz; yalnizca ayni kategoriye bakmak, baska kategorideki
 * kopyada INSERT'i kisit ihlaliyle patlatirdi.
 */
function findByContentHash(contentHash: string, db: DB): number | null {
  const row = db
    .prepare("SELECT id FROM questions WHERE content_hash = ?")
    .get(contentHash) as unknown as { id: number } | undefined;
  return row ? Number(row.id) : null;
}

export function insertQuestion(input: NewQuestion, db: DB = getDb()): InsertOutcome {
  const candidate = {
    questionText: input.questionText,
    optionA: input.optionA,
    optionB: input.optionB,
    optionC: input.optionC,
    optionD: input.optionD,
    correctAnswer: input.correctAnswer,
    category: input.category,
    subtopic: input.subtopic,
  };

  const contentHash = buildContentHash(candidate);
  const existingId = findByContentHash(contentHash, db);
  if (existingId !== null) {
    return {
      ok: false,
      reason: "duplicate",
      verdict: {
        isDuplicate: true,
        kind: "exact",
        matchedQuestionId: existingId,
        similarity: 1,
        reason: `Birebir ayni soru zaten var (#${existingId}).`,
      },
    };
  }

  const verdict = checkDuplicate(candidate, signaturesForCategory(input.category, db));
  if (verdict.isDuplicate) return { ok: false, reason: "duplicate", verdict };

  const now = nowIso();
  const result = db
    .prepare(
      `INSERT INTO questions (
         section, category, subtopic, difficulty, cefr_level,
         question_text, passage, option_a, option_b, option_c, option_d,
         correct_answer, explanation, explanation_tr,
         source, source_url, source_id, origin, generator_model,
         quality_status, quality_notes, time_sensitive, stale_after,
         content_hash, fingerprint, created_at, verified_at, updated_at,
         concept, style_type, is_negative, estimated_seconds, skills_tested,
         quality_score, source_level, source_name, source_year, answer_confidence,
         historical, reference_id, last_verified_at
       ) VALUES (?,?,?,?,?, ?,?,?,?,?,?, ?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?,?,
                 ?,?,?,?,?, ?,?,?,?,?, ?,?,?)`,
    )
    .run(
      input.section,
      input.category,
      input.subtopic,
      input.difficulty,
      input.cefrLevel ?? null,
      input.questionText,
      input.passage ?? null,
      input.optionA,
      input.optionB,
      input.optionC,
      input.optionD,
      input.correctAnswer,
      input.explanation,
      input.explanationTr?.trim() || null,
      input.source ?? null,
      input.sourceUrl ?? null,
      input.sourceId ?? null,
      input.origin,
      input.generatorModel ?? null,
      input.qualityStatus,
      input.qualityNotes ?? null,
      toSqlBool(input.timeSensitive ?? false),
      input.staleAfter ?? null,
      contentHash,
      buildFingerprint(input.questionText, input.passage, [
        input.optionA,
        input.optionB,
        input.optionC,
        input.optionD,
      ]),
      now,
      input.verifiedAt ?? (input.qualityStatus === "verified" ? now : null),
      now,
      input.concept ?? null,
      input.styleType ?? null,
      toSqlBool(input.isNegative ?? false),
      input.estimatedSeconds ?? null,
      input.skillsTested && input.skillsTested.length > 0
        ? JSON.stringify(input.skillsTested)
        : null,
      input.qualityScore ?? null,
      input.sourceLevel ?? null,
      input.sourceName ?? null,
      input.sourceYear ?? null,
      input.answerConfidence ?? null,
      toSqlBool(input.historical ?? false),
      input.referenceId ?? null,
      input.lastVerifiedAt ?? null,
    );

  return { ok: true, id: Number(result.lastInsertRowid) };
}

export function getQuestion(id: number, db: DB = getDb()): Question | null {
  const row = db.prepare("SELECT * FROM questions WHERE id = ?").get(id) as
    | QuestionRow
    | undefined;
  return row ? mapQuestion(row) : null;
}

export function getQuestions(ids: readonly number[], db: DB = getDb()): Question[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`)
    .all(...ids) as unknown as QuestionRow[];
  const byId = new Map(rows.map((r) => [Number(r.id), mapQuestion(r)]));
  return ids.map((id) => byId.get(id)).filter((q): q is Question => q !== undefined);
}

export interface QuestionFilter {
  section?: SectionId;
  category?: string;
  subtopic?: string;
  qualityStatus?: QualityStatus;
  difficulty?: Difficulty;
  search?: string;
  /** true = yalnizca cikmis sorular, false = yalnizca uretilmis sorular. */
  historical?: boolean;
  styleType?: StyleType;
  sourceLevel?: SourceLevel;
  /** Kalite skoru bu degerin altindakiler haric tutulur. */
  minQualityScore?: number;
  limit?: number;
  offset?: number;
}

export function listQuestions(
  filter: QuestionFilter = {},
  db: DB = getDb(),
): { items: Question[]; total: number } {
  const where: string[] = [];
  const params: SqlParam[] = [];

  if (filter.section) { where.push("section = ?"); params.push(filter.section); }
  if (filter.category) { where.push("category = ?"); params.push(filter.category); }
  if (filter.subtopic) { where.push("subtopic = ?"); params.push(filter.subtopic); }
  if (filter.qualityStatus) { where.push("quality_status = ?"); params.push(filter.qualityStatus); }
  if (filter.difficulty) { where.push("difficulty = ?"); params.push(filter.difficulty); }
  if (filter.historical !== undefined) {
    where.push("historical = ?");
    params.push(filter.historical ? 1 : 0);
  }
  if (filter.styleType) { where.push("style_type = ?"); params.push(filter.styleType); }
  if (filter.sourceLevel) { where.push("source_level = ?"); params.push(filter.sourceLevel); }
  if (filter.minQualityScore !== undefined) {
    where.push("(quality_score IS NULL OR quality_score >= ?)");
    params.push(filter.minQualityScore);
  }
  if (filter.search) {
    where.push("(question_text LIKE ? OR explanation LIKE ? OR subtopic LIKE ?)");
    const like = `%${filter.search}%`;
    params.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM questions ${whereSql}`)
    .get(...params) as unknown as { n: number };

  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  const rows = db
    .prepare(
      `SELECT * FROM questions ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as unknown as QuestionRow[];

  return { items: rows.map(mapQuestion), total: Number(totalRow.n) };
}

/**
 * Secim havuzu: yalnizca `verified` ve (time_sensitive ise) guncelligini
 * kaybetmemis sorular. Geri donen satirlar secim skorlamasi icin gereken
 * minimum alanlari tasir.
 */
export interface PoolQuestion {
  id: number;
  section: SectionId;
  category: string;
  subtopic: string;
  difficulty: Difficulty;
  cefrLevel: CefrLevel | null;
  timesAsked: number;
  timesCorrect: number;
  timesWrong: number;
  lastAskedAt: string | null;
  /** Olculen tam beceri; kavram bazli secim ve uretim bunu kullanir. */
  concept: string | null;
  historical: boolean;
}

export interface SelectionPoolFilter {
  section?: SectionId;
  categories?: readonly string[];
  subtopics?: readonly string[];
  /**
   * Cikmis (historical) sorulari havuza al.
   *
   * VARSAYILAN: false. Sartname #4A/#10 geregi gercek/eski sorular gercek sinav
   * simulasyonuna ve normal calismaya KARISMAZ; yalnizca "Cikmis Sorular"
   * modunda ve daha once yanlis yapildiysa "Eski Yanlislari Tekrar Coz"
   * modunda sorulur.
   */
  includeHistorical?: boolean;
  /** Yalnizca cikmis sorular (Historical Questions Mode). */
  onlyHistorical?: boolean;
  /** Kalite skoru esigi; verilmezse config'teki gercek sinav esigi uygulanir. */
  minQualityScore?: number;
}

export function selectionPool(
  filter: SelectionPoolFilter,
  db: DB = getDb(),
): PoolQuestion[] {
  const where: string[] = ["quality_status = 'verified'", "(stale_after IS NULL OR stale_after > ?)"];
  const params: SqlParam[] = [nowIso()];

  // Kalite skoru: NULL skorlu eski kayitlar disarida birakilmaz (geriye donuk
  // uyumluluk), ama skoru olup esigin altinda kalanlar gercek sinava alinmaz.
  const minScore = filter.minQualityScore ?? QUALITY_SCORE.minForExam;
  where.push("(quality_score IS NULL OR quality_score >= ?)");
  params.push(minScore);

  if (filter.onlyHistorical) {
    where.push("historical = 1");
  } else if (!filter.includeHistorical) {
    where.push("historical = 0");
  }

  if (filter.section) { where.push("section = ?"); params.push(filter.section); }
  if (filter.categories?.length) {
    where.push(`category IN (${filter.categories.map(() => "?").join(",")})`);
    params.push(...filter.categories);
  }
  if (filter.subtopics?.length) {
    where.push(`subtopic IN (${filter.subtopics.map(() => "?").join(",")})`);
    params.push(...filter.subtopics);
  }

  const rows = db
    .prepare(
      `SELECT id, section, category, subtopic, difficulty, cefr_level,
              times_asked, times_correct, times_wrong, last_asked_at,
              concept, historical
       FROM questions WHERE ${where.join(" AND ")}`,
    )
    .all(...params) as unknown as {
    id: number; section: string; category: string; subtopic: string; difficulty: string;
    cefr_level: string | null; times_asked: number; times_correct: number;
    times_wrong: number; last_asked_at: string | null;
    concept: string | null; historical: number;
  }[];

  return rows.map((r) => ({
    id: Number(r.id),
    section: r.section as SectionId,
    category: r.category,
    subtopic: r.subtopic,
    difficulty: r.difficulty as Difficulty,
    cefrLevel: (r.cefr_level as CefrLevel | null) ?? null,
    timesAsked: Number(r.times_asked),
    timesCorrect: Number(r.times_correct),
    timesWrong: Number(r.times_wrong),
    lastAskedAt: r.last_asked_at,
    concept: r.concept,
    historical: fromSqlBool(r.historical),
  }));
}

/** Cevaplama sonrasi soru sayaclarini gunceller. */
export function recordQuestionAttempt(
  questionId: number,
  isCorrect: boolean | null,
  timeSpentMs: number,
  db: DB = getDb(),
): void {
  db.prepare(
    `UPDATE questions
     SET times_asked     = times_asked + 1,
         times_correct   = times_correct + ?,
         times_wrong     = times_wrong + ?,
         total_answer_ms = total_answer_ms + ?,
         last_asked_at   = ?,
         updated_at      = ?
     WHERE id = ?`,
  ).run(
    isCorrect === true ? 1 : 0,
    isCorrect === false ? 1 : 0,
    Math.max(0, Math.round(timeSpentMs)),
    nowIso(),
    nowIso(),
    questionId,
  );
}

export function setQualityStatus(
  questionId: number,
  status: QualityStatus,
  notes: string | null,
  db: DB = getDb(),
): void {
  const now = nowIso();
  db.prepare(
    `UPDATE questions SET quality_status = ?, quality_notes = ?, updated_at = ?,
            verified_at = CASE WHEN ? = 'verified' THEN ? ELSE verified_at END
     WHERE id = ?`,
  ).run(status, notes, now, status, now, questionId);
}

export function deleteQuestion(questionId: number, db: DB = getDb()): void {
  db.prepare("DELETE FROM questions WHERE id = ?").run(questionId);
}

/** Bolum/kategori bazli soru bankasi doluluk raporu. */
export function bankCoverage(
  thresholds: { general: number; technical: number },
  db: DB = getDb(),
): BankCoverage[] {
  const rows = db
    .prepare(
      `SELECT section, category,
              SUM(CASE WHEN quality_status = 'verified'      THEN 1 ELSE 0 END) AS verified,
              SUM(CASE WHEN quality_status = 'review_needed' THEN 1 ELSE 0 END) AS review_needed,
              SUM(CASE WHEN quality_status = 'verified' AND times_asked = 0 THEN 1 ELSE 0 END) AS unseen
       FROM questions GROUP BY section, category`,
    )
    .all() as unknown as {
    section: string; category: string; verified: number; review_needed: number; unseen: number;
  }[];

  return rows.map((r) => {
    const threshold = r.section === "technical" ? thresholds.technical : thresholds.general;
    return {
      section: r.section as SectionId,
      category: r.category,
      verified: Number(r.verified),
      reviewNeeded: Number(r.review_needed),
      unseen: Number(r.unseen),
      threshold,
      belowThreshold: Number(r.verified) < threshold,
    };
  });
}

export function countQuestions(db: DB = getDb()): { total: number; verified: number } {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN quality_status = 'verified' THEN 1 ELSE 0 END) AS verified
       FROM questions`,
    )
    .get() as unknown as { total: number; verified: number | null };
  return { total: Number(row.total), verified: Number(row.verified ?? 0) };
}

/** Toplu ekleme; her soru icin ayri dedup kontrolu yapar. */
export function insertQuestions(
  inputs: readonly NewQuestion[],
  db: DB = getDb(),
): { inserted: number[]; duplicates: DuplicateVerdict[] } {
  return transaction(db, () => {
    const inserted: number[] = [];
    const duplicates: DuplicateVerdict[] = [];
    for (const input of inputs) {
      const outcome = insertQuestion(input, db);
      if (outcome.ok) inserted.push(outcome.id);
      else duplicates.push(outcome.verdict);
    }
    return { inserted, duplicates };
  });
}
