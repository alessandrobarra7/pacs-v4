import { describe, expect, it } from "vitest";
import { combineDoctorCycleEventTotals } from "./db";

describe("mostrador financeiro do médico", () => {
  it("soma o evento de catálogo ativo ao total do ciclo mesmo sem evento legado", () => {
    expect(combineDoctorCycleEventTotals(
      { events: 0, amount: "0.00" },
      { events: 1, amount: "10.00" },
    )).toEqual({ events: 1, amount: 10 });
  });

  it("preserva a soma de fontes legada e de catálogo em centavos exatos", () => {
    expect(combineDoctorCycleEventTotals(
      { events: "2", amount: "44.10" },
      { events: 1, amount: "10.25" },
    )).toEqual({ events: 3, amount: 54.35 });
  });

  it("trata agregados nulos como ciclo sem eventos", () => {
    expect(combineDoctorCycleEventTotals(
      { events: null, amount: null },
      { events: null, amount: null },
    )).toEqual({ events: 0, amount: 0 });
  });
});
