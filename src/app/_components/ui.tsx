import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-[13px] text-[var(--text-muted)] mt-1 max-w-3xl">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
  padded = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3 border-b border-[var(--border)]">
          <div>
            <h2 className="font-semibold text-[14px]">{title}</h2>
            {subtitle ? (
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{subtitle}</p>
            ) : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "pass" | "fail" | "warn" | "accent";
}) {
  const color =
    tone === "pass"
      ? "var(--pass)"
      : tone === "fail"
        ? "var(--fail)"
        : tone === "warn"
          ? "var(--warn)"
          : tone === "accent"
            ? "var(--accent)"
            : "var(--text)";
  return (
    <div className="card p-3.5">
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">
        {label}
      </div>
      <div className="mono text-[24px] font-semibold leading-tight mt-1" style={{ color }}>
        {value}
      </div>
      {hint ? <div className="text-[12px] text-[var(--text-muted)] mt-0.5">{hint}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "pass" | "fail" | "warn" | "info" | "muted";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function PassFail({ passed }: { passed: boolean }) {
  return <Badge tone={passed ? "pass" : "fail"}>{passed ? "PASS" : "FAIL"}</Badge>;
}

export function Meter({
  value,
  threshold,
  tone,
}: {
  /** 0-1 arasi doluluk. */
  value: number;
  /** 0-1 arasi baraj cizgisi (opsiyonel). */
  threshold?: number;
  tone?: "pass" | "fail" | "accent";
}) {
  const color =
    tone === "pass" ? "var(--pass)" : tone === "fail" ? "var(--fail)" : "var(--accent)";
  return (
    <div className="relative h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color }}
      />
      {threshold !== undefined ? (
        <div
          className="absolute inset-y-0 w-px"
          style={{ left: `${threshold * 100}%`, background: "var(--text)", opacity: 0.55 }}
          title={`Baraj: %${(threshold * 100).toFixed(0)}`}
        />
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card p-8 text-center">
      <p className="font-semibold text-[15px]">{title}</p>
      {description ? (
        <p className="text-[13px] text-[var(--text-muted)] mt-1.5 max-w-xl mx-auto">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "fail" | "pass";
  title?: ReactNode;
  children: ReactNode;
}) {
  const bg =
    tone === "warn"
      ? "var(--warn-soft)"
      : tone === "fail"
        ? "var(--fail-soft)"
        : tone === "pass"
          ? "var(--pass-soft)"
          : "var(--info-soft)";
  const fg =
    tone === "warn"
      ? "var(--warn)"
      : tone === "fail"
        ? "var(--fail)"
        : tone === "pass"
          ? "var(--pass)"
          : "var(--info)";
  return (
    <div className="rounded-[10px] p-3.5 text-[13px]" style={{ background: bg }}>
      {title ? (
        <div className="font-semibold mb-1" style={{ color: fg }}>
          {title}
        </div>
      ) : null}
      <div className="text-[var(--text)]">{children}</div>
    </div>
  );
}

/**
 * Soru aciklamasi kutusu.
 *
 * Ingilizce bolumde aciklama Ingilizce yazilir; Turkce karsiligi varsa ayni
 * kutunun ALTINDA ayri bir baslikla gosterilir. Turkce yazilan bolumlerde
 * `turkish` bos gelir ve ikinci blok hic basilmaz.
 */
export function Explanation({
  text,
  turkish,
  source,
  sourceUrl,
  className = "",
}: {
  text: ReactNode;
  turkish?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  className?: string;
}) {
  return (
    <div className={`rounded-lg p-3 bg-[var(--surface-2)] text-[13px] ${className}`}>
      <div className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] mb-1">
        Açıklama
      </div>
      {text}
      {turkish ? (
        <div className="mt-2.5 pt-2.5 border-t border-[var(--border)]">
          <div className="text-[11px] uppercase font-semibold text-[var(--text-subtle)] mb-1">
            Türkçe açıklama
          </div>
          {turkish}
        </div>
      ) : null}
      {sourceUrl ? (
        <div className="mt-2 text-[12px]">
          Kaynak:{" "}
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline"
            style={{ color: "var(--accent)" }}
          >
            {source ?? sourceUrl}
          </a>
        </div>
      ) : null}
    </div>
  );
}
