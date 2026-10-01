import type { DB } from "../db/client.ts";
import { getDb } from "../db/client.ts";
import { daysUntilExam, loadExamConfig } from "../config/load-config.ts";
import type { ExamConfig, SectionId } from "../config/exam-config.ts";
import { requiredCorrect } from "../config/exam-config.ts";
import { listSessions } from "../db/repos/sessions.ts";
import { categoryMastery, listMastery } from "../db/repos/mastery.ts";
import { bankCoverage, countQuestions } from "../db/repos/questions.ts";
import { mistakeStats, weakestMistakeTopics } from "../db/repos/mistakes.ts";
import { computeReadiness, type ExamSnapshot } from "./readiness.ts";
import { masteryBand } from "./mastery.ts";
import type { ExamResult, ReadinessReport, TopicMastery } from "./types.ts";

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Tamamlanmis tum gercek sinavlarin sonuclari (eskiden yeniye). */
export function fullExamResults(db: DB = getDb()): ExamResult[] {
  return listSessions({ mode: "full_exam", status: "submitted", limit: 500 }, db)
    .filter((s) => s.resultJson !== null)
    .map((s) => JSON.parse(s.resultJson!) as ExamResult)
    .sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
}

function toSnapshot(result: ExamResult): ExamSnapshot {
  const sectionAccuracy: Partial<Record<SectionId, number>> = {};
  for (const section of result.sections) sectionAccuracy[section.sectionId] = section.accuracy;
  return {
    sessionId: result.sessionId,
    submittedAt: result.submittedAt,
    score: result.score,
    passed: result.passed,
    sectionAccuracy,
    timeVerdict: result.time.verdict,
  };
}

export function readiness(db: DB = getDb()): ReadinessReport {
  const config = loadExamConfig(db);
  return computeReadiness({
    config,
    fullExams: fullExamResults(db).map(toSnapshot),
    mastery: listMastery({}, db),
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardStats {
  config: ExamConfig;
  daysLeft: number;
  readiness: ReadinessReport;
  latestScore: number | null;
  averageScore: number | null;
  bestScore: number | null;
  totalExams: number;
  totalPracticeSessions: number;
  questionsSolved: number;
  overallAccuracy: number | null;
  sectionAccuracy: { sectionId: SectionId; label: string; accuracy: number | null; requiredRatio: number }[];
  avgTimePerQuestionMs: number | null;
  bank: { total: number; verified: number; belowThreshold: number };
  mistakes: { total: number; unresolved: number };
}

export function dashboardStats(db: DB = getDb()): DashboardStats {
  const config = loadExamConfig(db);
  const exams = fullExamResults(db);
  const allSubmitted = listSessions({ status: "submitted", limit: 1000 }, db);

  const scores = exams.map((e) => e.score);
  const coverage = bankCoverage(
    {
      general: config.questionBank.minPerSubsection,
      technical: config.questionBank.minPerTechnicalCategory,
    },
    db,
  );

  // Tum oturumlardan (sinav + calisma) toplam istatistik.
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS answered,
              SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct,
              SUM(time_spent_ms) AS total_ms
       FROM exam_answers WHERE graded_at IS NOT NULL`,
    )
    .get() as { answered: number; correct: number | null; total_ms: number | null };

  const answered = Number(totals.answered);
  const correct = Number(totals.correct ?? 0);

  const sectionAccuracy = config.sections.map((section) => {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n, SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS c
         FROM exam_answers a
         JOIN exam_session_questions sq
           ON sq.session_id = a.session_id AND sq.question_id = a.question_id
         WHERE a.graded_at IS NOT NULL AND sq.section = ?`,
      )
      .get(section.id) as { n: number; c: number | null };
    const n = Number(row.n);
    return {
      sectionId: section.id,
      label: section.shortLabel,
      accuracy: n === 0 ? null : Number(row.c ?? 0) / n,
      requiredRatio: section.passRatio,
    };
  });

  return {
    config,
    daysLeft: daysUntilExam(config),
    readiness: readiness(db),
    latestScore: scores.length ? scores[scores.length - 1]! : null,
    averageScore: scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    bestScore: scores.length ? Math.max(...scores) : null,
    totalExams: exams.length,
    totalPracticeSessions: allSubmitted.filter((s) => s.mode !== "full_exam").length,
    questionsSolved: answered,
    overallAccuracy: answered === 0 ? null : correct / answered,
    sectionAccuracy,
    avgTimePerQuestionMs: answered === 0 ? null : Math.round(Number(totals.total_ms ?? 0) / answered),
    bank: {
      ...countQuestions(db),
      belowThreshold: coverage.filter((c) => c.belowThreshold).length,
    },
    mistakes: mistakeStats(db),
  };
}

// ---------------------------------------------------------------------------
// Ilerleme grafigi
// ---------------------------------------------------------------------------

export interface ProgressPoint {
  date: string;
  sessionId: number;
  score: number;
  passed: boolean;
  general: number;
  english: number;
  technical: number;
}

