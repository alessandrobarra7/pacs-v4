import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceConfigPath = path.resolve(__dirname, "..", "pnpm-workspace.yaml");
const viteConfigPath = path.resolve(__dirname, "..", "vite.config.ts");

describe("resolução de dependências de segurança", () => {
  it("fixa Mermaid na versão corrigida no workspace pnpm", async () => {
    const workspaceConfig = await fs.readFile(workspaceConfigPath, "utf8");

    expect(workspaceConfig).toContain("mermaid: 11.17.0");
  });

  it("transforma global em globalThis no bundle de navegador", async () => {
    const viteConfig = await fs.readFile(viteConfigPath, "utf8");

    expect(viteConfig).toContain('global: "globalThis"');
  });
});
