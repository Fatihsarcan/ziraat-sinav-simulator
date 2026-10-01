import type { DB } from "../db/client.ts";
import { getDb, transaction } from "../db/client.ts";
import { loadExamConfig } from "../config/load-config.ts";
import { durationSeconds, type ExamConfig, type SectionId } from "../config/exam-config.ts";
import { EXAM_BLUEPRINT, getCategory, categoriesForSection } from "../config/curriculum.ts";
import {
  getQuestions,
  recordQuestionAttempt,
  selectionPool,
  type PoolQuestion,
} from "../db/repos/questions.ts";
import {
  abandonSession,
  answerRecords,
  correctlyAnsweredQuestionIds,
  createSession,
  finalizeSession,
  getActiveSession,
  getPaper,
  getSession,
  gradeAnswerRow,
  isExpired,
  questionIdsInActiveSessions,
  remainingSeconds,
  saveAnswer,
  type PaperEntry,
} from "../db/repos/sessions.ts";
import { masteryKey, masteryMap, recordMasteryAnswer } from "../db/repos/mastery.ts";
import {
  conceptMistakeRows,
  markMistakesResolved,
  mistakeCountByTopic,
  mistakeQuestionIds,
  recordMistake,
} from "../db/repos/mistakes.ts";
import { rankConceptGaps, type ConceptGap } from "./concepts.ts";
import {
  defaultContext,
  selectByBlueprint,
  selectTopN,
  type SelectionContext,
  type SelectionShortfall,
} from "./selection.ts";
import { gradeExam, isCorrect, type GradedItem } from "./scoring.ts";
import type {
  ExamMode,
  ExamQuestionView,
  ExamResult,
  ExamSession,
  OptionKey,
  Question,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Secim baglami
// ---------------------------------------------------------------------------

function buildSelectionContext(
  db: DB,
  overrides: Partial<SelectionContext> = {},
): SelectionContext {
  const mastery = masteryMap(db);
  const masteryByKey = new Map<string, number>();
  for (const [key, value] of mastery) masteryByKey.set(key, value.masteryScore);

  return defaultContext({
    masteryByKey,
    mistakeCountByKey: mistakeCountByTopic(30, db),
    correctlyAnsweredIds: correctlyAnsweredQuestionIds(db),
    now: new Date(),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Oturum baslatma
// ---------------------------------------------------------------------------

export interface StartFullExamOptions {
  /** Soru bankasi yetersizse yine de baslat. Varsayilan: false (acikca reddet). */
  allowPartial?: boolean;
}

export type StartResult =
  | { ok: true; session: ExamSession; shortfalls: SelectionShortfall[] }
  | { ok: false; reason: "insufficient_questions"; shortfalls: SelectionShortfall[]; message: string }
  | { ok: false; reason: "active_session_exists"; session: ExamSession; message: string }
  | { ok: false; reason: "empty_pool"; message: string };

function shortfallMessage(shortfalls: SelectionShortfall[]): string {
  const lines = shortfalls.map(
    (s) => `  - ${s.category}: ${s.available}/${s.requested} soru mevcut (eksik ${s.requested - s.available})`,
  );
  return `Soru bankasi yetersiz:\n${lines.join("\n")}\n\nSoru uretimi calistirip tekrar dene.`;
}

export function startFullExam(
  options: StartFullExamOptions = {},
  db: DB = getDb(),
): StartResult {
  const existing = getActiveSession(db);
  if (existing) {
    return {
      ok: false,
      reason: "active_session_exists",
      session: existing,
      message: `Devam eden bir oturum var (#${existing.id}). Once onu tamamla veya iptal et.`,
    };
  }

  const config = loadExamConfig(db);
  const pool = selectionPool({}, db);
  if (pool.length === 0) {
    return {
      ok: false,
      reason: "empty_pool",
      message: "Soru bankasinda dogrulanmis ('verified') soru yok. Once seed/uretim calistir.",
    };
  }

  const ctx = buildSelectionContext(db);
  const { selected, shortfalls } = selectByBlueprint(
    EXAM_BLUEPRINT,
    pool,
    ctx,
    questionIdsInActiveSessions(db),
  );

  if (shortfalls.length > 0 && !options.allowPartial) {
    return {
      ok: false,
      reason: "insufficient_questions",
      shortfalls,
      message: shortfallMessage(shortfalls),
    };
  }

  // Kagit sirasi resmi bolum sirasina gore duzenlenir (1 -> 2 -> 3).
  const sectionOrder: Record<SectionId, number> = { general: 0, english: 1, technical: 2 };
  const ordered = [...selected].sort((a, b) => {
    const diff = sectionOrder[a.question.section] - sectionOrder[b.question.section];
    if (diff !== 0) return diff;
    return a.question.category.localeCompare(b.question.category);
  });

  const paper: PaperEntry[] = ordered.map((s, index) => ({
    position: index + 1,
    questionId: s.question.id,
    section: s.question.section,
    category: s.question.category,
    subtopic: s.question.subtopic,
  }));

  const session = createSession(
    {
      mode: "full_exam",
      label: `Gercek Sinav Simulasyonu — ${new Date().toLocaleDateString("tr-TR")}`,
      configJson: JSON.stringify(config),
      paramsJson: JSON.stringify({ blueprint: EXAM_BLUEPRINT, allowPartial: options.allowPartial ?? false }),
      durationSeconds: durationSeconds(config),
      paper,
    },
    db,
  );

  return { ok: true, session, shortfalls };
}

export interface PracticeRequest {
  mode: Exclude<ExamMode, "full_exam">;
  count: number;
  section?: SectionId;
  category?: string;
  subtopic?: string;
  /** Practice icin opsiyonel sure siniri (dakika). */
  durationMinutes?: number | null;
}

function practiceLabel(request: PracticeRequest, config: ExamConfig): string {
  const date = new Date().toLocaleDateString("tr-TR");
  switch (request.mode) {
    case "weak_topics":
      return `Zayif Konular — ${request.count} soru — ${date}`;
    case "mistake_concepts":
      return `Zayifliklarimi Calis (yeni sorular) — ${request.count} soru — ${date}`;
    case "retry_mistakes":
      return `Eski Yanlislari Tekrar Coz — ${request.count} soru — ${date}`;
    case "historical":
      return `Cikmis Sorular — ${request.count} soru — ${date}`;
    case "custom": {
      const parts = [request.category, request.subtopic].filter(Boolean);
      return `Ozel Calisma${parts.length ? ` — ${parts.join(" > ")}` : ""} — ${request.count} soru — ${date}`;
    }
    default: {
      const label = request.section
        ? (config.sections.find((s) => s.id === request.section)?.shortLabel ?? request.section)
        : "Karma";
      return `${label} Calismasi — ${request.count} soru — ${date}`;
    }
  }
}

export function startPractice(request: PracticeRequest, db: DB = getDb()): StartResult {
  const existing = getActiveSession(db);
  if (existing) {
    return {
      ok: false,
      reason: "active_session_exists",
      session: existing,
      message: `Devam eden bir oturum var (#${existing.id}). Once onu tamamla veya iptal et.`,
    };
  }

  const config = loadExamConfig(db);
  // "Eski yanlislari tekrar coz" modunda dogru-bilinme cezasi uygulanmaz:
  // amac zaten o sorulari tekrar onune koymaktir.
  const ctx = buildSelectionContext(
    db,
    request.mode === "retry_mistakes" ? { correctlyAnsweredIds: new Set<number>() } : {},
  );
  const exclude = questionIdsInActiveSessions(db);

  let pool: PoolQuestion[];

  if (request.mode === "retry_mistakes") {
    const ids = new Set(
      mistakeQuestionIds({ section: request.section, category: request.category, limit: 500 }, db),
    );
    // Daha once yanlis yapilan soru CIKMIS soru da olabilir; bu modun amaci
    // zaten o sorulari tekrar onune koymaktir.
    pool = selectionPool(
      {
        section: request.section,
        categories: request.category ? [request.category] : undefined,
        includeHistorical: true,
      },
      db,
    ).filter((q) => ids.has(q.id));
    if (pool.length === 0) {
      return {
        ok: false,
        reason: "empty_pool",
        message: "Tekrar cozulecek eski yanlis soru bulunamadi.",
      };
    }
  } else if (request.mode === "mistake_concepts") {
    // Ayni SORULARI degil, ayni KAVRAMLARDAN farkli sorulari getir (#8).
    const gaps = rankConceptGaps(conceptMistakeRows(90, db));
    if (gaps.length === 0) {
      return {
        ok: false,
        reason: "empty_pool",
        message: "Henuz yanlis gecmisin yok — once bir sinav veya calisma tamamla.",
      };
    }
    const top = gaps.slice(0, 20);
    const categories = [...new Set(top.map((g) => g.category))];
    const subtopics = [...new Set(top.map((g) => g.subtopic))];
    // Daha once YANLIS YAPILAN sorularin kendisi bu modda sorulmaz; amac ayni
    // kavrami BASKA bir soruyla olcmek.
    const mistakenQuestionIds = new Set(mistakeQuestionIds({ limit: 1000 }, db));
    const targetConcepts = new Set(top.map((g) => g.concept));

    const candidatePool = selectionPool({ categories, subtopics }, db).filter(
      (q) => !mistakenQuestionIds.has(q.id),
    );
    // Once tam kavram eslesmesi; kavram etiketi olmayan eski sorular icin alt
    // konu eslesmesine duser.
    const byConcept = candidatePool.filter((q) => q.concept && targetConcepts.has(q.concept));
    pool = byConcept.length >= request.count ? byConcept : candidatePool;

    if (pool.length === 0) {
      return {
        ok: false,
        reason: "empty_pool",
        message:
          "Zayif kavramlarinda henuz cozulmemis yeni soru yok. Soru uretimi calistirarak bu kavramlardan yeni soru ekleyebilirsin.",
      };
    }
  } else if (request.mode === "historical") {
    // Cikmis / gercek sorular — yalnizca bu modda sorulur (#4A).
    pool = selectionPool(
      {
        onlyHistorical: true,
        section: request.section,
        categories: request.category ? [request.category] : undefined,
        subtopics: request.subtopic ? [request.subtopic] : undefined,
      },
      db,
    );
    if (pool.length === 0) {
      return {
        ok: false,
        reason: "empty_pool",
        message:
          "Icerde cikmis soru yok. Kaynaklar > Cikmis Sorular ekranindan bir PDF/JSON/TXT " +
          "ice aktarip onayladiginda burada cozebilirsin.",
      };
    }
  } else if (request.mode === "weak_topics") {
    const mastery = masteryMap(db);
    const weakKeys = [...mastery.values()]
      .filter((m) => m.masteryScore < 70)
      .sort((a, b) => a.masteryScore - b.masteryScore)
      .slice(0, 20);
    const categories = [...new Set(weakKeys.map((m) => m.category))];
    const subtopics = [...new Set(weakKeys.map((m) => m.subtopic))];
    pool =
      weakKeys.length > 0
        ? selectionPool({ categories, subtopics }, db)
        : selectionPool({}, db); // veri yoksa genel havuz + adaptif skor
  } else {
    pool = selectionPool(
      {
        section: request.section,
        categories: request.category ? [request.category] : undefined,
        subtopics: request.subtopic ? [request.subtopic] : undefined,
      },
      db,
    );
  }

  if (pool.length === 0) {
    return {
      ok: false,
      reason: "empty_pool",
      message: "Bu filtrelere uyan dogrulanmis soru bulunamadi.",
    };
  }

  const { selected, shortfalls } = selectTopN(pool, request.count, ctx, exclude);
  if (selected.length === 0) {
    return { ok: false, reason: "empty_pool", message: "Secilebilecek soru kalmadi." };
  }

  const paper: PaperEntry[] = selected.map((s, index) => ({
    position: index + 1,
    questionId: s.question.id,
    section: s.question.section,
    category: s.question.category,
    subtopic: s.question.subtopic,
  }));

  const session = createSession(
    {
      mode: request.mode,
      label: practiceLabel(request, config),
      configJson: JSON.stringify(config),
      paramsJson: JSON.stringify(request),
      durationSeconds:
        request.durationMinutes === undefined || request.durationMinutes === null
          ? null
          : request.durationMinutes * 60,
      paper,
    },
    db,
  );

  return { ok: true, session, shortfalls };
}

// ---------------------------------------------------------------------------
// Oturum durumu (sinav sirasinda dogru cevap ASLA gonderilmez)
// ---------------------------------------------------------------------------

export interface SessionState {
  session: ExamSession;
  remainingSeconds: number | null;
  expired: boolean;
  questions: ExamQuestionView[];
  counts: { answered: number; unanswered: number; flagged: number };
  sectionRanges: { sectionId: SectionId; label: string; from: number; to: number }[];
}

export function getSessionState(sessionId: number, db: DB = getDb()): SessionState | null {
  const session = getSession(sessionId, db);
  if (!session) return null;

  const config = JSON.parse(session.configJson) as ExamConfig;
  const paper = getPaper(sessionId, db);
  const questions = getQuestions(paper.map((p) => p.questionId), db);
  const byId = new Map(questions.map((q) => [q.id, q]));

  const views: ExamQuestionView[] = paper.map((entry) => {
    const q = byId.get(entry.questionId);
    if (!q) throw new Error(`Soru bulunamadi: #${entry.questionId}`);
    const sectionLabel =
      config.sections.find((s) => s.id === entry.section)?.shortLabel ?? entry.section;
    return {
      position: entry.position,
      questionId: q.id,
      section: entry.section,
      sectionLabel,
      category: entry.category,
      subtopic: entry.subtopic,
      difficulty: q.difficulty,
      passage: q.passage,
      questionText: q.questionText,
      options: { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD },
      selectedAnswer: entry.selectedAnswer,
      flagged: entry.flagged,
      timeSpentMs: entry.timeSpentMs,
    };
  });

  const answered = views.filter((v) => v.selectedAnswer !== null).length;
  const flagged = views.filter((v) => v.flagged).length;

  const sectionRanges = config.sections
    .map((s) => {
      const positions = views.filter((v) => v.section === s.id).map((v) => v.position);
      if (positions.length === 0) return null;
      return {
        sectionId: s.id,
        label: s.shortLabel,
        from: Math.min(...positions),
        to: Math.max(...positions),
      };
    })
    .filter((x): x is { sectionId: SectionId; label: string; from: number; to: number } => x !== null);

  return {
    session,
    remainingSeconds: remainingSeconds(session, new Date()),
    expired: isExpired(session),
    questions: views,
    counts: { answered, unanswered: views.length - answered, flagged },
    sectionRanges,
  };
}

export interface AnswerUpdate {
  questionId: number;
  selectedAnswer?: OptionKey | null;
  flagged?: boolean;
  addTimeMs?: number;
}

export function updateAnswers(
  sessionId: number,
  updates: readonly AnswerUpdate[],
  db: DB = getDb(),
): { accepted: number; rejected: string | null } {
  const session = getSession(sessionId, db);
  if (!session) return { accepted: 0, rejected: "Oturum bulunamadi." };
  if (session.status !== "in_progress") {
    return { accepted: 0, rejected: "Oturum kapanmis; cevap kaydedilemez." };
  }
  if (isExpired(session)) {
    return { accepted: 0, rejected: "Sure doldu; cevap kaydedilemez." };
  }

  transaction(db, () => {
    for (const update of updates) {
      saveAnswer({ sessionId, ...update }, db);
    }
  });
  return { accepted: updates.length, rejected: null };
}

// ---------------------------------------------------------------------------
// Teslim etme + degerlendirme
// ---------------------------------------------------------------------------

export function submitSession(
  sessionId: number,
  options: { auto?: boolean } = {},
  db: DB = getDb(),
): ExamResult {
  const session = getSession(sessionId, db);
  if (!session) throw new Error(`Oturum bulunamadi: #${sessionId}`);

  if (session.status === "submitted" && session.resultJson) {
    return JSON.parse(session.resultJson) as ExamResult;
  }

  const config = JSON.parse(session.configJson) as ExamConfig;
  const paper = getPaper(sessionId, db);
  const questions = getQuestions(paper.map((p) => p.questionId), db);
  const byId = new Map(questions.map((q) => [q.id, q]));

  const items: GradedItem[] = paper.map((entry) => {
    const q = byId.get(entry.questionId)!;
    return {
      position: entry.position,
      questionId: entry.questionId,
      section: entry.section,
      category: entry.category,
      subtopic: entry.subtopic,
      questionText: q.questionText,
      correctAnswer: q.correctAnswer,
      selectedAnswer: entry.selectedAnswer,
      timeSpentMs: entry.timeSpentMs,
    };
  });

  const submittedAt = new Date().toISOString();
  const result = gradeExam({
    sessionId,
    mode: session.mode,
    label: session.label,
    submittedAt,
    autoSubmitted: options.auto ?? false,
    items,
    config,
    durationSecondsOverride: session.durationSeconds,
  });

  transaction(db, () => {
    for (const item of items) {
      const q = byId.get(item.questionId)!;
      const verdict = isCorrect(item);
      const wasBlank = item.selectedAnswer === null;

      gradeAnswerRow(sessionId, item.questionId, verdict, db);
      recordQuestionAttempt(item.questionId, verdict, item.timeSpentMs, db);

      recordMasteryAnswer(
        {
          section: item.section,
          category: item.category,
          subtopic: item.subtopic,
          difficulty: q.difficulty,
          isCorrect: verdict === true,
          wasBlank,
          answeredAt: submittedAt,
        },
        db,
      );

      if (verdict === true) {
        markMistakesResolved(item.questionId, db);
      } else {
        recordMistake(
          {
            questionId: item.questionId,
            sessionId,
            section: item.section,
            category: item.category,
            subtopic: item.subtopic,
            selectedAnswer: item.selectedAnswer,
            correctAnswer: item.correctAnswer,
            wasBlank,
          },
          db,
        );
      }
    }

    finalizeSession(
      sessionId,
      {
        score: result.score,
        passed: result.passed,
        resultJson: JSON.stringify(result),
        autoSubmitted: options.auto ?? false,
      },
      db,
    );
  });

  return result;
}

/**
 * Suresi dolmus oturumu OTOMATIK teslim eder.
 * Her oturum okumasinda cagrilir; sekme kapali kalsa bile ilk acilista calisir.
 */
export function autoSubmitIfExpired(sessionId: number, db: DB = getDb()): ExamResult | null {
  const session = getSession(sessionId, db);
  if (!session || session.status !== "in_progress") return null;
  if (!isExpired(session)) return null;
  return submitSession(sessionId, { auto: true }, db);
}

/** Acilista tum suresi dolmus oturumlari kapatir (kurtarma). */
export function autoSubmitAllExpired(db: DB = getDb()): number[] {
  const rows = db
    .prepare(
      "SELECT id FROM exam_sessions WHERE status = 'in_progress' AND deadline_at IS NOT NULL AND deadline_at <= ?",
    )
    .all(new Date().toISOString()) as unknown as { id: number }[];
  const submitted: number[] = [];
  for (const row of rows) {
    submitSession(Number(row.id), { auto: true }, db);
    submitted.push(Number(row.id));
  }
  return submitted;
}

export function cancelSession(sessionId: number, db: DB = getDb()): void {
  abandonSession(sessionId, db);
}

/** Sonuc ekrani icin: kaydedilmis sonucu (yoksa hesaplayip) dondurur. */
export function getSessionResult(sessionId: number, db: DB = getDb()): ExamResult | null {
  const session = getSession(sessionId, db);
  if (!session) return null;
  if (session.resultJson) return JSON.parse(session.resultJson) as ExamResult;
  if (session.status === "in_progress") return null;
  return submitSession(sessionId, { auto: false }, db);
}

/** Sonuc ekraninda soru bazli inceleme (dogru cevaplar burada gosterilir). */
export interface ReviewItem {
  position: number;
  question: Question;
  selectedAnswer: OptionKey | null;
  isCorrect: boolean | null;
  timeSpentMs: number;
  flagged: boolean;
}

export function getSessionReview(sessionId: number, db: DB = getDb()): ReviewItem[] {
  const answers = answerRecords(sessionId, db);
  const questions = getQuestions(answers.map((a) => a.questionId), db);
  const byId = new Map(questions.map((q) => [q.id, q]));
  return answers
    .map((a) => {
      const question = byId.get(a.questionId);
      if (!question) return null;
      return {
        position: a.position,
        question,
        selectedAnswer: a.selectedAnswer,
        isCorrect: a.isCorrect,
        timeSpentMs: a.timeSpentMs,
        flagged: a.flagged,
      };
    })
    .filter((x): x is ReviewItem => x !== null);
}

/**
 * Kullanicinin yanlis yaptigi KAVRAMLAR, onceliklendirilmis.
 * "Zayifliklarimi Calis" ekrani ve kavram bazli soru uretimi bunu kullanir.
 */
export function conceptGaps(limit = 25, db: DB = getDb()): ConceptGap[] {
  return rankConceptGaps(conceptMistakeRows(90, db)).slice(0, limit);
}

/** Practice mod icin kullanilabilir kategori/alt konu agaci (Custom Practice). */
export function practiceTree(db: DB = getDb()): {
  section: SectionId;
  label: string;
  categories: { key: string; label: string; official: boolean; subtopics: { key: string; available: number }[] }[];
}[] {
  const config = loadExamConfig(db);
  const rows = db
    .prepare(
      `SELECT category, subtopic, COUNT(*) AS n
       FROM questions WHERE quality_status = 'verified'
       GROUP BY category, subtopic`,
    )
    .all() as unknown as { category: string; subtopic: string; n: number }[];

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(masteryKey(r.category, r.subtopic), Number(r.n));

  return config.sections.map((section) => ({
    section: section.id,
    label: section.label,
    categories: categoriesForSection(section.id).map((category) => ({
      key: category.key,
      label: category.label,
      official: category.official,
      subtopics: category.subtopics.map((subtopic) => ({
        key: subtopic,
        available: counts.get(masteryKey(category.key, subtopic)) ?? 0,
      })),
    })),
  }));
}

export { getCategory };
