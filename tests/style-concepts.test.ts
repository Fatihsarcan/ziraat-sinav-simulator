import assert from "node:assert/strict";
import { test, describe } from "node:test";
import {
  buildStyleProfile,
  classifyStyle,
  describeStyleProfile,
  detectNegativeStem,
  estimateSeconds,
  observationFrom,
  type StyleObservation,
} from "../src/core/style-profile.ts";
import { conceptKey, deriveConcept, rankConceptGaps } from "../src/core/concepts.ts";
import { checkDuplicate, buildContentHash, buildFingerprint, normalizeText, coarsenFingerprint, fingerprintSimilarity } from "../src/core/dedup.ts";
import type { DedupCandidate, ExistingQuestionSignature } from "../src/core/dedup.ts";
import { computeQualityScore, checkQuality } from "../src/question-engine/quality.ts";
import { QUALITY_SCORE } from "../src/config/exam-style.ts";

// ---------------------------------------------------------------------------
// Stil profili
// ---------------------------------------------------------------------------

function observation(overrides: Partial<StyleObservation> = {}): StyleObservation {
  return {
    section: "technical",
    category: "Veri Tabani ve SQL",
    subtopic: "JOIN turleri",
    sourceLevel: "B",
    styleType: "sql_query",
    isNegative: false,
    difficulty: "medium",
    estimatedSeconds: 90,
    stemChars: 220,
    optionChars: [40, 44, 38, 42],
    optionCount: 4,
    ...overrides,
  };
}

describe("Exam style profile", () => {
  test("referans yokken profil VARSAYIM olarak isaretlenir", () => {
    const profile = buildStyleProfile([], { scope: "section:technical", section: "technical" });
    assert.equal(profile.sampleSize, 0);
    assert.equal(profile.confidence, "none");
    assert.equal(profile.measuredShare, 0);
    assert.ok(
      profile.notes.some((n) => n.includes("VARSAYIMDIR")),
      "varsayim uyarisi bulunmali",
    );
    // Varsayilan karisim kullanilmali.
    assert.ok((profile.styleMix.concept ?? 0) > 0);
  });

  test("az ornekte guven dusuk kalir ve olcum varsayimla harmanlanir", () => {
    const profile = buildStyleProfile([observation(), observation()], {
      scope: "section:technical",
      section: "technical",
    });
    assert.equal(profile.sampleSize, 2);
    assert.equal(profile.confidence, "none", "2 ornek istatistik icin yetersiz");
    assert.ok(profile.measuredShare < 0.2, "olcumun agirligi dusuk olmali");
    // Tum ornekler sql_query olsa da varsayim harmanlandigi icin %100 olmaz.
    assert.ok((profile.styleMix.sql_query ?? 0) < 1);
    assert.ok((profile.styleMix.sql_query ?? 0) > 0);
  });

  test("yeterli ornekte olculen dagilim baskin hale gelir", () => {
    const many = Array.from({ length: 60 }, () => observation());
    const profile = buildStyleProfile(many, { scope: "section:technical", section: "technical" });
    assert.ok(["medium", "high"].includes(profile.confidence), profile.confidence);
    assert.equal(profile.measuredShare, 1);
    assert.ok((profile.styleMix.sql_query ?? 0) > 0.9);
    assert.equal(profile.avgStemChars, 220);
  });

  test("kaynak seviyesi agirligi ornek buyuklugune yansir", () => {
    const official = Array.from({ length: 10 }, () => observation({ sourceLevel: "A" }));
    const similar = Array.from({ length: 10 }, () => observation({ sourceLevel: "D" }));
    const a = buildStyleProfile(official, { scope: "a", section: "technical" });
    const d = buildStyleProfile(similar, { scope: "d", section: "technical" });
    assert.ok(
      a.weightedSampleSize > d.weightedSampleSize,
      "resmi kaynak benzer banka sinavindan agir basmali",
    );
  });

  test("A/B kaynagi yoksa profil bunu not dusar", () => {
    const profile = buildStyleProfile([observation({ sourceLevel: "C" })], {
      scope: "x",
      section: "technical",
    });
    assert.ok(profile.notes.some((n) => n.includes("resmî") || n.includes("resmi") || n.includes("A)")));
  });

  test("profil metni guven bilgisini ACIKCA yazar", () => {
    const profile = buildStyleProfile([observation()], { scope: "x", section: "technical" });
    const text = describeStyleProfile(profile);
    assert.ok(text.includes("VARSAYIMDAN"), "varsayim payi prompt metninde gorunmeli");
    assert.ok(text.includes("Ornek sayisi"));
  });
});

