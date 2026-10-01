import assert from "node:assert/strict";
import { test, describe, after } from "node:test";
import { makeTestDb } from "./helpers.ts";
import type { DB } from "../src/db/client.ts";
import {
  autoSubmitAllExpired,
  autoSubmitIfExpired,
  getSessionResult,
  getSessionReview,
  getSessionState,
  startFullExam,
  startPractice,
  submitSession,
  updateAnswers,
} from "../src/core/exam-engine.ts";
import { getQuestion, listQuestions, setQualityStatus } from "../src/db/repos/questions.ts";
import {
  correctlyAnsweredQuestionIds,
  getPaper,
  getSession,
  isExpired,
  remainingSeconds,
} from "../src/db/repos/sessions.ts";
import { listMastery } from "../src/db/repos/mastery.ts";
import { listMistakes, mistakeQuestionIds } from "../src/db/repos/mistakes.ts";
import { runMigrations } from "../src/db/migrations.ts";
import { EXAM_CONFIG } from "../src/config/exam-config.ts";
import type { OptionKey } from "../src/core/types.ts";

/** Kagidi verilen dogruluk oranina gore cevaplar. */
function answerPaper(
  db: DB,
  sessionId: number,
  options: { correctRatio: number; blankEvery?: number; timePerQuestionMs?: number },
) {
  const state = getSessionState(sessionId, db)!;
  const updates = state.questions.map((q, index) => {
    const truth = getQuestion(q.questionId, db)!.correctAnswer;
    const wrong = (["A", "B", "C", "D"] as OptionKey[]).find((o) => o !== truth)!;
    const isBlank = options.blankEvery ? (index + 1) % options.blankEvery === 0 : false;
    const shouldBeCorrect = index < Math.round(state.questions.length * options.correctRatio);
    return {
      questionId: q.questionId,
      selectedAnswer: isBlank ? null : shouldBeCorrect ? truth : wrong,
      addTimeMs: options.timePerQuestionMs ?? 30_000,
    };
  });
  updateAnswers(sessionId, updates, db);
  return state;
}

describe("Migration'lar", () => {
  const { db, cleanup } = makeTestDb({ seed: false });
  after(cleanup);

  test("idempotenttir — ikinci kez calistirmak bir sey yapmaz", () => {
    const second = runMigrations(db);
    assert.equal(second.alreadyUpToDate, true);
    assert.deepEqual(second.applied, []);
  });

  test("tum tablolar olusturulmustur", () => {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as unknown as { name: string }[];
    const names = rows.map((r) => r.name);
    for (const table of [
      "questions",
      "exam_sessions",
      "exam_session_questions",
      "exam_answers",
      "mistake_history",
      "topic_mastery",
      "settings",
      "sources",
      "generation_log",
    ]) {
      assert.ok(names.includes(table), `${table} tablosu yok`);
    }
  });
});

describe("Gercek sinav olusturma", () => {
  const { db, cleanup } = makeTestDb();
  after(cleanup);

  test("resmi yapiya uygun 140 soruluk kagit olusturur", () => {
    const start = startFullExam({}, db);
    assert.equal(start.ok, true);
    if (!start.ok) return;

    assert.equal(start.session.totalQuestions, EXAM_CONFIG.totalQuestions);
    assert.equal(start.session.durationSeconds, EXAM_CONFIG.durationMinutes * 60);
    assert.deepEqual(start.shortfalls, []);

    const paper = getPaper(start.session.id, db);
    const counts = { general: 0, english: 0, technical: 0 };
    for (const entry of paper) counts[entry.section] += 1;
    assert.deepEqual(counts, { general: 60, english: 40, technical: 40 });
  });

  test("ayni soru kagitta iki kez yer almaz", () => {
    const active = db
      .prepare("SELECT id FROM exam_sessions WHERE status='in_progress' LIMIT 1")
      .get() as unknown as { id: number };
    const paper = getPaper(Number(active.id), db);
    const ids = paper.map((p) => p.questionId);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("teknik bolumde 8 resmi kategori de temsil edilir", () => {
    const active = db
      .prepare("SELECT id FROM exam_sessions WHERE status='in_progress' LIMIT 1")
      .get() as unknown as { id: number };
    const paper = getPaper(Number(active.id), db).filter((p) => p.section === "technical");
    const categories = new Set(paper.map((p) => p.category));
    assert.equal(categories.size, 8);
  });

  test("devam eden oturum varken ikinci sinav baslatilamaz", () => {
    const second = startFullExam({}, db);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.reason, "active_session_exists");
  });

  test("SINAV SIRASINDA dogru cevap ve aciklama gonderilmez", () => {
    const active = db
      .prepare("SELECT id FROM exam_sessions WHERE status='in_progress' LIMIT 1")
      .get() as unknown as { id: number };
    const state = getSessionState(Number(active.id), db)!;

    // Metin ICINDE "explanation" gecen mesru sorular var (Ingilizce kelime
    // sorulari gibi), bu yuzden alt string degil ALAN ADLARI kontrol edilir.
    const leakedKeys = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          if (["correctAnswer", "explanation", "isCorrect", "source", "sourceUrl"].includes(key)) {
            leakedKeys.add(key);
          }
          walk(child);
        }
      }
    };
    walk(state.questions);
    assert.deepEqual([...leakedKeys], [], "sinav sirasinda cevap/aciklama alanlari gonderilmemeli");

    // Gerekli alanlar ise mevcut olmali.
    const first = state.questions[0]!;
    assert.ok(first.questionText.length > 0);
    assert.deepEqual(Object.keys(first.options).sort(), ["A", "B", "C", "D"]);
  });
});

