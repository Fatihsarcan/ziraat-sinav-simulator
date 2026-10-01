import type { DB, SqlParam } from "../client.ts";
import { fromSqlBool, getDb, nowIso, toSqlBool, transaction } from "../client.ts";
import type {
  AnswerRecord,
  ExamMode,
  ExamSession,
  OptionKey,
  SectionId,
  SessionStatus,
} from "../../core/types.ts";

interface SessionRow {
  id: number;
  mode: string;
  label: string;
  status: string;
  config_json: string;
  params_json: string | null;
  total_questions: number;
  duration_seconds: number | null;
  started_at: string;
  deadline_at: string | null;
  submitted_at: string | null;
  auto_submitted: number;
  score: number | null;
  passed: number | null;
  result_json: string | null;
  created_at: string;
}

function mapSession(row: SessionRow): ExamSession {
  return {
    id: Number(row.id),
    mode: row.mode as ExamMode,
    label: row.label,
    status: row.status as SessionStatus,
    configJson: row.config_json,
    paramsJson: row.params_json,
    totalQuestions: Number(row.total_questions),
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    startedAt: row.started_at,
    deadlineAt: row.deadline_at,
    submittedAt: row.submitted_at,
    autoSubmitted: fromSqlBool(row.auto_submitted),
    score: row.score === null ? null : Number(row.score),
    passed: row.passed === null ? null : fromSqlBool(row.passed),
    resultJson: row.result_json,
    createdAt: row.created_at,
  };
}

export interface PaperEntry {
  position: number;
  questionId: number;
  section: SectionId;
  category: string;
  subtopic: string;
}

export interface CreateSessionInput {
  mode: ExamMode;
  label: string;
  configJson: string;
  paramsJson?: string | null;
  durationSeconds: number | null;
  paper: readonly PaperEntry[];
}

export function createSession(input: CreateSessionInput, db: DB = getDb()): ExamSession {
  return transaction(db, () => {
    const startedAt = nowIso();
    const deadlineAt =
      input.durationSeconds === null
        ? null
        : new Date(Date.parse(startedAt) + input.durationSeconds * 1000).toISOString();

    const result = db
      .prepare(
        `INSERT INTO exam_sessions
           (mode, label, status, config_json, params_json, total_questions,
            duration_seconds, started_at, deadline_at, created_at)
         VALUES (?,?, 'in_progress', ?,?,?,?,?,?,?)`,
      )
      .run(
        input.mode,
        input.label,
        input.configJson,
        input.paramsJson ?? null,
        input.paper.length,
        input.durationSeconds,
        startedAt,
        deadlineAt,
        startedAt,
      );

    const sessionId = Number(result.lastInsertRowid);

    const insertPaper = db.prepare(
      `INSERT INTO exam_session_questions (session_id, position, question_id, section, category, subtopic)
       VALUES (?,?,?,?,?,?)`,
    );
    const insertAnswer = db.prepare(
      `INSERT INTO exam_answers (session_id, question_id, position, flagged, time_spent_ms)
       VALUES (?,?,?,0,0)`,
    );

    for (const entry of input.paper) {
      insertPaper.run(
        sessionId,
        entry.position,
        entry.questionId,
        entry.section,
        entry.category,
        entry.subtopic,
      );
      insertAnswer.run(sessionId, entry.questionId, entry.position);
    }

    return getSession(sessionId, db)!;
  });
}

export function getSession(id: number, db: DB = getDb()): ExamSession | null {
  const row = db.prepare("SELECT * FROM exam_sessions WHERE id = ?").get(id) as
    | SessionRow
    | undefined;
  return row ? mapSession(row) : null;
}

/** Devam eden (submit edilmemis) en son oturum. */
export function getActiveSession(db: DB = getDb()): ExamSession | null {
  const row = db
    .prepare("SELECT * FROM exam_sessions WHERE status = 'in_progress' ORDER BY started_at DESC LIMIT 1")
    .get() as unknown as SessionRow | undefined;
  return row ? mapSession(row) : null;
}

