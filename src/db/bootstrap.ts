import type { DB } from "./client.ts";
import { getDb } from "./client.ts";
import { runMigrations } from "./migrations.ts";
import { upsertSource } from "./repos/sources.ts";
import { getSetting, setSetting } from "./repos/settings.ts";

/**
 * Arastirma sirasinda kullanilan ve uygulamaya gomulu olan kaynaklar.
 * Sinav formatina iliskin her iddia bu kayitlara dayanir.
 */
export const BASELINE_SOURCES = [
  {
    title:
      "ZIRAAT BANKASI UZMAN YARDIMCISI ISE ALIM SINAVI BASVURU KOSULLARI (23.09.2026) — RESMI ILAN",
    url: "https://www.ziraatbank.com.tr/tr/Bankamiz-ZB/insan-kaynaklari/Documents/zb-uzman-yard%c4%b1mcisi-23092026.pdf",
    publisher: "T.C. Ziraat Bankasi A.S.",
    kind: "official" as const,
    reliability: "high" as const,
    notes:
      "BIRINCIL KAYNAK. Sinav tarihi (24 Ekim 2026, 14:00), 140 soru / 160 dakika, bolum dagilimi " +
      "(1. Bolum 60: Genel Kultur 20 + Genel Yetenek 40; 2. Bolum Ingilizce 40; 3. Bolum alan 40), " +
      "barajlar (%60/%60/%50 ve toplam >= 60 puan) ve Ek-1'deki 8 teknik konu basligi bu belgeden alindi.",
  },
  {
    title: "Ziraat Bankasi Ise Alim Basvuru Portali — Istanbul Universitesi",
    url: "https://ziraatbankisealim.istanbul.edu.tr",
    publisher: "Istanbul Universitesi",
    kind: "official" as const,
    reliability: "high" as const,
    notes: "Basvuru, sinav giris belgesi ve sonuc ilan adresi (basvuru: 23.09.2026 - 12.10.2026).",
  },
  {
    title: "Ziraat Bankasi Insan Kaynaklari — Acik Pozisyonlar",
    url: "https://www.ziraatbank.com.tr/tr/bankamiz/insan-kaynaklari/acik-pozisyonlar",
    publisher: "T.C. Ziraat Bankasi A.S.",
    kind: "official" as const,
    reliability: "high" as const,
    notes: "Guncel ilan PDF'lerinin yayinlandigi resmi sayfa.",
  },
  {
    title:
      "ZIRAAT BANKASI A.S. UZMAN YARDIMCISI ISE ALIM SINAVI BASVURU KOSULLARI (2021) — GECMIS FORMAT",
    url: "https://www.ziraatbank.com.tr/tr/Bankamiz-ZB/insan-kaynaklari/Documents/Detay-Ziraat_Bankasi_Ise_Alim_Uzman_Yardimcisi.pdf",
    publisher: "T.C. Ziraat Bankasi A.S.",
    kind: "official" as const,
    reliability: "high" as const,
    notes:
      "KARSILASTIRMA AMACLI. 2021 formatinda dagilim 50/40/50 ve tum bolumlerde baraj %50 idi. " +
      "2026 formati farklidir; bu belge yalnizca gecmis formati gostermek icin tutuluyor.",
  },
] as const;

const BOOTSTRAP_FLAG = "bootstrap.baseline_sources_v1";

export function bootstrapDatabase(db: DB = getDb()): { migrationsApplied: string[] } {
  const migrations = runMigrations(db);

  if (getSetting(BOOTSTRAP_FLAG, db) === null) {
    const accessedAt = new Date().toISOString();
    for (const source of BASELINE_SOURCES) {
      upsertSource({ ...source, accessedAt }, db);
    }
    setSetting(BOOTSTRAP_FLAG, accessedAt, db);
  }

  return { migrationsApplied: migrations.applied };
}

let bootstrapped = false;

/** Uygulama genelinde bir kez calisan guvenli baslatici. */
export function ensureDatabaseReady(): DB {
  const db = getDb();
  if (!bootstrapped) {
    bootstrapDatabase(db);
    bootstrapped = true;
  }
  return db;
}
