"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface BackupEntry {
  file: string;
  sizeBytes: number;
  modifiedAt: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DataPanel({
  dbPath,
  backupDir,
  backups,
}: {
  dbPath: string;
  backupDir: string;
  backups: BackupEntry[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");

  async function backup() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      const data = (await res.json()) as {
        ok: boolean;
        backup?: { file: string; sizeBytes: number };
        message?: string;
      };
      if (data.ok && data.backup) {
        setMessage(`Yedek oluşturuldu: ${data.backup.file} (${formatSize(data.backup.sizeBytes)})`);
        router.refresh();
      } else {
        setError(data.message ?? "Yedek alınamadı.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload, mode }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        result?: { imported: Record<string, number>; skipped: Record<string, number> };
      };
      if (data.ok && data.result) {
        const summary = Object.entries(data.result.imported)
          .filter(([, n]) => n > 0)
          .map(([table, n]) => `${table}: ${n}`)
          .join(", ");
        setMessage(`İçe aktarma tamamlandı. ${summary || "Yeni kayıt eklenmedi."}`);
        router.refresh();
      } else {
        setError(data.message ?? "İçe aktarılamadı.");
      }
    } catch (e) {
      setError(`Dosya okunamadı: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <dl className="text-[12.5px] space-y-1">
        <div className="flex gap-2">
          <dt className="text-[var(--text-muted)] shrink-0">Veritabanı:</dt>
          <dd className="mono break-all">{dbPath}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-[var(--text-muted)] shrink-0">Yedek klasörü:</dt>
          <dd className="mono break-all">{backupDir}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={() => void backup()} disabled={busy}>
          Veritabanını yedekle
        </button>
        <a href="/api/export" className="btn" download>
          JSON olarak dışa aktar
        </a>
        <button
          type="button"
          className="btn"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          JSON içe aktar
        </button>
        <select
          className="select"
          style={{ width: "auto" }}
          value={mode}
          onChange={(e) => setMode(e.target.value as "merge" | "replace")}
        >
          <option value="merge">Birleştir (mevcut veriyi koru)</option>
          <option value="replace">Değiştir (mevcut veriyi sil)</option>
        </select>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
          }}
        />
      </div>

      <p className="text-[12px] text-[var(--text-muted)]">
        En güvenli yol veritabanı yedeğidir: <span className="mono">.db</span> dosyasının birebir
        kopyasıdır, geri yüklemek için dosyayı yerine kopyalaman yeterlidir. JSON dışa aktarım ise
        taşınabilir ve insan okunabilirdir.
      </p>

      {message ? (
        <div className="rounded-lg p-3 text-[13px] break-all" style={{ background: "var(--pass-soft)" }}>
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg p-3 text-[13px]" style={{ background: "var(--fail-soft)" }}>
          {error}
        </div>
      ) : null}

      {backups.length > 0 ? (
        <div>
          <div className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] mb-2">
            Mevcut yedekler ({backups.length})
          </div>
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Dosya</th>
                  <th className="text-right">Boyut</th>
                  <th>Tarih</th>
                </tr>
              </thead>
              <tbody>
                {backups.slice(0, 10).map((b) => (
                  <tr key={b.file}>
                    <td className="mono text-[12px]">{b.file}</td>
                    <td className="mono text-right">{formatSize(b.sizeBytes)}</td>
                    <td className="mono">{new Date(b.modifiedAt).toLocaleString("tr-TR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
