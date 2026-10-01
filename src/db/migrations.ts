/**
 * Veritabani semasi ve migration calistiricisi.
 *
 * Migration'lar sirali ve ileriye donuktur. Uygulanmis olanlar `_migrations`
 * tablosunda tutulur; `runMigrations()` idempotenttir ve uygulama her
 * acilisinda guvenle cagrilabilir.
 */

import type { DB } from "./client.ts";
import { nowIso, transaction } from "./client.ts";
import { classifyStyle, detectNegativeStem, estimateSeconds } from "../core/style-profile.ts";
import { deriveConcept } from "../core/concepts.ts";
import { ENGLISH_SEED } from "./seed/english.ts";
import { checkQuality, deterministicQualityScore } from "../question-engine/quality.ts";

interface Migration {
  readonly id: number;
  readonly name: string;
  readonly up: string;
  /**
   * SQL calistiktan SONRA ayni transaction icinde calisan JS adimi.
   * Saf SQL ile yapilamayan geri doldurmalar (fingerprint, kalite skoru gibi)
   * icindir.
   */
  readonly after?: (db: DB) => void;
  /**
   * Tablo yeniden kurulumu iceriyorsa true. Bu durumda migration transaction'i
   * `PRAGMA foreign_keys = OFF` ile sarilir (SQLite'in belgelenmis tablo
   * degistirme yordami); pragma transaction icinde etkisizdir, bu yuzden
   * disaridan uygulanmasi gerekir.
   */
  readonly rebuildsTables?: boolean;
}

