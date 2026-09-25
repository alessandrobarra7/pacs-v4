/**
 * Regressão (claude/modulo-financeiro-unificado, 2026-09-22).
 *
 * Decisão de produto do Alessandro (22/09/2026, resposta ao mockup
 * financeiro-responsavel-v2.html): responsavel_financeiro passa a poder
 * editar o ciclo de pagamento (setUnitCycle) e encerrar o ciclo
 * (closeCycle) — antes exclusivo de admin_master. A regra de autorização
 * reusa assertCanManageFinancialPrices (mesma checagem já usada por
 * setUnitModalityPrice): admin_master irrestrito; responsavel_financeiro
 * só na(s) própria(s) unidade(s), nunca em unidade de outro responsável.
 *
 * Este teste prova as duas pontas da mudança: acesso concedido na unidade
 * própria, e continua FORBIDDEN fora dela — não é uma abertura geral de
 * permissão, é escopada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  responses: [] as unknown[][],
  ownResponsibleId: undefined as number | undefined,
  ownResponsibleIds: [] as number[],
  updates: [] as unknown[],
  closeCalls: [] as { cycleId: number; closedBy: number }[],
}));

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
    getResponsibleIdForUser: vi.fn(async () => state.ownResponsibleId),
    getResponsibleIdsForUser: vi.fn(async () => state.ownResponsibleIds),
    // closeBillingCycle é definida e usa getDb dentro do próprio db.ts —
    // se só espalhada via ...original, chamaria o getDb real (sem
    // DATABASE_URL) em vez do fake abaixo. Mockada direto pra registrar a
    // chamada sem tocar em banco nenhum.
    closeBillingCycle: vi.fn(async (cycleId: number, closedBy: number) => {
      state.closeCalls.push({ cycleId, closedBy });
    }),
    getDb: vi.fn(async () => ({
      select: vi.fn(() => {
        const chain: Record<string, unknown> = {};
        chain.from = vi.fn(() => chain);
        chain.leftJoin = vi.fn(() => chain);
        chain.where = vi.fn(() => resultQuery(state.responses.shift() ?? []));
        return chain;
      }),
      update: vi.fn(() => ({
        set: (values: unknown) => ({
          where: () => {
            state.updates.push(values);
            return Promise.resolve([{ affectedRows: 1 }]);
          },
        }),
      })),
    })),
  };
});

import { financeSimpleRouter } from "./routers/financeSimple";

function callerFor(role: "admin_master" | "responsavel_financeiro") {
  return financeSimpleRouter.createCaller({
    user: { id: 1, role },
    req: {} as never,
    res: {} as never,
  });
}

describe("setUnitCycle / closeCycle — responsavel_financeiro escopado à própria unidade", () => {
  beforeEach(() => {
    state.responses = [];
    state.ownResponsibleId = undefined;
    state.ownResponsibleIds = [];
    state.updates = [];
    state.closeCalls = [];
  });

  it("setUnitCycle: responsavel_financeiro consegue editar o ciclo da própria unidade", async () => {
    state.ownResponsibleId = 7;
    state.ownResponsibleIds = [7];
    state.responses = [
      [{ id: 1 }], // assertCanAccessFinancialUnit: vínculo encontrado
    ];

    const result = await callerFor("responsavel_financeiro").setUnitCycle({
      unit_id: 12,
      start_day: 1,
      end_day: 28,
    });

    expect(result.ok).toBe(true);
    expect(state.updates).toEqual([{ billing_cycle_start_day: 1, billing_cycle_end_day: 28 }]);
  });

  it("setUnitCycle: responsavel_financeiro NÃO consegue editar o ciclo de uma unidade de outro responsável", async () => {
    state.ownResponsibleId = 7;
    state.ownResponsibleIds = [7];
    state.responses = [
      [], // assertCanAccessFinancialUnit: nenhum vínculo — unidade de outro responsável
    ];

    await expect(
      callerFor("responsavel_financeiro").setUnitCycle({ unit_id: 999, start_day: 1, end_day: 28 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.updates).toEqual([]);
  });

  it("setUnitCycle: admin_master continua irrestrito, sem checar vínculo", async () => {
    const result = await callerFor("admin_master").setUnitCycle({ unit_id: 12, start_day: 1, end_day: 28 });
    expect(result.ok).toBe(true);
    // admin_master retorna antes de qualquer leitura de vínculo — a fila de
    // respostas fica intacta, provando que assertCanAccessFinancialUnit
    // nem chegou a rodar pra esse perfil.
    expect(state.responses).toEqual([]);
  });

  it("closeCycle: responsavel_financeiro consegue encerrar o ciclo da própria unidade", async () => {
    state.ownResponsibleId = 7;
    state.ownResponsibleIds = [7];
    state.responses = [
      [{ unit_id: 12 }], // resolve unit_id do ciclo
      [{ id: 1 }], // assertCanAccessFinancialUnit: vínculo encontrado
    ];

    const result = await callerFor("responsavel_financeiro").closeCycle({ cycle_id: 55 });

    expect(result.success).toBe(true);
    expect(state.closeCalls).toEqual([{ cycleId: 55, closedBy: 1 }]);
  });

  it("closeCycle: responsavel_financeiro NÃO consegue encerrar o ciclo de uma unidade de outro responsável", async () => {
    state.ownResponsibleId = 7;
    state.ownResponsibleIds = [7];
    state.responses = [
      [{ unit_id: 999 }], // ciclo pertence a outra unidade
      [], // assertCanAccessFinancialUnit: sem vínculo
    ];

    await expect(
      callerFor("responsavel_financeiro").closeCycle({ cycle_id: 55 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.closeCalls).toEqual([]);
  });

  it("closeCycle: ciclo inexistente retorna NOT_FOUND antes de checar permissão", async () => {
    state.ownResponsibleId = 7;
    state.ownResponsibleIds = [7];
    state.responses = [[]]; // nenhum ciclo com esse id

    await expect(
      callerFor("responsavel_financeiro").closeCycle({ cycle_id: 999 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(state.closeCalls).toEqual([]);
  });
});

/**
 * FIX (2026-09-23, revisão Manus — bloqueio crítico 2): getUnitCycle ainda
 * exigia admin_master mesmo depois de setUnitCycle ter sido aberta pra
 * responsavel_financeiro. O botão "Ciclo" aparecia pro responsável, mas o
 * modal nunca conseguia carregar os dias atuais — arriscando sobrescrever
 * o ciclo real com os valores-padrão 1 e 31 ao salvar às cegas. Corrigido
 * pra usar a mesma checagem de setUnitCycle (assertCanManageFinancialPrices).
 */
