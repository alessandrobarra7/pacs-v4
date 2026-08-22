import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  financeInputs: [] as Array<{ unit_id: number; reference_date: string }>,
}));

vi.mock("wouter", () => ({ useLocation: () => ["/financeiro/meu-financeiro", vi.fn()] }));
vi.mock("@/components/AppHeader", () => ({ AppHeader: ({ nav, unitSlot }: { nav?: React.ReactNode; unitSlot?: React.ReactNode }) => <header>{unitSlot}{nav}</header> }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    financeSimple: {
      myFinanceiroUnits: { useQuery: () => ({ data: [{ unit_id: 8, unit_name: "Unidade Teste", cycle_start_day: 1, cycle_end_day: 31 }], isLoading: false, isError: false, refetch: vi.fn() }) },
      myFinanceiro: { useQuery: (input: { unit_id: number; reference_date: string }) => {
        state.financeInputs.push(input);
        return {
          data: {
            summary: [{ unit_id: 8, unit_name: "Unidade Teste", cycle_start_date: "2026-08-01T00:00:00.000Z", cycle_end_date: "2026-09-01T00:00:00.000Z", cycle_start_display: "2026-08-01", cycle_end_display: "2026-08-31", doctor_total: 180, signed_report_count: 2 }],
            delivered_reports: [{ id: 17, patient_name: "ANA^SILVA", modality: "CT", document_label: "Tórax", status: "signed", signed_at: "2026-08-02T10:00:00.000Z", download_url: "https://example.test/report-17.pdf" }],
          },
          isLoading: false,
          isError: false,
          isFetching: false,
          refetch: vi.fn(),
        };
      } },
      myModalityPrices: { useQuery: () => ({ data: [{ modality: "CT", price_per_report: 90 }], isLoading: false, isError: false, refetch: vi.fn() }) },
    },
  },
}));

import FinanceMeuFinanceiro from "../client/src/pages/finance/FinanceMeuFinanceiro";

function hasText(root: ReactTestInstance, value: string) {
  return root.findAll((node) => node.children.some((child) => typeof child === "string" && child.includes(value))).length > 0;
}

describe("página financeira individual do médico", () => {
  let renderer: ReactTestRenderer;

  afterEach(() => act(() => renderer?.unmount()));

  it("mostra somente o resumo da unidade, o paciente e o download do próprio laudo", () => {
    state.financeInputs = [];
    act(() => { renderer = create(<FinanceMeuFinanceiro />); });

    expect(hasText(renderer.root, "Dados da unidade:")).toBe(true);
    expect(hasText(renderer.root, "Unidade Teste")).toBe(true);
    expect(hasText(renderer.root, "Laudos assinados no ciclo")).toBe(true);
    expect(hasText(renderer.root, "Repasses gerados no ciclo")).toBe(true);
    expect(hasText(renderer.root, "01/08/2026 a 31/08/2026")).toBe(true);
    expect(hasText(renderer.root, "ANA SILVA")).toBe(true);
    expect(hasText(renderer.root, "Baixar laudo")).toBe(true);
    expect(hasText(renderer.root, "Valores definidos pelo administrador")).toBe(true);
    expect(state.financeInputs.some((input) => input.unit_id === 8)).toBe(true);

    const link = renderer.root.findAllByType("a").find((node) => node.children.some((child) => typeof child === "string" && child.includes("Baixar laudo")));
    expect(link?.props.href).toBe("https://example.test/report-17.pdf");
  });
});
