import assert from "node:assert/strict";
import { test, describe, after } from "node:test";
import {
  classifyReferenceQuestion,
  importReferenceSource,
  looksEnglish,
  parseQuestionsFromText,
  validateReferenceQuestion,
} from "../src/question-engine/import-reference.ts";
import {
  promoteReferenceQuestion,
  reviewReferenceQuestion,
  trimToFourOptions,
} from "../src/question-engine/reference-review.ts";
import {
  listReferenceQuestions,
  referenceSummary,
} from "../src/db/repos/reference.ts";
import {
  recomputeAllStyleProfiles,
  getStyleProfile,
} from "../src/question-engine/style-analyzer.ts";
import { listQuestions, selectionPool, getQuestion } from "../src/db/repos/questions.ts";
import { startFullExam, startPractice, cancelSession } from "../src/core/exam-engine.ts";
import { makeTestDb } from "./helpers.ts";

// ---------------------------------------------------------------------------
// Ayristirma
// ---------------------------------------------------------------------------

const SAMPLE_BOOKLET = `
ZIRAAT BANKASI UZMAN YARDIMCILIGI — ORNEK KITAPCIK

1. Bir iliskisel veritabaninda LEFT JOIN kullanildiginda asagidakilerden hangisi dogrudur?
A) Yalnizca her iki tabloda eslesen satirlar dondurulur
B) Sol tablodaki tum satirlar korunur, eslesmeyen sag sutunlar NULL olur
C) Sag tablodaki tum satirlar korunur
D) Iki tablonun kartezyen carpimi alinir
E) Hicbir satir dondurulmez

2. TCP protokolu OSI modelinde hangi katmanda yer alir?
A) Fiziksel katman
B) Ag katmani
C) Tasima katmani
D) Oturum katmani
E) Uygulama katmani

3. Bir dizide ikili arama (binary search) algoritmasinin ortalama zaman karmasikligi nedir?
A) O(1)
B) O(log n)
C) O(n)
D) O(n log n)
E) O(n^2)

CEVAP ANAHTARI
1-B  2-C  3-B
`;

describe("Cikmis soru ayristirma", () => {
  test("numarali sorular ve 5 secenek dogru ayristirilir", () => {
    const { questions, answerKeyCount } = parseQuestionsFromText(SAMPLE_BOOKLET);
    assert.equal(questions.length, 3, "3 soru bulunmali");
    assert.equal(answerKeyCount, 3, "cevap anahtarinda 3 giris olmali");
    assert.equal(questions[0]!.options.length, 5);
    assert.ok(questions[0]!.questionText.includes("LEFT JOIN"));
  });

  test("cevap anahtari sorulara dogru eslenir", () => {
    const { questions } = parseQuestionsFromText(SAMPLE_BOOKLET);
    assert.equal(questions[0]!.correctIndex, 1, "1-B");
    assert.equal(questions[1]!.correctIndex, 2, "2-C");
    assert.equal(questions[2]!.correctIndex, 1, "3-B");
  });

  test("cevap anahtari YOKSA dogru cevap UYDURULMAZ", () => {
    const withoutKey = SAMPLE_BOOKLET.split("CEVAP ANAHTARI")[0]!;
    const { questions, answerKeyCount } = parseQuestionsFromText(withoutKey);
    assert.equal(answerKeyCount, 0);
    assert.ok(questions.every((q) => q.correctIndex === null), "hicbirine cevap atanmamali");
  });

  test("basliklar ve aciklama metinleri soru sayilmaz", () => {
    const { questions } = parseQuestionsFromText(
      "Bu bir onsozdur ve soru degildir.\n\nSinav 140 sorudan olusur.\n",
    );
    assert.equal(questions.length, 0);
  });

  test("dogrulama secenegi eksik soruyu eler", () => {
    const verdict = validateReferenceQuestion({
      number: 1,
      questionText: "Cok kisa",
      passage: null,
      options: ["a"],
      correctIndex: null,
      issues: [],
    });
    assert.equal(verdict.ok, false);
    assert.ok(verdict.reasons.length >= 2);
  });
});