describe("Stil siniflandirma", () => {
  test("SQL sorusu sql_query olarak etiketlenir", () => {
    assert.equal(
      classifyStyle({
        section: "technical",
        questionText: "Verilen SELECT sorgusu kac satir dondurur?",
        passage: "SELECT * FROM musteri LEFT JOIN hesap ON ...",
      }),
      "sql_query",
    );
  });

  test("kod parcasi code_reading olur", () => {
    assert.equal(
      classifyStyle({
        section: "technical",
        questionText: "Asagidaki fonksiyonun ciktisi nedir?",
        passage: "def f(n):\n  return n * 2",
      }),
      "code_reading",
    );
  });

  test("uzun parcali Ingilizce soru reading olur", () => {
    assert.equal(
      classifyStyle({
        section: "english",
        questionText: "According to the passage, what is the main idea?",
        passage: "x".repeat(200),
      }),
      "language_reading",
    );
  });

  test("olumsuz kok tespiti Turkce ve Ingilizce calisir", () => {
    assert.equal(detectNegativeStem("Asagidakilerden hangisi DEGILDIR?"), true);
    assert.equal(detectNegativeStem("Aşağıdakilerden hangisi yanlıştır?"), true);
    assert.equal(detectNegativeStem("Which of the following is NOT true?"), true);
    assert.equal(detectNegativeStem("Asagidakilerden hangisi dogrudur?"), false);
  });

  test("sure tahmini stil tipine ve uzunluga gore artar", () => {
    const short = estimateSeconds("definition", 100);
    const longCode = estimateSeconds("code_reading", 600);
    assert.ok(longCode > short);
    assert.ok(short >= 20 && short <= 60);
  });

  test("observationFrom olcumleri dogru cikarir", () => {
    const obs = observationFrom({
      section: "technical",
      questionText: "Bu bir test sorusudur, hangisi DEGILDIR?",
      options: ["abc", "defg", "hi", "jklmn"],
    });
    assert.equal(obs.isNegative, true);
    assert.equal(obs.optionCount, 4);
    assert.deepEqual(obs.optionChars, [3, 4, 2, 5]);
  });
});

// ---------------------------------------------------------------------------
// Kavramlar
// ---------------------------------------------------------------------------

