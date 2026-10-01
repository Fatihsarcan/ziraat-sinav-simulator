import assert from "node:assert/strict";
import { test, describe, after } from "node:test";
import {
  defaultContext,
  scoreQuestion,
  selectByBlueprint,
  selectTopN,
  SELECTION_WEIGHTS,
} from "../src/core/selection.ts";
import type { PoolQuestion } from "../src/db/repos/questions.ts";
import { masteryKey } from "../src/db/repos/mastery.ts";
import { exportJson, importJson } from "../src/lib/backup.ts";
import { countQuestions } from "../src/db/repos/questions.ts";
import { listSessions } from "../src/db/repos/sessions.ts";
import { startFullExam, submitSession, getSessionState, updateAnswers } from "../src/core/exam-engine.ts";
import { makeTestDb } from "./helpers.ts";

function q(overrides: Partial<PoolQuestion> = {}): PoolQuestion {
  return {
    id: 1,
    section: "technical",
    category: "Veri Tabani ve SQL",
    subtopic: "JOIN turleri",
    difficulty: "medium",
    cefrLevel: null,
    timesAsked: 0,
    timesCorrect: 0,
    timesWrong: 0,
    lastAskedAt: null,
    concept: null,
    historical: false,
    ...overrides,
  };
}

/** Deterministik secim icin sabit rastgelelik. */
const fixedRandom = () => 0.5;

describe("Secim skorlamasi", () => {
  test("hic sorulmamis soru en yuksek onceligi alir", () => {
    const ctx = defaultContext({ random: fixedRandom });
    const unseen = scoreQuestion(q({ id: 1, timesAsked: 0 }), ctx);
    const seen = scoreQuestion(
      q({ id: 2, timesAsked: 3, timesCorrect: 1, lastAskedAt: new Date().toISOString() }),
      ctx,
    );
    assert.ok(unseen.score > seen.score);
    assert.ok(unseen.reasons.includes("Hic sorulmamis"));
  });

  test("DAHA ONCE DOGRU CEVAPLANAN soru en dusuk onceligi alir", () => {
    const known = q({
      id: 10,
      timesAsked: 4,
      timesCorrect: 4,
      lastAskedAt: new Date().toISOString(),
    });
    const ctx = defaultContext({
      random: fixedRandom,
      correctlyAnsweredIds: new Set([10]),
    });
    const scored = scoreQuestion(known, ctx);
    const neutral = scoreQuestion(
      q({ id: 11, timesAsked: 4, timesCorrect: 2, lastAskedAt: new Date().toISOString() }),
      defaultContext({ random: fixedRandom }),
    );
    assert.ok(scored.score < neutral.score, "dogru bilinen soru daha dusuk skor almali");
    assert.ok(scored.reasons.some((r) => r.includes("dusuk oncelik")));
  });

  test("zayif konudaki soru guclu konudakinden once gelir", () => {
    const masteryByKey = new Map([
      [masteryKey("Veri Tabani ve SQL", "zayif"), 20],
      [masteryKey("Veri Tabani ve SQL", "guclu"), 95],
    ]);
    const ctx = defaultContext({ masteryByKey, random: fixedRandom });
    const weak = scoreQuestion(q({ id: 1, subtopic: "zayif" }), ctx);
    const strong = scoreQuestion(q({ id: 2, subtopic: "guclu" }), ctx);
    assert.ok(weak.score > strong.score);
    assert.ok(weak.reasons.some((r) => r.includes("Zayif konu")));
  });

  test("gecmiste yanlis yapilan KONU onceliklendirilir", () => {
    const mistakeCountByKey = new Map([[masteryKey("Veri Tabani ve SQL", "JOIN turleri"), 4]]);
    const withMistakes = scoreQuestion(
      q(),
      defaultContext({ mistakeCountByKey, random: fixedRandom }),
    );
    const without = scoreQuestion(q(), defaultContext({ random: fixedRandom }));
    assert.ok(withMistakes.score > without.score);
    assert.ok(withMistakes.reasons.some((r) => r.includes("yanlis gecmisi")));
  });

  test("uzun suredir sorulmayan soru yeniden one cikar", () => {
    const ctx = defaultContext({ random: fixedRandom });
    const recent = scoreQuestion(
      q({ id: 1, timesAsked: 1, lastAskedAt: new Date().toISOString() }),
      ctx,
    );
    const old = scoreQuestion(
      q({
        id: 2,
        timesAsked: 1,
        lastAskedAt: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
      }),
      ctx,
    );
    assert.ok(old.score > recent.score);
    assert.ok(old.reasons.includes("Uzun suredir sorulmadi"));
  });

  test("adaptif agirlik 0 iken zayif konu bonusu uygulanmaz", () => {
    const masteryByKey = new Map([[masteryKey("Veri Tabani ve SQL", "JOIN turleri"), 10]]);
    const on = scoreQuestion(q(), defaultContext({ masteryByKey, weakTopicWeight: 1, random: fixedRandom }));
    const off = scoreQuestion(q(), defaultContext({ masteryByKey, weakTopicWeight: 0, random: fixedRandom }));
    assert.ok(on.score > off.score);
  });

  test("agirliklar pozitif ve anlamli", () => {
    assert.ok(SELECTION_WEIGHTS.W_UNSEEN > SELECTION_WEIGHTS.W_STALE);
    assert.ok(SELECTION_WEIGHTS.W_ALREADY_KNOWN > 0);
  });
});

