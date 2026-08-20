import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const clientRoot = resolve(process.cwd(), "client/src");
const worklist = readFileSync(resolve(clientRoot, "pages/PacsQueryPage.tsx"), "utf8");
const admin = readFileSync(resolve(clientRoot, "pages/AdminPage.tsx"), "utf8");
const catalog = readFileSync(resolve(clientRoot, "pages/ExamCatalogPage.tsx"), "utf8");

describe("navegação administrativa do catálogo de exames", () => {
  it("não mantém o catálogo na navegação principal da lista de estudos", () => {
    expect(worklist).not.toContain("navigate('/admin/exames')");
    expect(worklist).not.toContain("Catálogo de exames");
  });

  it("expõe o catálogo exclusivamente como aba do administrador geral", () => {
    expect(admin).toContain('type Tab = "units" | "users" | "catalog"');
    expect(admin).toContain('label: "Catálogo de exames"');
    expect(admin).toContain('effectiveTab === "catalog" && isAdminMaster');
    expect(admin).toContain('<ExamCatalogPage embedded />');
  });

  it("mantém os controles administrativos de busca, modalidade e status no catálogo incorporado", () => {
    expect(catalog).toContain('embedded = false');
    expect(catalog).toContain('Buscar por nome de exame');
    expect(catalog).toContain('Todas as modalidades');
    expect(catalog).toContain('Somente ativos');
  });
});