export function progressSeries(db: DB = getDb()): ProgressPoint[] {
  return fullExamResults(db).map((e) => {
    const acc = (id: SectionId) =>
      round1((e.sections.find((s) => s.sectionId === id)?.accuracy ?? 0) * 100);
    return {
      date: e.submittedAt.slice(0, 10),
      sessionId: e.sessionId,
      score: e.score,
      passed: e.passed,
      general: acc("general"),
      english: acc("english"),
      technical: acc("technical"),
    };
  });
}

// ---------------------------------------------------------------------------
// Iki sinav karsilastirmasi
// ---------------------------------------------------------------------------

export interface ComparisonRow {
  label: string;
  before: number;
  after: number;
  delta: number;
  unit: "score" | "percent";
}

export interface ExamComparison {
  previous: { sessionId: number; date: string; score: number };
  current: { sessionId: number; date: string; score: number };
  rows: ComparisonRow[];
}

export function compareExams(
  previousId: number,
  currentId: number,
  db: DB = getDb(),
): ExamComparison | null {
  const all = fullExamResults(db);
  const previous = all.find((e) => e.sessionId === previousId);
  const current = all.find((e) => e.sessionId === currentId);
  if (!previous || !current) return null;

  const rows: ComparisonRow[] = [
    {
      label: "Toplam Puan",
      before: previous.score,
      after: current.score,
      delta: round1(current.score - previous.score),
      unit: "score",
    },
  ];

  for (const section of current.sections) {
    const before = previous.sections.find((s) => s.sectionId === section.sectionId);
    if (!before) continue;
    rows.push({
      label: section.label,
      before: round1(before.accuracy * 100),
      after: round1(section.accuracy * 100),
      delta: round1((section.accuracy - before.accuracy) * 100),
      unit: "percent",
    });
  }

  // Ortak kategoriler.
  for (const cat of current.categoryBreakdown) {
    const before = previous.categoryBreakdown.find((c) => c.category === cat.category);
    if (!before || before.total < 2 || cat.total < 2) continue;
    rows.push({
      label: cat.category,
      before: round1(before.accuracy * 100),
      after: round1(cat.accuracy * 100),
      delta: round1((cat.accuracy - before.accuracy) * 100),
      unit: "percent",
    });
  }

  return {
    previous: { sessionId: previous.sessionId, date: previous.submittedAt.slice(0, 10), score: previous.score },
    current: { sessionId: current.sessionId, date: current.submittedAt.slice(0, 10), score: current.score },
    rows,
  };
}

// ---------------------------------------------------------------------------
// Gunluk calisma onerisi
// ---------------------------------------------------------------------------

export interface RecommendationItem {
  label: string;
  questionCount: number;
  section: SectionId;
  category?: string;
  subtopic?: string;
  reason: string;
  /** Practice ekranina dogrudan gidecek baglanti parametreleri. */
  link: string;
}

export interface DailyRecommendation {
  items: RecommendationItem[];
  rationale: string[];
  totalQuestions: number;
  generatedAt: string;
}

const DAILY_BUDGET = 40;

