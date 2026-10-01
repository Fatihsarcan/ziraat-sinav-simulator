import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { EXAM_CONFIG, type OptionKey, type SectionId } from "../src/config/exam-config.ts";
import { computeScore, gradeExam, type GradedItem } from "../src/core/scoring.ts";

function buildItems(
  spec: { section: SectionId; total: number; correct: number; wrong: number }[],
  timePerQuestionMs = 60_000,
): GradedItem[] {
  const items: GradedItem[] = [];
  let position = 0;
  for (const s of spec) {
    for (let i = 0; i < s.total; i += 1) {
      position += 1;
      const correctAnswer: OptionKey = "A";
      let selected: OptionKey | null;
      if (i < s.correct) selected = "A";
      else if (i < s.correct + s.wrong) selected = "B";
      else selected = null;
      items.push({
        position,
        questionId: position,
        section: s.section,
        category: `${s.section}-kategori`,
        subtopic: `${s.section}-altkonu-${i % 4}`,
        questionText: `Soru ${position}`,
        correctAnswer,
        selectedAnswer: selected,
        timeSpentMs: timePerQuestionMs,
      });
    }
  }
  return items;
}

function grade(spec: Parameters<typeof buildItems>[0], timePerQuestionMs?: number) {
  return gradeExam({
    sessionId: 1,
    mode: "full_exam",
    label: "test",
    submittedAt: new Date().toISOString(),
    autoSubmitted: false,
    items: buildItems(spec, timePerQuestionMs),
    config: EXAM_CONFIG,
    durationSecondsOverride: EXAM_CONFIG.durationMinutes * 60,
  });
}

describe("Puan hesabi", () => {
  test("ceza katsayisi 0 iken puan = dogru/toplam x 100", () => {
    assert.equal(computeScore(112, 14, 140, EXAM_CONFIG), 80);
    assert.equal(computeScore(70, 70, 140, EXAM_CONFIG), 50);
    assert.equal(computeScore(0, 140, 140, EXAM_CONFIG), 0);
  });

  test("ceza katsayisi tanimlanirsa puan dusurulur", () => {
    const withPenalty = {
      ...EXAM_CONFIG,
      scoring: { ...EXAM_CONFIG.scoring, penaltyPerWrong: 0.25 },
    };
    // 112 dogru - 14*0.25 = 108.5 ham puan / 140 * 100
    assert.equal(computeScore(112, 14, 140, withPenalty), 77.5);
  });
});

describe("Baraj degerlendirmesi", () => {
  test("tum barajlar tutup toplam puan yeterliyse PASS", () => {
    const result = grade([
      { section: "general", total: 60, correct: 45, wrong: 15 },
      { section: "english", total: 40, correct: 28, wrong: 12 },
      { section: "technical", total: 40, correct: 24, wrong: 16 },
    ]);
    assert.equal(result.correct, 97);
    assert.equal(result.passed, true);
    assert.deepEqual(result.failReasons, []);
    assert.ok(result.sections.every((s) => s.passed));
  });

  test("EN KRITIK KURAL: toplam puan yuksek olsa bile bir bolum baraji tutmazsa FAIL", () => {
    // Genel 52/60 (%86.7 PASS), Ingilizce 22/40 (%55 FAIL), Teknik 31/40 (%77.5 PASS)
    const result = grade([
      { section: "general", total: 60, correct: 52, wrong: 8 },
      { section: "english", total: 40, correct: 22, wrong: 18 },
      { section: "technical", total: 40, correct: 31, wrong: 9 },
    ]);

    assert.equal(result.correct, 105);
    assert.equal(result.score, 75); // toplam puan barajin (60) cok uzerinde
    assert.equal(result.passed, false, "Ingilizce baraji tutmadigi icin FAIL olmali");

    const english = result.sections.find((s) => s.sectionId === "english")!;
    assert.equal(english.passed, false);
    assert.equal(english.requiredCorrect, 24);
    assert.ok(english.failReason?.includes("24"));
    assert.equal(result.failReasons.length, 1);
    assert.ok(result.failReasons[0]!.includes("Ingilizce"));
  });

  test("tam sinirda (esitlik) baraj TUTAR", () => {
    const result = grade([
      { section: "general", total: 60, correct: 36, wrong: 24 },
      { section: "english", total: 40, correct: 24, wrong: 16 },
      { section: "technical", total: 40, correct: 20, wrong: 20 },
    ]);
    assert.ok(result.sections.every((s) => s.passed), "esitlik durumunda baraj tutmali");
    // 80/140 = %57.1 -> toplam puan baraji (60) altinda kalir
    assert.equal(result.score, 57.1);
    assert.equal(result.passed, false);
    assert.equal(result.failReasons.length, 1);
    assert.ok(result.failReasons[0]!.includes("Toplam puan"));
  });

  test("bos birakilanlar yanlis gibi baraji dusurur ama ayri sayilir", () => {
    const result = grade([
      { section: "general", total: 60, correct: 40, wrong: 10 }, // 10 bos
      { section: "english", total: 40, correct: 30, wrong: 5 }, // 5 bos
      { section: "technical", total: 40, correct: 25, wrong: 5 }, // 10 bos
    ]);
    assert.equal(result.blank, 25);
    assert.equal(result.wrong, 20);
    assert.equal(result.correct, 95);
    assert.equal(result.totalQuestions, 140);
  });
});