describe("Soru bankasi yetersizken", () => {
  const { db, cleanup } = makeTestDb();
  after(cleanup);

  test("eksik soru varsa sinav ACIKCA reddedilir (uydurma soru yok)", () => {
    // Teknik sorulari inceleme moduna alarak havuzdan cikar.
    for (const q of listQuestions({ section: "technical", limit: 500 }, db).items) {
      setQualityStatus(q.id, "review_needed", "test", db);
    }

    const start = startFullExam({}, db);
    assert.equal(start.ok, false);
    if (start.ok) return;
    assert.equal(start.reason, "insufficient_questions");
    assert.ok(start.shortfalls.length > 0);
    assert.ok(start.message.includes("Soru bankasi yetersiz"));
  });

  test("allowPartial ile eksik soruyla baslatilabilir", () => {
    const start = startFullExam({ allowPartial: true }, db);
    assert.equal(start.ok, true);
    if (!start.ok) return;
    assert.ok(start.shortfalls.length > 0);
    assert.ok(start.session.totalQuestions < EXAM_CONFIG.totalQuestions);
  });
});

describe("Sayac, kalici olma ve otomatik teslim", () => {
  const { db, cleanup } = makeTestDb();
  after(cleanup);

  test("kalan sure sunucudaki deadline'dan hesaplanir", () => {
    const start = startFullExam({}, db);
    assert.equal(start.ok, true);
    if (!start.ok) return;

    const session = start.session;
    assert.ok(session.deadlineAt !== null);
    const expected = EXAM_CONFIG.durationMinutes * 60;
    const remaining = remainingSeconds(session)!;
    assert.ok(Math.abs(remaining - expected) <= 2, `kalan sure ${remaining}, beklenen ~${expected}`);
  });

  test("SAYFA YENILEME simulasyonu: durum yeniden okununca sure sifirlanmaz", () => {
    const sessionId = getSession(1, db)!.id;
    const first = getSessionState(sessionId, db)!;
    const second = getSessionState(sessionId, db)!;
    assert.ok(second.remainingSeconds! <= first.remainingSeconds!);
    assert.ok(
      first.remainingSeconds! - second.remainingSeconds! < 5,
      "yeniden okuma sureyi bastan baslatmamali",
    );
  });

  test("gecmis zamanli deadline suresi dolmus sayilir", () => {
    const session = getSession(1, db)!;
    assert.equal(isExpired(session), false);
    assert.equal(
      isExpired(session, new Date(Date.parse(session.deadlineAt!) + 1000)),
      true,
    );
  });

  test("SURE DOLUNCA otomatik teslim edilir", () => {
    const sessionId = 1;
    answerPaper(db, sessionId, { correctRatio: 0.7 });

    // Deadline'i gecmise cek (sure bitmis gibi).
    db.prepare("UPDATE exam_sessions SET deadline_at = ? WHERE id = ?").run(
      new Date(Date.now() - 1000).toISOString(),
      sessionId,
    );

    const result = autoSubmitIfExpired(sessionId, db);
    assert.ok(result !== null, "otomatik teslim calismali");
    assert.equal(result!.autoSubmitted, true);

    const session = getSession(sessionId, db)!;
    assert.equal(session.status, "submitted");
    assert.equal(session.autoSubmitted, true);
    assert.ok(session.score !== null);
  });

  test("suresi dolmayan oturum otomatik teslim edilmez", () => {
    const start = startFullExam({}, db);
    assert.equal(start.ok, true);
    if (!start.ok) return;
    assert.equal(autoSubmitIfExpired(start.session.id, db), null);
    assert.deepEqual(autoSubmitAllExpired(db), []);
  });

  test("toplu kurtarma suresi dolmus TUM oturumlari kapatir", () => {
    const active = db
      .prepare("SELECT id FROM exam_sessions WHERE status='in_progress' LIMIT 1")
      .get() as unknown as { id: number };
    db.prepare("UPDATE exam_sessions SET deadline_at = ? WHERE id = ?").run(
      new Date(Date.now() - 60_000).toISOString(),
      Number(active.id),
    );
    const submitted = autoSubmitAllExpired(db);
    assert.deepEqual(submitted, [Number(active.id)]);
    assert.equal(getSession(Number(active.id), db)!.status, "submitted");
  });
});