const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: "initial_schema",
    up: /* sql */ `
      -- Arastirma sirasinda kullanilan kaynaklar ve erisim tarihleri.
      CREATE TABLE sources (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        title         TEXT    NOT NULL,
        url           TEXT    NOT NULL UNIQUE,
        publisher     TEXT,
        kind          TEXT    NOT NULL CHECK (kind IN ('official','third_party','documentation','academic','standard')),
        reliability   TEXT    NOT NULL DEFAULT 'medium' CHECK (reliability IN ('high','medium','low')),
        accessed_at   TEXT    NOT NULL,
        notes         TEXT,
        created_at    TEXT    NOT NULL
      );

      -- Soru bankasi.
      CREATE TABLE questions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        section         TEXT    NOT NULL CHECK (section IN ('general','english','technical')),
        category        TEXT    NOT NULL,
        subtopic        TEXT    NOT NULL,
        difficulty      TEXT    NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
        cefr_level      TEXT    CHECK (cefr_level IS NULL OR cefr_level IN ('A2','B1','B2','C1')),

        question_text   TEXT    NOT NULL,
        passage         TEXT,                -- reading comprehension / cloze icin ortak metin
        option_a        TEXT    NOT NULL,
        option_b        TEXT    NOT NULL,
        option_c        TEXT    NOT NULL,
        option_d        TEXT    NOT NULL,
        correct_answer  TEXT    NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
        explanation     TEXT    NOT NULL,

        source          TEXT,
        source_url      TEXT,
        source_id       INTEGER REFERENCES sources(id) ON DELETE SET NULL,

        origin          TEXT    NOT NULL DEFAULT 'seed' CHECK (origin IN ('seed','llm','manual','import')),
        generator_model TEXT,

        quality_status  TEXT    NOT NULL DEFAULT 'review_needed'
                                CHECK (quality_status IN ('verified','review_needed','rejected')),
        quality_notes   TEXT,
        time_sensitive  INTEGER NOT NULL DEFAULT 0 CHECK (time_sensitive IN (0,1)),
        -- time_sensitive sorular bu tarihten sonra sinava alinmaz (NULL = sinirsiz)
        stale_after     TEXT,

        content_hash    TEXT    NOT NULL UNIQUE,   -- birebir kopya engeli
        fingerprint     TEXT    NOT NULL,          -- anlamsal benzerlik icin token imzasi

        created_at      TEXT    NOT NULL,
        verified_at     TEXT,
        updated_at      TEXT    NOT NULL,

        times_asked     INTEGER NOT NULL DEFAULT 0,
        times_correct   INTEGER NOT NULL DEFAULT 0,
        times_wrong     INTEGER NOT NULL DEFAULT 0,
        last_asked_at   TEXT,
        total_answer_ms INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX idx_questions_section       ON questions(section, quality_status);
      CREATE INDEX idx_questions_category      ON questions(category, subtopic);
      CREATE INDEX idx_questions_last_asked    ON questions(last_asked_at);
      CREATE INDEX idx_questions_fingerprint   ON questions(fingerprint);
      CREATE INDEX idx_questions_selection     ON questions(quality_status, section, category, times_correct);

      -- Sinav / calisma oturumlari.
      CREATE TABLE exam_sessions (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        mode             TEXT    NOT NULL CHECK (mode IN (
                                   'full_exam','practice','weak_topics','mistake_concepts','retry_mistakes','custom'
                                 )),
        label            TEXT    NOT NULL,
        status           TEXT    NOT NULL DEFAULT 'in_progress'
                                 CHECK (status IN ('in_progress','submitted','abandoned')),

        config_json      TEXT    NOT NULL,   -- olusturuldugu andaki examConfig anlik goruntusu
        params_json      TEXT,               -- practice filtreleri vb.

        total_questions  INTEGER NOT NULL,
        duration_seconds INTEGER,            -- NULL = suresiz (practice)
        started_at       TEXT    NOT NULL,
        deadline_at      TEXT,               -- started_at + duration; kalan sure buradan hesaplanir
        submitted_at     TEXT,
        auto_submitted   INTEGER NOT NULL DEFAULT 0 CHECK (auto_submitted IN (0,1)),

        score            REAL,
        passed           INTEGER CHECK (passed IS NULL OR passed IN (0,1)),
        result_json      TEXT,               -- tam analiz anlik goruntusu
        created_at       TEXT    NOT NULL
      );

      CREATE INDEX idx_sessions_status ON exam_sessions(status, started_at);
      CREATE INDEX idx_sessions_mode   ON exam_sessions(mode, submitted_at);

      -- Oturumun soru kagidi (sira sabit).
      CREATE TABLE exam_session_questions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id  INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
        position    INTEGER NOT NULL,
        question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
        section     TEXT    NOT NULL,
        category    TEXT    NOT NULL,
        subtopic    TEXT    NOT NULL,
        UNIQUE (session_id, position),
        UNIQUE (session_id, question_id)
      );

      CREATE INDEX idx_sq_session ON exam_session_questions(session_id, position);

      -- Her soru icin cevap durumu (bos cevaplar da satir olarak tutulur).
      CREATE TABLE exam_answers (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id      INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
        question_id     INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
        position        INTEGER NOT NULL,
        selected_answer TEXT    CHECK (selected_answer IS NULL OR selected_answer IN ('A','B','C','D')),
        is_correct      INTEGER CHECK (is_correct IS NULL OR is_correct IN (0,1)),
        flagged         INTEGER NOT NULL DEFAULT 0 CHECK (flagged IN (0,1)),
        time_spent_ms   INTEGER NOT NULL DEFAULT 0,
        first_seen_at   TEXT,
        answered_at     TEXT,
        graded_at       TEXT,
        UNIQUE (session_id, question_id)
      );

      CREATE INDEX idx_answers_session  ON exam_answers(session_id);
      CREATE INDEX idx_answers_question ON exam_answers(question_id, graded_at);

      -- Yanlis soru defteri.
      CREATE TABLE mistake_history (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id     INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        session_id      INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
        section         TEXT    NOT NULL,
        category        TEXT    NOT NULL,
        subtopic        TEXT    NOT NULL,
        selected_answer TEXT,               -- NULL = bos birakildi
        correct_answer  TEXT    NOT NULL,
        was_blank       INTEGER NOT NULL DEFAULT 0 CHECK (was_blank IN (0,1)),
        created_at      TEXT    NOT NULL,
        -- Ayni soru daha sonra dogru cozulunce isaretlenir (gecmis silinmez).
        resolved_at     TEXT
      );

      CREATE INDEX idx_mistakes_created  ON mistake_history(created_at);
      CREATE INDEX idx_mistakes_topic    ON mistake_history(category, subtopic);
      CREATE INDEX idx_mistakes_question ON mistake_history(question_id);

      -- Alt konu bazli ustalik.
      CREATE TABLE topic_mastery (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        section        TEXT    NOT NULL,
        category       TEXT    NOT NULL,
        subtopic       TEXT    NOT NULL,
        attempts       INTEGER NOT NULL DEFAULT 0,
        correct        INTEGER NOT NULL DEFAULT 0,
        -- Son cevaplara daha fazla agirlik veren ustel hareketli ortalama (0-1).
        ewma           REAL    NOT NULL DEFAULT 0.5,
        mastery_score  REAL    NOT NULL DEFAULT 50,
        confidence     REAL    NOT NULL DEFAULT 0,
        last_answer_at TEXT,
        updated_at     TEXT    NOT NULL,
        UNIQUE (category, subtopic)
      );

      CREATE INDEX idx_mastery_section ON topic_mastery(section, mastery_score);

      -- Ayarlar (examConfig override'lari dahil).
      CREATE TABLE settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Soru uretim gecmisi / kuyrugu.
      CREATE TABLE generation_log (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        section        TEXT    NOT NULL,
        category       TEXT    NOT NULL,
        subtopic       TEXT,
        requested      INTEGER NOT NULL,
        accepted       INTEGER NOT NULL DEFAULT 0,
        rejected       INTEGER NOT NULL DEFAULT 0,
        duplicates     INTEGER NOT NULL DEFAULT 0,
        model          TEXT,
        used_web       INTEGER NOT NULL DEFAULT 0 CHECK (used_web IN (0,1)),
        status         TEXT    NOT NULL CHECK (status IN ('running','succeeded','failed')),
        error          TEXT,
        started_at     TEXT    NOT NULL,
        finished_at    TEXT
      );

      CREATE INDEX idx_genlog_started ON generation_log(started_at);
    `,
  },
  {
    id: 2,
    name: "exam_style_reference",
    rebuildsTables: true,
    up: /* sql */ `
      -- ---------------------------------------------------------------------
      -- 1) questions: stil, kavram, kalite skoru ve kaynak seviyesi alanlari
      -- ---------------------------------------------------------------------
      -- Olculen tam beceri (orn. "JOIN turleri — left outer"). Yanlis yapilan
      -- KAVRAMDAN yeni soru uretimi bu alana dayanir.
      ALTER TABLE questions ADD COLUMN concept TEXT;
      -- Stil taksonomisi (concept/application/sql_query/code_reading/...).
      ALTER TABLE questions ADD COLUMN style_type TEXT;
      -- "Asagidakilerden hangisi DEGILDIR" tipi olumsuz kok.
      ALTER TABLE questions ADD COLUMN is_negative INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE questions ADD COLUMN estimated_seconds INTEGER;
      -- JSON dizisi: olculen beceriler.
      ALTER TABLE questions ADD COLUMN skills_tested TEXT;
      -- 0-100. Esigin altindaki sorular gercek sinava ALINMAZ.
      ALTER TABLE questions ADD COLUMN quality_score INTEGER;
      -- Kaynak hiyerarsisi A-E (bkz. config/exam-style.ts).
      ALTER TABLE questions ADD COLUMN source_level TEXT;
      ALTER TABLE questions ADD COLUMN source_name TEXT;
      ALTER TABLE questions ADD COLUMN source_year INTEGER;
      -- Ice aktarilan sorularda dogru cevabin ne kadar kesin oldugu (0-1).
      ALTER TABLE questions ADD COLUMN answer_confidence REAL;
      -- 1 = gercek/eski sinav sorusu. Gercek sinav simulasyonuna GIRMEZ;
      -- yalnizca "Cikmis Sorular" modunda sorulur (sartname #4A, #10).
      ALTER TABLE questions ADD COLUMN historical INTEGER NOT NULL DEFAULT 0;
      -- Referans tablosundan terfi ettiyse kaynagi.
      ALTER TABLE questions ADD COLUMN reference_id INTEGER;
      -- Zamana bagli sorularda en son ne zaman dogrulandigi (sartname #10).
      ALTER TABLE questions ADD COLUMN last_verified_at TEXT;

      CREATE INDEX idx_questions_concept    ON questions(category, subtopic, concept);
      CREATE INDEX idx_questions_historical ON questions(historical, quality_status);
      CREATE INDEX idx_questions_quality    ON questions(quality_status, quality_score);

      -- ---------------------------------------------------------------------
      -- 2) sources: A-E guven seviyesi, yil ve kullanildigi bolumler
      -- ---------------------------------------------------------------------
      ALTER TABLE sources ADD COLUMN level TEXT;
      ALTER TABLE sources ADD COLUMN source_year INTEGER;
      -- JSON dizisi: ["general","technical"] gibi.
      ALTER TABLE sources ADD COLUMN sections TEXT;

      -- ---------------------------------------------------------------------
      -- 3) Ice aktarim partileri (ham kaynak -> ayristirma kaydi)
      -- ---------------------------------------------------------------------
      CREATE TABLE import_batches (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        filename       TEXT    NOT NULL,
        kind           TEXT    NOT NULL CHECK (kind IN ('pdf','json','txt')),
        source_level   TEXT    NOT NULL CHECK (source_level IN ('A','B','C','D','E')),
        source_name    TEXT    NOT NULL,
        source_year    INTEGER,
        source_url     TEXT,
        raw_chars      INTEGER NOT NULL DEFAULT 0,
        detected       INTEGER NOT NULL DEFAULT 0,
        imported       INTEGER NOT NULL DEFAULT 0,
        duplicates     INTEGER NOT NULL DEFAULT 0,
        rejected       INTEGER NOT NULL DEFAULT 0,
        with_answer    INTEGER NOT NULL DEFAULT 0,
        status         TEXT    NOT NULL CHECK (status IN ('parsed','failed')),
        message        TEXT,
        created_at     TEXT    NOT NULL
      );

      CREATE INDEX idx_import_batches_created ON import_batches(created_at);

      -- ---------------------------------------------------------------------
      -- 4) Referans (stil) soru seti — ANA SORU BANKASINDAN AYRI
      --    Bunlar kullaniciya dogrudan sorulmaz; once insan onayindan gecer,
      --    onaylanirsa "cikmis soru" olarak questions tablosuna terfi eder.
      --    Secenek sayisi degisken olabilir (eski sinavlarda 5 secenek yaygin),
      --    bu yuzden secenekler JSON dizisi olarak saklanir.
      -- ---------------------------------------------------------------------
      CREATE TABLE reference_questions (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id           INTEGER REFERENCES import_batches(id) ON DELETE SET NULL,

        section            TEXT    CHECK (section IS NULL OR section IN ('general','english','technical')),
        category           TEXT,
        subtopic           TEXT,
        concept            TEXT,

        source_level       TEXT    NOT NULL CHECK (source_level IN ('A','B','C','D','E')),
        source_name        TEXT    NOT NULL,
        source_year        INTEGER,
        source_url         TEXT,
        original_or_generated TEXT NOT NULL DEFAULT 'original'
                              CHECK (original_or_generated IN ('original','generated')),

        question_text      TEXT    NOT NULL,
        passage            TEXT,
        options_json       TEXT    NOT NULL,     -- JSON dizisi
        correct_index      INTEGER,              -- NULL = cevap bilinmiyor (UYDURULMAZ)
        answer_confidence  REAL    NOT NULL DEFAULT 0,
        explanation        TEXT,

        style_type         TEXT,
        is_negative        INTEGER NOT NULL DEFAULT 0,
        difficulty         TEXT    CHECK (difficulty IS NULL OR difficulty IN ('easy','medium','hard')),
        estimated_seconds  INTEGER,
        stem_chars         INTEGER NOT NULL DEFAULT 0,
        avg_option_chars   INTEGER NOT NULL DEFAULT 0,
        option_count       INTEGER NOT NULL DEFAULT 0,
        time_sensitive     INTEGER NOT NULL DEFAULT 0 CHECK (time_sensitive IN (0,1)),

        review_state       TEXT    NOT NULL DEFAULT 'pending'
                              CHECK (review_state IN ('pending','approved','rejected')),
        review_notes       TEXT,
        promoted_question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL,

        content_hash       TEXT    NOT NULL UNIQUE,
        fingerprint        TEXT    NOT NULL,

        created_at         TEXT    NOT NULL,
        reviewed_at        TEXT
      );

      CREATE INDEX idx_reference_state   ON reference_questions(review_state, section);
      CREATE INDEX idx_reference_level   ON reference_questions(source_level, source_year);
      CREATE INDEX idx_reference_fp      ON reference_questions(fingerprint);

      -- ---------------------------------------------------------------------
      -- 5) Hesaplanmis stil profilleri (examStyleProfile anlik goruntuleri)
      -- ---------------------------------------------------------------------
      CREATE TABLE style_profiles (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        scope        TEXT    NOT NULL UNIQUE,     -- "section:technical", "all"
        sample_size  INTEGER NOT NULL,
        confidence   TEXT    NOT NULL,
        profile_json TEXT    NOT NULL,
        computed_at  TEXT    NOT NULL
      );

      -- ---------------------------------------------------------------------
      -- 6) exam_sessions.mode: 'historical' modu eklenir.
      --    SQLite CHECK kisiti ALTER ile degistirilemez; tablo belgelenmis
      --    yordamla yeniden kurulur. Cocuk tablolarin FK bildirimleri
      --    "exam_sessions" adina bakar, yeniden adlandirma sonrasi yeni tabloyu
      --    gosterirler.
      -- ---------------------------------------------------------------------
      CREATE TABLE exam_sessions_new (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        mode             TEXT    NOT NULL CHECK (mode IN (
                                   'full_exam','practice','weak_topics','mistake_concepts',
                                   'retry_mistakes','historical','custom'
                                 )),
        label            TEXT    NOT NULL,
        status           TEXT    NOT NULL DEFAULT 'in_progress'
                                 CHECK (status IN ('in_progress','submitted','abandoned')),
        config_json      TEXT    NOT NULL,
        params_json      TEXT,
        total_questions  INTEGER NOT NULL,
        duration_seconds INTEGER,
        started_at       TEXT    NOT NULL,
        deadline_at      TEXT,
        submitted_at     TEXT,
        auto_submitted   INTEGER NOT NULL DEFAULT 0 CHECK (auto_submitted IN (0,1)),
        score            REAL,
        passed           INTEGER CHECK (passed IS NULL OR passed IN (0,1)),
        result_json      TEXT,
        created_at       TEXT    NOT NULL
      );

      INSERT INTO exam_sessions_new
        SELECT id, mode, label, status, config_json, params_json, total_questions,
               duration_seconds, started_at, deadline_at, submitted_at, auto_submitted,
               score, passed, result_json, created_at
        FROM exam_sessions;

      DROP TABLE exam_sessions;
      ALTER TABLE exam_sessions_new RENAME TO exam_sessions;

      CREATE INDEX idx_sessions_status ON exam_sessions(status, started_at);
      CREATE INDEX idx_sessions_mode   ON exam_sessions(mode, submitted_at);
    `,
    after: backfillQuestionMetadata,
  },
  {
    id: 3,
    name: "explanation_tr",
    up: /* sql */ `
      -- Ingilizce bolumunde aciklama Ingilizce yazilir. Bu sutun ayni
      -- aciklamanin Turkce anlatimini tutar; arayuzde Ingilizce metnin
      -- ALTINDA gosterilir. Turkce bolumlerde NULL kalir.
      ALTER TABLE questions ADD COLUMN explanation_tr TEXT;
    `,
    after: backfillEnglishExplanationTr,
  },
];