describe("Bolum ve konu siniflandirma", () => {
  test("Ingilizce soru Ingilizce bolumune gider", () => {
    assert.equal(
      looksEnglish("Which of the following words best completes the sentence according to the text?"),
      true,
    );
    const classified = classifyReferenceQuestion({
      questionText: "Which of the following best completes the sentence according to the passage?",
      options: ["however", "therefore", "although", "moreover"],
    });
    assert.equal(classified.section, "english");
  });

  test("SQL sorusu Veri Tabani kategorisine baglanir", () => {
    const classified = classifyReferenceQuestion({
      questionText: "Bir sorguda GROUP BY ve HAVING birlikte kullanildiginda ne olur?",
      options: ["a", "b", "c", "d"],
    });
    assert.equal(classified.category, "Veri Tabani ve SQL");
    assert.equal(classified.section, "technical");
  });

  test("nadir terim, sik gecen terimden agir basar (ACID -> Transaction ve ACID)", () => {
    const classified = classifyReferenceQuestion({
      questionText: 'Bir islemin ACID ozelliklerinden "Durability" ne anlama gelir?',
      options: [
        "Islem ya tamamen uygulanir ya hic uygulanmaz",
        "Tamamlanan islemin sonucu sistem cokse bile kalicidir",
        "Es zamanli islemler birbirini etkilemez",
        "Veritabani kisitlari her zaman saglanir",
      ],
    });
    assert.equal(classified.category, "Veri Tabani ve SQL");
    assert.equal(
      classified.subtopic,
      "Transaction ve ACID",
      `"sistem"/"islem" gibi yaygin sozcukler yaniltmamali, secilen: ${classified.subtopic}`,
    );
  });

  test("baglanamayan soru TAHMIN EDILMEZ, bos birakilir", () => {
    const classified = classifyReferenceQuestion({
      questionText: "Zzzz qqqq wwww eeee rrrr tttt yyyy uuuu?",
      options: ["a", "b", "c", "d"],
    });
    assert.equal(classified.category, null);
    assert.equal(classified.section, null);
  });
});

// ---------------------------------------------------------------------------
// Secenek kirpma
// ---------------------------------------------------------------------------

describe("5 secenegi 4'e indirme", () => {
  test("dogru cevap E ise yanlis bir secenek atilir ve indeks korunur", () => {
    const result = trimToFourOptions(["a", "b", "c", "d", "DOGRU"], 4);
    assert.equal(result.options.length, 4);
    assert.equal(result.options[result.correctIndex], "DOGRU");
    assert.equal(result.removed, "d");
  });

  test("dogru cevap A ise sondaki yanlis atilir", () => {
    const result = trimToFourOptions(["DOGRU", "b", "c", "d", "e"], 0);
    assert.equal(result.options.length, 4);
    assert.equal(result.correctIndex, 0);
    assert.equal(result.removed, "e");
  });

  test("zaten 4 secenekse hicbir sey degismez", () => {
    const result = trimToFourOptions(["a", "b", "c", "d"], 2);
    assert.deepEqual(result.options, ["a", "b", "c", "d"]);
    assert.equal(result.correctIndex, 2);
    assert.equal(result.removed, null);
  });
});

// ---------------------------------------------------------------------------
// Uctan uca: ice aktar -> incele -> terfi -> cikmis soru modu
// ---------------------------------------------------------------------------

