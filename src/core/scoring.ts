/**
 * PUANLAMA VE BARAJ DEGERLENDIRMESI
 * =================================
 * Resmi kural (23.09.2026 ilani):
 *   "sinav bolumlerinin her biri baraj niteliginde olup, basari tespitinde
 *    bulunulmasi icin; sorulan sorularin 1. bolumden en az %60'inin,
 *    2. bolumden en az %60'inin ve 3. bolumden en az %50'sinin dogru olarak
 *    cevaplandirilmasi ve 60 ve ustu puan alinmasi gerekmektedir."
 *
 * Yani SONUC = (tum bolum barajlari saglandi) VE (toplam puan >= 60).
 * Bir bolum baraji tutmazsa toplam puan yuksek olsa bile sinav BASARISIZ'dir.
 *
 * VARSAYIM: Resmi ilan yanlis cevabin dogruyu goturdugunu belirtmiyor;
 * `examConfig.scoring.penaltyPerWrong` varsayilan olarak 0'dir.
 */

import {
  durationSeconds,
  getSection,
  requiredCorrect,
  type ExamConfig,
  type OptionKey,
  type SectionId,
} from "../config/exam-config.ts";
import type {
  ExamMode,
  ExamResult,
  QuestionTiming,
  SectionResult,
  TimeManagementAnalysis,
  TopicResult,
} from "./types.ts";

export interface GradedItem {
  position: number;
  questionId: number;
  section: SectionId;
  category: string;
  subtopic: string;
  questionText: string;
  correctAnswer: OptionKey;
  selectedAnswer: OptionKey | null;
  timeSpentMs: number;
}

export interface GradeInput {
  sessionId: number;
  mode: ExamMode;
  label: string;
  submittedAt: string;
  autoSubmitted: boolean;
  items: readonly GradedItem[];
  config: ExamConfig;
  /** Sinav suresi (practice modunda null). */
  durationSecondsOverride?: number | null;
}

