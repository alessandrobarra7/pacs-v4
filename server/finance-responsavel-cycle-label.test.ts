import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Teste de regressão (auditoria claude/corrige-rotulo-ciclo-painel-responsavel,
// 2026-10-11). Reproduzido ao vivo logada como "erica" (responsavel_financeiro,
// Hospital da Criança): com "Outubro 2026" selecionado, o card da unidade mostrava
// "Ciclo: 24/10 – 23/11", mas os totais abaixo (1 laudo, R$ 30,00) eram do ciclo
// real 24/09–23/10 (o mesmo que o banner da worklist e "Meu Financeiro" do médico
// mostram). O texto do período não batia com os números.
//
// Causa: FinanceMeuResponsavel.tsx recalculava o rótulo no cliente a partir de
// (cycle_start_day, cycle_end_day, mês selecionado), assumindo sempre que o mês
// selecionado é o INÍCIO do ciclo — falso para ciclos que cruzam o mês (sd > ed)
// quando o dia de referência fixo (15) cai antes de sd. O backend já calcula e
// retorna o rótulo correto (myResponsavelSummary → cycle_label, via
// calcCycleDates/calculateFinancialCycleDates — a mesma função usada no banner da
// worklist e em financeSimple.myFinanceiro).

const pageSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/finance/FinanceMeuResponsavel.tsx"),
  "utf8",
);

describe("Painel do responsável financeiro: rótulo do ciclo por unidade", () => {
  it("usa o cycle_label vindo do backend em vez de recalcular no cliente", () => {
    expect(pageSource).toContain("u.cycle_label ? `Ciclo: ${u.cycle_label}`");
  });

  it("não recalcula mais o rótulo a partir de (sd, ed, mês selecionado)", () => {
    // Padrão antigo e quebrado: montava a string ele mesmo, assumindo que o mês
    // selecionado é sempre o início do ciclo.
    expect(pageSource).not.toContain("pad(sd)}/${pad(month)} – ${pad(ed)}/${pad(month)}");
    expect(pageSource).not.toContain("pad(sd)}/${pad(month)} – ${pad(ed)}/${pad(nextM)}");
  });
});
