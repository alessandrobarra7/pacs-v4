/**
 * CORREÇÃO (auditoria claude/corrige-preco-modalidade-futuro-duplicado, 2026-10-11):
 *
 * Achado real em produção: a tela do responsável financeiro calculava "preço
 * vigente" checando só `!ends_at`, sem checar `starts_at <= now`. Um preço já
 * AGENDADO para o futuro (ainda não efetivo — ex.: um R$0,00 cadastrado por
 * engano) era tratado como se já estivesse valendo, e o "próximo início
 * válido" calculado (unit.cycle_end_date) coincidia exatamente com o
 * starts_at desse registro futuro. Ao tentar corrigir o valor, o INSERT
 * seguinte violava o índice único uq_modality_price_active (unit_id,
 * doctor_user_id, modality, starts_at) e o usuário via o erro bruto de SQL
 * na tela, sem conseguir corrigir.
 *
 * Este teste prova o contrato da correção no backend
 * (setDoctorModalityPrice, server/routers/financeSimple.ts): quando já
 * existe uma linha com exatamente o mesmo (unidade, médico, modalidade,
 * início de vigência), o backend deve ATUALIZAR essa linha em vez de tentar
 * inserir uma segunda — nunca deixando o erro de constraint única vazar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const state = vi.hoisted(() => ({
  responses: [] as unknown[][],
  updates: [] as unknown[],
  inserts: [] as unknown[],
}));

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getDb: vi.fn(async () => ({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(state.responses.shift() ?? [])),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((value: unknown) => ({
          where: vi.fn(async () => {
            state.updates.push(value);
          }),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(async (value: unknown) => {
          state.inserts.push(value);
          return [{ insertId: 999 }];
        }),
      })),
    })),
  };
});

function createContext(overrides: Partial<AuthenticatedUser>): TrpcContext {
  const user: AuthenticatedUser = {
    id: overrides.id ?? 1,
    openId: overrides.openId ?? "test-admin",
    email: overrides.email ?? "admin@pacs.com",
    name: overrides.name ?? "Admin",
    loginMethod: "local",
    role: overrides.role ?? "admin_master",
    unit_id: overrides.unit_id ?? null,
    isActive: overrides.isActive ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
      ip: "127.0.0.1",
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

describe("setDoctorModalityPrice — colisão com preço futuro já agendado", () => {
  beforeEach(() => {
    state.responses = [];
    state.updates = [];
    state.inserts = [];
    vi.clearAllMocks();
  });

  it("quando já existe uma linha com o mesmo (unidade, médico, modalidade, início), ATUALIZA em vez de inserir duplicata", async () => {
    // 1ª query: activeRows (preço já vigente agora) — vazio, reproduz o caso
    // real: nada vigente HOJE, só um preço agendado para o futuro.
    state.responses.push([]);
    // 2ª query: existingAtSameStart — encontra a linha futura já existente
    // com o mesmo starts_at que o frontend está reenviando.
    state.responses.push([{ id: 777 }]);

    const { appRouter } = await import("./routers");
    const ctx = createContext({ role: "admin_master" });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.financeSimple.setDoctorModalityPrice({
      financialResponsibleId: 1,
      unitId: 20,
      doctorUserId: 268,
      modality: "CR",
      pricePerReport: "10.00",
      startsAt: "2026-10-24",
    });

    expect(result).toEqual({ id: 777 });
    // Nunca deve ter tentado inserir uma segunda linha — isso é exatamente o
    // que violava o índice único e gerava o erro bruto de SQL na tela.
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ price_per_report: "10.00" });
  });

  it("quando não existe nenhuma linha no mesmo início, insere normalmente (comportamento padrão preservado)", async () => {
    // 1ª query: activeRows — vazio (primeira configuração).
    state.responses.push([]);
    // 2ª query: existingAtSameStart — vazio, não há conflito.
    state.responses.push([]);

    const { appRouter } = await import("./routers");
    const ctx = createContext({ role: "admin_master" });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.financeSimple.setDoctorModalityPrice({
      financialResponsibleId: 1,
      unitId: 20,
      doctorUserId: 268,
      modality: "CT",
      pricePerReport: "25.00",
      startsAt: "2026-10-24",
    });

    expect(result).toEqual({ id: 999 });
    expect(state.inserts).toHaveLength(1);
    expect(state.updates).toHaveLength(0);
  });
});
