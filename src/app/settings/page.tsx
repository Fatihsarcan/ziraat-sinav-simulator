import path from "node:path";
import { db } from "../../lib/server.ts";
import { loadExamConfig } from "../../config/load-config.ts";
import { EXAM_CONFIG, validateExamConfig } from "../../config/exam-config.ts";
import { resolveDbPath } from "../../db/client.ts";
import { listBackups } from "../../lib/backup.ts";
import { countQuestions } from "../../db/repos/questions.ts";
import { listSessions } from "../../db/repos/sessions.ts";
import { mistakeStats } from "../../db/repos/mistakes.ts";
import { generationStatus } from "../../question-engine/llm-client.ts";
import { Callout, Card, PageHeader, Stat } from "../_components/ui.tsx";
import { SettingsForm } from "./settings-form.tsx";
import { DataPanel } from "./data-panel.tsx";
import { num } from "../../lib/format.ts";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const database = db();
  const config = loadExamConfig(database);
  const problems = validateExamConfig(config);
  const backups = listBackups();
  const counts = countQuestions(database);
  const sessions = listSessions({ limit: 1000 }, database);
  const mistakes = mistakeStats(database);
  const genStatus = generationStatus();

  const isDefault =
    config.examDate === EXAM_CONFIG.examDate &&
    config.durationMinutes === EXAM_CONFIG.durationMinutes &&
    config.totalQuestions === EXAM_CONFIG.totalQuestions;

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader
        title="Ayarlar"
        description="Sınav konfigürasyonu tek bir merkezî yapıdan yönetilir; buradaki değişiklikler yeni sınavlara uygulanır."
      />

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat label="Soru" value={num(counts.total)} hint={`${num(counts.verified)} doğrulanmış`} />
        <Stat label="Oturum" value={num(sessions.length)} />
        <Stat label="Yanlış Kaydı" value={num(mistakes.total)} />
        <Stat label="Yedek" value={num(backups.length)} />
      </div>

      {problems.length > 0 ? (
        <Callout tone="fail" title="Konfigürasyon tutarsız">
          <ul className="list-disc pl-4">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <Card
        title="Sınav Konfigürasyonu"
        subtitle={
          isDefault
            ? "Şu anda 23.09.2026 tarihli resmî ilandaki değerler kullanılıyor."
            : "Varsayılan resmî değerlerden farklı ayarlar kullanılıyor."
        }
      >
        <SettingsForm
          examDate={config.examDate}
          durationMinutes={config.durationMinutes}
          overallThreshold={config.thresholds.overallScore}
          sections={config.sections.map((s) => ({
            id: s.id,
            label: s.label,
            passRatio: s.passRatio,
            questionCount: s.questionCount,
          }))}
          subsections={config.sections.flatMap((s) =>
            s.subsections.map((sub) => ({
              key: sub.key,
              label: `${sub.label} (${s.shortLabel})`,
              questionCount: sub.questionCount,
            })),
          )}
        />
      </Card>

      <Card title="Veri Yönetimi" subtitle="Sınav geçmişin kaybolmamalı — iki bağımsız yedekleme yolu">
        <DataPanel
          dbPath={resolveDbPath()}
          backupDir={path.resolve(process.cwd(), "backups")}
          backups={backups}
        />
      </Card>

      <Card title="Soru Üretimi Entegrasyonu">
        <dl className="text-[13px] space-y-2">
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--text-muted)]">Durum</dt>
            <dd>
              {genStatus.available ? (
                <span className="badge badge-pass">Etkin</span>
              ) : (
                <span className="badge badge-muted">Kapalı</span>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--text-muted)]">Model</dt>
            <dd className="mono">{genStatus.model}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--text-muted)]">Web araştırması</dt>
            <dd>{genStatus.webSearchEnabled ? "Etkin (sunucu taraflı web_search aracı)" : "Kapalı"}</dd>
          </div>
        </dl>

        {genStatus.reason ? (
          <Callout tone="info" title="Nasıl etkinleştirilir?">
            <p>{genStatus.reason}</p>
            <pre className="mono text-[12px] mt-2 p-2.5 rounded bg-[var(--surface-2)] overflow-x-auto">
{`# .env.local
ANTHROPIC_API_KEY=sk-ant-...
ZSS_GENERATION_MODEL=claude-opus-5   # opsiyonel`}
            </pre>
            <p className="mt-2 text-[12px]">
              API anahtarı yalnızca ortam değişkeninden okunur; hiçbir zaman kaynak koda veya
              veritabanına yazılmaz.
            </p>
          </Callout>
        ) : null}
      </Card>

      <Card title="Resmî Varsayılanlar" subtitle="Referans — değiştirilemez">
        <div className="scroll-x">
          <table className="data">
            <tbody>
              <tr>
                <td className="text-[var(--text-muted)]">Sınav</td>
                <td>{EXAM_CONFIG.examName}</td>
              </tr>
              <tr>
                <td className="text-[var(--text-muted)]">Tarih</td>
                <td className="mono">24 Ekim 2026, 14:00</td>
              </tr>
              <tr>
                <td className="text-[var(--text-muted)]">Yapı</td>
                <td className="mono">140 soru / 160 dakika / tek oturum</td>
              </tr>
              <tr>
                <td className="text-[var(--text-muted)]">1. Bölüm</td>
                <td className="mono">60 (Genel Kültür 20 + Genel Yetenek 40) — baraj %60</td>
              </tr>
              <tr>
                <td className="text-[var(--text-muted)]">2. Bölüm</td>
                <td className="mono">İngilizce 40 — baraj %60</td>
              </tr>
              <tr>
                <td className="text-[var(--text-muted)]">3. Bölüm</td>
                <td className="mono">Bilgisayar, Bilişim ve Yapay Zekâ 40 — baraj %50</td>
              </tr>
              <tr>
                <td className="text-[var(--text-muted)]">Toplam puan barajı</td>
                <td className="mono">60</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
