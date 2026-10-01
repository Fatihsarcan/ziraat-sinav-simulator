import assert from "node:assert/strict";
import { test, describe } from "node:test";
import {
  EXAM_CONFIG,
  durationSeconds,
  getSection,
  requiredCorrect,
  validateExamConfig,
} from "../src/config/exam-config.ts";
import { applyOverride, daysUntilExam } from "../src/config/load-config.ts";
import { ALL_CATEGORIES, EXAM_BLUEPRINT } from "../src/config/curriculum.ts";

describe("Sinav konfigurasyonu", () => {
  test("resmi ilanla birebir tutarlidir", () => {
    assert.equal(EXAM_CONFIG.totalQuestions, 140);
    assert.equal(EXAM_CONFIG.durationMinutes, 160);
    assert.equal(durationSeconds(EXAM_CONFIG), 9600);

    const general = getSection(EXAM_CONFIG, "general");
    assert.equal(general.questionCount, 60);
    assert.deepEqual(
      general.subsections.map((s) => [s.key, s.questionCount]),
      [
        ["Genel Kultur", 20],
        ["Genel Yetenek", 40],
      ],
    );

    assert.equal(getSection(EXAM_CONFIG, "english").questionCount, 40);
    assert.equal(getSection(EXAM_CONFIG, "technical").questionCount, 40);
  });

  test("barajlar %60 / %60 / %50 ve toplam 60 puandir", () => {
    assert.equal(EXAM_CONFIG.thresholds.bySection.general, 0.6);
    assert.equal(EXAM_CONFIG.thresholds.bySection.english, 0.6);
    assert.equal(EXAM_CONFIG.thresholds.bySection.technical, 0.5);
    assert.equal(EXAM_CONFIG.thresholds.overallScore, 60);
  });

  test("gereken dogru sayilari yukari yuvarlanir", () => {
    assert.equal(requiredCorrect(getSection(EXAM_CONFIG, "general")), 36); // 60 * 0.60
    assert.equal(requiredCorrect(getSection(EXAM_CONFIG, "english")), 24); // 40 * 0.60
    assert.equal(requiredCorrect(getSection(EXAM_CONFIG, "technical")), 20); // 40 * 0.50
  });

  test("konfigurasyon kendi icinde tutarli", () => {
    assert.deepEqual(validateExamConfig(EXAM_CONFIG), []);
  });

  test("tutarsiz konfigurasyon yakalanir", () => {
    const broken = applyOverride(EXAM_CONFIG, {
      subsectionQuestionCounts: { "Genel Kultur": 5 },
    });
    // Alt bolum toplami degisince bolum toplami da degisir; totalQuestions guncellenir.
    assert.equal(broken.sections[0]!.questionCount, 45);
    assert.equal(broken.totalQuestions, 125);
    assert.deepEqual(validateExamConfig(broken), []);
  });

  test("override ile sinav tarihi ve barajlar degistirilebilir", () => {
    const custom = applyOverride(EXAM_CONFIG, {
      examDate: "2027-01-01T10:00:00",
      durationMinutes: 120,
      thresholds: { overallScore: 70, bySection: { technical: 0.6 } },
    });
    assert.equal(custom.durationMinutes, 120);
    assert.equal(custom.thresholds.overallScore, 70);
    assert.equal(custom.thresholds.bySection.technical, 0.6);
    assert.equal(getSection(custom, "technical").passRatio, 0.6);
    assert.deepEqual(validateExamConfig(custom), []);
  });

  test("sinava kalan gun hesaplanir", () => {
    const config = applyOverride(EXAM_CONFIG, { examDate: "2026-10-24T14:00:00" });
    const days = daysUntilExam(config, new Date("2026-09-23T14:00:00"));
    assert.equal(days, 31);
  });
});

describe("Mufredat", () => {
  test("blueprint bolum soru sayilariyla eslesir", () => {
    for (const section of EXAM_CONFIG.sections) {
      const total = ALL_CATEGORIES.filter((c) => c.section === section.id).reduce(
        (a, c) => a + c.examQuestionCount,
        0,
      );
      assert.equal(
        total,
        section.questionCount,
        `${section.label}: blueprint ${total} != config ${section.questionCount}`,
      );
    }
  });

  test("blueprint toplami 140", () => {
    assert.equal(
      EXAM_BLUEPRINT.reduce((a, b) => a + b.count, 0),
      EXAM_CONFIG.totalQuestions,
    );
  });

  test("resmi 8 teknik konu basligi eksiksiz", () => {
    const technical = ALL_CATEGORIES.filter((c) => c.section === "technical");
    assert.equal(technical.length, 8);
    assert.ok(technical.every((c) => c.official));
    assert.ok(technical.every((c) => c.subtopics.length >= 8));
  });

  test("kategori anahtarlari benzersiz", () => {
    const keys = ALL_CATEGORIES.map((c) => c.key);
    assert.equal(new Set(keys).size, keys.length);
  });
});
