"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "zss-theme";

/**
 * Sayfa boyanmadan temayi uygular (flash onleme).
 * Varsayilan ACIK temadir: uzun calisma seanslarinda goz yormasin diye,
 * isletim sistemi koyu modda olsa bile kullanici acikca "Koyu" ya da
 * "Sistem" secmedikce acik tema kullanilir.
 */
export function ThemeScript() {
  const script = `(function(){try{var d=document.documentElement,t=localStorage.getItem('zss-theme');if(t==='dark'){d.setAttribute('data-theme','dark');}else if(t==='system'){d.removeAttribute('data-theme');}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

type Theme = "light" | "dark" | "system";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") setTheme(stored);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    if (next === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", next);
    }
  }

  const next: Theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const label = theme === "light" ? "Açık" : theme === "dark" ? "Koyu" : "Sistem";

  return (
    <button
      type="button"
      className="btn shrink-0"
      onClick={() => apply(next)}
      title="Tema: açık → koyu → sistem"
    >
      {label}
    </button>
  );
}