export function dailyRecommendation(db: DB = getDb()): DailyRecommendation {
  const config = loadExamConfig(db);
  const exams = fullExamResults(db);
  const mastery = listMastery({}, db);
  const rationale: string[] = [];
  const items: RecommendationItem[] = [];

  if (exams.length === 0 && mastery.length === 0) {
    rationale.push(
      "Henuz performans verisi yok. Once bir Gercek Sinav Simulasyonu cozersen oneriler kisisellesir.",
    );
    for (const section of config.sections) {
      items.push({
        label: `${section.shortLabel} tanisma calismasi`,
        questionCount: 10,
        section: section.id,
        reason: "Baslangic olcumu icin her bolumden ornek.",
        link: `/practice?section=${section.id}&count=10`,
      });
    }
    return {
      items,
      rationale,
      totalQuestions: items.reduce((a, b) => a + b.questionCount, 0),
      generatedAt: new Date().toISOString(),
    };
  }

  // 1) Baraj altindaki bolumler en yuksek oncelik.
  const recent = exams.slice(-3);
  const sectionGap: { section: SectionId; label: string; gap: number; accuracy: number }[] = [];
  for (const section of config.sections) {
    const accuracies = recent
      .map((e) => e.sections.find((s) => s.sectionId === section.id)?.accuracy)
      .filter((a): a is number => typeof a === "number");
    if (accuracies.length === 0) continue;
    const accuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    sectionGap.push({
      section: section.id,
      label: section.shortLabel,
      gap: section.passRatio - accuracy,
      accuracy,
    });
  }
  sectionGap.sort((a, b) => b.gap - a.gap);

  let budget = DAILY_BUDGET;

  for (const entry of sectionGap) {
    if (entry.gap <= 0 || budget <= 0) continue;
    const count = Math.min(budget, entry.gap > 0.1 ? 20 : 10);
    items.push({
      label: `${entry.label} — ${count} soru`,
      questionCount: count,
      section: entry.section,
      reason: `Son ${recent.length} sinavda %${round1(entry.accuracy * 100)} — baraj %${round1(
        (config.sections.find((s) => s.id === entry.section)?.passRatio ?? 0) * 100,
      )}. Baraj altinda.`,
      link: `/practice?section=${entry.section}&count=${count}`,
    });
    rationale.push(
      `${entry.label} baraj altinda (%${round1(entry.accuracy * 100)} < %${round1(
        (config.sections.find((s) => s.id === entry.section)?.passRatio ?? 0) * 100,
      )}).`,
    );
    budget -= count;
  }

  // 2) En zayif alt konular.
  const weakTopics = mastery
    .filter((m) => m.attempts >= 2 && masteryBand(m.masteryScore) === "weak")
    .sort((a, b) => a.masteryScore - b.masteryScore)
    .slice(0, 3);

  for (const topic of weakTopics) {
    if (budget <= 0) break;
    const count = Math.min(budget, 10);
    items.push({
      label: `${topic.subtopic} — ${count} soru`,
      questionCount: count,
      section: topic.section,
      category: topic.category,
      subtopic: topic.subtopic,
      reason: `Ustalik ${round1(topic.masteryScore)} (${topic.correct}/${topic.attempts} dogru).`,
      link: `/practice?mode=custom&category=${encodeURIComponent(topic.category)}&subtopic=${encodeURIComponent(topic.subtopic)}&count=${count}`,
    });
    rationale.push(`${topic.category} > ${topic.subtopic} ustaligi ${round1(topic.masteryScore)}.`);
    budget -= count;
  }

  // 3) Son donemde en cok yanlis yapilan kavramlar.
  if (budget > 0) {
    const topics = weakestMistakeTopics(3, 14, db);
    for (const topic of topics) {
      if (budget <= 0) break;
      const count = Math.min(budget, 10);
      items.push({
        label: `${topic.subtopic} (yeni sorular) — ${count} soru`,
        questionCount: count,
        section: topic.section,
        category: topic.category,
        subtopic: topic.subtopic,
        reason: `Son 2 haftada bu konuda ${topic.mistakes} yanlis.`,
        link: `/practice?mode=mistake_concepts&count=${count}`,
      });
      rationale.push(`Son 2 haftada ${topic.subtopic} konusunda ${topic.mistakes} yanlis yaptin.`);
      budget -= count;
    }
  }

  // 4) Kalan butce: en dusuk ustalikli kategoriden genel calisma.
  if (budget >= 5) {
    const categories = categoryMastery(db);
    const weakest = categories[0];
    if (weakest) {
      items.push({
        label: `${weakest.category} — ${budget} soru`,
        questionCount: budget,
        section: weakest.section,
        category: weakest.category,
        reason: `Kategori ustaligi ${weakest.masteryScore} ile en dusuk seviyede.`,
        link: `/practice?mode=custom&category=${encodeURIComponent(weakest.category)}&count=${budget}`,
      });
    }
  }

  if (rationale.length === 0) {
    rationale.push("Tum bolumler baraj ustunde — mevcut seviyeni korumak icin dengeli tekrar oneriliyor.");
  }

  return {
    items,
    rationale,
    totalQuestions: items.reduce((a, b) => a + b.questionCount, 0),
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Analytics sayfasi
// ---------------------------------------------------------------------------

export interface AnalyticsPayload {
  config: ExamConfig;
  progress: ProgressPoint[];
  readiness: ReadinessReport;
  mastery: TopicMastery[];
  categoryMastery: { section: SectionId; category: string; masteryScore: number; attempts: number }[];
  sectionTrend: {
    sectionId: SectionId;
    label: string;
    requiredCorrect: number;
    totalQuestions: number;
    points: { date: string; accuracy: number; passed: boolean }[];
  }[];
  timeBySection: { date: string; general: number; english: number; technical: number }[];
}

export function analyticsPayload(db: DB = getDb()): AnalyticsPayload {
  const config = loadExamConfig(db);
  const exams = fullExamResults(db);

  const sectionTrend = config.sections.map((section) => ({
    sectionId: section.id,
    label: section.label,
    requiredCorrect: requiredCorrect(section),
    totalQuestions: section.questionCount,
    points: exams
      .map((e) => {
        const s = e.sections.find((x) => x.sectionId === section.id);
        if (!s) return null;
        return {
          date: e.submittedAt.slice(0, 10),
          accuracy: round1(s.accuracy * 100),
          passed: s.passed,
        };
      })
      .filter((p): p is { date: string; accuracy: number; passed: boolean } => p !== null),
  }));

  const timeBySection = exams.map((e) => {
    const minutes = (id: SectionId) =>
      round1((e.time.bySection.find((b) => b.sectionId === id)?.timeMs ?? 0) / 60000);
    return {
      date: e.submittedAt.slice(0, 10),
      general: minutes("general"),
      english: minutes("english"),
      technical: minutes("technical"),
    };
  });

  return {
    config,
    progress: progressSeries(db),
    readiness: readiness(db),
    mastery: listMastery({}, db),
    categoryMastery: categoryMastery(db),
    sectionTrend,
    timeBySection,
  };
}