/**
 * Migration 3 geri doldurmasi.
 *
 * Baslangic bankasindaki Ingilizce sorular veritabanina Turkce aciklama alani
 * eklenmeden once yazilmisti. Turkce karsiliklar `seed/english.ts` icinde
 * durdugu icin burada soru metni uzerinden eslestirilip yazilir. Ceviri
 * URETILMEZ; yalnizca elle yazilmis olanlar aktarilir.
 */
function backfillEnglishExplanationTr(db: DB): void {
  const update = db.prepare(
    "UPDATE questions SET explanation_tr = ? WHERE section = 'english' AND question_text = ? AND explanation_tr IS NULL",
  );
  for (const seed of ENGLISH_SEED) {
    if (!seed.explanationTr) continue;
    update.run(seed.explanationTr, seed.q);
  }
}

/**
 * Migration 2 geri doldurmasi.
 *
 * Mevcut sorular (elle yazilmis 165 soruluk baslangic bankasi) yeni alanlar
 * icin NULL kalirsa secim havuzu disinda kalirdi. Burada deterministik olarak
 * doldurulur:
 *  - source_level: seed/llm -> E (uretilmis), import -> B (cikmis arsivi)
 *  - style_type / is_negative: metinden siniflandirilir
 *  - concept: alt konu + dogru cevabin ayirt edici terimleri
 *  - quality_score: deterministik kalite kontrolunden hesaplanir (LLM
 *    dogrulamasi olmadigi icin tavan uygulanir)
 */
