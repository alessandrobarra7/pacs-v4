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

  it("mantém os controles administrativos de busca, modalidade e status na composição prática do catálogo", () => {
    expect(catalog).toContain('embedded = false');
    expect(catalog).toContain('Fluxo do catálogo');
    expect(catalog).toContain('Buscar legenda canônica');
    expect(catalog).toContain('Modalidade: todas');
    expect(catalog).toContain('Status: ativos');
  });

  it("permite ao administrador definir eventos financeiros independentemente dos documentos clínicos", () => {
    expect(catalog).toContain('financial_event_count: 1');
    expect(catalog).toContain('label="Eventos"');
    expect(catalog).toContain('Eventos são gerados somente após todas as assinaturas clínicas exigidas');
    expect(catalog).toContain('A quantidade de eventos é independente da quantidade de documentos');
  });

  it("organiza o formulário em cartões e retira a Ordem da configuração manual", () => {
    expect(catalog).toContain('1. Identificação clínica');
    expect(catalog).toContain('2. Regra de eventos');
    expect(catalog).toContain('3. Disponibilidade por unidade');
    expect(catalog).toContain('4. Documentos clínicos');
    expect(catalog).toContain('5. Mapeamentos PACS');
    expect(catalog).not.toContain('Field label="Ordem"');
    expect(catalog).toContain('A ordem de exibição é automática por modalidade e nome');
  });

  it("exibe as legendas em cartões compactos com resumo e acesso à configuração", () => {
    expect(catalog).toContain('sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4');
    expect(catalog).toContain('min-h-[148px]');
    expect(catalog).toContain('function CatalogMetric');
    expect(catalog).toContain('label="Laudos"');
    expect(catalog).toContain('label="Eventos"');
    expect(catalog).toContain('label="PACS"');
    expect(catalog).toContain('>Configurar</Button>');
  });
});