describe("Kavram turetme ve bosluklar", () => {
  test("kavram alt konu + dogru cevabin ayirt edici terimlerinden kurulur", () => {
    const concept = deriveConcept({
      subtopic: "JOIN turleri",
      correctOptionText: "LEFT JOIN sol tablodaki tum satirlari korur",
    });
    assert.ok(concept.startsWith("JOIN turleri"));
    assert.ok(concept.length > "JOIN turleri".length, "cevap terimleri eklenmeli");
  });

  test("cevap salt sayiysa kavram alt konuya duser", () => {
    assert.equal(deriveConcept({ subtopic: "Oran-oranti", correctOptionText: "42" }), "Oran-oranti");
  });

  test("ayni beceriyi olcen iki soru ayni kavram anahtarina duser", () => {
    const a = deriveConcept({
      subtopic: "JOIN turleri",
      correctOptionText: "LEFT JOIN tum sol satirlari dondurur",
    });
    const b = deriveConcept({
      subtopic: "JOIN turleri",
      correctOptionText: "dondurur satirlari sol tum JOIN LEFT",
    });
    assert.equal(
      conceptKey("Veri Tabani ve SQL", "JOIN turleri", a),
      conceptKey("Veri Tabani ve SQL", "JOIN turleri", b),
      "sozcuk sirasi kavrami degistirmemeli",
    );
  });

  test("kavram bosluklari cozulmemislik ve tazelige gore siralanir", () => {
    const now = new Date("2026-09-24T12:00:00Z");
    const recent = "2026-09-23T12:00:00Z";
    const old = "2026-06-01T12:00:00Z";

    const gaps = rankConceptGaps(
      [
        // Eski ama cok yanlis
        ...Array.from({ length: 5 }, (_, i) => ({
          section: "technical",
          category: "Veri Tabani ve SQL",
          subtopic: "Indeksler",
          concept: "Indeks maliyeti",
          questionId: 100 + i,
          createdAt: old,
          resolvedAt: null,
          wasBlank: false,
        })),
        // Yeni ve cozulmemis
        ...Array.from({ length: 3 }, (_, i) => ({
          section: "technical",
          category: "Veri Tabani ve SQL",
          subtopic: "JOIN turleri",
          concept: "LEFT JOIN davranisi",
          questionId: 200 + i,
          createdAt: recent,
          resolvedAt: null,
          wasBlank: false,
        })),
      ],
      now,
    );

    assert.equal(gaps[0]!.concept, "LEFT JOIN davranisi", "taze yanlis once gelmeli");
    assert.equal(gaps[0]!.wrongCount, 3);
    assert.deepEqual(gaps[0]!.questionIds.sort(), [200, 201, 202]);
  });

  test("kavram etiketi yoksa alt konuya duser", () => {
    const gaps = rankConceptGaps([
      {
        section: "general",
        category: "Genel Yetenek",
        subtopic: "Paragraf ve anlatim",
        concept: null,
        questionId: 1,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        wasBlank: true,
      },
    ]);
    assert.equal(gaps[0]!.concept, "Paragraf ve anlatim");
    assert.equal(gaps[0]!.blankCount, 1);
  });
});

// ---------------------------------------------------------------------------
// Anlamsal tekrar (sartname #7 ornegi)
// ---------------------------------------------------------------------------

function signatureOf(c: DedupCandidate, id: number): ExistingQuestionSignature {
  const map = { A: c.optionA, B: c.optionB, C: c.optionC, D: c.optionD };
  return {
    id,
    category: c.category,
    subtopic: c.subtopic,
    fingerprint: buildFingerprint(c.questionText, null, [c.optionA, c.optionB, c.optionC, c.optionD]),
    stemFingerprint: buildFingerprint(c.questionText, null, []),
    contentHash: buildContentHash(c),
    correctOptionNormalized: normalizeText(map[c.correctAnswer]),
  };
}

describe("Anlamsal tekrar — Turkce parafraz", () => {
  const base: DedupCandidate = {
    questionText: "TCP hangi katmanda çalışır?",
    optionA: "Taşıma katmanı",
    optionB: "Ağ katmanı",
    optionC: "Veri bağı katmanı",
    optionD: "Uygulama katmanı",
    correctAnswer: "A",
    category: "Bilgisayar Aglari ve Isletim Sistemleri",
    subtopic: "OSI katmanlari",
  };

  test("SARTNAME ORNEGI: 'TCP hangi katmanda calisir' vs 'OSI modelinin hangi katmaniyla iliskilidir'", () => {
    const paraphrase: DedupCandidate = {
      ...base,
      questionText: "TCP protokolü OSI modelinin hangi katmanıyla ilişkilidir?",
      optionA: "Taşıma katmanı",
      optionB: "Oturum katmanı",
      optionC: "Sunum katmanı",
      optionD: "Fiziksel katman",
    };
    const verdict = checkDuplicate(paraphrase, [signatureOf(base, 11)]);
    assert.equal(verdict.isDuplicate, true, `yakalanmali, sebep: ${verdict.reason}`);
    assert.equal(verdict.matchedQuestionId, 11);
  });

  test("kabalastirma Turkce cekim eklerini ayni koke indirir", () => {
    const a = coarsenFingerprint("katmand");
    const b = coarsenFingerprint("katmani");
    assert.equal(a, b);
  });

  test("kabalastirma sayilari BOZMAZ (oruntu sorulari ayirt edilebilir kalir)", () => {
    assert.equal(coarsenFingerprint("123456789"), "123456789");
  });

  test("ayni konuda FARKLI kavram hala tekrar sayilmaz", () => {
    const different: DedupCandidate = {
      ...base,
      questionText: "IP adresi hangi katmanda islenir?",
      optionA: "Ağ katmanı",
      optionB: "Taşıma katmanı",
      optionC: "Oturum katmanı",
      optionD: "Uygulama katmanı",
      correctAnswer: "A",
    };
    const verdict = checkDuplicate(different, [signatureOf(base, 11)]);
    assert.equal(verdict.isDuplicate, false, `yanlis pozitif: ${verdict.reason}`);
  });

  test("benzerlik simetriktir", () => {
    const x = buildFingerprint("TCP hangi katmanda çalışır", null, ["a"]);
    const y = buildFingerprint("TCP protokolü hangi katmanıyla ilişkilidir", null, ["a"]);
    assert.equal(fingerprintSimilarity(x, y), fingerprintSimilarity(y, x));
  });
});

