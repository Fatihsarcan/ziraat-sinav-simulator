import assert from "node:assert/strict";
import { test, describe } from "node:test";
import {
  applyAnswer,
  confidenceFor,
  explainMastery,
  initialMastery,
  masteryBand,
  masteryScore,
  MASTERY_PARAMS,
} from "../src/core/mastery.ts";
import { computeReadiness, READINESS_WEIGHTS, type ExamSnapshot } from "../src/core/readiness.ts";
import { EXAM_CONFIG } from "../src/config/exam-config.ts";
import type { TopicMastery } from "../src/core/types.ts";

describe("Ustalik algoritmasi", () => {
  test("veri yokken 50'den baslar", () => {
    const state = initialMastery();
    assert.equal(state.ewma, MASTERY_PARAMS.PRIOR);
    assert.equal(masteryScore(state), 50);
  });

  test("TEK bir dogru cevap mastery'yi 100 yapmaz", () => {
    const state = applyAnswer(initialMastery(), {
      isCorrect: true,
      wasBlank: false,
      difficulty: "medium",
    });
    const score = masteryScore(state);
    assert.ok(score > 50, `skor artmali, oldu: ${score}`);
    assert.ok(score < 60, `tek dogru cevap 60'in altinda kalmali, oldu: ${score}`);
  });

  test("ustuste dogru cevaplarla skor yukselir ama yavas", () => {
    let state = initialMastery();
    for (let i = 0; i < 5; i += 1) {
      state = applyAnswer(state, { isCorrect: true, wasBlank: false, difficulty: "medium" });
    }
    const five = masteryScore(state);
    for (let i = 0; i < 15; i += 1) {
      state = applyAnswer(state, { isCorrect: true, wasBlank: false, difficulty: "medium" });
    }
    const twenty = masteryScore(state);
    assert.ok(five < twenty, "daha cok dogru -> daha yuksek skor");
    assert.ok(twenty < 100, "ust sinira asimptotik yaklasir, tam 100 olmaz");
    assert.ok(twenty > 80, `20 dogrudan sonra yuksek olmali, oldu: ${twenty}`);
  });

  test("yanlis cevap dogru cevaptan daha hizli hareket ettirir", () => {
    const base = initialMastery();
    const afterCorrect = applyAnswer(base, {
      isCorrect: true,
      wasBlank: false,
      difficulty: "medium",
    });
    const afterWrong = applyAnswer(base, {
      isCorrect: false,
      wasBlank: false,
      difficulty: "medium",
    });
    const upMove = afterCorrect.ewma - base.ewma;
    const downMove = base.ewma - afterWrong.ewma;
    assert.ok(downMove > upMove, `yanlis (${downMove}) dogrudan (${upMove}) daha etkili olmali`);
  });

  test("zor soruyu dogru yapmak kolay soruyu dogru yapmaktan daha degerli", () => {
    const base = initialMastery();
    const hard = applyAnswer(base, { isCorrect: true, wasBlank: false, difficulty: "hard" });
    const easy = applyAnswer(base, { isCorrect: true, wasBlank: false, difficulty: "easy" });
    assert.ok(hard.ewma > easy.ewma);
  });

  test("kolay soruyu yanlis yapmak zor soruyu yanlis yapmaktan daha cok dusurur", () => {
    const base = initialMastery();
    const easyWrong = applyAnswer(base, { isCorrect: false, wasBlank: false, difficulty: "easy" });
    const hardWrong = applyAnswer(base, { isCorrect: false, wasBlank: false, difficulty: "hard" });
    assert.ok(easyWrong.ewma < hardWrong.ewma);
  });

  test("bos birakmak yanlistan daha yumusak etki eder", () => {
    const base = initialMastery();
    const blank = applyAnswer(base, { isCorrect: false, wasBlank: true, difficulty: "medium" });
    const wrong = applyAnswer(base, { isCorrect: false, wasBlank: false, difficulty: "medium" });
    assert.ok(blank.ewma > wrong.ewma);
  });

  test("guven ornek buyuklugu ile artar", () => {
    assert.ok(confidenceFor(0) === 0);
    assert.ok(confidenceFor(5) === 0.5);
    assert.ok(confidenceFor(50) > 0.9);
  });

  test("skor 0-100 araliginda kalir", () => {
    let state = initialMastery();
    for (let i = 0; i < 100; i += 1) {
      state = applyAnswer(state, { isCorrect: false, wasBlank: false, difficulty: "easy" });
    }
    const score = masteryScore(state);
    assert.ok(score >= 0 && score <= 100);
    assert.ok(score < 10, `surekli yanlista cok dusuk olmali, oldu: ${score}`);
  });

  test("aciklama metni uretilir ve sayilari icerir", () => {
    let state = initialMastery();
    state = applyAnswer(state, { isCorrect: true, wasBlank: false, difficulty: "medium" });
    const text = explainMastery(state);
    assert.ok(text.includes("1 denemede 1 dogru"));
    assert.ok(text.includes("EWMA"));
  });

  test("bantlar dogru siniflandirir", () => {
    assert.equal(masteryBand(40), "weak");
    assert.equal(masteryBand(60), "moderate");
    assert.equal(masteryBand(75), "good");
    assert.equal(masteryBand(90), "strong");
  });
});

