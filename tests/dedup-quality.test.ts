import assert from "node:assert/strict";
import { test, describe, after } from "node:test";
import {
  buildContentHash,
  buildFingerprint,
  checkDuplicate,
  fingerprintSimilarity,
  normalizeText,
  tokenize,
  type DedupCandidate,
  type ExistingQuestionSignature,
} from "../src/core/dedup.ts";
import { checkQuality, classifySource } from "../src/question-engine/quality.ts";
import { insertQuestion, listQuestions, signaturesForCategory } from "../src/db/repos/questions.ts";
import { makeTestDb } from "./helpers.ts";

function candidate(overrides: Partial<DedupCandidate> = {}): DedupCandidate {
  return {
    questionText: "What protocol resolves domain names to IP addresses?",
    optionA: "DNS",
    optionB: "DHCP",
    optionC: "ARP",
    optionD: "NAT",
    correctAnswer: "A",
    category: "Bilgisayar Aglari ve Isletim Sistemleri",
    subtopic: "DNS",
    ...overrides,
  };
}

function signature(c: DedupCandidate, id: number): ExistingQuestionSignature {
  const map = { A: c.optionA, B: c.optionB, C: c.optionC, D: c.optionD };
  return {
    id,
    category: c.category,
    subtopic: c.subtopic,
    fingerprint: buildFingerprint(c.questionText, null, [
      c.optionA,
      c.optionB,
      c.optionC,
      c.optionD,
    ]),
    stemFingerprint: buildFingerprint(c.questionText, null, []),
    contentHash: buildContentHash(c),
    correctOptionNormalized: normalizeText(map[c.correctAnswer]),
  };
}

describe("Metin normalizasyonu", () => {
  test("Turkce karakterler ve noktalama sadelesir", () => {
    assert.equal(normalizeText("Şığır, Öğüt ve Çünkü!"), "sigir ogut ve cunku");
  });

  test("sayilar token olarak korunur", () => {
    const tokens = tokenize("2, 6, 12, 20, 30 oruntusunde");
    assert.ok(tokens.includes("2"));
    assert.ok(tokens.includes("12"));
    assert.ok(tokens.includes("30"));
  });

  test("secenek sirasi degisse de contentHash ayni kalir", () => {
    const a = candidate();
    const b = candidate({ optionA: "DHCP", optionB: "DNS", correctAnswer: "B" });
    assert.equal(buildContentHash(a), buildContentHash(b));
  });
});

