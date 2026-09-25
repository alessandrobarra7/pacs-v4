/**
 * Regressão (claude/modulo-financeiro-unificado, 2026-09-22).
 *
 * myResponsavelSummary lia só billing_visit_events via SQL cru: deixava de
 * fora billing_catalog_study_events (fluxo novo de faturamento por
 * catálogo) e não excluía eventos com financial_status = 'cancelled' dos
 * totais — um responsável financeiro via um resumo inflado, contando
 * laudo cancelado como se fosse receita/repasse pendente real.
 *
 * O fix reusa listUnitCycleFinancialEvents (mesmo helper usado pelo log
 * auditável e pelo fechamento histórico) em vez de duplicar leitura SQL
 * direta — este teste prova que a agregação resultante: (a) inclui
 * eventos de billing_catalog_study_events, (b) exclui eventos cancelados
 * de ambas as tabelas dos totais e da contagem.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ responses: [] as unknown[][] }));

function resultQuery(rows: unknown[]) {
  return Object.assign(Promise.resolve(rows), {
    limit: () => Promise.resolve(rows),
    orderBy: () => Promise.resolve(rows),
  });
}

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    // Isolado do resolveResponsibleContext real — o que este teste prova é
    // a agregação de eventos, não a resolução de vínculo (já coberta em
    // outras suítes). Sem isso, getResponsibleIdsForUser chamaria o getDb
    // interno real de db.ts (não o mock abaixo) e falharia por falta de
    // DATABASE_URL.
    getResponsibleIdsForUser: vi.fn(async () => [7]),
    getDb: vi.fn(async () => ({
      select: vi.fn(() => {
        const chain: Record<string, unknown> = {};
        chain.from = vi.fn(() => chain);
        chain.leftJoin = vi.fn(() => chain);
        chain.innerJoin = vi.fn(() => chain);
        chain.where = vi.fn(() => resultQuery(state.responses.shift() ?? []));
        return chain;
      }),
    })),
  };
});

import { financeSimpleRouter } from "./routers/financeSimple";

function caller() {
  return financeSimpleRouter.createCaller({
    user: { id: 1, role: "responsavel_financeiro" as const },
    req: {} as never,
    res: {} as never,
  });
}

describe("financeSimple.myResponsavelSummary — inclusão de catálogo e exclusão de cancelados", () => {
  beforeEach(() => {
    state.responses = [];
  });

  it("soma eventos de billing_visit_events e billing_catalog_study_events, excluindo os cancelados dos totais", async () => {
    const signedAt = new Date("2026-09-10T12:00:00.000Z");
    state.responses = [
      // 1) linkedUnits — unidade 12, ciclo 1→31 (cobre a data do teste)
      [{ unit_id: 12, unit_name: "Hospital da Criança", cycle_start_day: 1, cycle_end_day: 31 }],
      // 2) legacyRows (billing_visit_events) — um ativo, um cancelado
      [
        { event_id: 1, study_instance_uid: "1.1", report_id: 10, modality: "CR", clinical_label: "TÓRAX", doctor_user_id: 5, signed_at: signedAt, system_rate_applied: "3.50", doctor_amount_due: "18.00", system_amount_due: "3.50", doctor_received_at: null, system_paid_at: null, pricing_status: "active", financial_status: "active" },
        { event_id: 2, study_instance_uid: "1.2", report_id: 11, modality: "CR", clinical_label: "CRÂNIO", doctor_user_id: 5, signed_at: signedAt, system_rate_applied: "3.50", doctor_amount_due: "22.00", system_amount_due: "3.50", doctor_received_at: null, system_paid_at: null, pricing_status: "cancelled", financial_status: "cancelled" },
      ],
      // 3) catalogRows (billing_catalog_study_events) — um ativo (paga o sistema)
      [
        { event_id: 3, study_selection_id: 99, billing_occurrence: 1, source_report_id: 20, modality: "MR", clinical_label: "CRÂNIO RM", doctor_user_id: 6, signed_at: signedAt, system_rate_applied: "5.00", doctor_amount_due: "40.00", system_amount_due: "5.00", doctor_received_at: signedAt, system_paid_at: signedAt, pricing_status: "ok", financial_status: "active" },
      ],
    ];

    const result = await caller().myResponsavelSummary({});
    expect(result.units).toHaveLength(1);
    const unit = result.units[0]!;

    // 2 eventos ativos contam (1 legacy + 1 catalog); o cancelado não conta.
    expect(unit.total_laudos).toBe(2);
    // system_total: 3.50 (legacy ativo) + 5.00 (catalog) — NÃO soma o 3.50 do cancelado.
    expect(unit.system_total).toBe(8.5);
    // doctor_total: 18.00 (legacy ativo) + 40.00 (catalog) — NÃO soma os 22.00 do cancelado.
    expect(unit.doctor_total).toBe(58);
    // Só o evento de catálogo foi marcado como pago em ambas as pontas.
    expect(unit.system_paid).toBe(5);
    expect(unit.doctor_paid).toBe(40);
  });

  it("não conta nenhum evento quando todos estão cancelados (regressão: antes contava pela leitura SQL crua)", async () => {
    const signedAt = new Date("2026-09-10T12:00:00.000Z");
    state.responses = [
      [{ unit_id: 12, unit_name: "Hospital da Criança", cycle_start_day: 1, cycle_end_day: 31 }],
      [{ event_id: 1, study_instance_uid: "1.1", report_id: 10, modality: "CR", clinical_label: "TÓRAX", doctor_user_id: 5, signed_at: signedAt, system_rate_applied: "3.50", doctor_amount_due: "18.00", system_amount_due: "3.50", doctor_received_at: null, system_paid_at: null, pricing_status: "cancelled", financial_status: "cancelled" }],
      [],
    ];

    const result = await caller().myResponsavelSummary({});
    const unit = result.units[0]!;
    expect(unit.total_laudos).toBe(0);
    expect(unit.system_total).toBe(0);
    expect(unit.doctor_total).toBe(0);
  });
});

/**
 * Regressão (2026-09-24, AUDITORIA_PAINEL_RESPONSAVEL_FINANCEIRO, Achados 1 e 2).
 *
 * Achado 1: financial_responsible_units pode ter duas linhas ativas
 * (ends_at IS NULL) apontando para a mesma unidade — dado duplicado.
 * Confirmado ao vivo em produção: o card "HOSPITAL DA CRIANÇA" aparecia
 * duas vezes na tela do responsável, e os totais do cabeçalho ("4 laudos",
 * "R$4,00 pendente") eram o dobro do real (2 laudos, R$2,00).
 *
 * Achado 2: quando o unit_id não corresponde a nenhuma linha em `units`
 * (unidade excluída ou vínculo com dado errado), o LEFT JOIN retorna
 * unit_name = null e o código antigo substituía silenciosamente por
 * "Unidade" — indistinguível de uma unidade real com esse nome.
 */