function snapshot(overrides: Partial<ExamSnapshot> & { score: number }): ExamSnapshot {
  return {
    sessionId: 1,
    submittedAt: new Date().toISOString(),
    passed: true,
    sectionAccuracy: { general: 0.7, english: 0.7, technical: 0.7 },
    timeVerdict: "Good",
    ...overrides,
  };
}

function mastery(score: number, attempts = 10): TopicMastery {
  return {
    id: 1,
    section: "technical",
    category: "Veri Tabani ve SQL",
    subtopic: "JOIN turleri",
    attempts,
    correct: Math.round((attempts * score) / 100),
    ewma: score / 100,
    masteryScore: score,
    confidence: 0.5,
    lastAnswerAt: null,
    updatedAt: new Date().toISOString(),
  };
}

describe("Hazirlik skoru", () => {
  test("agirliklar toplami 1", () => {
    const sum = Object.values(READINESS_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
  });

  test("hic sinav yoksa yalnizca ustalik kullanilir ve uyari verilir", () => {
    const report = computeReadiness({
      config: EXAM_CONFIG,
      fullExams: [],
      mastery: [mastery(70)],
    });
    assert.equal(report.sampleSize, 0);
    assert.ok(report.explanation.some((e) => e.includes("Henuz tamamlanmis gercek sinav yok")));
    // Yalnizca konu ustaligi bileseni hesaplandi -> skor ona esit
    assert.equal(report.score, 70);
    const withoutData = report.components.filter((c) => c.detail.startsWith("Yeterli veri yok"));
    assert.equal(withoutData.length, 5);
  });

  test("hic veri yoksa skor 0 ve tum bilesenler bos", () => {
    const report = computeReadiness({ config: EXAM_CONFIG, fullExams: [], mastery: [] });
    assert.equal(report.score, 0);
    assert.equal(report.sampleSize, 0);
    assert.ok(report.sectionVerdicts.every((v) => v.verdict === "No Data"));
    assert.equal(report.timeManagement, "No Data");
  });

  test("baraj altindaki bolum 'At Risk' olarak isaretlenir", () => {
    const report = computeReadiness({
      config: EXAM_CONFIG,
      fullExams: [
        snapshot({ score: 72, sectionAccuracy: { general: 0.8, english: 0.5, technical: 0.7 } }),
      ],
      mastery: [mastery(70)],
    });
    const english = report.sectionVerdicts.find((v) => v.sectionId === "english")!;
    assert.equal(english.verdict, "At Risk");
    assert.ok(report.explanation.some((e) => e.includes("Baraj riski")));
  });

  test("yukselen trend skoru artirir", () => {
    const rising = computeReadiness({
      config: EXAM_CONFIG,
      fullExams: [58, 63, 67, 71, 75].map((score, i) =>
        snapshot({ score, sessionId: i + 1, submittedAt: `2026-09-${10 + i}T10:00:00Z` }),
      ),
      mastery: [mastery(70)],
    });
    const falling = computeReadiness({
      config: EXAM_CONFIG,
      fullExams: [75, 71, 67, 63, 58].map((score, i) =>
        snapshot({ score, sessionId: i + 1, submittedAt: `2026-09-${10 + i}T10:00:00Z` }),
      ),
      mastery: [mastery(70)],
    });
    const risingTrend = rising.components.find((c) => c.key === "trend")!;
    const fallingTrend = falling.components.find((c) => c.key === "trend")!;
    assert.ok(risingTrend.value > fallingTrend.value);
    assert.ok(risingTrend.detail.includes("yukselis"));
    assert.ok(fallingTrend.detail.includes("dusus"));
  });

  test("istikrarli puanlar daha yuksek istikrar bileseni verir", () => {
    const steady = computeReadiness({
      config: EXAM_CONFIG,
      fullExams: [70, 71, 70, 71, 70].map((score, i) => snapshot({ score, sessionId: i + 1 })),
      mastery: [mastery(70)],
    });
    const erratic = computeReadiness({
      config: EXAM_CONFIG,
      fullExams: [55, 85, 58, 82, 60].map((score, i) => snapshot({ score, sessionId: i + 1 })),
      mastery: [mastery(70)],
    });
    const a = steady.components.find((c) => c.key === "consistency")!.value;
    const b = erratic.components.find((c) => c.key === "consistency")!.value;
    assert.ok(a > b, `istikrarli (${a}) daha yuksek olmali`);
  });

  test("her bilesen gerekcesiyle birlikte raporlanir", () => {
    const report = computeReadiness({
      config: EXAM_CONFIG,
      fullExams: [snapshot({ score: 70 })],
      mastery: [mastery(70)],
    });
    assert.equal(report.components.length, 6);
    for (const component of report.components) {
      assert.ok(component.detail.length > 0, `${component.key} gerekcesiz`);
      assert.ok(component.weight > 0);
    }
  });
});