describe("Teslim sonrasi kayitlar", () => {
  const { db, cleanup } = makeTestDb();
  after(cleanup);

  test("sinav cozulur ve degerlendirilir", () => {
    const start = startFullExam({}, db);
    assert.equal(start.ok, true);
    if (!start.ok) return;

    answerPaper(db, start.session.id, { correctRatio: 0.75, blankEvery: 10 });
    const result = submitSession(start.session.id, {}, db);

    assert.equal(result.totalQuestions, 140);
    assert.equal(result.correct + result.wrong + result.blank, 140);
    assert.ok(result.blank > 0);
    assert.ok(result.score > 0);
  });

  test("yanlislar defterine kaydedilir", () => {
    const { total, items } = listMistakes({}, db);
    assert.ok(total > 0);
    assert.ok(items[0]!.correctAnswer.length === 1);
    assert.ok(items[0]!.explanation.length > 0);
  });

  test("ustalik tablosu guncellenir", () => {
    const mastery = listMastery({}, db);
    assert.ok(mastery.length > 0);
    assert.ok(mastery.every((m) => m.attempts > 0));
    assert.ok(mastery.every((m) => m.masteryScore >= 0 && m.masteryScore <= 100));
  });

  test("soru istatistikleri guncellenir", () => {
    const asked = db
      .prepare("SELECT COUNT(*) AS n FROM questions WHERE times_asked > 0")
      .get() as unknown as { n: number };
    assert.equal(Number(asked.n), 140);
  });

  test("teslim edilmis oturum tekrar teslim edilince ayni sonucu dondurur", () => {
    const first = getSessionResult(1, db)!;
    const second = submitSession(1, {}, db);
    assert.equal(first.score, second.score);
    assert.equal(first.submittedAt, second.submittedAt);
  });

  test("inceleme ekraninda dogru cevaplar ve aciklamalar GORUNUR", () => {
    const review = getSessionReview(1, db);
    assert.equal(review.length, 140);
    assert.ok(review.every((r) => r.question.correctAnswer.length === 1));
    assert.ok(review.every((r) => r.question.explanation.length > 0));
  });
});

describe("SARTNAME #18: dogru cevaplanan sorular tekrar sorulmaz", () => {
  const { db, cleanup } = makeTestDb();
  after(cleanup);

  test("ikinci sinavda dogru bilinen sorular buyuk olcude elenir", () => {
    const first = startFullExam({}, db);
    assert.equal(first.ok, true);
    if (!first.ok) return;

    // Ilk sinavda HEPSINI dogru cevapla.
    answerPaper(db, first.session.id, { correctRatio: 1 });
    submitSession(first.session.id, {}, db);

    const known = correctlyAnsweredQuestionIds(db);
    assert.equal(known.size, 140);

    const second = startFullExam({ allowPartial: true }, db);
    assert.equal(second.ok, true);
    if (!second.ok) return;

    const secondPaper = getPaper(second.session.id, db);
    const repeated = secondPaper.filter((p) => known.has(p.questionId)).length;
    const fresh = secondPaper.length - repeated;

    // Bankada toplam 165 soru var; 140'i biliniyor -> 25 taze soru mumkun.
    // Motor once TAZE sorulari secmeli.
    assert.ok(fresh >= 20, `ikinci sinavda yalnizca ${fresh} yeni soru cikti`);
    assert.ok(
      repeated < secondPaper.length,
      "ikinci sinav birinciyle birebir ayni olmamali",
    );
  });
});