describe("getUnitCycle — mesma autorização escopada de setUnitCycle", () => {
  beforeEach(() => {
    state.responses = [];
    state.ownResponsibleId = undefined;
    state.ownResponsibleIds = [];
    state.updates = [];
    state.closeCalls = [];
  });

  it("admin_master lê o ciclo de qualquer unidade sem checar vínculo", async () => {
    state.responses = [
      [{ id: 12, name: "Unidade A", billing_cycle_start_day: 5, billing_cycle_end_day: 4 }],
    ];

    const result = await callerFor("admin_master").getUnitCycle({ unit_id: 12 });

    expect(result).toMatchObject({ unit_id: 12, start_day: 5, end_day: 4 });
  });

  it("responsavel_financeiro lê o ciclo da própria unidade", async () => {
    state.ownResponsibleId = 7;
    state.ownResponsibleIds = [7];
    state.responses = [
      [{ id: 1 }], // assertCanAccessFinancialUnit: vínculo encontrado
      [{ id: 12, name: "Unidade A", billing_cycle_start_day: 10, billing_cycle_end_day: 9 }],
    ];

    const result = await callerFor("responsavel_financeiro").getUnitCycle({ unit_id: 12 });

    expect(result).toMatchObject({ unit_id: 12, start_day: 10, end_day: 9 });
  });

  it("responsavel_financeiro NÃO consegue ler o ciclo de uma unidade de outro responsável (sem vazar datas)", async () => {
    state.ownResponsibleId = 7;
    state.ownResponsibleIds = [7];
    state.responses = [
      [], // assertCanAccessFinancialUnit: nenhum vínculo — unidade de outro responsável
    ];

    await expect(
      callerFor("responsavel_financeiro").getUnitCycle({ unit_id: 999 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
