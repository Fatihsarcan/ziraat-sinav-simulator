/**
 * REFERANS (STIL) SORU SETI DEPOSU
 * ================================
 * `reference_questions`, ANA SORU BANKASINDAN AYRI tutulur. Buradaki kayitlar
 * kullaniciya dogrudan sorulmaz; once insan onayindan gecer (sartname #13),
 * onaylandiginda "cikmis soru" olarak `questions` tablosuna TERFI eder.
 *
 * Neden ayri tablo:
 *  - Eski sinavlarda 5 secenek yaygin; ana sema 4 secenek uzerine kurulu.
 *    Ham hali burada kaybolmadan saklanir.
 *  - Dogru cevabi bilinmeyen sorular UYDURULMAZ; `correct_index = NULL` olarak
 *    durur ve terfi edemez.
 *  - Stil analizi, ana bankayi kirletmeden bu set uzerinden calisir.
 */

import type { DB, SqlParam } from "../client.ts";
import { fromSqlBool, getDb, nowIso, toSqlBool, transaction } from "../client.ts";
import type { Difficulty, SectionId } from "../../core/types.ts";
import type { ReviewState, SourceLevel, StyleType } from "../../config/exam-style.ts";
import { buildContentHash, buildFingerprint, normalizeText } from "../../core/dedup.ts";
import type { StyleProfile } from "../../core/style-profile.ts";

// ---------------------------------------------------------------------------
// Ice aktarim partileri
// ---------------------------------------------------------------------------

export interface NewImportBatch {
  filename: string;
  kind: "pdf" | "json" | "txt";
  sourceLevel: SourceLevel;
  sourceName: string;
  sourceYear: number | null;
  sourceUrl: string | null;
  rawChars: number;
  status: "parsed" | "failed";
  message: string | null;
}

export interface ImportBatch extends NewImportBatch {
  id: number;
  detected: number;
  imported: number;
  duplicates: number;
  rejected: number;
  withAnswer: number;
  createdAt: string;
}

