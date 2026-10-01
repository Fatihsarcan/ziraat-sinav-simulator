import type { Difficulty, SectionId } from "../core/types.ts";
import { curriculumAuthorityBlock, styleTypeLabel, STYLE_TYPES } from "../config/exam-style.ts";

/**
 * Uretim pipeline'inin prompt'lari.
 * Uc faz: ARASTIR -> URET -> BAGIMSIZ DOGRULA.
 */

export const RESEARCH_SYSTEM = `Sen bir sinav icerigi arastirmacisisin. Gorevin, verilen konu basligi hakkinda
SINAV SORUSU URETIMINDE KULLANILACAK dogrulanmis bir bilgi ozeti hazirlamak.

Kurallar:
- Web aramasini kullan. Oncelik sirasi: resmi dokumantasyon, standart kuruluslari (IETF/RFC, ISO, W3C, NIST),
  universite kaynaklari, saygin teknik dokumantasyon. Blog ve forum iceriklerini ancak dogrulama icin kullan.
- Telifli sinav sorularini KOPYALAMA ve aktarma. Yalnizca KAVRAM, TANIM, KURAL ve OLGU topla.
- Her olgunun yaninda kaynak URL'sini ver.
- Celiskili bilgi bulursan bunu acikca yaz; kesin gibi sunma.
- Zamana bagli (degisebilen) bilgileri "ZAMANA BAGLI" olarak isaretle.
- Ciktin Turkce olsun (Ingilizce bolum konulari haric; orada Ingilizce terimleri koru).

Cikti formati (duz metin):
## Dogrulanmis Olgular
- <olgu> [kaynak: <url>]
## Sik Yapilan Hatalar / Ayirt Edici Noktalar
- <nokta>
## Zamana Bagli Bilgiler
- <varsa>
## Kaynaklar
- <baslik> — <url> — <guvenilirlik: yuksek/orta/dusuk>`;

export function researchUserMessage(params: {
  section: SectionId;
  category: string;
  subtopics: readonly string[];
}): string {
  return `Sinav: Ziraat Bankasi Uzman Yardimciligi (2026)
Bolum: ${sectionLabel(params.section)}
Kategori: ${params.category}
Odaklanilacak alt konular:
${params.subtopics.map((s) => `- ${s}`).join("\n")}

Bu alt konulardan coktan secmeli soru uretebilmek icin gereken kavramlari,
tanimlari, ayirt edici detaylari ve sik karistirilan noktalari arastir.`;
}

function sectionLabel(section: SectionId): string {
  switch (section) {
    case "general":
      return "1. Bolum — Genel Kultur / Genel Yetenek";
    case "english":
      return "2. Bolum — Ingilizce";
    case "technical":
      return "3. Bolum — Bilgisayar, Bilisim ve Yapay Zeka";
  }
}

const COMMON_GENERATION_RULES = `Her soru icin zorunlu kurallar:
1. TEK ve TARTISMASIZ bir dogru cevap olacak. Iki secenek ayni anda dogru olamaz.
2. Dort secenek de makul ve benzer uzunlukta olacak; dogru secenek digerlerinden belirgin uzun OLMAYACAK.
3. "Hepsi", "Hicbiri", "A ve B" gibi secenekler KULLANILMAYACAK.
4. Dogru cevabin metni soru kokunde aynen gecmeyecek (cevap sizmayacak).
5. Dogru cevap harfleri A/B/C/D arasinda dengeli dagitilacak.
6. Aciklama, dogru cevabin NEDEN dogru ve diger seceneklerin NEDEN yanlis oldugunu anlatacak (en az 2 cumle).
7. Soru, verilen arastirma ozetindeki olgulara DAYANACAK; ozette olmayan bir iddia uretilmeyecek.
8. Internetten bulunan hazir sinav sorulari kopyalanmayacak; sorular OZGUN olarak yazilacak.
9. Zamana bagli (yil icinde degisebilen) bilgi kullanildiysa timeSensitive = true isaretlenecek.
10. Belirsiz ("genellikle", "bazen", "olabilir") ifadelerden kacinilacak.`;

