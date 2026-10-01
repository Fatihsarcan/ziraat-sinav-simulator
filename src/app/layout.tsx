import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "./_components/nav.tsx";
import { ThemeScript } from "./_components/theme-toggle.tsx";

export const metadata: Metadata = {
  title: "Ziraat Sınav Simülatörü",
  description:
    "Ziraat Bankası 2026 Uzman Yardımcılığı sınavı için kişisel, yerel çalışan sınav simülatörü.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" data-theme="light" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <div className="min-h-screen flex flex-col">
          <Nav />
          <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 py-6">{children}</main>
          <footer className="border-t border-[var(--border)] py-4 text-center text-[11px] text-[var(--text-subtle)]">
            Kişisel kullanım için yerel çalışan sınav simülatörü — tüm veriler bu bilgisayarda saklanır.
          </footer>
        </div>
      </body>
    </html>
  );
}