function backfillQuestionMetadata(db: DB): void {
  const rows = db
    .prepare(
      `SELECT id, section, category, subtopic, origin, question_text, passage,
              option_a, option_b, option_c, option_d, correct_answer, explanation, source_url
       FROM questions`,
    )
    .all() as unknown as Record<string, unknown>[];

  const update = db.prepare(
    `UPDATE questions
     SET concept = ?, style_type = ?, is_negative = ?, quality_score = ?,
         source_level = ?, estimated_seconds = ?
     WHERE id = ?`,
  );

  for (const row of rows) {
    const section = String(row.section) as "general" | "english" | "technical";
    const options = {
      A: String(row.option_a),
      B: String(row.option_b),
      C: String(row.option_c),
      D: String(row.option_d),
    };
    const correctKey = String(row.correct_answer) as "A" | "B" | "C" | "D";
    const questionText = String(row.question_text);
    const passage = (row.passage as string | null) ?? null;
    const subtopic = String(row.subtopic);

    const styleType = classifyStyle({ section, questionText, passage, subtopic });
    const isNegative = detectNegativeStem(questionText);
    const concept = deriveConcept({ subtopic, correctOptionText: options[correctKey] });

    const report = checkQuality({
      questionText,
      passage,
      optionA: options.A,
      optionB: options.B,
      optionC: options.C,
      optionD: options.D,
      correctAnswer: correctKey,
      explanation: String(row.explanation),
      sourceUrl: (row.source_url as string | null) ?? null,
    });
    const score = deterministicQualityScore(report);
    const sourceLevel = String(row.origin) === "import" ? "B" : "E";

    update.run(
      concept,
      styleType,
      isNegative ? 1 : 0,
      score,
      sourceLevel,
      estimateSeconds(styleType, `${passage ?? ""}${questionText}`.length),
      Number(row.id),
    );
  }

  // Gomulu kaynaklar resmi ilan PDF'leridir -> A seviyesi.
  db.prepare("UPDATE sources SET level = 'A' WHERE kind = 'official' AND level IS NULL").run();
  db.prepare("UPDATE sources SET level = 'D' WHERE level IS NULL").run();
}