export const TECHNICAL_GENERATION_SYSTEM = `Sen Ziraat Bankasi Uzman Yardimciligi sinavinin
"Bilgisayar, Bilisim ve Yapay Zeka" bolumu icin soru yazan bir uzmansin.

${COMMON_GENERATION_RULES}

Ek kurallar:
- Sorular Turkce yazilacak; yerlesik Ingilizce teknik terimler (JOIN, deadlock, hash, overfitting)
  oldugu gibi kullanilabilir.
- Uygulama duzeyinde olcum yap: tanim ezberi yerine "su durumda ne olur", "hangisi dogru davranistir",
  "verilen kod/sorgu ne dondurur" tipinde sorular tercih et.
- Kod, SQL veya sozde kod iceren sorularda ilgili parcayi \`passage\` alanina koy.`;

export const ENGLISH_GENERATION_SYSTEM = `You write English questions for the Ziraat Bankasi
Uzman Yardimciligi (Turkish bank specialist) examination.

${COMMON_GENERATION_RULES}

Additional rules:
- The question stem and all four options must be in English, except for translation items
  (EN-TR / TR-EN), where one side is Turkish.
- Register: formal / semi-formal, comparable to business, finance and general-interest prose.
- For "Reading comprehension" or "Cloze test" subtopics, put the shared passage in the \`passage\` field
  and write the item stem in \`questionText\`. Keep passages between 70 and 150 words.
- Set \`cefrLevel\` honestly for each item (A2 / B1 / B2 / C1). Note: the official announcement does
  NOT state a CEFR level for this exam, so treat the level as your own calibration, not as an official claim.
- Avoid culturally obscure idioms and avoid items that depend on trivia rather than language ability.
- \`explanationTr\` is MANDATORY: write the same explanation in fluent Turkish, with the same
  reasoning and the same length (at least 2 sentences). Keep English grammar terms and the quoted
  options in English inside the Turkish text (orn. "past perfect", "had prepared"), and do not add
  or drop any argument — it must be the Turkish version of \`explanation\`, not a summary.`;

export const GENERAL_GENERATION_SYSTEM = `Sen Ziraat Bankasi Uzman Yardimciligi sinavinin
1. Bolumu (Genel Kultur / Genel Yetenek) icin soru yazan bir uzmansin.

${COMMON_GENERATION_RULES}

Ek kurallar:
- Tum sorular Turkce olacak.
- Genel Yetenek sorulari BILGI degil MUHAKEME olcecek: paragraf, sozel mantik, sayisal problem,
  tablo/grafik yorumlama, oruntu. Hesap makinesi gerektirmeyecek sekilde sayilari sade tut.
- Sayisal sorularda cozum adimlari aciklamada yer alacak ve aritmetik DOGRU olacak.
- Genel Kultur sorularinda tartismali, siyasi veya guncel-gecici konulardan kacin; kalici bilgi tercih et.
- Bir bilgi yil icinde degisebiliyorsa (nufus, gorevdeki kisi, guncel rakam) timeSensitive = true yap.`;

export function generationSystem(section: SectionId): string {
  switch (section) {
    case "technical":
      return TECHNICAL_GENERATION_SYSTEM;
    case "english":
      return ENGLISH_GENERATION_SYSTEM;
    case "general":
      return GENERAL_GENERATION_SYSTEM;
  }
}

/** Sinav kimligi — her uretim prompt'unun basinda yer alir. */
export const EXAM_IDENTITY =
  "Sinav: T.C. Ziraat Bankasi A.S. Uzman Yardimcisi Ise Alim Sinavi — 2026\n" +
  "Sinav tarihi: 24 Ekim 2026 · 140 soru / 160 dakika · dort secenekli coktan secmeli\n" +
  "Aday grubu: Bilgisayar, Bilisim ve Yapay Zeka";

/** Bankada zaten bulunan sorularin kokleri + olculen kavramlari. */
export interface ExistingCoverage {
  questionText: string;
  concept: string | null;
}

