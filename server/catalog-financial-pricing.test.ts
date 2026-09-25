import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  responses: [] as unknown[][],
  inserts: [] as unknown[],
  updates: [] as unknown[],
  // FIX (2026-09-24, bloqueio 1 da revisão Manus, teste de isolamento de
  // escopo): captura o argumento passado a cada .where(...) na ordem das
  // chamadas, para provar que a query de preço por legenda é de fato
  // filtrada por unit_id + doctor_user_id + exam_legend_id (não é possível
  // provar isso só com a fila de respostas, que é cega aos argumentos).
  whereArgs: [] as unknown[],
}));

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getDb: vi.fn(async () => ({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn((cond: unknown) => {
            state.whereArgs.push(cond);
            return Promise.resolve(state.responses.shift() ?? []);
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((value: unknown) => ({
          where: vi.fn(async () => state.updates.push(value)),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(async (value: unknown) => state.inserts.push(value)),
      })),
    })),
  };
});

import { and, eq } from "drizzle-orm";
import { billing_doctor_exam_legend_prices } from "../drizzle/schema";
import { createCatalogEventsWhenComplete } from "./catalogFinancial";

const signedAt = new Date("2026-08-21T12:00:00.000Z");
const current = { starts_at: new Date("2026-08-01T00:00:00.000Z"), ends_at: null };

function selection(overrides: Record<string, unknown> = {}) {
  return {
    id: 41,
    unit_id: 12,
    exam_legend_id: 8,
    exam_name_snapshot: "CRÂNIO",
    modality_snapshot: "CR",
    financial_event_count: 1,
    documents_snapshot: [{ key: "primary" }],
    lockedAt: null,
    ...overrides,
  };
}

function preparePricing({
  legend = [],
  doctor = [],
  unit = [],
  system = [{ ...current, price_per_report: "3.50" }],
}: {
  legend?: unknown[];
  doctor?: unknown[];
  unit?: unknown[];
  system?: unknown[];
} = {}) {
  state.responses = [
    [selection()],
    [{ document_key: "primary" }],
    [],
    // FIX (2026-09-24): billing_doctor_exam_legend_prices agora e consultada
    // primeiro, antes de doctor/unit/system -- ver ordem do Promise.all em
    // createCatalogEventsWhenComplete (catalogFinancial.ts).
    legend,
    doctor,
    unit,
    system,
  ];
}