export function isCorrect(item: GradedItem): boolean | null {
  if (item.selectedAnswer === null) return null;
  return item.selectedAnswer === item.correctAnswer;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeScore(
  correct: number,
  wrong: number,
  totalQuestions: number,
  config: ExamConfig,
): number {
  if (totalQuestions === 0) return 0;
  const raw = correct * config.scoring.pointsPerCorrect - wrong * config.scoring.penaltyPerWrong;
  const maxRaw = totalQuestions * config.scoring.pointsPerCorrect;
  const normalized = (raw / maxRaw) * config.scoring.maxScore;
  return round1(Math.max(0, Math.min(config.scoring.maxScore, normalized)));
}

function buildSectionResults(input: GradeInput): SectionResult[] {
  const results: SectionResult[] = [];

  for (const sectionConfig of input.config.sections) {
    const items = input.items.filter((i) => i.section === sectionConfig.id);
    if (items.length === 0 && input.mode !== "full_exam") continue;

    let correct = 0;
    let wrong = 0;
    let blank = 0;
    let timeSpentMs = 0;

    for (const item of items) {
      timeSpentMs += item.timeSpentMs;
      const verdict = isCorrect(item);
      if (verdict === null) blank += 1;
      else if (verdict) correct += 1;
      else wrong += 1;
    }

    const total = items.length;
    const accuracy = total === 0 ? 0 : correct / total;
    // Baraj her zaman GERCEK soru sayisina gore hesaplanir; practice modunda
    // bolum soru sayisi resmi degerden farkli olabilir.
    const required =
      input.mode === "full_exam"
        ? requiredCorrect(getSection(input.config, sectionConfig.id))
        : Math.ceil(total * sectionConfig.passRatio);
    const passed = correct >= required;

    results.push({
      sectionId: sectionConfig.id,
      label: sectionConfig.label,
      ordinal: sectionConfig.ordinal,
      total,
      correct,
      wrong,
      blank,
      accuracy,
      passRatio: sectionConfig.passRatio,
      requiredCorrect: required,
      passed,
      failReason: passed
        ? null
        : `${sectionConfig.label}: ${correct}/${total} dogru (%${round1(accuracy * 100)}). ` +
          `Gereken: en az ${required} dogru (%${round1(sectionConfig.passRatio * 100)}).`,
      timeSpentMs,
      avgTimePerQuestionMs: total === 0 ? 0 : Math.round(timeSpentMs / total),
    });
  }

  return results.sort((a, b) => a.ordinal - b.ordinal);
}

function buildTopicResults(input: GradeInput): TopicResult[] {
  const map = new Map<string, TopicResult>();
  for (const item of input.items) {
    const key = `${item.category}||${item.subtopic}`;
    const entry = map.get(key) ?? {
      section: item.section,
      category: item.category,
      subtopic: item.subtopic,
      total: 0,
      correct: 0,
      accuracy: 0,
    };
    entry.total += 1;
    if (isCorrect(item) === true) entry.correct += 1;
    map.set(key, entry);
  }
  const topics = [...map.values()];
  for (const t of topics) t.accuracy = t.total === 0 ? 0 : t.correct / t.total;
  return topics;
}

function buildTimeAnalysis(input: GradeInput, sections: SectionResult[]): TimeManagementAnalysis {
  const times = input.items.map((i) => i.timeSpentMs);
  const totalTimeMs = times.reduce((a, b) => a + b, 0);
  const allottedTimeMs =
    input.durationSecondsOverride === null
      ? null
      : (input.durationSecondsOverride ?? durationSeconds(input.config)) * 1000;

  const timings: QuestionTiming[] = input.items.map((i) => ({
    position: i.position,
    questionId: i.questionId,
    section: i.section,
    category: i.category,
    timeSpentMs: i.timeSpentMs,
    isCorrect: isCorrect(i),
    questionText: i.questionText,
  }));

  const withTime = timings.filter((t) => t.timeSpentMs > 0);
  const slowest = [...withTime].sort((a, b) => b.timeSpentMs - a.timeSpentMs).slice(0, 5);
  const fastest = [...withTime].sort((a, b) => a.timeSpentMs - b.timeSpentMs).slice(0, 5);

  const bySection = sections.map((s) => ({
    sectionId: s.sectionId,
    label: s.label,
    timeMs: s.timeSpentMs,
    share: totalTimeMs === 0 ? 0 : s.timeSpentMs / totalTimeMs,
  }));

  const notes: string[] = [];
  let verdict: TimeManagementAnalysis["verdict"] = "Good";

  if (allottedTimeMs !== null && totalTimeMs > 0) {
    const usage = totalTimeMs / allottedTimeMs;
    if (usage > 0.97) {
      verdict = "At Risk";
      notes.push(
        `Sureyi neredeyse tamamen kullandin (%${round1(usage * 100)}). Gercek sinavda zaman baskisi yasayabilirsin.`,
      );
    } else if (usage > 0.88) {
      verdict = "Watch";
      notes.push(`Sure kullanimi %${round1(usage * 100)} — pay az, tempoyu bir miktar artir.`);
    } else {
      notes.push(`Sure kullanimi %${round1(usage * 100)} — rahat bir tempo.`);
    }
  }

  // Bos birakilan ama uzun sure harcanan sorular = kararsizlik sinyali.
  const blankButSlow = input.items.filter(
    (i) => i.selectedAnswer === null && i.timeSpentMs > 90_000,
  ).length;
  if (blankButSlow >= 3) {
    if (verdict === "Good") verdict = "Watch";
    notes.push(
      `${blankButSlow} soruda 90 saniyeden fazla vakit harcayip bos biraktin — erken gecmeyi dene.`,
    );
  }

  const answeredWrongAndSlow = input.items.filter(
    (i) => isCorrect(i) === false && i.timeSpentMs > 120_000,
  ).length;
  if (answeredWrongAndSlow >= 3) {
    if (verdict !== "At Risk") verdict = "Watch";
    notes.push(
      `${answeredWrongAndSlow} soruda 2 dakikadan fazla harcayip yine de yanlis yaptin — bu sorular birakilabilir.`,
    );
  }

  return {
    totalTimeMs,
    allottedTimeMs,
    avgPerQuestionMs: input.items.length === 0 ? 0 : Math.round(totalTimeMs / input.items.length),
    medianPerQuestionMs: Math.round(median(times)),
    bySection,
    slowest,
    fastest,
    verdict,
    notes,
  };
}

export function gradeExam(input: GradeInput): ExamResult {
  let correct = 0;
  let wrong = 0;
  let blank = 0;
  for (const item of input.items) {
    const verdict = isCorrect(item);
    if (verdict === null) blank += 1;
    else if (verdict) correct += 1;
    else wrong += 1;
  }

  const total = input.items.length;
  const sections = buildSectionResults(input);
  const topics = buildTopicResults(input);
  const score = computeScore(correct, wrong, total, input.config);

  const failReasons: string[] = [];
  for (const section of sections) {
    if (!section.passed && section.failReason) failReasons.push(section.failReason);
  }
  // Toplam puan baraji yalnizca gercek sinav simulasyonunda anlamlidir.
  if (input.mode === "full_exam" && score < input.config.thresholds.overallScore) {
    failReasons.push(
      `Toplam puan ${score} — gereken en az ${input.config.thresholds.overallScore}.`,
    );
  }

  const ranked = [...topics]
    .filter((t) => t.total >= 2)
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);

  const categoryMap = new Map<string, { section: SectionId; total: number; correct: number }>();
  for (const item of input.items) {
    const entry = categoryMap.get(item.category) ?? { section: item.section, total: 0, correct: 0 };
    entry.total += 1;
    if (isCorrect(item) === true) entry.correct += 1;
    categoryMap.set(item.category, entry);
  }

  return {
    sessionId: input.sessionId,
    mode: input.mode,
    label: input.label,
    submittedAt: input.submittedAt,
    autoSubmitted: input.autoSubmitted,
    totalQuestions: total,
    correct,
    wrong,
    blank,
    accuracy: total === 0 ? 0 : correct / total,
    score,
    passed: failReasons.length === 0,
    failReasons,
    sections,
    topics,
    weakTopics: ranked.slice(0, 5),
    strongTopics: [...ranked].reverse().slice(0, 5),
    categoryBreakdown: [...categoryMap.entries()]
      .map(([category, v]) => ({
        section: v.section,
        category,
        total: v.total,
        correct: v.correct,
        accuracy: v.total === 0 ? 0 : v.correct / v.total,
      }))
      .sort((a, b) => a.accuracy - b.accuracy),
    time: buildTimeAnalysis(input, sections),
  };
}
