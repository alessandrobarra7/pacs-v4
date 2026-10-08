/**
 * Testes de contrato (source-string, mesmo padrão de server/study-priority-ui.test.ts)
 * para os 4 bloqueios do parecer técnico da Manus sobre o painel de detalhe da
 * unidade do responsável financeiro (2026-10-08):
 *
 * Bloqueio 1 — rota/autorização de admin_master
 * Bloqueio 2 — perda de financialResponsibleId na navegação (multi-responsável)
 * Bloqueio 3 — perda de reference_date/ciclo na navegação
 * Bloqueio 4 — vigência de preço do médico (não limpar input antes do sucesso)
 *
 * Não testamos renderização de componente (este repo não tem esse padrão para
 * telas React) — testamos o CONTRATO no código-fonte: que as strings que
 * implementam cada correção estão realmente presentes, e que os padrões do
 * bug antigo não voltaram.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appTsx = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
const meuResponsavelTsx = readFileSync(resolve(process.cwd(), "client/src/pages/finance/FinanceMeuResponsavel.tsx"), "utf8");
const unidadeTsx = readFileSync(resolve(process.cwd(), "client/src/pages/finance/FinanceResponsavelUnidade.tsx"), "utf8");

describe("Bloqueio 1 (parecer Manus 2026-10-08) — rota exclusiva de responsavel_financeiro", () => {
  it("a rota /financeiro/responsavel/:unitId não permite mais admin_master", () => {
    expect(appTsx).toMatch(/financeiro\/responsavel\/:unitId"[^\n]*allowedRoles=\{\['responsavel_financeiro'\]\}/);
    expect(appTsx).not.toMatch(/financeiro\/responsavel\/:unitId"[^\n]*allowedRoles=\{\['responsavel_financeiro',\s*'admin_master'\]\}/);
  });

  it("FinanceMeuResponsavel oferece caminhos diferentes por papel (Entrar na unidade vs Ver médicos)", () => {
    expect(meuResponsavelTsx).toContain("user?.role === 'responsavel_financeiro'");
    expect(meuResponsavelTsx).toContain("Entrar na unidade");
    expect(meuResponsavelTsx).toContain("Ver médicos");
    expect(meuResponsavelTsx).toContain("setSelectedUnitForAdmin");
  });
});

describe("Bloqueio 2 (parecer Manus 2026-10-08) — financialResponsibleId preservado na navegação", () => {
  it("a tela de origem embute financialResponsibleId na query string ao entrar na unidade", () => {
    expect(meuResponsavelTsx).toContain("params.set('financialResponsibleId', String(selectedResponsibleId))");
    expect(meuResponsavelTsx).toContain("navigate(`/financeiro/responsavel/${u.unit_id}?${params.toString()}`)");
  });

  it("a tela de destino lê financialResponsibleId da query string e repassa a myResponsavelSummary", () => {
    expect(unidadeTsx).toContain("useSearch");
    expect(unidadeTsx).toContain('params.get("financialResponsibleId")');
    expect(unidadeTsx).toContain("myResponsavelSummary.useQuery({ financialResponsibleId, reference_date: referenceDate })");
  });

  it("não chama mais myResponsavelSummary sem nenhum argumento de contexto", () => {
    expect(unidadeTsx).not.toContain("myResponsavelSummary.useQuery({})");
  });
});

describe("Bloqueio 3 (parecer Manus 2026-10-08) — reference_date/ciclo preservado na navegação", () => {
  it("a tela de origem embute reference_date na query string ao entrar na unidade", () => {
    expect(meuResponsavelTsx).toContain("params.set('reference_date', referenceDate)");
  });

  it("a tela de destino lê reference_date da query string e repassa às 4 consultas de ciclo", () => {
    expect(unidadeTsx).toContain('params.get("reference_date")');
    const queriesComReferenceDate = [
      "myResponsavelSummary.useQuery({ financialResponsibleId, reference_date: referenceDate })",
      "doctorSummaryByUnit.useQuery(\n    { unit_id: unitId!, reference_date: referenceDate }",
      "unitProfitCalculator.useQuery(\n    { unit_id: unitId!, reference_date: referenceDate }",
      "getUnitProfitEventsDetailed.useQuery(\n    { unit_id: unitId!, reference_date: referenceDate }",
    ];
    for (const needle of queriesComReferenceDate) {
      expect(unidadeTsx).toContain(needle);
    }
  });

  it("mostra o ciclo efetivo retornado pelo backend, não um texto genérico fixo", () => {
    expect(unidadeTsx).toContain("Ciclo: {unit.cycle_label}");
    expect(unidadeTsx).not.toMatch(/>\s*Ciclo atual\s*</);
  });
});

describe("Bloqueio 4 (parecer Manus 2026-10-08) — vigência de preço do médico", () => {
  it("calcula o início de vigência alinhado ao próximo ciclo quando já existe preço ativo", () => {
    expect(unidadeTsx).toContain("const nextValidStart = active ? (unit?.cycle_end_date || new Date().toISOString()) : new Date().toISOString();");
    expect(unidadeTsx).toContain("startsAt: nextValidStart");
  });

  it("não envia mais new Date().toISOString() incondicionalmente como startsAt", () => {
    expect(unidadeTsx).not.toMatch(/startsAt:\s*new Date\(\)\.toISOString\(\),\s*\n\s*\}\);\s*\n\s*setModalityPriceInput/);
  });

  it("só limpa o campo de preço no sucesso da mutation, nunca antes", () => {
    expect(unidadeTsx).toContain("{ onSuccess: () => setModalityPriceInput((s) => ({ ...s, [mod]: \"\" })) }");
  });

  it("exibe a regra de vigência na interface antes do clique, quando já há preço vigente", () => {
    expect(unidadeTsx).toContain("Já existe preço vigente");
    expect(unidadeTsx).toContain("nunca retroativamente nem no meio do ciclo atual");
  });

  it("aplica a mesma disciplina de não limpar antes do sucesso ao preço externo", () => {
    expect(unidadeTsx).toContain("{ onSuccess: () => setExternalPriceInput((s) => ({ ...s, [p.exam_legend_id]: \"\" })) }");
  });
});

describe("Pontos adicionais (seção 4 do parecer Manus 2026-10-08)", () => {
  it("valida unitId como inteiro positivo, não apenas finito", () => {
    expect(unidadeTsx).toContain("Number.isInteger(unitIdRaw) && unitIdRaw > 0");
    expect(unidadeTsx).not.toContain("Number.isFinite(unitId)");
  });

  it("expõe isError/error para unitProfitCalculator e getUnitProfitEventsDetailed, com mensagem ciente de FORBIDDEN", () => {
    expect(unidadeTsx).toContain("profitTotalsError");
    expect(unidadeTsx).toContain("profitDetailError");
    expect(unidadeTsx).toContain('code === "FORBIDDEN"');
    expect(unidadeTsx).toContain("describeQueryError");
  });

  it("adiciona rolagem horizontal consciente nas tabelas largas (lucro e médicos)", () => {
    const overflowXCount = (unidadeTsx.match(/overflow-x-auto/g) ?? []).length;
    expect(overflowXCount).toBeGreaterThanOrEqual(2);
  });
});