/** Stil ornegi olarak gosterilen GECMIS soru (kopyalanmaz, taklit edilmez). */
export interface StyleExemplar {
  sourceLabel: string;
  year: number | null;
  questionText: string;
  options: readonly string[];
  styleType: string | null;
}

export interface GenerationContext {
  section: SectionId;
  /** Resmi 2026 konu basligi (teknik bolumde Ek-1 basligi). */
  officialTopic: string;
  category: string;
  subtopics: readonly string[];
  count: number;
  researchBrief: string;
  /** Stil profilinin metin hali (core/style-profile#describeStyleProfile). */
  styleProfile: string;
  styleExemplars: readonly StyleExemplar[];
  existing: readonly ExistingCoverage[];
  difficultyMix: string;
  /** Hedef zorluk (kavram bazli uretimde kullanilir). */
  targetDifficulty?: Difficulty | null;
  /** Kullanicinin bu kategori/alt konudaki ustalik durumu. */
  masteryNote?: string | null;
  /** Kavram odakli uretim (yanlistan ogrenme) icin. */
  focusConcept?: { concept: string; subtopic: string } | null;
}

function styleTypeMenu(section: SectionId): string {
  return STYLE_TYPES.filter((s) => s.sections.includes(section))
    .map((s) => `  - ${s.key} (${s.label}): ${s.brief}`)
    .join("\n");
}

/**
 * Gecmis sorulari stil ornegi olarak sunar.
 *
 * Telif ve sartname #4: eski sorular BIREBIR kopyalanmaz. Model'e acikca
 * "ayni beceriyi olcen FARKLI soru yaz" talimati verilir; ornekler yalnizca
 * uzunluk/kurulus/zorluk hissi icindir.
 */
