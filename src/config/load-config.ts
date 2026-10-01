/**
 * Runtime examConfig yukleyici.
 *
 * Varsayilan `EXAM_CONFIG` uzerine `settings` tablosundaki kullanici
 * override'larini uygular. Uygulamada sinav sabitlerine erisen her kod
 * `loadExamConfig()` cagirir — `EXAM_CONFIG`'i dogrudan okumaz.
 */

import type { DB } from "../db/client.ts";
import { getDb } from "../db/client.ts";
import { SETTING_KEYS, getJsonSetting, getSetting, setJsonSetting, setSetting } from "../db/repos/settings.ts";
import { EXAM_CONFIG, validateExamConfig, type ExamConfig, type SectionId } from "./exam-config.ts";

/** Ayarlardan degistirilebilen alanlar. */
export interface ExamConfigOverride {
  examDate?: string;
  durationMinutes?: number;
  sectionQuestionCounts?: Partial<Record<SectionId, number>>;
  subsectionQuestionCounts?: Record<string, number>;
  thresholds?: {
    overallScore?: number;
    bySection?: Partial<Record<SectionId, number>>;
  };
}

export function loadExamConfig(db: DB = getDb()): ExamConfig {
  const override = getJsonSetting<ExamConfigOverride>(SETTING_KEYS.examConfigOverride, db) ?? {};
  const examDate = getSetting(SETTING_KEYS.examDate, db) ?? override.examDate ?? EXAM_CONFIG.examDate;
  return applyOverride(EXAM_CONFIG, { ...override, examDate });
}

export function applyOverride(base: ExamConfig, override: ExamConfigOverride): ExamConfig {
  const sections = base.sections.map((section) => {
    const overriddenSectionCount = override.sectionQuestionCounts?.[section.id];
    const subsections = section.subsections.map((sub) => {
      const overriddenSubCount = override.subsectionQuestionCounts?.[sub.key];
      return overriddenSubCount === undefined ? sub : { ...sub, questionCount: overriddenSubCount };
    });
    const subSum = subsections.reduce((acc, s) => acc + s.questionCount, 0);
    return {
      ...section,
      // Alt-bolum override'i varsa bolum toplami ondan turetilir; yoksa
      // dogrudan bolum override'i (ya da varsayilan) kullanilir.
      questionCount:
        override.subsectionQuestionCounts !== undefined && subSum > 0
          ? subSum
          : (overriddenSectionCount ?? section.questionCount),
      passRatio: override.thresholds?.bySection?.[section.id] ?? section.passRatio,
      subsections,
    };
  });

  const bySection = Object.fromEntries(
    sections.map((s) => [s.id, s.passRatio]),
  ) as Record<SectionId, number>;

  return {
    ...base,
    examDate: override.examDate ?? base.examDate,
    durationMinutes: override.durationMinutes ?? base.durationMinutes,
    totalQuestions: sections.reduce((acc, s) => acc + s.questionCount, 0),
    sections,
    thresholds: {
      overallScore: override.thresholds?.overallScore ?? base.thresholds.overallScore,
      bySection,
    },
  };
}

export function saveExamConfigOverride(override: ExamConfigOverride, db: DB = getDb()): ExamConfig {
  const candidate = applyOverride(EXAM_CONFIG, override);
  const problems = validateExamConfig(candidate);
  if (problems.length > 0) {
    throw new Error(`Gecersiz sinav konfigurasyonu:\n- ${problems.join("\n- ")}`);
  }
  setJsonSetting(SETTING_KEYS.examConfigOverride, override, db);
  if (override.examDate) setSetting(SETTING_KEYS.examDate, override.examDate, db);
  return candidate;
}

/** Hedef sinava kalan gun sayisi (negatif olabilir). */
export function daysUntilExam(config: ExamConfig, now: Date = new Date()): number {
  const target = new Date(config.examDate).getTime();
  const diffMs = target - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
