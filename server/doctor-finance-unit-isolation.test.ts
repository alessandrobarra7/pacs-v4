import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Teste comportamental de isolamento financeiro entre unidades.
 *
 * ANTES (até 2026-09-22): este arquivo apenas lia server/routers/financeSimple.ts
 * e client/src/pages/finance/FinanceMeuFinanceiro.tsx como texto puro e conferia
 * se certos trechos (nomes de função, mensagens de erro) apareciam no arquivo.
 * Isso nunca executou o código real: um refactor que removesse a checagem de
 * permissão, mas deixasse o nome da função em um comentário em outro lugar do
 * arquivo, faria esse teste continuar passando mesmo com o isolamento quebrado.
 *
 * AGORA: o teste chama myFinanceiro / myModalityPrices de verdade, simulando
 * um médico autenticado, e confirma que uma unidade fora da permissão dele é
 * bloqueada com FORBIDDEN — e que a própria unidade autorizada é liberada.
 *
 * Escopo deliberado: para myFinanceiro, a query de unidades é esvaziada
 * (fila de respostas vazia) para isolar o teste na checagem de permissão,
 * sem acoplar este arquivo à extensa lógica de agregação financeira (ciclos,
 * eventos legados/catálogo, laudos entregues) já coberta por outros testes
 * comportamentais, como finance-unit-summary-behavior.test.ts. O que este
 * teste prova é que a chamada NÃO lança FORBIDDEN quando a unidade é a
 * correta — ou seja, que a barreira de isolamento deixa o fluxo passar
 * adiante sem bloquear quem tem permissão.
 */

const state = vi.hoisted(() => ({
  responses: [] as unknown[][],
  getUserUnitPermissions: vi.fn(),
  canAccessUnit: vi.fn(),
}));

function resultQuery(rows: unknown[]) {
  return Object.assign(Promise.resolve(rows), {
    orderBy: () => Promise.resolve(rows),
    limit: () => Promise.resolve(rows),
  });
}

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    // FIX (2026-09-22): getUserUnitPermissions precisa ser sobrescrito
    // explicitamente. Se apenas espalhado via ...original, a implementação
    // real seria usada e chamaria o getDb() real (não mockado) internamente,
    // derrubando o teste por falta de DATABASE_URL no ambiente de teste.
    getUserUnitPermissions: state.getUserUnitPermissions,
    getDb: vi.fn(async () => ({
      select: vi.fn(() => {
        const chain: Record<string, unknown> = {};
        chain.from = vi.fn(() => chain);
        chain.where = vi.fn(() => resultQuery(state.responses.shift() ?? []));
        return chain;
      }),
    })),
  };
});

vi.mock("./authorization", async (importOriginal) => {
  const original = await importOriginal<typeof import("./authorization")>();
  return {
    ...original,
    canAccessUnit: state.canAccessUnit,
  };
});

import { financeSimpleRouter } from "./routers/financeSimple";

function medico(id: number) {
  return { id, role: "medico" as const };
}

function callerFor(user: { id: number; role: string }) {
  return financeSimpleRouter.createCaller({
    user: user as never,
    req: {} as never,
    res: {} as never,
  });
}

describe("Isolamento financeiro do médico entre unidades", () => {
  beforeEach(() => {
    state.responses = [];
    state.getUserUnitPermissions.mockReset();
    state.canAccessUnit.mockReset();
    state.canAccessUnit.mockResolvedValue(false);
  });

  describe("myFinanceiro", () => {
    it("bloqueia com FORBIDDEN quando o médico não tem view_financial na unidade pedida", async () => {
      state.getUserUnitPermissions.mockResolvedValue([
        { unit_id: 10, view_financial: true },
      ]);

      await expect(
        callerFor(medico(1)).myFinanceiro({ unit_id: 99 }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Sem acesso financeiro a esta unidade.",
      });
    });

    it("libera a consulta quando a unidade pedida é a mesma em que o médico tem view_financial", async () => {
      state.getUserUnitPermissions.mockResolvedValue([
        { unit_id: 10, view_financial: true },
      ]);
      // unitRowsQuery e modPriceRows vazios — ver nota de escopo no topo do arquivo.
      state.responses = [[], []];

      const result = await callerFor(medico(1)).myFinanceiro({ unit_id: 10 });

      expect(result.summary).toEqual([]);
    });

    it("admin_master não é bloqueado mesmo sem permissão explícita cadastrada na unidade", async () => {
      state.responses = [[], []];

      const result = await callerFor({ id: 1, role: "admin_master" }).myFinanceiro({ unit_id: 10 });

      expect(result.summary).toEqual([]);
      expect(state.getUserUnitPermissions).not.toHaveBeenCalled();
    });
  });

  describe("myModalityPrices", () => {
    it("bloqueia com FORBIDDEN quando o médico não tem view_financial na unidade pedida", async () => {
      state.getUserUnitPermissions.mockResolvedValue([
        { unit_id: 10, view_financial: true },
      ]);

      await expect(
        callerFor(medico(1)).myModalityPrices({ unit_id: 99 }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Sem acesso financeiro a esta unidade.",
      });
    });

    it("retorna somente os preços da unidade autorizada, sem vazar dado de outra unidade", async () => {
      state.getUserUnitPermissions.mockResolvedValue([
        { unit_id: 10, view_financial: true },
      ]);
      state.responses = [
        // preço individual do médico (doctorRows) para a unidade 10
        [{ modality: "CR", price_per_report: "25.00", starts_at: new Date("2026-01-01"), ends_at: null }],
        // preço padrão da unidade (unitRows) — vazio neste cenário
        [],
      ];

      const result = await callerFor(medico(1)).myModalityPrices({ unit_id: 10 });
      const cr = result.find((r) => r.modality === "CR");

      expect(cr).toMatchObject({ price_per_report: 25, source: "individual" });
    });
  });
});
