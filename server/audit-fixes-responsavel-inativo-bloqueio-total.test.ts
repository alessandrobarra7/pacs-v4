/**
 * Regressão (claude/modulo-financeiro-unificado-fixes, 2026-09-23, 2ª rodada
 * de revisão da Manus — bloqueio 2).
 *
 * A política de produto "bloquear tudo" (decidida pelo Alessandro em
 * 2026-09-22: responsável financeiro inativo perde TODO acesso — leitura,
 * preço, ciclo — pra qualquer usuário vinculado a ele) já era garantida pela
 * trava central em getResponsibleIdForUser/getResponsibleIdsForUser. Mas a
 * revisão da Manus, testando contra banco real de sandbox, encontrou duas
 * procedures que liam financial_responsible_users direto, sem passar por
 * essa trava:
 *
 *   - getResponsibleDebtByDoctor: além de ignorar isActive, tinha um bug
 *     mais grave escondido atrás — se nenhum responsável fosse resolvido
 *     (ativo ou não), o filtro por unidade era pulado inteiro e a consulta
 *     devolvia dívidas de TODAS as unidades pra uma conta responsavel_financeiro.
 *   - listDoctorsForResponsible: mesma leitura direta, mesma ausência do
 *     filtro isActive, expondo médicos/unidades/preços de responsável inativo.
 *
 * Este arquivo prova, pra cada uma das duas procedures, que uma conta ligada
 * SOMENTE a um responsável inativo agora recebe FORBIDDEN sem que nenhuma
 * consulta de dado financeiro chegue a rodar — não apenas uma lista vazia,
 * que poderia ser confundida com "sem dívidas"/"sem médicos cadastrados".
 *
 * Comprovado por quebra deliberada: revertendo o fix (voltando à leitura
 * direta de financial_responsible_users sem getResponsibleIdForUser), estes
 * dois testes falham porque a conta com responsável inativo deixa de
 * receber FORBIDDEN — confirmando que os testes realmente exercitam a
 * trava, não são testes vazios.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  ownResponsibleId: undefined as number | undefined,
  selectCalls: 0,
  listResponsiblesForUserCalls: [] as number[],
  responsiblesForUser: [] as { id: number; legal_name: string; trade_name: string | null; isActive: boolean }[],
}));

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    // getResponsibleIdForUser já é a trava central (respeita isActive via
    // innerJoin com financial_responsibles, ver fix anterior no db.ts).
    // Mockado direto aqui pra simular os dois cenários (com/sem responsável
    // ativo) sem precisar montar o innerJoin real no fake de banco.
    getResponsibleIdForUser: vi.fn(async () => state.ownResponsibleId),
    // listResponsiblesForUser chama getDb() internamente, DENTRO do próprio
    // db.ts (mesma armadilha de mock auto-referente já documentada nas
    // rodadas anteriores: o fechamento da função real aponta pro getDb
    // original, não pro mock, então não dá pra exercitar o filtro isActive
    // do SQL por aqui). Mockada direto: prova que listMyResponsibles
    // encaminha certo pra ela, não prova o filtro isActive em si — isso fica
    // pra revisão de código + validação da Manus em banco real, mesma
    // ressalva já feita e aceita nas rodadas anteriores.
    listResponsiblesForUser: vi.fn(async (userId: number) => {
      state.listResponsiblesForUserCalls.push(userId);
      return state.responsiblesForUser;
    }),
    getDb: vi.fn(async () => ({
      select: vi.fn(() => {
        state.selectCalls += 1;
        const chain: Record<string, unknown> = {};
        chain.from = vi.fn(() => chain);
        chain.leftJoin = vi.fn(() => chain);
        // where() precisa servir dois formatos usados por getResponsibleDebtByDoctor:
        // (a) `const [row] = await ...where(...)` — resolve direto pra [];
        // (b) `...where(...).orderBy(...).limit(...).offset(...)` — encadeado.
        chain.where = vi.fn(() =>
          Object.assign(Promise.resolve([]), {
            limit: () => Promise.resolve([]),
            orderBy: () =>
              Object.assign(Promise.resolve([]), {
                limit: () => Object.assign(Promise.resolve([]), { offset: () => Promise.resolve([]) }),
              }),
          }),
        );
        return chain;
      }),
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

describe("responsável financeiro inativo — bloqueio total nas duas procedures que escapavam da trava", () => {
  beforeEach(() => {
    state.ownResponsibleId = undefined;
    state.selectCalls = 0;
    state.listResponsiblesForUserCalls = [];
    state.responsiblesForUser = [];
  });

  describe("getResponsibleDebtByDoctor", () => {
    it("bloqueia com FORBIDDEN, sem consultar nenhum dado financeiro, quando a conta só tem responsável inativo", async () => {
      state.ownResponsibleId = undefined; // getResponsibleIdForUser já filtra isActive — undefined = nenhum ativo

      await expect(
        callerFor("responsavel_financeiro").getResponsibleDebtByDoctor(undefined),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      // Nenhuma consulta de eventos/dívidas deve ter rodado antes do bloqueio.
      expect(state.selectCalls).toBe(0);
    });

    it("libera a consulta normalmente quando a conta tem responsável ativo", async () => {
      state.ownResponsibleId = 7;

      const result = await callerFor("responsavel_financeiro").getResponsibleDebtByDoctor(undefined);

      expect(result.responsible_id).toBe(7);
      expect(state.selectCalls).toBeGreaterThan(0);
    });
  });

  describe("listDoctorsForResponsible", () => {
    it("bloqueia com FORBIDDEN, sem consultar médicos/unidades/preços, quando a conta só tem responsável inativo", async () => {
      state.ownResponsibleId = undefined;

      await expect(
        callerFor("responsavel_financeiro").listDoctorsForResponsible(),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(state.selectCalls).toBe(0);
    });

    it("segue liberado (lista vazia por falta de vínculo de unidade, não erro) quando o responsável está ativo mas sem unidades vinculadas", async () => {
      state.ownResponsibleId = 7;

      const result = await callerFor("responsavel_financeiro").listDoctorsForResponsible();

      // Com responsável ativo, mas sem unidades vinculadas (fake de banco
      // devolve [] pro innerJoin de financial_responsible_units), a resposta
      // é lista vazia — comportamento normal de "sem unidades", não bloqueio.
      expect(result).toEqual([]);
    });
  });

  describe("listMyResponsibles", () => {
    it("encaminha o usuário logado para listResponsiblesForUser (que já filtra isActive no SQL — ver FIX em db.ts)", async () => {
      state.responsiblesForUser = [
        { id: 7, legal_name: "Responsável Ativo LTDA", trade_name: null, isActive: true },
      ];

      const result = await callerFor("responsavel_financeiro").listMyResponsibles();

      expect(state.listResponsiblesForUserCalls).toEqual([1]);
      expect(result).toEqual(state.responsiblesForUser);
    });
  });
});