// ---------------------------------------------------------------------------
// Kalite skoru (sartname #6)
// ---------------------------------------------------------------------------

describe("Kalite skoru", () => {
  const clean = {
    questionText: "Bir veritabaninda LEFT JOIN kullanildiginda sonuc kumesi nasil olusur?",
    optionA: "Sol tablodaki tum satirlar korunur, eslesmeyen sag alanlar NULL olur",
    optionB: "Yalnizca her iki tabloda eslesen satirlar dondurulur",
    optionC: "Sag tablodaki tum satirlar korunur, sol eksikler NULL olur",
    optionD: "Iki tablonun kartezyen carpimi dondurulur",
    correctAnswer: "A" as const,
    explanation:
      "LEFT JOIN sol tablonun tum satirlarini korur; sag tarafta eslesme yoksa o sutunlar NULL gelir. INNER JOIN yalnizca eslesenleri, RIGHT JOIN ise sag tarafi korur; CROSS JOIN kartezyen carpim uretir.",
  };

  test("dogrulama yoksa skor deterministik tavanda kalir", () => {
    const report = checkQuality(clean);
    const result = computeQualityScore({ report });
    assert.equal(result.score, QUALITY_SCORE.deterministicCap);
    assert.ok(result.reasons.some((r) => r.includes("doğrulaması yapılmadı")));
  });

  test("denetci onaylarsa skor tavani asar", () => {
    const report = checkQuality(clean);
    const result = computeQualityScore({
      report,
      verifier: { answerAgrees: true, ambiguous: false, possiblyOutdated: false, confidence: 1 },
      audit: {
        withinCurriculum: true,
        difficultyReasonable: true,
        distractorsPlausible: true,
        explanationConsistent: true,
        confidence: 1,
      },
    });
    assert.equal(result.score, 100);
  });

  test("cevap uyusmazligi skoru sifirlar", () => {
    const report = checkQuality(clean);
    const result = computeQualityScore({
      report,
      verifier: { answerAgrees: false, ambiguous: false, possiblyOutdated: false, confidence: 0.9 },
    });
    assert.equal(result.score, 0);
  });

  test("mufredat disi soru esigin altina duser", () => {
    const report = checkQuality(clean);
    const result = computeQualityScore({
      report,
      verifier: { answerAgrees: true, ambiguous: true, possiblyOutdated: false, confidence: 0.75 },
      audit: {
        withinCurriculum: false,
        difficultyReasonable: false,
        distractorsPlausible: false,
        explanationConsistent: true,
        confidence: 0.8,
      },
    });
    assert.ok(
      result.score < QUALITY_SCORE.minForExam,
      `esigin altinda olmali, skor: ${result.score}`,
    );
  });

  test("zorluk etiketi ile sure tutarsizligi cezalandirilir", () => {
    const report = checkQuality(clean);
    const consistent = computeQualityScore({ report, difficulty: "easy", estimatedSeconds: 40 });
    const inconsistent = computeQualityScore({ report, difficulty: "easy", estimatedSeconds: 200 });
    assert.ok(inconsistent.score < consistent.score);
    assert.ok(inconsistent.reasons.some((r) => r.includes("Tahmini süre")));
  });

  test("engelleyici sorun skoru sifir yapar", () => {
    const report = checkQuality({ ...clean, explanation: "Kisa." });
    const result = computeQualityScore({ report });
    assert.equal(result.score, 0);
  });
});