export function createImportBatch(input: NewImportBatch, db: DB = getDb()): number {
  const result = db
    .prepare(
      `INSERT INTO import_batches
         (filename, kind, source_level, source_name, source_year, source_url,
          raw_chars, status, message, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      input.filename,
      input.kind,
      input.sourceLevel,
      input.sourceName,
      input.sourceYear,
      input.sourceUrl,
      input.rawChars,
      input.status,
      input.message,
      nowIso(),
    );
  return Number(result.lastInsertRowid);
}

export function updateImportBatchCounts(
  id: number,
  counts: { detected: number; imported: number; duplicates: number; rejected: number; withAnswer: number },
  db: DB = getDb(),
): void {
  db.prepare(
    `UPDATE import_batches
     SET detected = ?, imported = ?, duplicates = ?, rejected = ?, with_answer = ?
     WHERE id = ?`,
  ).run(counts.detected, counts.imported, counts.duplicates, counts.rejected, counts.withAnswer, id);
}

function mapBatch(row: Record<string, unknown>): ImportBatch {
  return {
    id: Number(row.id),
    filename: String(row.filename),
    kind: row.kind as "pdf" | "json" | "txt",
    sourceLevel: row.source_level as SourceLevel,
    sourceName: String(row.source_name),
    sourceYear: row.source_year === null ? null : Number(row.source_year),
    sourceUrl: (row.source_url as string | null) ?? null,
    rawChars: Number(row.raw_chars),
    detected: Number(row.detected),
    imported: Number(row.imported),
    duplicates: Number(row.duplicates),
    rejected: Number(row.rejected),
    withAnswer: Number(row.with_answer),
    status: row.status as "parsed" | "failed",
    message: (row.message as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

export function listImportBatches(limit = 30, db: DB = getDb()): ImportBatch[] {
  const rows = db
    .prepare("SELECT * FROM import_batches ORDER BY created_at DESC LIMIT ?")
    .all(limit) as unknown as Record<string, unknown>[];
  return rows.map(mapBatch);
}

// ---------------------------------------------------------------------------
// Referans sorular
// ---------------------------------------------------------------------------

export interface NewReferenceQuestion {
  batchId: number | null;
  section: SectionId | null;
  category: string | null;
  subtopic: string | null;
  concept?: string | null;

  sourceLevel: SourceLevel;
  sourceName: string;
  sourceYear: number | null;
  sourceUrl: string | null;
  originalOrGenerated?: "original" | "generated";

  questionText: string;
  passage?: string | null;
  options: readonly string[];
  /** null = dogru cevap bilinmiyor. ASLA uydurulmaz. */
  correctIndex: number | null;
  answerConfidence: number;
  explanation?: string | null;

  styleType: StyleType | null;
  isNegative: boolean;
  difficulty?: Difficulty | null;
  estimatedSeconds?: number | null;
  timeSensitive?: boolean;
}

export interface ReferenceQuestion {
  id: number;
  batchId: number | null;
  section: SectionId | null;
  category: string | null;
  subtopic: string | null;
  concept: string | null;

  sourceLevel: SourceLevel;
  sourceName: string;
  sourceYear: number | null;
  sourceUrl: string | null;
  originalOrGenerated: "original" | "generated";

  questionText: string;
  passage: string | null;
  options: string[];
  correctIndex: number | null;
  answerConfidence: number;
  explanation: string | null;

  styleType: StyleType | null;
  isNegative: boolean;
  difficulty: Difficulty | null;
  estimatedSeconds: number | null;
  stemChars: number;
  avgOptionChars: number;
  optionCount: number;
  timeSensitive: boolean;

  reviewState: ReviewState;
  reviewNotes: string | null;
  promotedQuestionId: number | null;

  createdAt: string;
  reviewedAt: string | null;
}

function mapReference(row: Record<string, unknown>): ReferenceQuestion {
  return {
    id: Number(row.id),
    batchId: row.batch_id === null ? null : Number(row.batch_id),
    section: (row.section as SectionId | null) ?? null,
    category: (row.category as string | null) ?? null,
    subtopic: (row.subtopic as string | null) ?? null,
    concept: (row.concept as string | null) ?? null,
    sourceLevel: row.source_level as SourceLevel,
    sourceName: String(row.source_name),
    sourceYear: row.source_year === null ? null : Number(row.source_year),
    sourceUrl: (row.source_url as string | null) ?? null,
    originalOrGenerated: row.original_or_generated as "original" | "generated",
    questionText: String(row.question_text),
    passage: (row.passage as string | null) ?? null,
    options: JSON.parse(String(row.options_json)) as string[],
    correctIndex: row.correct_index === null ? null : Number(row.correct_index),
    answerConfidence: Number(row.answer_confidence),
    explanation: (row.explanation as string | null) ?? null,
    styleType: (row.style_type as StyleType | null) ?? null,
    isNegative: fromSqlBool(row.is_negative),
    difficulty: (row.difficulty as Difficulty | null) ?? null,
    estimatedSeconds: row.estimated_seconds === null ? null : Number(row.estimated_seconds),
    stemChars: Number(row.stem_chars),
    avgOptionChars: Number(row.avg_option_chars),
    optionCount: Number(row.option_count),
    timeSensitive: fromSqlBool(row.time_sensitive),
    reviewState: row.review_state as ReviewState,
    reviewNotes: (row.review_notes as string | null) ?? null,
    promotedQuestionId:
      row.promoted_question_id === null ? null : Number(row.promoted_question_id),
    createdAt: String(row.created_at),
    reviewedAt: (row.reviewed_at as string | null) ?? null,
  };
}

/**
 * Referans sorusunun kimligi: metin + siralanmis secenekler.
 * Ana bankadaki `contentHash` ile AYNI algoritmadir; boylece ayni soru hem
 * referansta hem bankada varsa yakalanabilir.
 */
function referenceHashes(input: {
  questionText: string;
  passage?: string | null;
  options: readonly string[];
}): { contentHash: string; fingerprint: string } {
  const padded = [...input.options];
  while (padded.length < 4) padded.push("");
  return {
    contentHash: buildContentHash({
      questionText: input.questionText,
      optionA: padded[0]!,
      optionB: padded[1]!,
      optionC: padded[2]!,
      optionD: padded[3]!,
      correctAnswer: "A",
      category: "",
      subtopic: "",
    }),
    fingerprint: buildFingerprint(input.questionText, input.passage, input.options),
  };
}

export type ReferenceInsertOutcome =
  | { ok: true; id: number }
  | { ok: false; reason: "duplicate"; existingId: number };

export function insertReferenceQuestion(
  input: NewReferenceQuestion,
  db: DB = getDb(),
): ReferenceInsertOutcome {
  const { contentHash, fingerprint } = referenceHashes(input);

  const existing = db
    .prepare("SELECT id FROM reference_questions WHERE content_hash = ?")
    .get(contentHash) as { id: number } | undefined;
  if (existing) return { ok: false, reason: "duplicate", existingId: Number(existing.id) };

  const optionLengths = input.options.map((o) => o.trim().length);
  const avgOptionChars =
    optionLengths.length === 0
      ? 0
      : Math.round(optionLengths.reduce((a, b) => a + b, 0) / optionLengths.length);

  const result = db
    .prepare(
      `INSERT INTO reference_questions (
         batch_id, section, category, subtopic, concept,
         source_level, source_name, source_year, source_url, original_or_generated,
         question_text, passage, options_json, correct_index, answer_confidence, explanation,
         style_type, is_negative, difficulty, estimated_seconds,
         stem_chars, avg_option_chars, option_count, time_sensitive,
         review_state, content_hash, fingerprint, created_at
       ) VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?, ?,?,?,?, 'pending', ?,?,?)`,
    )
    .run(
      input.batchId,
      input.section,
      input.category,
      input.subtopic,
      input.concept ?? null,
      input.sourceLevel,
      input.sourceName,
      input.sourceYear,
      input.sourceUrl,
      input.originalOrGenerated ?? "original",
      input.questionText.trim(),
      input.passage?.trim() || null,
      JSON.stringify(input.options),
      input.correctIndex,
      input.answerConfidence,
      input.explanation?.trim() || null,
      input.styleType,
      toSqlBool(input.isNegative),
      input.difficulty ?? null,
      input.estimatedSeconds ?? null,
      `${input.passage ?? ""}${input.questionText}`.trim().length,
      avgOptionChars,
      input.options.length,
      toSqlBool(input.timeSensitive ?? false),
      contentHash,
      fingerprint,
      nowIso(),
    );

  return { ok: true, id: Number(result.lastInsertRowid) };
}

export interface ReferenceFilter {
  reviewState?: ReviewState;
  section?: SectionId;
  sourceLevel?: SourceLevel;
  batchId?: number;
  search?: string;
  /** Yalnizca dogru cevabi bilinenler. */
  withAnswerOnly?: boolean;
  limit?: number;
  offset?: number;
}

export function listReferenceQuestions(
  filter: ReferenceFilter = {},
  db: DB = getDb(),
): { items: ReferenceQuestion[]; total: number } {
  const where: string[] = [];
  const params: SqlParam[] = [];

  if (filter.reviewState) { where.push("review_state = ?"); params.push(filter.reviewState); }
  if (filter.section) { where.push("section = ?"); params.push(filter.section); }
  if (filter.sourceLevel) { where.push("source_level = ?"); params.push(filter.sourceLevel); }
  if (filter.batchId) { where.push("batch_id = ?"); params.push(filter.batchId); }
  if (filter.withAnswerOnly) where.push("correct_index IS NOT NULL");
  if (filter.search) {
    where.push("question_text LIKE ?");
    params.push(`%${filter.search}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM reference_questions ${whereSql}`)
    .get(...params) as unknown as { n: number };

  const rows = db
    .prepare(
      `SELECT * FROM reference_questions ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, filter.limit ?? 50, filter.offset ?? 0) as unknown as Record<string, unknown>[];

  return { items: rows.map(mapReference), total: Number(totalRow.n) };
}

