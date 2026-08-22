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
            delivered_reports: [{ id: 17, patient_name: "ANA^SILVA", modality: "CT", document_label: "Tórax", status: "signed", signed_at: "2026-08-02T10:00:00.000Z", print_target: { unit_id: 8, study_instance_uid: "1.2.3", document_key: "primary", document_label: "Tórax", patient_name: "ANA^SILVA", modality: "CT", study_description: "Tórax" } }],
          },
          isLoading: false,
          isError: false,
          isFetching: false,
          refetch: vi.fn(),
        };
      } },
      myModalityPrices: { useQuery: () => ({ data: [{ modality: "CT", price_per_report: 90, source: "individual", source_label: "Valor individual definido para você" }], isLoading: false, isError: false, refetch: vi.fn() }) },
    },
  },
}));

import FinanceMeuFinanceiro from "../client/src/pages/finance/FinanceMeuFinanceiro";

function hasText(root: ReactTestInstance, value: string) {
  return root.findAll((node) => node.children.some((child) => typeof child === "string" && child.includes(value))).length > 0;
}

describe("página financeira individual do médico", () => {
  let renderer: ReactTestRenderer;

  afterEach(() => {
    act(() => renderer?.unmount());
    vi.unstubAllGlobals();
  });

  it("mostra somente a navegação essencial, o resumo da unidade, o paciente e a impressão configurada do próprio laudo", () => {
    state.financeInputs = [];
    act(() => { renderer = create(<FinanceMeuFinanceiro />); });

    expect(hasText(renderer.root, "Unidade:")).toBe(true);
    expect(hasText(renderer.root, "Unidade Teste")).toBe(true);
    expect(hasText(renderer.root, "Laudos assinados no ciclo")).toBe(true);
    expect(hasText(renderer.root, "Repasses gerados no ciclo")).toBe(true);
    expect(hasText(renderer.root, "01/08/2026 a 31/08/2026")).toBe(true);
    expect(hasText(renderer.root, "ANA SILVA")).toBe(true);
    expect(renderer.root.findAllByType("input").some((node) => node.props.placeholder === "Buscar paciente ou exame")).toBe(true);
    expect(hasText(renderer.root, "Baixar PDF")).toBe(true);
    expect(hasText(renderer.root, "Valores definidos pelo administrador")).toBe(true);
    const header = renderer.root.findAllByType("header")[0];
    expect(hasText(header, "Estudos")).toBe(true);
    expect(hasText(header, "Financeiro")).toBe(true);
    expect(hasText(header, "Meus laudos")).toBe(false);
    expect(hasText(header, "Minha configuração")).toBe(false);
    expect(state.financeInputs.some((input) => input.unit_id === 8)).toBe(true);

    expect(renderer.root.findAllByType("button").some((node) => node.children.some((child) => typeof child === "string" && child.includes("Baixar PDF")))).toBe(true);
    expect(renderer.root.findAllByType("button").some((node) => String(node.props.className).includes("w-full"))).toBe(true);
  });

  it("filtra os próprios laudos localmente e baixa pelo modo financeiro sem abrir nova aba", () => {
    const setItem = vi.fn();
    const setAttribute = vi.fn();
    const appendChild = vi.fn();
    const downloadFrame = { setAttribute, tabIndex: 0, style: {}, src: "" };
    vi.stubGlobal("sessionStorage", { setItem });
    vi.stubGlobal("document", { createElement: vi.fn(() => downloadFrame), body: { appendChild } });
    act(() => { renderer = create(<FinanceMeuFinanceiro />); });

    const search = renderer.root.findByType("input");
    act(() => search.props.onChange({ target: { value: "Paciente inexistente" } }));
    expect(hasText(renderer.root, "Nenhum laudo encontrado para a busca.")).toBe(true);

    act(() => renderer.root.findByType("input").props.onChange({ target: { value: "ANA" } }));
    const printButton = renderer.root.findAllByType("button").find((node) => node.children.some((child) => typeof child === "string" && child.includes("Baixar PDF")));
    expect(printButton).toBeDefined();
    act(() => printButton?.props.onClick());

    expect(setItem).toHaveBeenCalledWith("study_1.2.3", expect.stringContaining("ANA^SILVA"));
    expect(document.createElement).toHaveBeenCalledWith("iframe");
    expect(appendChild).toHaveBeenCalledWith(downloadFrame);
    expect(downloadFrame.src).toContain("financialView=1");
    expect(downloadFrame.src).toContain("download=1");
    expect(downloadFrame.src).not.toContain("print=1");
  });
});
