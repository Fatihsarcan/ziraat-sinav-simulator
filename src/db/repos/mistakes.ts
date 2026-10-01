import type { DB, SqlParam } from "../client.ts";
import { fromSqlBool, getDb, nowIso, toSqlBool } from "../client.ts";
import type { Difficulty, MistakeEntry, OptionKey, SectionId } from "../../core/types.ts";
import { masteryKey } from "./mastery.ts";
import type { ConceptMistakeRow } from "../../core/concepts.ts";

export interface RecordMistakeInput {
  questionId: number;
  sessionId: number;
  section: SectionId;
  category: string;
  subtopic: string;
  selectedAnswer: OptionKey | null;
  correctAnswer: OptionKey;
  wasBlank: boolean;
}

export function recordMistake(input: RecordMistakeInput, db: DB = getDb()): void {
  db.prepare(
    `INSERT INTO mistake_history
       (question_id, session_id, section, category, subtopic, selected_answer, correct_answer, was_blank, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    input.questionId,
    input.sessionId,
    input.section,
    input.category,
    input.subtopic,
    input.selectedAnswer,
    input.correctAnswer,
    toSqlBool(input.wasBlank),
    nowIso(),
  );
}

/**
 * Bir soru sonradan dogru cozulunce eski yanlis KAYITLARI SILINMEZ;
 * yalnizca `resolved_at` isaretlenir (sartname #17: gecmis saklanir).
 */
export function markMistakesResolved(questionId: number, db: DB = getDb()): void {
  db.prepare(
    "UPDATE mistake_history SET resolved_at = ? WHERE question_id = ? AND resolved_at IS NULL",
  ).run(nowIso(), questionId);
}

export interface MistakeFilter {
  section?: SectionId;
  category?: string;
  subtopic?: string;
  includeResolved?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export function listMistakes(
  filter: MistakeFilter = {},
  db: DB = getDb(),
): { items: MistakeEntry[]; total: number } {
  const where: string[] = [];
  const params: SqlParam[] = [];

  if (filter.section) { where.push("m.section = ?"); params.push(filter.section); }
  if (filter.category) { where.push("m.category = ?"); params.push(filter.category); }
  if (filter.subtopic) { where.push("m.subtopic = ?"); params.push(filter.subtopic); }
  if (!filter.includeResolved) where.push("m.resolved_at IS NULL");
  if (filter.search) {
    where.push("q.question_text LIKE ?");
    params.push(`%${filter.search}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM mistake_history m
       JOIN questions q ON q.id = m.question_id ${whereSql}`,
    )
    .get(...params) as unknown as { n: number };

  const rows = db
    .prepare(
      `SELECT m.id, m.question_id, m.session_id, m.section, m.category, m.subtopic,
              m.selected_answer, m.correct_answer, m.was_blank, m.created_at, m.resolved_at,
              s.label AS session_label,
              q.difficulty, q.question_text, q.passage,
              q.option_a, q.option_b, q.option_c, q.option_d,
              q.explanation, q.explanation_tr, q.source, q.source_url
       FROM mistake_history m
       JOIN questions q      ON q.id = m.question_id
       JOIN exam_sessions s  ON s.id = m.session_id
       ${whereSql}
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, filter.limit ?? 50, filter.offset ?? 0) as unknown as {
    id: number; question_id: number; session_id: number; section: string; category: string;
    subtopic: string; selected_answer: string | null; correct_answer: string; was_blank: number;
    created_at: string; resolved_at: string | null; session_label: string; difficulty: string;
    question_text: string; passage: string | null; option_a: string; option_b: string;
    option_c: string; option_d: string; explanation: string; explanation_tr: string | null;
    source: string | null;
    source_url: string | null;
  }[];

  const items: MistakeEntry[] = rows.map((r) => ({
    id: Number(r.id),
    questionId: Number(r.question_id),
    sessionId: Number(r.session_id),
    sessionLabel: r.session_label,
    section: r.section as SectionId,
    category: r.category,
    subtopic: r.subtopic,
    difficulty: r.difficulty as Difficulty,
    questionText: r.question_text,
    passage: r.passage,
    options: { A: r.option_a, B: r.option_b, C: r.option_c, D: r.option_d },
    selectedAnswer: (r.selected_answer as OptionKey | null) ?? null,
    correctAnswer: r.correct_answer as OptionKey,
    wasBlank: fromSqlBool(r.was_blank),
    explanation: r.explanation,
    explanationTr: r.explanation_tr ?? null,
    source: r.source,
    sourceUrl: r.source_url,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }));

  return { items, total: Number(totalRow.n) };
}