describe("Ice aktarim boru hatti (uctan uca)", () => {
  const { db, cleanup } = makeTestDb();
  after(cleanup);

  const result = importReferenceSource(
    {
      filename: "ornek-kitapcik.txt",
      kind: "txt",
      sourceLevel: "B",
      sourceName: "Ornek Ziraat Kitapcigi",
      sourceYear: 2025,
      sourceUrl: null,
    },
    SAMPLE_BOOKLET,
    db,
  );

  test("sorular referans tablosuna 'pending' olarak girer", () => {
    assert.equal(result.detected, 3);
    assert.equal(result.imported, 3);
    assert.equal(result.withAnswer, 3);
    const pending = listReferenceQuestions({ reviewState: "pending" }, db);
    assert.equal(pending.total, 3);
  });

  test("referanslar ANA SORU BANKASINA girmez", () => {
    const bank = listQuestions({ historical: true }, db);
    assert.equal(bank.total, 0, "onaylanmadan soru bankasina eklenmemeli");
  });

  test("ayni dosya tekrar aktarilirsa kopya olusmaz", () => {
    const again = importReferenceSource(
      {
        filename: "ornek-kitapcik.txt",
        kind: "txt",
        sourceLevel: "B",
        sourceName: "Ornek Ziraat Kitapcigi",
        sourceYear: 2025,
        sourceUrl: null,
      },
      SAMPLE_BOOKLET,
      db,
    );
    assert.equal(again.imported, 0);
    assert.equal(again.duplicates, 3);
  });

  test("kaynak dokumu seviye ve yil ile raporlanir", () => {
    const summary = referenceSummary(db);
    const row = summary.find((r) => r.sourceName === "Ornek Ziraat Kitapcigi");
    assert.ok(row, "kaynak ozetinde gorunmeli");
    assert.equal(row!.sourceLevel, "B");
    assert.equal(row!.sourceYear, 2025);
    assert.equal(row!.withAnswer, 3);
  });

  test("stil profili referanslardan hesaplanir ve ornekleme gore guven tasir", () => {
    recomputeAllStyleProfiles(db);
    const technical = getStyleProfile("technical", db);
    assert.ok(technical.profile.sampleSize >= 3);
    // 3 ornek istatistik icin yetersizdir; profil bunu bildirmeli.
    assert.equal(technical.profile.confidence, "none");
    assert.ok(technical.profile.notes.some((n) => n.includes("küçük") || n.includes("VARSAYIM")));
  });

  test("cevabi bilinmeyen soru TERFI EDEMEZ", () => {
    const pending = listReferenceQuestions({ reviewState: "pending" }, db);
    const target = pending.items[0]!;
    // Cevabi gecici olarak kaldir.
    db.prepare("UPDATE reference_questions SET correct_index = NULL WHERE id = ?").run(target.id);

    const outcome = promoteReferenceQuestion(target.id, {}, db);
    assert.equal(outcome.ok, false);
    assert.ok(
      !outcome.ok && outcome.message.includes("cevap uydurmaz"),
      `mesaj: ${!outcome.ok ? outcome.message : ""}`,
    );

    db.prepare("UPDATE reference_questions SET correct_index = ? WHERE id = ?").run(
      target.correctIndex,
      target.id,
    );
  });

  test("onay soruyu 'cikmis soru' olarak bankaya tasir ve kirpmayi NOT DUSER", () => {
    const pending = listReferenceQuestions({ reviewState: "pending" }, db);
    const sql = pending.items.find((q) => q.questionText.includes("LEFT JOIN"))!;

    const outcome = reviewReferenceQuestion(
      sql.id,
      "approved",
      { overrides: { category: "Veri Tabani ve SQL", subtopic: "JOIN turleri" } },
      db,
    );
    assert.equal(outcome.ok, true, outcome.message);

    const question = getQuestion(outcome.questionId!, db)!;
    assert.equal(question.historical, true, "cikmis soru olarak isaretlenmeli");
    assert.equal(question.origin, "import");
    assert.equal(question.sourceLevel, "B");
    assert.equal(question.sourceYear, 2025);
    assert.ok(
      question.qualityNotes?.includes("5 seçenekliydi"),
      `kirpma notu dusulmeli: ${question.qualityNotes}`,
    );
    assert.ok(question.explanation.length >= 40, "aciklama uydurulmaz ama bos da birakilmaz");
    assert.equal(question.optionB.includes("Sol tablodaki tum satirlar"), true);
    assert.equal(question.correctAnswer, "B");
  });

  test("ayni referans iki kez terfi edemez", () => {
    const approved = listReferenceQuestions({ reviewState: "approved" }, db);
    const outcome = promoteReferenceQuestion(approved.items[0]!.id, {}, db);
    assert.equal(outcome.ok, false);
  });

  test("CIKMIS SORU AYRIMI: gercek sinav havuzuna girmez", () => {
    const normalPool = selectionPool({}, db);
    const historicalPool = selectionPool({ onlyHistorical: true }, db);

    assert.ok(historicalPool.length >= 1, "cikmis soru havuzu dolu olmali");
    assert.equal(
      normalPool.some((q) => q.historical),
      false,
      "varsayilan havuzda cikmis soru OLMAMALI",
    );
    assert.equal(
      normalPool.some((q) => historicalPool.some((h) => h.id === q.id)),
      false,
    );
  });

  test("gercek sinav simulasyonu cikmis soru KULLANMAZ", () => {
    const start = startFullExam({ allowPartial: true }, db);
    assert.equal(start.ok, true);
    if (!start.ok) return;

    const paper = db
      .prepare(
        `SELECT q.historical FROM exam_session_questions sq
         JOIN questions q ON q.id = sq.question_id
         WHERE sq.session_id = ?`,
      )
      .all(start.session.id) as unknown as { historical: number }[];

    assert.ok(paper.length > 0);
    assert.equal(
      paper.some((row) => Number(row.historical) === 1),
      false,
      "gercek sinav kagidinda cikmis soru olmamali",
    );
    cancelSession(start.session.id, db);
  });

  test("'Cikmis Sorular' modu YALNIZCA cikmis sorulari getirir", () => {
    const start = startPractice({ mode: "historical", count: 1 }, db);
    assert.equal(start.ok, true, !start.ok ? start.message : "");
    if (!start.ok) return;

    const paper = db
      .prepare(
        `SELECT q.historical FROM exam_session_questions sq
         JOIN questions q ON q.id = sq.question_id
         WHERE sq.session_id = ?`,
      )
      .all(start.session.id) as unknown as { historical: number }[];

    assert.ok(paper.length > 0);
    assert.ok(paper.every((row) => Number(row.historical) === 1));
    cancelSession(start.session.id, db);
  });

  test("ret soruyu bankaya EKLEMEZ", () => {
    const pending = listReferenceQuestions({ reviewState: "pending" }, db);
    const before = listQuestions({ historical: true }, db).total;
    const outcome = reviewReferenceQuestion(pending.items[0]!.id, "rejected", { notes: "test" }, db);
    assert.equal(outcome.ok, true);
    assert.equal(listQuestions({ historical: true }, db).total, before);
    assert.equal(listReferenceQuestions({ reviewState: "rejected" }, db).total, 1);
  });
});

