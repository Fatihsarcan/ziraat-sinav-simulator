import type { DB } from "../db/client.ts";
import { ensureDatabaseReady } from "../db/bootstrap.ts";
import { autoSubmitAllExpired } from "../core/exam-engine.ts";

/**
 * Her sunucu isteginin basinda cagrilir:
 *  1. Sema hazir mi? (migration'lar — idempotent)
 *  2. Suresi dolmus ama teslim edilmemis oturum var mi? -> OTOMATIK TESLIM
 *
 * (2) adimi, kullanici sekmeyi kapatip gunler sonra dondugunde bile sinavin
 * kayitsiz kalmamasini saglar (sartname #12 otomatik teslim / #41 kurtarma).
 * Sorgu `status` + `deadline_at` indeksli oldugu icin her istekte calismasi
 * ucuzdur ve surenin sunucu saatine gore dolmasini kacirmaz.
 */
export function db(): DB {
  const database = ensureDatabaseReady();
  autoSubmitAllExpired(database);
  return database;
}

/** Kurtarma calistirmadan yalnizca sema hazirligi (yazma uclari icin). */
export function rawDb(): DB {
  return ensureDatabaseReady();
}