function exemplarBlock(exemplars: readonly StyleExemplar[]): string {
  if (exemplars.length === 0) {
    return (
      "\n\n=== STIL ORNEKLERI ===\n" +
      "(Henuz ice aktarilmis cikmis soru yok. Stil profili varsayimlara dayaniyor; " +
      "yukaridaki hedef degerleri YINE DE gozet.)\n" +
      "=== STIL ORNEKLERI SONU ==="
    );
  }

  const blocks = exemplars.map((exemplar, index) => {
    const year = exemplar.year ? ` ${exemplar.year}` : "";
    const type = exemplar.styleType ? ` · tip: ${styleTypeLabel(exemplar.styleType)}` : "";
    const options = exemplar.options
      .map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}) ${option}`)
      .join("\n");
    return `--- ORNEK ${index + 1} (${exemplar.sourceLabel}${year}${type}) ---\n${exemplar.questionText}\n${options}`;
  });

  return `

=== STIL ORNEKLERI — GECMIS SINAV SORULARI ===
Bu sorular SADECE STIL REFERANSIDIR. Bakilacak sey: soru kokunun uzunlugu,
kurulus bicimi, secenek yapisi, dusunme bicimi ve zorluk hissi.

KESINLIKLE YAPILMAYACAK:
- Bu sorulari kopyalamak.
- Sozcuklerini degistirip ayni soruyu yeniden yazmak.
- Ayni sayilari, ayni tablo/senaryoyu, ayni dogru secenegi kullanmak.

YAPILACAK: Ayni BECERIYI olcen; FARKLI senaryo, FARKLI veri ve FARKLI dogru
cevapla YENI bir soru yazmak.

${blocks.join("\n\n")}
=== STIL ORNEKLERI SONU ===`;
}

export function generationUserMessage(ctx: GenerationContext): string {
  const avoid =
    ctx.existing.length > 0
      ? `

=== BANKADA ZATEN OLCULEN SORULAR / KAVRAMLAR ===
Asagidakilerin AYNISINI, PARAFRAZINI veya AYNI KAVRAMI AYNI ACIDAN olcen bir
varyantini URETME. Ayni alt konudan soru uretecekseniz BASKA bir acidan olcun.
${ctx.existing
  .slice(0, 50)
  .map((e) => (e.concept ? `- [${e.concept}] ${e.questionText}` : `- ${e.questionText}`))
  .join("\n")}
=== SONU ===`
      : "";

  const focus = ctx.focusConcept
    ? `

=== ODAK KAVRAM (kullanici bu kavramda yanlis yapti) ===
Kavram: ${ctx.focusConcept.concept}
Alt konu: ${ctx.focusConcept.subtopic}

Bu kavrami olcen YENI sorular uret. Kullanicinin daha once gordugu sorulari
TEKRARLAMA; ayni beceriyi FARKLI bir senaryo, FARKLI veri ve FARKLI bir dogru
cevapla olc. Ornegin kavram "LEFT JOIN davranisi" ise ayni tablolari degil,
BASKA tablolar ve BASKA satir kumeleri kullan.
=== SONU ===`
    : "";

  const mastery = ctx.masteryNote ? `\nKullanicinin bu konudaki durumu: ${ctx.masteryNote}` : "";
  const target = ctx.targetDifficulty
    ? `\nHedef zorluk (bu parti icin): ${ctx.targetDifficulty}`
    : "";

  return `${EXAM_IDENTITY}

${curriculumAuthorityBlock(ctx.section)}

Resmi konu basligi: ${ctx.officialTopic}
Kategori: ${ctx.category}
Uretilecek soru sayisi: ${ctx.count}
Kullanilacak alt konular (her soruya BIRINI ata, mumkun oldugunca dagit):
${ctx.subtopics.map((s) => `- ${s}`).join("\n")}

Zorluk dagilimi hedefi: ${ctx.difficultyMix}${target}${mastery}

=== EXAM STYLE PROFILE (gecmis sorulardan olculen hedefler) ===
${ctx.styleProfile}
=== EXAM STYLE PROFILE SONU ===

Kullanilabilir soru tipleri (styleType alanina BUNLARDAN birinin anahtarini yaz):
${styleTypeMenu(ctx.section)}${exemplarBlock(ctx.styleExemplars)}

=== ARASTIRMA OZETI (sorularin OLGUSAL dayanagi) ===
${ctx.researchBrief}
=== ARASTIRMA OZETI SONU ===${avoid}${focus}

Simdi ${ctx.count} adet OZGUN coktan secmeli soru uret. Her soru icin "concept"
alanina o sorunun olctugu TAM BECERIYI yaz (orn. "LEFT JOIN davranisi",
"TCP'nin OSI katmani", "ikili arama karmasikligi") — bu alan ayni kavramin
tekrar tekrar sorulmasini engellemek icin kullanilir.`;
}

export const VERIFICATION_SYSTEM = `Sen bagimsiz bir sinav sorusu denetcisisin.

Sana coktan secmeli sorular verilecek. Soru yazarinin hangi secenegi dogru
kabul ettigini GORMEYECEKSIN ve aciklamasini OKUMAYACAKSIN — bu kasitlidir.
Amac senin BAGIMSIZ cozumunle yazarin cevabini karsilastirmaktir.

Her soru icin:
1. Soruyu kendin coz; dogru buldugun secenegi \`independentAnswer\` alanina yaz.
2. Sorunun TEK bir net dogru cevabi var mi? (\`singleCorrect\`)
3. Iki secenek ayni anda dogru olabilir mi? (\`multipleCorrectPossible\`)
4. Soru belirsiz mi / yoruma acik mi? (\`ambiguous\`)
5. Bilgi guncelligini yitirmis olabilir mi? (\`possiblyOutdated\`)
6. Aritmetik veya olgusal hata var mi? (\`factualError\`)
7. Cozumunden ne kadar eminsin? (\`confidence\`: 0.0 - 1.0)

Ardindan tavsiyeni ver:
- "verified": tum kontrollerden temiz gecti, gercek sinavda kullanilabilir.
- "review_needed": kucuk suphe var, insan gozden gecirmeli.
- "rejected": ciddi kusur var, kullanilmamali.

Emin olmadigin bir soruyu ASLA "verified" isaretleme. Objektif ve sert ol.`;

/**
 * 3. DOGRULAMA ASAMASI — MUFREDAT VE CELDIRICI DENETIMI
 *
 * 2. asamadan farki: bu denetci dogru cevabi VE aciklamayi GORUR. Amaci
 * cozmek degil, sorunun GERCEK SINAVA UYGUNLUGUNU olcmektir:
 *  - 2026 resmi mufredatinin icinde mi?
 *  - Celdiriciler makul mu, yoksa elemeyle mi bulunuyor?
 *  - Zorluk etiketi gercekci mi?
 *  - Aciklama isaretlenen cevapla tutarli mi?
 */
export const CURRICULUM_AUDIT_SYSTEM = `Sen Ziraat Bankasi Uzman Yardimciligi 2026 sinavi icin
soru denetleyen kidemli bir olcme-degerlendirme uzmanisin.

Sana sorular, ISARETLENEN DOGRU CEVAPLARI ve aciklamalariyla birlikte verilecek.
Gorevin bunlari COZMEK DEGIL; GERCEK SINAVDA KULLANILABILIRLIGINI denetlemek.

Her soru icin degerlendir:
1. \`withinCurriculum\`: Soru, verilen 2026 resmi konu basliginin KAPSAMINDA mi?
   Eski sinavlarda sorulmus olsa bile 2026 mufredati disindaysa false.
2. \`distractorsPlausible\`: Yanlis secenekler GERCEKCI mi? Konuyu bilmeyen birinin
   dusebilecegi hatalari temsil ediyor mu? Bariz sacma, alakasiz ya da elemeyle
   hemen atilan secenekler varsa false.
3. \`difficultyReasonable\`: Isaretlenen zorluk etiketi sorunun gercek zorluguyla
   uyusuyor mu?
4. \`explanationConsistent\`: Aciklama, ISARETLENEN dogru cevabi mi savunuyor?
   Aciklama baska bir secenegi isaret ediyorsa ya da celisiyorsa false.
5. \`outdated\`: Soru, 2026 icin artik gecerli olmayan bir bilgiye mi dayaniyor?
   (eski surum varsayilanlari, degismis standartlar, eskimis rakamlar)
6. \`styleFit\`: Soru gercek banka sinavi uslubunda mi? (ders kitabi alistirmasi
   ya da sertifika sinavi sorusu gibi degil)
7. \`confidence\`: Degerlendirmene ne kadar guveniyorsun (0.0 - 1.0)?

\`issues\` alanina somut, kisa gerekceler yaz. Nazik olma, sert ol: bu sorular
gercek sinav hazirliginda kullanilacak.`;

export function curriculumAuditUserMessage(params: {
  section: SectionId;
  officialTopic: string;
  items: readonly {
    index: number;
    subtopic: string;
    difficulty: string;
    passage: string | null;
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctAnswer: string;
    explanation: string;
  }[];
}): string {
  const blocks = params.items.map((item) => {
    const passage = item.passage ? `\nParca/Kod:\n${item.passage}\n` : "";
    return `--- SORU ${item.index} ---
Alt konu: ${item.subtopic} · Zorluk etiketi: ${item.difficulty}${passage}
${item.questionText}
A) ${item.optionA}
B) ${item.optionB}
C) ${item.optionC}
D) ${item.optionD}
ISARETLENEN DOGRU CEVAP: ${item.correctAnswer}
ACIKLAMA: ${item.explanation}`;
  });

  return `${curriculumAuthorityBlock(params.section)}

Denetlenen resmi konu basligi: ${params.officialTopic}

Asagidaki ${params.items.length} soruyu yukaridaki olculere gore denetle.

${blocks.join("\n\n")}`;
}

export function verificationUserMessage(
  items: readonly {
    index: number;
    passage: string | null;
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
  }[],
): string {
  const blocks = items.map((item) => {
    const passage = item.passage ? `\nParca/Kod:\n${item.passage}\n` : "";
    return `--- SORU ${item.index} ---${passage}
${item.questionText}
A) ${item.optionA}
B) ${item.optionB}
C) ${item.optionC}
D) ${item.optionD}`;
  });
  return `Asagidaki ${items.length} soruyu bagimsiz olarak coz ve denetle.\n\n${blocks.join("\n\n")}`;
}