describe("Blueprint ile secim", () => {
  const pool: PoolQuestion[] = [];
  for (let i = 1; i <= 30; i += 1) {
    pool.push(
      q({
        id: i,
        category: i <= 20 ? "A" : "B",
        subtopic: `alt-${i % 5}`,
      }),
    );
  }

  test("kategori kotalari kesinlikle asilmaz", () => {
    const result = selectByBlueprint(
      [
        { category: "A", count: 5 },
        { category: "B", count: 3 },
      ],
      pool,
      defaultContext({ random: fixedRandom }),
    );
    assert.equal(result.selected.length, 8);
    assert.equal(result.selected.filter((s) => s.question.category === "A").length, 5);
    assert.equal(result.selected.filter((s) => s.question.category === "B").length, 3);
    assert.deepEqual(result.shortfalls, []);
  });

  test("yetersiz soru shortfall olarak raporlanir, uydurulmaz", () => {
    const result = selectByBlueprint(
      [{ category: "B", count: 50 }],
      pool,
      defaultContext({ random: fixedRandom }),
    );
    assert.equal(result.selected.length, 10);
    assert.deepEqual(result.shortfalls, [{ category: "B", requested: 50, available: 10 }]);
  });

  test("ayni soru iki kez secilmez", () => {
    const result = selectByBlueprint(
      [{ category: "A", count: 20 }],
      pool,
      defaultContext({ random: fixedRandom }),
    );
    const ids = result.selected.map((s) => s.question.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("alt konu cesitliligi korunur", () => {
    const result = selectByBlueprint(
      [{ category: "A", count: 5 }],
      pool,
      defaultContext({ random: fixedRandom }),
    );
    const subtopics = new Set(result.selected.map((s) => s.question.subtopic));
    assert.equal(subtopics.size, 5, "5 soruda 5 farkli alt konu olmali");
  });

  test("dislanan sorular secilmez", () => {
    const excluded = new Set([1, 2, 3, 4, 5]);
    const result = selectByBlueprint(
      [{ category: "A", count: 5 }],
      pool,
      defaultContext({ random: fixedRandom }),
      excluded,
    );
    assert.ok(result.selected.every((s) => !excluded.has(s.question.id)));
  });

  test("selectTopN istenen sayida dondurur", () => {
    const result = selectTopN(pool, 7, defaultContext({ random: fixedRandom }));
    assert.equal(result.selected.length, 7);
    assert.deepEqual(result.shortfalls, []);
  });

  test("selectTopN havuz kucukken shortfall bildirir", () => {
    const result = selectTopN(pool.slice(0, 3), 10, defaultContext({ random: fixedRandom }));
    assert.equal(result.selected.length, 3);
    assert.equal(result.shortfalls[0]!.available, 3);
  });
});

describe("Yedekleme ve disa/ice aktarim", () => {
  const source = makeTestDb();
  const target = makeTestDb({ seed: false });
  after(() => {
    source.cleanup();
    target.cleanup();
  });

  test("kaynak veritabaninda sinav gecmisi olusturulur", () => {
    const start = startFullExam({}, source.db);
    assert.equal(start.ok, true);
    if (!start.ok) return;
    const state = getSessionState(start.session.id, source.db)!;
    updateAnswers(
      start.session.id,
      state.questions.map((q2) => ({ questionId: q2.questionId, selectedAnswer: "A" as const, addTimeMs: 20_000 })),
      source.db,
    );
    submitSession(start.session.id, {}, source.db);
    assert.equal(listSessions({}, source.db).length, 1);
  });

  test("disa aktarim tum tablolari icerir", () => {
    const payload = exportJson(source.db);
    assert.equal(payload.format, "zss-export");
    assert.ok(payload.tables.questions!.length > 0);
    assert.ok(payload.tables.exam_sessions!.length > 0);
    assert.ok(payload.tables.exam_answers!.length === 140);
    assert.ok(payload.tables.topic_mastery!.length > 0);
  });

  test("bos veritabanina ice aktarim veriyi geri yukler", () => {
    const payload = exportJson(source.db);
    const result = importJson(payload, { mode: "replace" }, target.db);

    assert.equal(countQuestions(target.db).total, countQuestions(source.db).total);
    assert.equal(listSessions({}, target.db).length, 1);
    assert.ok(result.imported.questions! > 0);
  });

  test("ayni dosyayi tekrar ice aktarmak kopya olusturmaz", () => {
    const before = countQuestions(target.db).total;
    const result = importJson(exportJson(source.db), { mode: "merge" }, target.db);
    assert.equal(countQuestions(target.db).total, before);
    assert.ok(result.skipped.questions! > 0);
  });

  test("gecersiz dosya bicimi reddedilir", () => {
    assert.throws(
      () => importJson({ format: "baska" } as never, {}, target.db),
      /Tanimsiz dosya bicimi/,
    );
  });
});
