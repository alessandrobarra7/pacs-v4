/**
 * Regressão (2026-09-24, AUDITORIA_PAINEL_RESPONSAVEL_FINANCEIRO, Achado 4,
 * e bloqueio 2 da revisão Manus em 2026-09-24).
 *
 * Duas procedures mostravam um "R$/Laudo" que podia divergir matematicamente
 * do "Total" exibido ao lado, porque o preço vinha de uma fonte
 * (configuração ATUAL) desacoplada da soma dos valores REALMENTE aplicados
 * nos eventos já faturados:
 *
 *  - doctorSummaryByUnit: price_per_report vinha de billing_doctor_unit_prices
 *    (preço configurado agora), enquanto doctor_total/total_laudos vinham dos
 *    eventos já faturados no ciclo. Confirmado ao vivo em produção: "1 laudo,
 *    R$1,00/laudo, Total R$10,00" na unidade HOSPITAL DA CRIANÇA.
 *
 *  - getResponsibleDebtByDoctor: price_per_report era fixado com o valor do
 *    PRIMEIRO evento de cada médico+unidade, enquanto reports/amount
 *    continuavam somando todos os eventos seguintes -- se o preço mudou
 *    entre eventos do mesmo período, o valor exibido não representava nem o
 *    primeiro nem a média real.
 *
 * A primeira correção derivou price_per_report de doctor_total/total_laudos
 * (ou amount/reports). A revisão da Manus apontou dois problemas nessa
 * primeira versão, corrigidos nesta rodada:
 *
 *  1) O denominador incluía laudos AINDA SEM preço aplicado (pendentes de
 *     precificação), que entravam como se fossem preço zero, distorcendo a
 *     média para baixo e escondendo a pendência. Corrigido: o denominador
 *     agora é só os laudos já precificados (doctor_priced_count /
 *     priced_reports), nunca o total de laudos.
 *
 *  2) Em getResponsibleDebtByDoctor, o acúmulo em ponto flutuante ao longo
 *     de muitas iterações (`amount += amt`) podia divergir por erro de
 *     representação binária. Corrigido: toMoney() aplicado a cada soma.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ responses: [] as unknown[][] }));

function makeChain(): any {
  const chain: any = {};
  for (const m of ["from", "leftJoin", "innerJoin", "where", "groupBy", "orderBy", "limit", "offset"]) {
    chain[m] = vi.fn(() => chain);
  }
  // Torna `chain` "thenable": `await db.select()...qualquerCoisa()` resolve
  // sempre para o próximo item da fila, independente de quantos métodos de
  // encadeamento foram chamados antes -- evita ter que replicar o encadeamento
  // exato de cada query.
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(state.responses.shift() ?? []).then(resolve, reject);
  return chain;
}

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getDb: vi.fn(async () => ({
      select: vi.fn(() => makeChain()),
    })),
  };
});

import { financeSimpleRouter } from "./routers/financeSimple";

function adminCaller() {
  return financeSimpleRouter.createCaller({
    user: { id: 1, role: "admin_master" as const },
    req: {} as never,
    res: {} as never,
  });
}

describe("financeSimple.doctorSummaryByUnit — R$/Laudo consistente com o Total", () => {
  beforeEach(() => {
    state.responses = [];
  });

  it("deriva R$/Laudo do total realmente faturado, não do preço configurado atual", async () => {
    state.responses = [
      // unitRow (ciclo)
      [{ s: 1, e: 31 }],
      // legacyRows — 1 laudo da Dra. Claudia faturado a R$10 (preço vigente
      // NA ÉPOCA da assinatura, já não é o preço configurado hoje), já
      // precificado (doctor_priced_count = 1)
      [{ doctor_user_id: 5, doctor_name: "Dra. Claudia Cipriano", total_laudos: 1, doctor_total: "10.00", doctor_paid: "10.00", doctor_pending_count: 0, doctor_priced_count: 1, last_received_at: null }],
      // catalogRows — nenhum evento de catálogo neste ciclo
      [],
      // priceRows — preço ATUALMENTE configurado (billing_doctor_unit_prices) é R$1,00 (mudou depois)
      [{ doctor_user_id: 5, price_per_report: "1.00" }],
    ];

    const result = await adminCaller().doctorSummaryByUnit({ unit_id: 12 });
    expect(result).toHaveLength(1);
    const doctor = result[0]!;

    // O que é pago de fato: 1 laudo, R$10 total.
    expect(doctor.total_laudos).toBe(1);
    expect(doctor.doctor_total).toBe(10);
    // R$/Laudo agora É o total dividido pelos laudos JÁ PRECIFICADOS (10/1 = 10)
    // — consistente com o Total, mesmo que o preço configurado hoje seja outro (R$1).
    expect(doctor.price_per_report).toBe(10);
    expect(doctor.priced_laudos_count).toBe(1);
    expect(doctor.pending_price_count).toBe(0);
    // O preço configurado atual continua disponível separadamente, para
    // quem quiser comparar/exibir os dois.
    expect(doctor.configured_price_per_report).toBe(1);
  });

  it("com múltiplos laudos em preços diferentes, R$/Laudo é a média real (total/laudos precificados)", async () => {
    state.responses = [
      [{ s: 1, e: 31 }],
      [{ doctor_user_id: 6, doctor_name: "Dr. Gian Carvalho", total_laudos: 3, doctor_total: "60.00", doctor_paid: "0.00", doctor_pending_count: 3, doctor_priced_count: 3, last_received_at: null }],
      [],
      [{ doctor_user_id: 6, price_per_report: "1.00" }],
    ];

    const result = await adminCaller().doctorSummaryByUnit({ unit_id: 12 });
    const doctor = result[0]!;
    expect(doctor.total_laudos).toBe(3);
    expect(doctor.doctor_total).toBe(60);
    // 60 / 3 = 20, não R$1 (preço atual) nem qualquer valor de um evento isolado.
    expect(doctor.price_per_report).toBe(20);
  });

  it("sem nenhum laudo no ciclo (nenhuma linha vem do GROUP BY), a lista simplesmente não inclui o médico", async () => {
    // FIX (bloqueio 2 da revisão Manus): o teste anterior simulava um médico
    // com total_laudos = 0, cenário que a query real NUNCA produz -- o
    // GROUP BY só retorna médicos que têm pelo menos um evento no período.
    // Este teste passa a refletir o caminho real: zero linhas agregadas =
    // zero médicos no resultado (não um médico "fantasma" com 0 laudos).
    state.responses = [
      [{ s: 1, e: 31 }],
      [], // legacyRows vazio
      [], // catalogRows vazio
      // priceRows nem chega a ser consultado (doctorIds fica vazio).
    ];

    const result = await adminCaller().doctorSummaryByUnit({ unit_id: 12 });
    expect(result).toHaveLength(0);
  });

  it("laudos pendentes de preço não entram no denominador da média nem são tratados como preço zero", async () => {
    // Médico com 3 laudos no ciclo: 2 já precificados (total R$20) e 1 ainda
    // pendente (doctor_amount_due NULL -- por isso doctor_priced_count = 2,
    // não 3, embora total_laudos seja 3).
    state.responses = [
      [{ s: 1, e: 31 }],
      [{ doctor_user_id: 8, doctor_name: "Dr. Pendente", total_laudos: 3, doctor_total: "20.00", doctor_paid: "0.00", doctor_pending_count: 3, doctor_priced_count: 2, last_received_at: null }],
      [],
      [],
    ];

    const result = await adminCaller().doctorSummaryByUnit({ unit_id: 12 });
    const doctor = result[0]!;
    expect(doctor.total_laudos).toBe(3);
    expect(doctor.priced_laudos_count).toBe(2);
    expect(doctor.pending_price_count).toBe(1);
    // 20 / 2 (só os precificados) = 10 -- se o denominador fosse total_laudos
    // (3, o bug apontado pela Manus), daria 6.67, escondendo que 1/3 dos
    // laudos ainda não tem preço nenhum.
    expect(doctor.price_per_report).toBe(10);
  });
});

describe("financeSimple.getResponsibleDebtByDoctor — R$/Laudo consistente com o Total (por unidade)", () => {
  beforeEach(() => {
    state.responses = [];
  });

  it("recalcula price_per_report como a média dos valores aplicados, não o valor do primeiro evento", async () => {
    state.responses = [
      // countRow2
      [{ count: 2 }],
      // rows — dois eventos do mesmo médico+unidade, com preços DIFERENTES
      // aplicados (ex.: preço mudou de vigência no meio do período)
      [
        {
          event: { doctor_user_id: 5, unit_id: 12, doctor_price_applied: "10.00", study_date: new Date("2026-09-05"), createdAt: new Date("2026-09-05") },
          unit_name: "Hospital da Criança",
          doctor_name: "Dra. Claudia Cipriano",
        },
        {
          event: { doctor_user_id: 5, unit_id: 12, doctor_price_applied: "30.00", study_date: new Date("2026-09-10"), createdAt: new Date("2026-09-10") },
          unit_name: "Hospital da Criança",
          doctor_name: "Dra. Claudia Cipriano",
        },
      ],
    ];

    const result = await adminCaller().getResponsibleDebtByDoctor({});
    const doctor = result.doctors[0]!;
    const unitEntry = doctor.units[0]!;

    expect(unitEntry.reports).toBe(2);
    expect(unitEntry.priced_reports).toBe(2);
    expect(unitEntry.pending_price_count).toBe(0);
    expect(unitEntry.amount).toBe(40);
    // Antes: price_per_report ficava travado em "10.00" (primeiro evento).
    // Agora: média real aplicada = 40 / 2 = 20.
    expect(unitEntry.price_per_report).toBe("20.00");
  });

  it("evento sem preço aplicado (doctor_price_applied null) não entra no denominador da média", async () => {
    state.responses = [
      [{ count: 2 }],
      [
        {
          event: { doctor_user_id: 5, unit_id: 12, doctor_price_applied: "10.00", study_date: new Date("2026-09-05"), createdAt: new Date("2026-09-05") },
          unit_name: "Hospital da Criança",
          doctor_name: "Dra. Claudia Cipriano",
        },
        {
          // Ainda pendente de precificação -- não deve virar "preço zero"
          // dentro da média.
          event: { doctor_user_id: 5, unit_id: 12, doctor_price_applied: null, study_date: new Date("2026-09-10"), createdAt: new Date("2026-09-10") },
          unit_name: "Hospital da Criança",
          doctor_name: "Dra. Claudia Cipriano",
        },
      ],
    ];

    const result = await adminCaller().getResponsibleDebtByDoctor({});
    const doctor = result.doctors[0]!;
    const unitEntry = doctor.units[0]!;

    expect(unitEntry.reports).toBe(2);
    expect(unitEntry.priced_reports).toBe(1);
    expect(unitEntry.pending_price_count).toBe(1);
    expect(unitEntry.amount).toBe(10);
    // Se o denominador fosse reports (2, incluindo o pendente), daria "5.00".
    // Correto: 10 / 1 (só o precificado) = 10.00.
    expect(unitEntry.price_per_report).toBe("10.00");
  });

  it("soma valores que não têm representação binária exata sem divergir por erro de ponto flutuante", async () => {
    // 0.29 + 0.58 é o exemplo clássico de imprecisão de IEEE 754 em JS
    // (0.29 + 0.58 !== 0.87 em ponto flutuante puro). Com toMoney() aplicado
    // a cada soma, o resultado acumulado precisa fechar exatamente em 0.87.
    state.responses = [
      [{ count: 2 }],
      [
        {
          event: { doctor_user_id: 9, unit_id: 12, doctor_price_applied: "0.29", study_date: new Date("2026-09-05"), createdAt: new Date("2026-09-05") },
          unit_name: "Hospital da Criança",
          doctor_name: "Dr. Centavos",
        },
        {
          event: { doctor_user_id: 9, unit_id: 12, doctor_price_applied: "0.58", study_date: new Date("2026-09-06"), createdAt: new Date("2026-09-06") },
          unit_name: "Hospital da Criança",
          doctor_name: "Dr. Centavos",
        },
      ],
    ];

    const result = await adminCaller().getResponsibleDebtByDoctor({});
    const unitEntry = result.doctors[0]!.units[0]!;
    expect(unitEntry.amount).toBe(0.87);
    expect(result.grand_total).toBe(0.87);
  });
});
