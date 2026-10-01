import Link from "next/link";
import { db } from "../../../lib/server.ts";
import { compareExams } from "../../../core/analytics.ts";
import { Card, EmptyState, PageHeader } from "../../_components/ui.tsx";
import { num, signed } from "../../../lib/format.ts";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Number((Array.isArray(value) ? value[0] : value) ?? 0);
  };

  const comparison = compareExams(one("previous"), one("current"), db());

  if (!comparison) {
    return (
      <div className="space-y-5">
        <PageHeader title="Sınav Karşılaştırması" />
        <EmptyState
          title="Karşılaştırma yapılamadı"
          description="Seçilen sınavlardan biri bulunamadı ya da tamamlanmamış."
          action={
            <Link href="/history" className="btn btn-primary">
              Sınav geçmişine dön
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader
        title="Sınav Karşılaştırması"
        description={`${comparison.previous.date} → ${comparison.current.date}`}
        actions={
          <>
            <Link href={`/exam/${comparison.previous.sessionId}/result`} className="btn">
              Önceki sonuç
            </Link>
            <Link href={`/exam/${comparison.current.sessionId}/result`} className="btn">
              Sonraki sonuç
            </Link>
          </>
        }
      />

      <Card title="Değişim" padded={false}>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Ölçüt</th>
                <th className="text-right">Önce</th>
                <th className="text-right">Sonra</th>
                <th className="text-right">Değişim</th>
                <th style={{ width: 160 }} />
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => {
                const improved = row.delta > 0;
                const flat = Math.abs(row.delta) < 0.05;
                const color = flat
                  ? "var(--text-muted)"
                  : improved
                    ? "var(--pass)"
                    : "var(--fail)";
                const magnitude = Math.min(100, Math.abs(row.delta) * (row.unit === "score" ? 2 : 2));
                return (
                  <tr key={row.label}>
                    <td className="font-medium">{row.label}</td>
                    <td className="mono text-right">
                      {num(row.before, 1)}
                      {row.unit === "percent" ? "%" : ""}
                    </td>
                    <td className="mono text-right">
                      {num(row.after, 1)}
                      {row.unit === "percent" ? "%" : ""}
                    </td>
                    <td className="mono text-right font-semibold" style={{ color }}>
                      {flat ? "—" : signed(row.delta)}
                      {row.unit === "percent" && !flat ? "%" : ""}
                    </td>
                    <td>
                      {/* Sifir cizgisinden iki yone acilan degisim cubugu. */}
                      <div className="relative h-2 rounded-full bg-[var(--surface-2)]">
                        <div
                          className="absolute inset-y-0 w-px bg-[var(--border-strong)]"
                          style={{ left: "50%" }}
                        />
                        <div
                          className="absolute inset-y-0 rounded-full"
                          style={{
                            background: color,
                            left: improved ? "50%" : `calc(50% - ${magnitude / 2}%)`,
                            width: `${magnitude / 2}%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-[12px] text-[var(--text-muted)]">
        Kategori satırları yalnızca her iki sınavda da en az 2 soru sorulan kategoriler için
        gösterilir; daha az soruda değişim gürültüden ibaret olur.
      </p>
    </div>
  );
}
