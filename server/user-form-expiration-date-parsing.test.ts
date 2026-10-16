/**
 * Regressão comportamental — UserFormDialog: parsing de expiration_date na
 * edição (Parecer técnico 2026-10-15, Bloqueio 2 — "modal de edição
 * transforma uma data válida em NaN-NaN-NaN").
 *
 * O bug original era:
 *   const d = new Date(Number(user.expiration_date));
 * Para uma string de calendário "YYYY-MM-DD" (o formato real gravado por
 * users.expiration_date, coluna date() sem "mode" no drizzle-orm/mysql-core),
 * Number(string) é NaN, então o campo do formulário acabava recebendo o
 * texto literal "NaN-NaN-NaN" mesmo para uma data válida e corretamente
 * persistida.
 *
 * Este teste importa a função pura exportada por UserFormDialog.tsx
 * (formatExpirationDateForInput) — não grep de source — e prova os 5
 * cenários exigidos pelo parecer. Como o projeto não tem testing-library/
 * jsdom configurado para montar componentes React de verdade (convenção já
 * registrada em create-user-interface-wiring.test.ts), o teste de helper
 * puro é a via explicitamente aceita pelo próprio parecer ("teste de
 * interface OU helper puro").
 */
import { describe, expect, it } from "vitest";
import { formatExpirationDateForInput } from "../client/src/components/UserFormDialog";

describe("UserFormDialog — formatExpirationDateForInput (Bloqueio 2, parecer 2026-10-15)", () => {
  it("1. '2026-12-30' aparece como '2026-12-30' no campo do formulário", () => {
    expect(formatExpirationDateForInput("2026-12-30")).toBe("2026-12-30");
  });

  it("2. '2024-02-29' (data bissexta válida) aparece preservada", () => {
    expect(formatExpirationDateForInput("2024-02-29")).toBe("2024-02-29");
  });

  it("3. valor nulo/vazio/undefined mantém o campo vazio", () => {
    expect(formatExpirationDateForInput(null)).toBe("");
    expect(formatExpirationDateForInput(undefined)).toBe("");
    expect(formatExpirationDateForInput("")).toBe("");
  });

  it('4. nunca produz o texto "NaN-NaN-NaN" para nenhuma data de calendário válida', () => {
    const samples = ["2026-12-30", "2024-02-29", "2026-01-01", "2030-06-15", "2026-02-28"];
    for (const value of samples) {
      const result = formatExpirationDateForInput(value);
      expect(result).not.toContain("NaN");
      expect(result).toBe(value);
    }
  });

  it("4b. equivalente ao bug original: new Date(Number(string)) É NaN-NaN-NaN para estas strings — prova que o bug é real e que o helper o evita", () => {
    for (const value of ["2026-12-30", "2024-02-29"]) {
      const buggy = new Date(Number(value));
      const yyyy = buggy.getUTCFullYear();
      const mm = String(buggy.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(buggy.getUTCDate()).padStart(2, "0");
      expect(`${yyyy}-${mm}-${dd}`).toBe("NaN-NaN-NaN");
      // o helper real não reproduz esse bug:
      expect(formatExpirationDateForInput(value)).not.toBe("NaN-NaN-NaN");
    }
  });

  it("5. salvar uma edição sem alterar a data não corrompe nem remove o valor (idempotência: formatar o próprio resultado dá o mesmo valor)", () => {
    const original = "2026-12-30";
    const displayed = formatExpirationDateForInput(original);
    expect(displayed).toBe(original);
    // O valor exibido, se reenviado ao formatador (ex.: reabrir o modal sem
    // mudanças), continua estável — não degrada em chamadas sucessivas.
    expect(formatExpirationDateForInput(displayed)).toBe(original);
  });

  it("também aceita, defensivamente, um valor Date (registro legado serializado), sem reinterpretar timezone", () => {
    const d = new Date(Date.UTC(2026, 11, 30)); // 2026-12-30 UTC
    expect(formatExpirationDateForInput(d)).toBe("2026-12-30");
  });

  it("um valor Date inválido (Invalid Date) resulta em campo vazio, nunca em NaN-NaN-NaN", () => {
    const invalid = new Date("not-a-date");
    expect(formatExpirationDateForInput(invalid)).toBe("");
  });

  it("tolera timestamp ISO com hora (ex.: vindo de uma serialização diferente) preservando só a parte de calendário", () => {
    expect(formatExpirationDateForInput("2026-12-30T00:00:00.000Z")).toBe("2026-12-30");
  });
});
