import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Teste de regressão (auditoria claude/corrige-ciclo-banner-financeiro-catalogo,
// 2026-10-10). Sem banco real disponível no sandbox, confirma estruturalmente que
// getDoctorUnitFinancialInfo parou de depender de uma linha materializada em
// billing_cycles para considerar o ciclo do médico aberto, e passou a computar a
// janela do ciclo via calculateFinancialCycleDates — igual a financeSimple.myFinanceiro
// — cobrindo tanto billing_visit_events (fluxo legado) quanto
// billing_catalog_study_events (fluxo de catálogo por legenda clínica), que nunca
// materializa uma linha em billing_cycles.

const dbSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");

function extractFunction(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  let i = source.indexOf("{", start);
  const bodyStart = i;
  for (; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return source.slice(bodyStart, i + 1);
}

describe("getDoctorUnitFinancialInfo não depende mais de billing_cycles materializado", () => {
  const fn = extractFunction(dbSource, "export async function getDoctorUnitFinancialInfo(");

  it("não consulta mais billing_cycles para decidir se o ciclo está aberto", () => {
    expect(fn).not.toContain(".from(billing_cycles)");
    expect(fn).not.toContain('eq(billing_cycles.status, "open")');
  });

  it("computa a janela do ciclo via calculateFinancialCycleDates, como financeSimple.myFinanceiro", () => {
    expect(fn).toContain("calculateFinancialCycleDates(");
    expect(fn).toContain("units.billing_cycle_start_day");
    expect(fn).toContain("units.billing_cycle_end_day");
  });

  it("conta eventos das duas fontes (legado e catálogo) dentro da janela computada", () => {
    expect(fn).toContain(".from(billing_visit_events)");
    expect(fn).toContain(".from(billing_catalog_study_events)");
    expect(fn).toContain("${billing_visit_events.signed_at} >= ${cycleStart}");
    expect(fn).toContain("${billing_catalog_study_events.signed_at} >= ${cycleStart}");
  });

  it("has_open_cycle deixa de depender da existência de uma linha billing_cycles", () => {
    // Antes: has_open_cycle só virava true dentro do `if (activeCycle.length > 0)`.
    // Agora: é computado sempre que a janela do ciclo é calculada com sucesso.
    expect(fn).toContain("has_open_cycle = true;");
    expect(fn).not.toContain("if (activeCycle.length > 0)");
  });
});