export function listSessions(
  filter: { mode?: ExamMode; status?: SessionStatus; limit?: number } = {},
  db: DB = getDb(),
): ExamSession[] {
  const where: string[] = [];
  const params: SqlParam[] = [];
  if (filter.mode) { where.push("mode = ?"); params.push(filter.mode); }
  if (filter.status) { where.push("status = ?"); params.push(filter.status); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM exam_sessions ${whereSql} ORDER BY started_at DESC LIMIT ?`)
    .all(...params, filter.limit ?? 100) as unknown as SessionRow[];
  return rows.map(mapSession);
}

export interface PaperRow extends PaperEntry {
  selectedAnswer: OptionKey | null;
  flagged: boolean;
  timeSpentMs: number;
  isCorrect: boolean | null;
  firstSeenAt: string | null;
  answeredAt: string | null;
}

/** Oturumun soru kagidi + cevap durumu (soru metinleri dahil DEGIL). */
export function getPaper(sessionId: number, db: DB = getDb()): PaperRow[] {
  const rows = db
    .prepare(
      `SELECT sq.position, sq.question_id, sq.section, sq.category, sq.subtopic,
              a.selected_answer, a.flagged, a.time_spent_ms, a.is_correct,
              a.first_seen_at, a.answered_at
       FROM exam_session_questions sq
       JOIN exam_answers a ON a.session_id = sq.session_id AND a.question_id = sq.question_id
       WHERE sq.session_id = ?
       ORDER BY sq.position`,
    )
    .all(sessionId) as unknown as {
    position: number; question_id: number; section: string; category: string; subtopic: string;
    selected_answer: string | null; flagged: number; time_spent_ms: number;
    is_correct: number | null; first_seen_at: string | null; answered_at: string | null;
  }[];

  return rows.map((r) => ({
    position: Number(r.position),
    questionId: Number(r.question_id),
    section: r.section as SectionId,
    category: r.category,
    subtopic: r.subtopic,
    selectedAnswer: (r.selected_answer as OptionKey | null) ?? null,
    flagged: fromSqlBool(r.flagged),
    timeSpentMs: Number(r.time_spent_ms),
    isCorrect: r.is_correct === null ? null : fromSqlBool(r.is_correct),
    firstSeenAt: r.first_seen_at,
    answeredAt: r.answered_at,
  }));
}

export interface SaveAnswerInput {
  sessionId: number;
  questionId: number;
  selectedAnswer?: OptionKey | null;
  flagged?: boolean;
  /** Bu cagrida eklenecek sure (kumulatif toplanir). */
  addTimeMs?: number;
}

export function saveAnswer(input: SaveAnswerInput, db: DB = getDb()): void {
  const sets: string[] = [];
  const params: SqlParam[] = [];

  if (input.selectedAnswer !== undefined) {
    sets.push("selected_answer = ?", "answered_at = ?");
    params.push(input.selectedAnswer, input.selectedAnswer === null ? null : nowIso());
  }
  if (input.flagged !== undefined) {
    sets.push("flagged = ?");
    params.push(toSqlBool(input.flagged));
  }
  if (input.addTimeMs !== undefined && input.addTimeMs > 0) {
    sets.push("time_spent_ms = time_spent_ms + ?");
    params.push(Math.round(input.addTimeMs));
  }
  sets.push("first_seen_at = COALESCE(first_seen_at, ?)");
  params.push(nowIso());

  if (sets.length === 0) return;

  db.prepare(
    `UPDATE exam_answers SET ${sets.join(", ")} WHERE session_id = ? AND question_id = ?`,
  ).run(...params, input.sessionId, input.questionId);
}

/** Cevap satirina notlanan dogru/yanlis bilgisi (submit aninda yazilir). */
export function gradeAnswerRow(
  sessionId: number,
  questionId: number,
  isCorrect: boolean | null,
  db: DB = getDb(),
): void {
  db.prepare(
    "UPDATE exam_answers SET is_correct = ?, graded_at = ? WHERE session_id = ? AND question_id = ?",
  ).run(isCorrect === null ? null : toSqlBool(isCorrect), nowIso(), sessionId, questionId);
}

export function finalizeSession(
  sessionId: number,
  data: { score: number; passed: boolean; resultJson: string; autoSubmitted: boolean },
  db: DB = getDb(),
): void {
  db.prepare(
    `UPDATE exam_sessions
     SET status = 'submitted', submitted_at = ?, auto_submitted = ?, score = ?, passed = ?, result_json = ?
     WHERE id = ?`,
  ).run(
    nowIso(),
    toSqlBool(data.autoSubmitted),
    data.score,
    toSqlBool(data.passed),
    data.resultJson,
    sessionId,
  );
}

export function abandonSession(sessionId: number, db: DB = getDb()): void {
  db.prepare("UPDATE exam_sessions SET status = 'abandoned' WHERE id = ? AND status = 'in_progress'")
    .run(sessionId);
}

export function deleteSession(sessionId: number, db: DB = getDb()): void {
  db.prepare("DELETE FROM exam_sessions WHERE id = ?").run(sessionId);
}

/**
 * Kalan sure (saniye). Sunucu saatine ve DB'deki `deadline_at`'e dayanir;
 * sayfa yenilense de sifirlanmaz.
 */
export function remainingSeconds(session: ExamSession, now: Date = new Date()): number | null {
  if (session.deadlineAt === null) return null;
  const remainingMs = Date.parse(session.deadlineAt) - now.getTime();
  return Math.max(0, Math.floor(remainingMs / 1000));
}

export function isExpired(session: ExamSession, now: Date = new Date()): boolean {
  if (session.deadlineAt === null) return false;
  return Date.parse(session.deadlineAt) <= now.getTime();
}

/** Daha once en az bir kez DOGRU cevaplanmis soru id'leri. */
export function correctlyAnsweredQuestionIds(db: DB = getDb()): Set<number> {
  const rows = db
    .prepare("SELECT DISTINCT question_id FROM exam_answers WHERE is_correct = 1")
    .all() as unknown as { question_id: number }[];
  return new Set(rows.map((r) => Number(r.question_id)));
}

/** Devam eden oturumlarda kullanilan soru id'leri (tekrar secilmesin). */
export function questionIdsInActiveSessions(db: DB = getDb()): Set<number> {
  const rows = db
    .prepare(
      `SELECT DISTINCT sq.question_id
       FROM exam_session_questions sq
       JOIN exam_sessions s ON s.id = sq.session_id
       WHERE s.status = 'in_progress'`,
    )
    .all() as unknown as { question_id: number }[];
  return new Set(rows.map((r) => Number(r.question_id)));
}

export function answerRecords(sessionId: number, db: DB = getDb()): AnswerRecord[] {
  const rows = db
    .prepare("SELECT * FROM exam_answers WHERE session_id = ? ORDER BY position")
    .all(sessionId) as unknown as {
    session_id: number; question_id: number; position: number; selected_answer: string | null;
    is_correct: number | null; flagged: number; time_spent_ms: number;
    first_seen_at: string | null; answered_at: string | null; graded_at: string | null;
  }[];
  return rows.map((r) => ({
    sessionId: Number(r.session_id),
    questionId: Number(r.question_id),
    position: Number(r.position),
    selectedAnswer: (r.selected_answer as OptionKey | null) ?? null,
    isCorrect: r.is_correct === null ? null : fromSqlBool(r.is_correct),
    flagged: fromSqlBool(r.flagged),
    timeSpentMs: Number(r.time_spent_ms),
    firstSeenAt: r.first_seen_at,
    answeredAt: r.answered_at,
    gradedAt: r.graded_at,
  }));
}
