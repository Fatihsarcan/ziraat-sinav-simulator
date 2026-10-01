import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proje kokunu acikca bildir: aksi halde Turbopack yukaridaki ev dizinini
  // kok sanip oradaki package-lock.json'u dahil etmeye calisiyor.
  turbopack: { root: import.meta.dirname },
  // Otomatik AGENTS.md/CLAUDE.md uretimi kapali — bu dosyalar elle yonetilir.
  agentRules: false,
  // Single-user local app: no telemetry-driven optimizations needed.
  reactStrictMode: true,
  // node:sqlite is a Node builtin; keep server bundles from trying to inline it.
  serverExternalPackages: ["@anthropic-ai/sdk"],
  experimental: {
    // Route handlers may run long question-generation jobs.
    proxyTimeout: 300_000,
  },
};

export default nextConfig;