describe("SARTNAME #19/#25: kavram tekrari ile soru tekrari ayridir", () => {
  const { db, cleanup } = makeTestDb();
  after(cleanup);

  test("once yanlis yapilan bir gecmis olustur", () => {
    const start = startFullExam({}, db);
    assert.equal(start.ok, true);
    if (!start.ok) return;
    answerPaper(db, start.session.id, { correctRatio: 0.3 });
    const result = submitSession(start.session.id, {}, db);
    assert.ok(result.wrong > 50);
    assert.ok(mistakeQuestionIds({}, db).length > 50);
  });

  test("'Eski yanlislari tekrar coz' AYNI sorulari getirir", () => {
    const wrongIds = new Set(mistakeQuestionIds({}, db));
    const start = startPractice({ mode: "retry_mistakes", count: 10 }, db);
    assert.equal(start.ok, true);
    if (!start.ok) return;

    const paper = getPaper(start.session.id, db);
    assert.equal(paper.length, 10);
    assert.ok(
      paper.every((p) => wrongIds.has(p.questionId)),
      "tum sorular gecmiste yanlis yapilanlardan olmali",
    );
    submitSession(start.session.id, {}, db);
  });

  test("'Zayifliklarimi calis' ayni sorulari DEGIL, ayni konudan FARKLI sorulari getirir", () => {
    const wrongIds = new Set(mistakeQuestionIds({}, db));
    const start = startPractice({ mode: "mistake_concepts", count: 10 }, db);

    if (!start.ok) {
      // Banka tukendiyse motor bunu ACIKCA soyler, sessizce ayni soruyu vermez.
      assert.equal(start.reason, "empty_pool");
      assert.ok(start.message.includes("yeni soru yok"));
      return;
    }

    const paper = getPaper(start.session.id, db);
    assert.ok(
      paper.every((p) => !wrongIds.has(p.questionId)),
      "yanlis yapilan SORULARIN kendisi gelmemeli",
    );
    submitSession(start.session.id, {}, db);
  });
});

describe("Calisma modlari", () => {
  const { db, cleanup } = makeTestDb();
  after(cleanup);

  test("bolum secerek calisma baslatilir", () => {
    const start = startPractice({ mode: "practice", count: 20, section: "technical" }, db);
    assert.equal(start.ok, true);
    if (!start.ok) return;
    assert.equal(start.session.totalQuestions, 20);
    assert.equal(start.session.durationSeconds, null, "practice varsayilan olarak suresizdir");
    const paper = getPaper(start.session.id, db);
    assert.ok(paper.every((p) => p.section === "technical"));
    submitSession(start.session.id, {}, db);
  });

  test("alt konu secerek ozel calisma baslatilir", () => {
    const start = startPractice(
      {
        mode: "custom",
        count: 5,
        category: "Veri Tabani ve SQL",
        subtopic: "JOIN turleri",
      },
      db,
    );
    if (!start.ok) {
      assert.equal(start.reason, "empty_pool");
      return;
    }
    const paper = getPaper(start.session.id, db);
    assert.ok(paper.every((p) => p.subtopic === "JOIN turleri"));
    submitSession(start.session.id, {}, db);
  });

  test("sureli calisma deadline alir", () => {
    const start = startPractice(
      { mode: "practice", count: 5, section: "english", durationMinutes: 10 },
      db,
    );
    assert.equal(start.ok, true);
    if (!start.ok) return;
    assert.equal(start.session.durationSeconds, 600);
    assert.ok(start.session.deadlineAt !== null);
    submitSession(start.session.id, {}, db);
  });

  test("filtreye uyan soru yoksa acik hata verir", () => {
    const start = startPractice(
      { mode: "custom", count: 5, category: "Olmayan Kategori" },
      db,
    );
    assert.equal(start.ok, false);
    if (!start.ok) assert.equal(start.reason, "empty_pool");
  });
});

describe("Cevap kaydetme kurallari", () => {
  const { db, cleanup } = makeTestDb();
  after(cleanup);

  test("teslim edilmis oturuma cevap yazilamaz", () => {
    const start = startPractice({ mode: "practice", count: 5 }, db);
    assert.equal(start.ok, true);
    if (!start.ok) return;

    const paper = getPaper(start.session.id, db);
    const ok = updateAnswers(
      start.session.id,
      [{ questionId: paper[0]!.questionId, selectedAnswer: "A" }],
      db,
    );
    assert.equal(ok.rejected, null);

    submitSession(start.session.id, {}, db);

    const rejected = updateAnswers(
      start.session.id,
      [{ questionId: paper[0]!.questionId, selectedAnswer: "B" }],
      db,
    );
    assert.ok(rejected.rejected !== null);
    assert.ok(rejected.rejected!.includes("kapanmis"));
  });

  test("suresi dolmus oturuma cevap yazilamaz", () => {
    const start = startPractice(
      { mode: "practice", count: 5, durationMinutes: 10 },
      db,
    );
    assert.equal(start.ok, true);
    if (!start.ok) return;

    db.prepare("UPDATE exam_sessions SET deadline_at = ? WHERE id = ?").run(
      new Date(Date.now() - 1000).toISOString(),
      start.session.id,
    );

    const paper = getPaper(start.session.id, db);
    const result = updateAnswers(
      start.session.id,
      [{ questionId: paper[0]!.questionId, selectedAnswer: "A" }],
      db,
    );
    assert.ok(result.rejected !== null);
    assert.ok(result.rejected!.includes("Sure doldu"));
  });
});
