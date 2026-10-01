"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle.tsx";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/exam", label: "Gerçek Sınav" },
  { href: "/practice", label: "Çalışma" },
  { href: "/mistakes", label: "Yanlışlarım" },
  { href: "/questions", label: "Soru Bankası" },
  { href: "/reference", label: "Çıkmış Sorular" },
  { href: "/history", label: "Sınav Geçmişi" },
  { href: "/analytics", label: "Analiz" },
  { href: "/sources", label: "Kaynaklar" },
  { href: "/settings", label: "Ayarlar" },
] as const;

export function Nav() {
  const pathname = usePathname();

  // Sınav sırasında navigasyon gizlenir; gerçek sınav hissi korunur.
  if (/^\/exam\/\d+$/.test(pathname)) return null;

  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)] sticky top-0 z-20">
      <div className="max-w-[1400px] mx-auto px-4 flex items-center gap-4 h-14">
        <Link href="/" className="font-semibold text-[15px] whitespace-nowrap shrink-0">
          Sınav Simülatörü
        </Link>
        <nav className="flex-1 scroll-x">
          <ul className="flex items-center gap-1">
            {LINKS.map((link) => {
              const active =
                link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="px-3 py-1.5 rounded-md text-[13px] whitespace-nowrap block"
                    style={
                      active
                        ? { background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600 }
                        : { color: "var(--text-muted)" }
                    }
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