describe("Tekrar tespiti", () => {
  test("birebir ayni soru yakalanir", () => {
    const existing = [signature(candidate(), 1)];
    const verdict = checkDuplicate(candidate(), existing);
    assert.equal(verdict.isDuplicate, true);
    assert.equal(verdict.kind, "exact");
    assert.equal(verdict.matchedQuestionId, 1);
  });

  test("SARTNAME ORNEGI: ayni kavrami farkli sozcuklerle soran soru yakalanir", () => {
    const existing = [signature(candidate(), 7)];
    const paraphrase = candidate({
      questionText: "Which network service translates domain names into IP addresses?",
      optionA: "DNS",
      optionB: "DHCP",
      optionC: "ARP",
      optionD: "NAT",
    });
    const verdict = checkDuplicate(paraphrase, existing);
    assert.equal(verdict.isDuplicate, true, "ayni kavram + ayni cevap tekrar sayilmali");
    assert.ok(verdict.kind === "concept" || verdict.kind === "near");
    assert.equal(verdict.matchedQuestionId, 7);
  });

  test("ayni konuda FARKLI kavram tekrar sayilmaz", () => {
    const existing = [signature(candidate(), 1)];
    const different = candidate({
      questionText: "Which protocol automatically assigns IP addresses to clients on a network?",
      optionA: "DHCP",
      optionB: "DNS",
      optionC: "ICMP",
      optionD: "FTP",
      correctAnswer: "A",
      subtopic: "DHCP",
    });
    const verdict = checkDuplicate(different, existing);
    assert.equal(verdict.isDuplicate, false, `yanlis pozitif: ${verdict.reason}`);
  });

  test("kaliplasmis soru kokleri yanlis pozitif uretmez", () => {
    const spelling = candidate({
      category: "Genel Yetenek",
      subtopic: "Dil bilgisi ve yazim kurallari",
      questionText: "Aşağıdaki cümlelerin hangisinde yazım yanlışı vardır?",
      optionA: "Herkes bu kararı bekliyordu.",
      optionB: "Yarın saat üçte buluşalım.",
      optionC: "Bir çok insan toplantıya katıldı.",
      optionD: "Hiçbir şey söylemeden çıktı.",
      correctAnswer: "C",
    });
    const punctuation = candidate({
      category: "Genel Yetenek",
      subtopic: "Dil bilgisi ve yazim kurallari",
      questionText: "Aşağıdaki cümlelerin hangisinde noktalama yanlışı vardır?",
      optionA: "Geldi, gördü ve gitti.",
      optionB: "Ne zaman geleceksin?",
      optionC: "Toplantı saat 10.00'da başlayacak.",
      optionD: "Ali, dün akşam, bize geldi.",
      correctAnswer: "D",
    });
    const verdict = checkDuplicate(punctuation, [signature(spelling, 3)]);
    assert.equal(verdict.isDuplicate, false, `yanlis pozitif: ${verdict.reason}`);
  });

  test("oruntu sorulari sayilari sayesinde ayirt edilir", () => {
    const a = candidate({
      category: "Genel Yetenek",
      subtopic: "Sayisal mantik ve oruntu",
      questionText: "2, 6, 12, 20, 30, ... örüntüsünde bir sonraki sayı kaçtır?",
      optionA: "36", optionB: "40", optionC: "42", optionD: "45", correctAnswer: "C",
    });
    const b = candidate({
      category: "Genel Yetenek",
      subtopic: "Sayisal mantik ve oruntu",
      questionText: "1, 1, 2, 3, 5, 8, ... dizisinde bir sonraki sayı kaçtır?",
      optionA: "11", optionB: "12", optionC: "13", optionD: "16", correctAnswer: "C",
    });
    const verdict = checkDuplicate(b, [signature(a, 5)]);
    assert.equal(verdict.isDuplicate, false, `yanlis pozitif: ${verdict.reason}`);
  });

  test("birebir kopya KATEGORIDEN BAGIMSIZ yakalanir", () => {
    // content_hash tum tabloda UNIQUE; ayni soru baska kategoride de duramaz.
    const existing = [signature(candidate({ category: "Baska Kategori" }), 1)];
    const verdict = checkDuplicate(candidate(), existing);
    assert.equal(verdict.isDuplicate, true);
    assert.equal(verdict.kind, "exact");
  });

  test("farkli kategorideki BENZER (ama ayni olmayan) soru tekrar sayilmaz", () => {
    const existing = [signature(candidate({ category: "Baska Kategori" }), 1)];
    const similar = candidate({
      questionText: "Which service maps domain names onto IP addresses in a network?",
    });
    const verdict = checkDuplicate(similar, existing);
    assert.equal(verdict.isDuplicate, false, `yanlis pozitif: ${verdict.reason}`);
  });

  test("benzerlik 0-1 araliginda", () => {
    const a = buildFingerprint("hello world test", null, ["x"]);
    const b = buildFingerprint("hello world test", null, ["x"]);
    assert.equal(fingerprintSimilarity(a, b), 1);
    assert.equal(fingerprintSimilarity(a, buildFingerprint("tamamen farkli icerik", null, ["y"])), 0);
  });
});

describe("Veritabani seviyesinde tekrar engeli", () => {
  const { db, cleanup } = makeTestDb({ seed: false });
  after(cleanup);

  const base = {
    section: "technical" as const,
    category: "Bilgisayar Aglari ve Isletim Sistemleri",
    subtopic: "DNS",
    difficulty: "easy" as const,
    questionText: "Alan adlarını IP adreslerine çeviren hizmet hangisidir?",
    optionA: "DNS",
    optionB: "DHCP",
    optionC: "ARP",
    optionD: "NAT",
    correctAnswer: "A" as const,
    explanation:
      "DNS alan adlarını IP adreslerine çözümler. DHCP otomatik IP dağıtır, ARP ise IP'yi MAC adresine eşler.",
    origin: "manual" as const,
    qualityStatus: "verified" as const,
  };

  test("ilk ekleme basarili", () => {
    const result = insertQuestion(base, db);
    assert.equal(result.ok, true);
  });

  test("ayni soru ikinci kez eklenemez", () => {
    const result = insertQuestion(base, db);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.verdict.kind, "exact");
    }
  });

  test("ayni kavramin farkli ifadesi de engellenir", () => {
    const result = insertQuestion(
      {
        ...base,
        questionText: "Hangi hizmet alan adlarını IP adreslerine dönüştürür?",
      },
      db,
    );
    assert.equal(result.ok, false);
  });

  test("imza sorgusu yalnizca ayni kategoriyi dondurur", () => {
    const signatures = signaturesForCategory(base.category, db);
    assert.equal(signatures.length, 1);
    assert.equal(signatures[0]!.correctOptionNormalized, "dns");
    assert.equal(listQuestions({}, db).total, 1);
  });
});