/**
 * Son N gundeki yanlislarin alt konu yogunlugu.
 * Adaptif secimde "yanlis yapilan KAVRAMDAN yeni soru" onceligi icin kullanilir.
 */
export function mistakeCountByTopic(
  windowDays = 30,
  db: DB = getDb(),
): Map<string, number> {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT category, subtopic, COUNT(*) AS n
       FROM mistake_history WHERE created_at >= ?
       GROUP BY category, subtopic`,
    )
    .all(cutoff) as unknown as { category: string; subtopic: string; n: number }[];

  const map = new Map<string, number>();
  for (const r of rows) map.set(masteryKey(r.category, r.subtopic), Number(r.n));
  return map;
}

/** "Practice My Weaknesses" icin: en cok yanlis yapilan alt konular. */
export function weakestMistakeTopics(
  limit = 10,
  windowDays = 60,
  db: DB = getDb(),
): { section: SectionId; category: string; subtopic: string; mistakes: number }[] {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT section, category, subtopic, COUNT(*) AS n
       FROM mistake_history WHERE created_at >= ?
       GROUP BY section, category, subtopic
       ORDER BY n DESC LIMIT ?`,
    )
    .all(cutoff, limit) as unknown as { section: string; category: string; subtopic: string; n: number }[];
  return rows.map((r) => ({
    section: r.section as SectionId,
    category: r.category,
    subtopic: r.subtopic,
    mistakes: Number(r.n),
  }));
}

/** "Retry Old Mistakes" icin: gercekten yanlis yapilmis SORU id'leri. */
export function mistakeQuestionIds(
  filter: { section?: SectionId; category?: string; limit?: number } = {},
  db: DB = getDb(),
): number[] {
  const where: string[] = [];
  const params: SqlParam[] = [];
  if (filter.section) { where.push("section = ?"); params.push(filter.section); }
  if (filter.category) { where.push("category = ?"); params.push(filter.category); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT question_id, MAX(created_at) AS last_wrong
       FROM mistake_history ${whereSql}
       GROUP BY question_id ORDER BY last_wrong DESC LIMIT ?`,
    )
    .all(...params, filter.limit ?? 100) as unknown as { question_id: number }[];
  return rows.map((r) => Number(r.question_id));
}

/**
 * Kavram bazli yanlis kayitlari (sartname #8).
 *
 * `mistake_history` alt konuya kadar biliyor; kavram etiketi `questions`
 * tablosunda durdugu icin birlestirme gerekir. Kavram bos olan eski kayitlar
 * alt konuya duser — `rankConceptGaps` bunu zaten ele alir.
 */
export function conceptMistakeRows(
  windowDays = 90,
  db: DB = getDb(),
): ConceptMistakeRow[] {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT m.section, m.category, m.subtopic, q.concept, m.question_id,
              m.created_at, m.resolved_at, m.was_blank
       FROM mistake_history m
       JOIN questions q ON q.id = m.question_id
       WHERE m.created_at >= ?`,
    )
    .all(cutoff) as unknown as {
    section: string; category: string; subtopic: string; concept: string | null;
    question_id: number; created_at: string; resolved_at: string | null; was_blank: number;
  }[];

  return rows.map((r) => ({
    section: r.section,
    category: r.category,
    subtopic: r.subtopic,
    concept: r.concept,
    questionId: Number(r.question_id),
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    wasBlank: fromSqlBool(r.was_blank),
  }));
}

export function mistakeStats(db: DB = getDb()): { total: number; unresolved: number } {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END) AS unresolved
       FROM mistake_history`,
    )
    .get() as unknown as { total: number; unresolved: number | null };
  return { total: Number(row.total), unresolved: Number(row.unresolved ?? 0) };
}
