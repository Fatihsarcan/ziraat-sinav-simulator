"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/*
 * Grafik kurallari:
 *  - Tek eksen; asla cift y ekseni kullanilmaz.
 *  - Renk paleti CSS degiskenlerinden gelir ve validate_palette.js ile dogrulandi.
 *  - 2 ve uzeri seri varsa legend HER ZAMAN vardir (kimlik yalnizca renge
 *    birakilmaz); tek serili grafiklerde baslik seriyi zaten adlandirir.
 *  - Her grafigin bir de TABLO gorunumu vardir (erisilebilirlik).
 *  - Cizgi kalinligi 2px, nokta capi >= 8px, izgara geri planda.
 */

const AXIS = { fontSize: 11, fill: "var(--text-subtle)" } as const;
const GRID = "var(--border)";

function TooltipBox({
  active,
  payload,
  label,
  unit = "",
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string }[];
  label?: string | number;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="card px-3 py-2 text-[12px]"
      style={{ background: "var(--surface)", borderColor: "var(--border-strong)" }}
    >
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((entry) => (
        <div key={String(entry.dataKey)} className="flex items-center gap-2">
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: entry.color,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          <span className="text-[var(--text-muted)]">{entry.name}</span>
          <span className="mono ml-auto font-medium">
            {entry.value}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

function TableToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="btn text-[12px] py-1 px-2" onClick={onToggle}>
      {open ? "Grafiği göster" : "Tablo olarak göster"}
    </button>
  );
}


/**
 * Serinin YALNIZCA son noktasini dogrudan etiketler (her noktaya sayi yazmak
 * grafigi okunmaz hale getirir). Recharts label render prop'u x/y degerlerini
 * string veya number verebildigi icin burada sayiya cevrilir.
 */
// Recharts'in label render prop tipleri surumden surume degistigi icin
// alanlar `unknown` alinip burada guvenli sekilde daraltilir.
type LabelRenderProps = {
  index?: unknown;
  x?: unknown;
  y?: unknown;
  value?: unknown;
};

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function renderLastPointLabel(length: number, color: string, text?: string) {
  return function LastPointLabel(props: LabelRenderProps) {
    if (toNumber(props.index, -1) !== length - 1) return <g />;
    const x = toNumber(props.x);
    const y = toNumber(props.y);
    return (
      <text x={x + 8} y={y - 6} fill={color} fontSize={12} fontWeight={600}>
        {text ?? String(props.value ?? "")}
      </text>
    );
  };
}

function Empty({ text }: { text: string }) {
  return (
    <div className="h-[220px] flex items-center justify-center text-[13px] text-[var(--text-muted)]">
      {text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gelisim grafigi — tek seri (toplam puan) + baraj referans cizgisi
// ---------------------------------------------------------------------------

export interface ProgressPoint {
  date: string;
  sessionId: number;
  score: number;
  passed: boolean;
}

export function ProgressChart({
  data,
  threshold,
}: {
  data: ProgressPoint[];
  threshold: number;
}) {
  const [asTable, setAsTable] = useState(false);

  if (data.length === 0) {
    return <Empty text="Henüz tamamlanmış gerçek sınav yok. İlk sınavını çözdüğünde burada gelişimin görünecek." />;
  }

  if (asTable) {
    return (
      <div>
        <div className="flex justify-end mb-2">
          <TableToggle open onToggle={() => setAsTable(false)} />
        </div>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Puan</th>
                <th>Sonuç</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.sessionId}>
                  <td>{d.date}</td>
                  <td className="mono">{d.score}</td>
                  <td>{d.passed ? "PASS" : "FAIL"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const last = data[data.length - 1]!;

  return (
    <div>
      <div className="flex justify-end mb-2">
        <TableToggle open={false} onToggle={() => setAsTable(true)} />
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 12, right: 44, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis
            domain={[0, 100]}
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={34}
          />
          <ReferenceLine
            y={threshold}
            stroke="var(--fail)"
            strokeDasharray="4 4"
            label={{
              value: `baraj ${threshold}`,
              position: "right",
              fill: "var(--text-muted)",
              fontSize: 11,
            }}
          />
          <Tooltip content={<TooltipBox unit=" puan" />} cursor={{ stroke: GRID }} />
          <Line
            type="monotone"
            dataKey="score"
            name="Toplam puan"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 0, fill: "var(--chart-1)" }}
            activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
            // Tek serinin son degeri dogrudan etiketlenir (her noktaya sayi yazilmaz).
            label={renderLastPointLabel(data.length, "var(--text)")}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[12px] text-[var(--text-muted)] mt-1">
        Son sınav: <span className="mono font-medium">{last.score}</span> puan ({last.date}) ·{" "}
        {data.length} sınav
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bolum bazli dogruluk trendi — 3 seri, legend zorunlu
// ---------------------------------------------------------------------------

export interface SectionTrendPoint {
  date: string;
  general: number;
  english: number;
  technical: number;
}

const SECTION_SERIES = [
  { key: "general", name: "Genel", color: "var(--chart-1)" },
  { key: "english", name: "İngilizce", color: "var(--chart-2)" },
  { key: "technical", name: "Teknik", color: "var(--chart-4)" },
] as const;

export function SectionTrendChart({
  data,
  thresholds,
}: {
  data: SectionTrendPoint[];
  thresholds: { general: number; english: number; technical: number };
}) {
  const [asTable, setAsTable] = useState(false);

  if (data.length === 0) {
    return <Empty text="Bölüm trendi için en az bir tamamlanmış gerçek sınav gerekir." />;
  }

  if (asTable) {
    return (
      <div>
        <div className="flex justify-end mb-2">
          <TableToggle open onToggle={() => setAsTable(false)} />
        </div>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Tarih</th>
                {SECTION_SERIES.map((s) => (
                  <th key={s.key}>{s.name} (%)</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td className="mono">{d.general}</td>
                  <td className="mono">{d.english}</td>
                  <td className="mono">{d.technical}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-2">
        <TableToggle open={false} onToggle={() => setAsTable(true)} />
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 12, right: 56, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} width={34} />
          {/* Barajlar tek eksende, kesikli referans cizgileri olarak. */}
          <ReferenceLine y={thresholds.general * 100} stroke="var(--chart-1)" strokeDasharray="3 4" strokeOpacity={0.5} />
          <ReferenceLine y={thresholds.technical * 100} stroke="var(--chart-4)" strokeDasharray="3 4" strokeOpacity={0.5} />
          <Tooltip content={<TooltipBox unit="%" />} cursor={{ stroke: GRID }} />
          <Legend
            verticalAlign="top"
            align="left"
            height={28}
            wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }}
          />
          {SECTION_SERIES.map((s, index) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 0, fill: s.color }}
              activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={false}
              label={renderLastPointLabel(data.length, s.color, s.name)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[12px] text-[var(--text-muted)] mt-1">
        Kesikli çizgiler bölüm barajlarını gösterir (Genel %
        {Math.round(thresholds.general * 100)}, İngilizce %
        {Math.round(thresholds.english * 100)}, Teknik %
        {Math.round(thresholds.technical * 100)}).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Konu ustaligi — tek seri yatay bar, durum rengiyle
// ---------------------------------------------------------------------------

export interface MasteryBar {
  label: string;
  value: number;
  attempts: number;
}

export function MasteryChart({ data }: { data: MasteryBar[] }) {
  const [asTable, setAsTable] = useState(false);

  if (data.length === 0) {
    return <Empty text="Ustalık verisi için önce birkaç soru çözmelisin." />;
  }

  const height = Math.max(200, data.length * 26 + 40);

  if (asTable) {
    return (
      <div>
        <div className="flex justify-end mb-2">
          <TableToggle open onToggle={() => setAsTable(false)} />
        </div>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Konu</th>
                <th>Ustalık</th>
                <th>Deneme</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label}>
                  <td>{d.label}</td>
                  <td className="mono">{d.value.toFixed(1)}</td>
                  <td className="mono">{d.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-2">
        <TableToggle open={false} onToggle={() => setAsTable(true)} />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ ...AXIS, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={false}
            width={190}
          />
          <Tooltip content={<TooltipBox />} cursor={{ fill: "var(--surface-2)" }} />
          <ReferenceLine x={55} stroke="var(--fail)" strokeDasharray="3 4" strokeOpacity={0.6} />
          <ReferenceLine x={70} stroke="var(--warn)" strokeDasharray="3 4" strokeOpacity={0.6} />
          <Bar
            dataKey="value"
            name="Ustalık"
            radius={[0, 4, 4, 0]}
            barSize={14}
            isAnimationActive={false}
            label={{ position: "right", fontSize: 11, fill: "var(--text-muted)" }}
          >
            {data.map((d) => (
              <Cell
                key={d.label}
                fill={d.value < 55 ? "var(--fail)" : d.value < 70 ? "var(--warn)" : "var(--pass)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[12px] text-[var(--text-muted)] mt-1">
        Kesikli çizgiler: 55 (zayıf sınırı) ve 70 (orta sınırı). Renk durumu gösterir, değer her
        çubukta yazılıdır.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bolum bazli sure kullanimi — 3 seri gruplu bar
// ---------------------------------------------------------------------------

export interface TimePoint {
  date: string;
  general: number;
  english: number;
  technical: number;
}

export function TimeBySectionChart({ data }: { data: TimePoint[] }) {
  const [asTable, setAsTable] = useState(false);

  if (data.length === 0) return <Empty text="Süre analizi için tamamlanmış gerçek sınav gerekir." />;

  if (asTable) {
    return (
      <div>
        <div className="flex justify-end mb-2">
          <TableToggle open onToggle={() => setAsTable(false)} />
        </div>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Tarih</th>
                {SECTION_SERIES.map((s) => (
                  <th key={s.key}>{s.name} (dk)</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td className="mono">{d.general}</td>
                  <td className="mono">{d.english}</td>
                  <td className="mono">{d.technical}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-2">
        <TableToggle open={false} onToggle={() => setAsTable(true)} />
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 4 }} barGap={2}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={34} />
          <Tooltip content={<TooltipBox unit=" dk" />} cursor={{ fill: "var(--surface-2)" }} />
          <Legend
            verticalAlign="top"
            align="left"
            height={28}
            wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }}
          />
          {SECTION_SERIES.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