describe("Zaman analizi", () => {
  test("sure neredeyse tamamen kullanilirsa At Risk", () => {
    // 140 soru x 67 sn = 9380 sn; sinav suresi 9600 sn -> %97.7
    const result = grade(
      [
        { section: "general", total: 60, correct: 40, wrong: 20 },
        { section: "english", total: 40, correct: 28, wrong: 12 },
        { section: "technical", total: 40, correct: 24, wrong: 16 },
      ],
      67_000,
    );
    assert.equal(result.time.verdict, "At Risk");
    assert.ok(result.time.notes.some((n) => n.includes("zaman baskisi")));
  });

  test("rahat tempoda Good", () => {
    const result = grade(
      [
        { section: "general", total: 60, correct: 40, wrong: 20 },
        { section: "english", total: 40, correct: 28, wrong: 12 },
        { section: "technical", total: 40, correct: 24, wrong: 16 },
      ],
      40_000,
    );
    assert.equal(result.time.verdict, "Good");
  });

  test("bolum bazli sure paylari toplami 1", () => {
    const result = grade([
      { section: "general", total: 60, correct: 40, wrong: 20 },
      { section: "english", total: 40, correct: 28, wrong: 12 },
      { section: "technical", total: 40, correct: 24, wrong: 16 },
    ]);
    const sum = result.time.bySection.reduce((a, b) => a + b.share, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
    assert.equal(result.time.slowest.length, 5);
    assert.equal(result.time.fastest.length, 5);
  });
});

describe("Konu kirilimi", () => {
  test("zayif ve guclu konular dogru siralanir", () => {
    const items: GradedItem[] = [];
    const topics = [
      { subtopic: "zayif", correct: 0, total: 4 },
      { subtopic: "orta", correct: 2, total: 4 },
      { subtopic: "guclu", correct: 4, total: 4 },
    ];
    let position = 0;
    for (const t of topics) {
      for (let i = 0; i < t.total; i += 1) {
        position += 1;
        items.push({
          position,
          questionId: position,
          section: "technical",
          category: "Veri Tabani ve SQL",
          subtopic: t.subtopic,
          questionText: `Soru ${position}`,
          correctAnswer: "A",
          selectedAnswer: i < t.correct ? "A" : "B",
          timeSpentMs: 30_000,
        });
      }
    }

    const result = gradeExam({
      sessionId: 2,
      mode: "practice",
      label: "test",
      submittedAt: new Date().toISOString(),
      autoSubmitted: false,
      items,
      config: EXAM_CONFIG,
      durationSecondsOverride: null,
    });

    assert.equal(result.weakTopics[0]!.subtopic, "zayif");
    assert.equal(result.strongTopics[0]!.subtopic, "guclu");
    assert.equal(result.time.allottedTimeMs, null);
  });
});