function ensureMigrationsTable(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

export interface MigrationResult {
  readonly applied: string[];
  readonly alreadyUpToDate: boolean;
}

export function runMigrations(db: DB): MigrationResult {
  ensureMigrationsTable(db);

  const appliedRows = db.prepare("SELECT id FROM _migrations").all() as { id: number }[];
  const appliedIds = new Set(appliedRows.map((r) => Number(r.id)));
  const applied: string[] = [];

  for (const migration of MIGRATIONS) {
    if (appliedIds.has(migration.id)) continue;

    // Tablo yeniden kurulumu iceren migration'lar SQLite'in belgelenmis
    // yordamini izler: pragma transaction icinde etkisiz oldugundan disarida
    // kapatilir, bitince geri acilir.
    if (migration.rebuildsTables) db.exec("PRAGMA foreign_keys = OFF;");
    try {
      transaction(db, () => {
        db.exec(migration.up);
        migration.after?.(db);
        db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)").run(
          migration.id,
          migration.name,
          nowIso(),
        );
      });
      if (migration.rebuildsTables) {
        const violations = db.prepare("PRAGMA foreign_key_check").all();
        if (violations.length > 0) {
          throw new Error(
            `Migration ${migration.id} sonrasi yabanci anahtar ihlali: ${JSON.stringify(violations)}`,
          );
        }
      }
    } finally {
      if (migration.rebuildsTables) db.exec("PRAGMA foreign_keys = ON;");
    }

    applied.push(`${migration.id}_${migration.name}`);
  }

  return { applied, alreadyUpToDate: applied.length === 0 };
}

export function latestMigrationId(): number {
  return MIGRATIONS[MIGRATIONS.length - 1]!.id;
}