describe("financeSimple.myResponsavelSummary — dedupe de unidade duplicada e unidade órfã", () => {
  beforeEach(() => {
    state.responses = [];
  });

  it("não duplica o card nem os totais quando há dois vínculos ativos para a mesma unidade", async () => {
    const signedAt = new Date("2026-09-10T12:00:00.000Z");
    state.responses = [
      // linkedUnits com a MESMA unidade (unit_id 12) repetida duas vezes —
      // reproduz o dado duplicado encontrado em produção.
      [
        { unit_id: 12, unit_name: "Hospital da Criança", cycle_start_day: 1, cycle_end_day: 31 },
        { unit_id: 12, unit_name: "Hospital da Criança", cycle_start_day: 1, cycle_end_day: 31 },
      ],
      // Com o dedupe, listUnitCycleFinancialEvents só é chamada UMA vez
      // para a unidade 12 — só há um par de respostas (legacy + catalog)
      // na fila. Se o dedupe não estivesse funcionando, o código tentaria
      // consumir mais itens da fila do que os disponíveis aqui, e o
      // segundo card ficaria com totais zerados/incorretos.
      [{ event_id: 1, study_instance_uid: "1.1", report_id: 10, modality: "CR", clinical_label: "TÓRAX", doctor_user_id: 5, signed_at: signedAt, system_rate_applied: "1.00", doctor_amount_due: "10.00", system_amount_due: "1.00", doctor_received_at: null, system_paid_at: null, pricing_status: "ok", financial_status: "active" }],
      [],
    ];

    const result = await caller().myResponsavelSummary({});

    // Uma unidade só, não duas.
    expect(result.units).toHaveLength(1);
    const unit = result.units[0]!;
    // 1 laudo, não 2 — os totais não podem estar dobrados.
    expect(unit.total_laudos).toBe(1);
    expect(unit.system_total).toBe(1);
    expect(unit.doctor_total).toBe(10);
  });

  it("marca a unidade como órfã com nome explícito quando o unit_id não existe mais em `units`", async () => {
    state.responses = [
      // unit_name null simula o LEFT JOIN sem correspondência.
      [{ unit_id: 999, unit_name: null, cycle_start_day: 1, cycle_end_day: 31 }],
      [],
      [],
    ];

    const result = await caller().myResponsavelSummary({});
    const unit = result.units[0]!;
    expect(unit.unit_orphaned).toBe(true);
    expect(unit.unit_name).toBe("Unidade removida (ID 999)");
  });

  it("não marca como órfã uma unidade normal, com nome real", async () => {
    state.responses = [
      [{ unit_id: 12, unit_name: "Hospital da Criança", cycle_start_day: 1, cycle_end_day: 31 }],
      [],
      [],
    ];

    const result = await caller().myResponsavelSummary({});
    const unit = result.units[0]!;
    expect(unit.unit_orphaned).toBe(false);
    expect(unit.unit_name).toBe("Hospital da Criança");
  });
});