describe("Kalite kontrolu", () => {
  const good = {
    questionText: "OSI modelinde yönlendirme işlemi hangi katmanda gerçekleşir?",
    optionA: "Veri bağı katmanı",
    optionB: "Ağ katmanı",
    optionC: "Taşıma katmanı",
    optionD: "Oturum katmanı",
    correctAnswer: "B" as const,
    explanation:
      "Ağ katmanı IP adresleriyle mantıksal adresleme yapar ve paketleri yönlendirir. Veri bağı katmanı aynı ağ içindeki MAC adresleriyle ilgilenir.",
  };

  test("saglam soru temiz gecer", () => {
    const report = checkQuality(good);
    assert.equal(report.verdict, "pass");
    assert.equal(report.blockers.length, 0);
  });

  test("ayni iki secenek BLOKLANIR (iki cevap ayni anda dogru olur)", () => {
    const report = checkQuality({ ...good, optionC: "Ağ katmanı" });
    assert.equal(report.verdict, "reject");
    assert.ok(report.blockers.some((i) => i.code === "duplicate_options"));
  });

  test("'hepsi/hicbiri' secenegi BLOKLANIR", () => {
    const report = checkQuality({ ...good, optionD: "Hiçbiri" });
    assert.equal(report.verdict, "reject");
    assert.ok(report.blockers.some((i) => i.code === "ambiguous_option"));
  });

  test("yetersiz aciklama BLOKLANIR", () => {
    const report = checkQuality({ ...good, explanation: "Ağ katmanı." });
    assert.equal(report.verdict, "reject");
    assert.ok(report.blockers.some((i) => i.code === "explanation_too_short"));
  });

  test("cok kisa soru koku BLOKLANIR", () => {
    const report = checkQuality({ ...good, questionText: "Hangisi?" });
    assert.equal(report.verdict, "reject");
  });

  test("dogru secenegin bariz uzun olmasi UYARI uretir", () => {
    const report = checkQuality({
      ...good,
      optionB:
        "Ağ katmanı, çünkü bu katman IP adresleriyle mantıksal adresleme yapar ve paketleri ağlar arasında yönlendirir",
    });
    assert.equal(report.verdict, "review");
    assert.ok(report.warnings.some((i) => i.code === "length_cue"));
  });

  test("cevabin soru kokunde gecmesi UYARI uretir", () => {
    const report = checkQuality({
      ...good,
      questionText: "Ağ katmanı hangi görevi üstlenir; ağ katmanı nedir?",
    });
    assert.ok(report.warnings.some((i) => i.code === "answer_leak"));
  });

  test("aciklama-secenek eslesmesi yalnizca INFO seviyesindedir (karari etkilemez)", () => {
    const report = checkQuality({
      ...good,
      explanation:
        "Bu soruda doğru yanıt, mantıksal adresleme ve paket iletiminden sorumlu olan katmandır; diğerleri farklı sorumluluklara sahiptir.",
    });
    assert.equal(report.verdict, "pass", "info seviyesindeki not soruyu engellememeli");
    assert.ok(report.infos.some((i) => i.code === "explanation_no_option_mention"));
  });
});

describe("Kaynak siniflandirma", () => {
  test("resmi ve standart alanlar yuksek guvenilirlik alir", () => {
    assert.equal(classifySource("https://www.ziraatbank.com.tr/x.pdf").kind, "official");
    assert.equal(classifySource("https://www.rfc-editor.org/rfc/rfc1034.html").kind, "standard");
    assert.equal(classifySource("https://www.postgresql.org/docs/").reliability, "high");
  });

  test("bilinmeyen alan ucuncu taraf sayilir", () => {
    const result = classifySource("https://rastgele-blog.example/yazi");
    assert.equal(result.kind, "third_party");
    assert.equal(result.reliability, "medium");
  });

  test("kaynaksiz soru dusuk guvenilirlik", () => {
    assert.equal(classifySource(null).reliability, "low");
  });
});