// ---------------------------------------------------------------------------
// JSON ice aktarim
// ---------------------------------------------------------------------------

describe("JSON ice aktarim", () => {
  const { db, cleanup } = makeTestDb({ seed: false });
  after(cleanup);

  test("esnek alan adlari ve harf/metin cevaplar desteklenir", () => {
    const payload = JSON.stringify([
      {
        soru: "Bir hash tablosunda carpisma (collision) nasil cozulur?",
        secenekler: ["Zincirleme", "Siralama", "Bolme", "Yuvarlama"],
        cevap: "A",
      },
      {
        question: "Hangi veri yapisi LIFO calisir?",
        options: ["Kuyruk", "Yigin", "Bagli liste", "Graf"],
        answer: "Yigin",
      },
      {
        question: "Cevabi bilinmeyen bir soru ornegi midir bu satir?",
        options: ["Evet", "Hayir", "Belki", "Bilinmiyor"],
      },
    ]);

    const result = importReferenceSource(
      {
        filename: "sorular.json",
        kind: "json",
        sourceLevel: "C",
        sourceName: "Aday hatirlamasi derlemesi",
        sourceYear: 2024,
        sourceUrl: null,
      },
      payload,
      db,
    );

    assert.equal(result.detected, 3);
    assert.equal(result.imported, 3);
    assert.equal(result.withAnswer, 2, "cevapsiz soru cevapli sayilmamali");

    const items = listReferenceQuestions({}, db).items;
    const find = (prefix: string) => {
      const match = items.find((i) => i.questionText.startsWith(prefix));
      assert.ok(match, `bulunamadi: ${prefix}`);
      return match;
    };
    assert.equal(find("Bir hash tablosunda").correctIndex, 0);
    assert.equal(find("Hangi veri yapisi LIFO").correctIndex, 1, "metin cevap eslenmeli");
    assert.equal(find("Cevabi bilinmeyen").correctIndex, null);
    assert.equal(find("Cevabi bilinmeyen").answerConfidence, 0);
  });

  test("bozuk JSON batch'i 'failed' olarak kaydeder", () => {
    const result = importReferenceSource(
      {
        filename: "bozuk.json",
        kind: "json",
        sourceLevel: "C",
        sourceName: "Bozuk dosya",
        sourceYear: null,
        sourceUrl: null,
      },
      "{ bu gecerli json degil",
      db,
    );
    assert.equal(result.detected, 0);
    assert.equal(result.imported, 0);
    assert.ok(result.warnings[0]!.includes("JSON"));
  });

  test("C seviyesi kaynak 'dogrulanmis cikmis soru' olarak terfi etmez", () => {
    const items = listReferenceQuestions({ sourceLevel: "C", withAnswerOnly: true }, db).items;
    const target = items[0]!;
    const outcome = promoteReferenceQuestion(
      target.id,
      { category: "Veri Yapilari ve Problem Cozme", subtopic: "Hash tablolari ve carpisma cozumu" },
      db,
    );
    assert.equal(outcome.ok, true, !outcome.ok ? outcome.message : "");
    if (!outcome.ok) return;
    const question = getQuestion(outcome.questionId, db)!;
    assert.equal(
      question.historical,
      false,
      "aday hatirlamasi (C) 'cikmis soru' olarak isaretlenmez",
    );
    assert.equal(question.sourceLevel, "C");
  });
});