export function getReferenceQuestion(id: number, db: DB = getDb()): ReferenceQuestion | null {
  const row = db.prepare("SELECT * FROM reference_questions WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapReference(row) : null;
}

export function setReferenceReviewState(
  id: number,
  state: ReviewState,
  notes: string | null,
  db: DB = getDb(),
): void {
  db.prepare(
    "UPDATE reference_questions SET review_state = ?, review_notes = ?, reviewed_at = ? WHERE id = ?",
  ).run(state, notes, nowIso(), id);
}

export function setReferencePromotedQuestion(
  id: number,
  questionId: number | null,
  db: DB = getDb(),
): void {
  db.prepare("UPDATE reference_questions SET promoted_question_id = ? WHERE id = ?").run(
    questionId,
    id,
  );
}

/**
 * Referans setinin ozeti: seviye ve bolum kirilimi.
 * Sources panelinde "kac referans cikarildi" sutununu besler.
 */
export interface ReferenceSummaryRow {
  sourceLevel: SourceLevel;
  sourceName: string;
  sourceYear: number | null;
  sourceUrl: string | null;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  withAnswer: number;
  sections: string[];
}

export function referenceSummary(db: DB = getDb()): ReferenceSummaryRow[] {
  const rows = db
    .prepare(
      `SELECT source_level, source_name, source_year, source_url,
              COUNT(*) AS total,
              SUM(CASE WHEN review_state = 'pending'  THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN review_state = 'approved' THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN review_state = 'rejected' THEN 1 ELSE 0 END) AS rejected,
              SUM(CASE WHEN correct_index IS NOT NULL THEN 1 ELSE 0 END) AS with_answer,
              GROUP_CONCAT(DISTINCT section) AS sections
       FROM reference_questions
       GROUP BY source_level, source_name, source_year, source_url
       ORDER BY source_level, source_year DESC`,
    )
    .all() as unknown as Record<string, unknown>[];

  return rows.map((r) => ({
    sourceLevel: r.source_level as SourceLevel,
    sourceName: String(r.source_name),
    sourceYear: r.source_year === null ? null : Number(r.source_year),
    sourceUrl: (r.source_url as string | null) ?? null,
    total: Number(r.total),
    pending: Number(r.pending),
    approved: Number(r.approved),
    rejected: Number(r.rejected),
    withAnswer: Number(r.with_answer),
    sections: String(r.sections ?? "")
      .split(",")
      .filter(Boolean),
  }));
}

/** Stil analizine girecek onaylanmis + bekleyen referanslar (reddedilenler haric). */
export function styleObservationRows(
  filter: { section?: SectionId } = {},
  db: DB = getDb(),
): Record<string, unknown>[] {
  const where = ["review_state != 'rejected'"];
  const params: SqlParam[] = [];
  if (filter.section) {
    where.push("section = ?");
    params.push(filter.section);
  }
  return db
    .prepare(
      `SELECT section, category, subtopic, source_level, style_type, is_negative,
              difficulty, estimated_seconds, stem_chars, avg_option_chars, option_count
       FROM reference_questions WHERE ${where.join(" AND ")}`,
    )
    .all(...params) as unknown as Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Stil profilleri
// ---------------------------------------------------------------------------

export function saveStyleProfile(profile: StyleProfile, db: DB = getDb()): void {
  db.prepare(
    `INSERT INTO style_profiles (scope, sample_size, confidence, profile_json, computed_at)
     VALUES (?,?,?,?,?)
     ON CONFLICT(scope) DO UPDATE SET
       sample_size = excluded.sample_size,
       confidence = excluded.confidence,
       profile_json = excluded.profile_json,
       computed_at = excluded.computed_at`,
  ).run(
    profile.scope,
    profile.sampleSize,
    profile.confidence,
    JSON.stringify(profile),
    nowIso(),
  );
}

export function loadStyleProfile(
  scope: string,
  db: DB = getDb(),
): { profile: StyleProfile; computedAt: string } | null {
  const row = db.prepare("SELECT * FROM style_profiles WHERE scope = ?").get(scope) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    profile: JSON.parse(String(row.profile_json)) as StyleProfile,
    computedAt: String(row.computed_at),
  };
}

export function listStyleProfiles(db: DB = getDb()): { profile: StyleProfile; computedAt: string }[] {
  const rows = db
    .prepare("SELECT * FROM style_profiles ORDER BY scope")
    .all() as unknown as Record<string, unknown>[];
  return rows.map((r) => ({
    profile: JSON.parse(String(r.profile_json)) as StyleProfile,
    computedAt: String(r.computed_at),
  }));
}

/**
 * Referans soruyla ana bankadaki bir soru ayni mi?
 * Terfi (promote) oncesi kullanilir.
 */
export function findQuestionByReferenceText(
  input: { questionText: string; options: readonly string[] },
  db: DB = getDb(),
): number | null {
  const { contentHash } = referenceHashes(input);
  const row = db.prepare("SELECT id FROM questions WHERE content_hash = ?").get(contentHash) as
    | { id: number }
    | undefined;
  if (row) return Number(row.id);

  // Metin birebir esit degilse normalize edilmis kok uzerinden ikinci deneme.
  const normalized = normalizeText(input.questionText);
  const candidate = db
    .prepare("SELECT id, question_text FROM questions WHERE LENGTH(question_text) BETWEEN ? AND ?")
    .all(
      Math.max(0, input.questionText.length - 20),
      input.questionText.length + 20,
    ) as unknown as { id: number; question_text: string }[];
  const match = candidate.find((c) => normalizeText(c.question_text) === normalized);
  return match ? Number(match.id) : null;
}

export { transaction };