describe("Precificação comportamental dos eventos de catálogo", () => {
  beforeEach(() => {
    state.responses = [];
    state.inserts = [];
    state.updates = [];
    state.whereArgs = [];
  });

  it("prioriza o preço individual vigente por modalidade sobre o fallback da unidade", async () => {
    preparePricing({
      doctor: [{ ...current, price_per_report: "10.00" }],
      unit: [{ ...current, price_per_event: "18.00" }],
    });

    const result = await createCatalogEventsWhenComplete({
      studyUid: "1.2.3", unitId: 12, doctorUserId: 31, documentKey: "primary", signedAt,
    });

    expect(result).toEqual({ handled: true, created: 1 });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toEqual([expect.objectContaining({
      modality_snapshot: "CR",
      price_applied: "10",
      doctor_price_source: "doctor_modality",
      system_price_applied: "3.5",
      system_amount_due: "3.5",
      pricing_status: "ok",
    })]);
  });

  it("usa o valor vigente da unidade quando o médico não tem preço individual", async () => {
    preparePricing({
      unit: [{ ...current, price_per_event: "18.00" }],
    });

    await createCatalogEventsWhenComplete({
      studyUid: "1.2.3", unitId: 12, doctorUserId: 31, documentKey: "primary", signedAt,
    });

    expect(state.inserts[0]).toEqual([expect.objectContaining({
      price_applied: "18",
      doctor_price_source: "unit_modality_fallback",
      pricing_status: "ok",
    })]);
  });

  it("preserva o evento pendente quando nenhuma fonte de preço médico está vigente", async () => {
    preparePricing();

    await createCatalogEventsWhenComplete({
      studyUid: "1.2.3", unitId: 12, doctorUserId: 31, documentKey: "primary", signedAt,
    });

    expect(state.inserts[0]).toEqual([expect.objectContaining({
      price_applied: null,
      doctor_price_source: null,
      system_amount_due: "3.5",
      pricing_status: "pending_doctor_price",
    })]);
  });

  // FIX (2026-09-24, AUDITORIA_PAINEL_RESPONSAVEL_FINANCEIRO): a tela "Preços
  // por Legenda Canônica" (billing_doctor_exam_legend_prices) prometia um
  // preço específico por médico+unidade+exame, mas essa função nunca a lia.
  // Os testes abaixo cobrem a nova fonte de preço, com prioridade máxima.
  it("prioriza o preço por legenda vigente sobre o preço por modalidade do médico", async () => {
    preparePricing({
      legend: [{ starts_at: "2026-08-01", ends_at: null, price_per_event: "25.00" }],
      doctor: [{ ...current, price_per_report: "10.00" }],
      unit: [{ ...current, price_per_event: "18.00" }],
    });

    await createCatalogEventsWhenComplete({
      studyUid: "1.2.3", unitId: 12, doctorUserId: 31, documentKey: "primary", signedAt,
    });

    expect(state.inserts[0]).toEqual([expect.objectContaining({
      price_applied: "25",
      doctor_price_source: "doctor_legend",
      pricing_status: "ok",
    })]);
  });

  it("ignora o preço por legenda quando a vigência já encerrou, caindo para a modalidade do médico", async () => {
    preparePricing({
      // ends_at anterior à data de assinatura (signedAt = 2026-08-21):
      // preço vencido, não deve ser aplicado.
      legend: [{ starts_at: "2026-06-01", ends_at: "2026-07-08", price_per_event: "25.00" }],
      doctor: [{ ...current, price_per_report: "10.00" }],
    });

    await createCatalogEventsWhenComplete({
      studyUid: "1.2.3", unitId: 12, doctorUserId: 31, documentKey: "primary", signedAt,
    });

    expect(state.inserts[0]).toEqual([expect.objectContaining({
      price_applied: "10",
      doctor_price_source: "doctor_modality",
      pricing_status: "ok",
    })]);
  });

  it("sem preço por legenda nem por modalidade do médico, mantém o fallback da unidade (comportamento antigo intacto)", async () => {
    preparePricing({
      unit: [{ ...current, price_per_event: "18.00" }],
    });

    await createCatalogEventsWhenComplete({
      studyUid: "1.2.3", unitId: 12, doctorUserId: 31, documentKey: "primary", signedAt,
    });

    expect(state.inserts[0]).toEqual([expect.objectContaining({
      price_applied: "18",
      doctor_price_source: "unit_modality_fallback",
      pricing_status: "ok",
    })]);
  });

  // FIX (2026-09-24, BLOQUEIO 1 da revisão Manus): billing_doctor_exam_legend_prices
  // é DATE (sem horário). A primeira versão convertia ends_at com
  // `new Date(row.ends_at)`, que vira 00:00:00.000 UTC daquele dia — um
  // preço com ends_at no MESMO dia da assinatura já era tratado como
  // vencido se a assinatura ocorresse depois da meia-noite. Os casos abaixo
  // são exatamente os pedidos pela revisão.
  describe("vigência do preço por legenda — casos de fronteira (dia inteiro, UTC)", () => {
    it("starts_at igual ao dia da assinatura: já vigora (não precisa esperar o dia seguinte)", async () => {
      preparePricing({
        // Assinatura ao meio-dia do dia 21; vigência começa no próprio dia 21.
        legend: [{ starts_at: "2026-08-21", ends_at: null, price_per_event: "25.00" }],
      });

      await createCatalogEventsWhenComplete({
        studyUid: "1.2.3", unitId: 12, doctorUserId: 31, documentKey: "primary", signedAt,
      });

      expect(state.inserts[0]).toEqual([expect.objectContaining({
        price_applied: "25",
        doctor_price_source: "doctor_legend",
      })]);
    });

    it("ends_at igual ao dia da assinatura, com horário posterior à meia-noite: ainda vigora (o bug relatado pela Manus)", async () => {
      preparePricing({
        // Preço encerra no dia 21; assinatura é às 12:00 UTC do próprio dia
        // 21 (signedAt). Antes do fix, isso já caía fora da vigência.
        legend: [{ starts_at: "2026-08-01", ends_at: "2026-08-21", price_per_event: "25.00" }],
      });

      await createCatalogEventsWhenComplete({
        studyUid: "1.2.3", unitId: 12, doctorUserId: 31, documentKey: "primary", signedAt,
      });

      expect(state.inserts[0]).toEqual([expect.objectContaining({
        price_applied: "25",
        doctor_price_source: "doctor_legend",
      })]);
    });

    it("preço encerrado no dia anterior ao da assinatura: não vigora", async () => {
      preparePricing({
        legend: [{ starts_at: "2026-08-01", ends_at: "2026-08-20", price_per_event: "25.00" }],
        doctor: [{ ...current, price_per_report: "10.00" }],
      });

      await createCatalogEventsWhenComplete({
        studyUid: "1.2.3", unitId: 12, doctorUserId: 31, documentKey: "primary", signedAt,
      });

      expect(state.inserts[0]).toEqual([expect.objectContaining({
        price_applied: "10",
        doctor_price_source: "doctor_modality",
      })]);
    });

    it("preço futuro (starts_at depois da assinatura): ainda não vigora", async () => {
      preparePricing({
        legend: [{ starts_at: "2026-08-22", ends_at: null, price_per_event: "25.00" }],
        doctor: [{ ...current, price_per_report: "10.00" }],
      });

      await createCatalogEventsWhenComplete({
        studyUid: "1.2.3", unitId: 12, doctorUserId: 31, documentKey: "primary", signedAt,
      });

      expect(state.inserts[0]).toEqual([expect.objectContaining({
        price_applied: "10",
        doctor_price_source: "doctor_modality",
      })]);
    });

    it("consulta de preço por legenda é filtrada por unidade + médico + exame exatos (isolamento de escopo)", async () => {
      preparePricing({
        legend: [{ starts_at: "2026-08-01", ends_at: null, price_per_event: "25.00" }],
      });

      await createCatalogEventsWhenComplete({
        studyUid: "1.2.3", unitId: 12, doctorUserId: 31, documentKey: "primary", signedAt,
      });

      // whereArgs[3] é a 4ª chamada a .where(...) (após candidatos da
      // seleção, relatórios assinados e verificação de evento existente) --
      // exatamente a query de billing_doctor_exam_legend_prices. Prova que
      // o filtro no banco usa unit_id=12, doctor_user_id=31 e
      // exam_legend_id=8 (o exam_legend_id da seleção default, ver
      // selection() acima) — não um preço de outro médico, unidade ou exame.
      expect(state.whereArgs[3]).toEqual(and(
        eq(billing_doctor_exam_legend_prices.unit_id, 12),
        eq(billing_doctor_exam_legend_prices.doctor_user_id, 31),
        eq(billing_doctor_exam_legend_prices.exam_legend_id, 8),
      ));
    });
  });
});
