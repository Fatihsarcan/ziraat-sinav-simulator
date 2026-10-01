"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Shortfall {
  category: string;
  requested: number;
  available: number;
}

export function StartExamButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shortfalls, setShortfalls] = useState<Shortfall[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  async function start(allowPartial: boolean) {
    setBusy(true);
    setError(null);
    setShortfalls([]);
    setActiveSessionId(null);
    try {
      const res = await fetch("/api/exam/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowPartial }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        sessionId?: number;
        message?: string;
        reason?: string;
        shortfalls?: Shortfall[];
      };
      if (data.ok && data.sessionId) {
        router.push(`/exam/${data.sessionId}`);
        return;
      }
      setError(data.message ?? "Sınav başlatılamadı.");
      setShortfalls(data.shortfalls ?? []);
      if (data.reason === "active_session_exists" && data.sessionId) {
        setActiveSessionId(data.sessionId);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="btn btn-primary btn-lg w-full"
        onClick={() => void start(false)}
        disabled={busy || disabled}
      >
        {busy ? "Sınav hazırlanıyor..." : "Gerçek Sınav Simülasyonunu Başlat"}
      </button>

      {error ? (
        <div className="mt-3 rounded-lg p-3 text-[13px]" style={{ background: "var(--fail-soft)" }}>
          <p className="font-semibold" style={{ color: "var(--fail)" }}>
            Sınav başlatılamadı
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[var(--text)]">{error}</p>

          {shortfalls.length > 0 ? (
            <>
              <div className="scroll-x mt-2">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Kategori</th>
                      <th>Gereken</th>
                      <th>Mevcut</th>
                      <th>Eksik</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortfalls.map((s) => (
                      <tr key={s.category}>
                        <td>{s.category}</td>
                        <td className="mono">{s.requested}</td>
                        <td className="mono">{s.available}</td>
                        <td className="mono" style={{ color: "var(--fail)" }}>
                          {s.requested - s.available}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="btn mt-3"
                onClick={() => void start(true)}
                disabled={busy}
              >
                Yine de eksik soruyla başlat
              </button>
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                Eksik soruyla başlatırsan sınav resmî 140 soruluk yapıya uymaz; sonuç yalnızca
                yaklaşık bir gösterge olur.
              </p>
            </>
          ) : null}

          {activeSessionId ? (
            <a href={`/exam/${activeSessionId}`} className="btn mt-3">
              Devam eden oturuma git
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
