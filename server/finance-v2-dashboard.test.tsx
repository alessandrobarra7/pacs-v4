import React, { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  unitSummaryInputs: [] as Array<{ reference_date: string }>,
  auditInputs: [] as Array<{ input: { unit_id: number; reference_date: string }; enabled: boolean | undefined }>,
  auditError: null as string | null,
  auditRefetch: vi.fn(),
}));

function Query<T>({ data, onQuery }: { data: T; onQuery?: (input: unknown, options: unknown) => void }) {
  return {
    useQuery: (input?: unknown, options?: unknown) => {
      onQuery?.(input, options);
      return { data, isLoading: false };
    },
  };
}

function Mutation() {
  return { useMutation: () => ({ isPending: false, mutate: vi.fn() }) };
}

vi.mock("wouter", () => ({
  useLocation: () => ["/financeiro/dashboard/hospital-da-crianca", vi.fn()],
  useRoute: () => [true, { unitSlug: "hospital-da-crianca" }],
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, role: "admin_master" } }),
}));

vi.mock("@/components/AppHeader", () => ({
  AppHeader: ({ nav }: { nav: ReactNode }) => <header>{nav}</header>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, variant: _variant, size: _size, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode; variant?: string; size?: string }) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("lucide-react", () => ({
  ArrowRight: () => null,
  Building2: () => null,
  CalendarDays: () => null,
  CheckCircle2: () => null,
  ChevronLeft: () => null,
  ChevronRight: () => null,
  Clock: () => null,
  Edit3: () => null,
  FileText: () => null,
  Loader2: () => null,
  ScrollText: () => null,
  Settings2: () => null,
  Stethoscope: () => null,
  X: () => null,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      financeSimple: {
        getUnitModalityPrices: { invalidate: vi.fn() },
        getUnitSystemRate: { invalidate: vi.fn() },
        getUnitDefaultPrices: { invalidate: vi.fn() },
        listDoctorModalityPrices: { invalidate: vi.fn() },
        unitSummary: { invalidate: vi.fn() },
      },
    }),
    financeSimple: {
      unitSummary: Query({
        data: [{ unit_id: 42, unit_name: "Hospital da Criança", cycle_label: "01/03 – 31/03", total_laudos: 2, system_total: 7, doctor_total: 38, system_pending: 7, doctor_pending: 38 }],
        onQuery: (input) => state.unitSummaryInputs.push(input as { reference_date: string }),
      }),
      getUnitDefaultPrices: Query({ data: { default_system_price: 3.5, default_doctor_price: 0 } }),
      getUnitSystemRate: Query({ data: { price_per_event: 3.5, configured: true, next_change_at: new Date("2026-04-01T00:00:00.000Z") } }),
      getUnitModalityPrices: Query({ data: [] }),
      doctorSummaryByUnit: Query({ data: [] }),
      listDoctorsForUnit: Query({ data: [] }),
      unitFinancialReadiness: Query({ data: { responsible_id: null } }),
      auditEventsByUnit: {
        useQuery: (input?: unknown, options?: unknown) => {
          state.auditInputs.push({
            input: input as { unit_id: number; reference_date: string },
            enabled: (options as { enabled?: boolean } | undefined)?.enabled,
          });
          return state.auditError
            ? { data: undefined, isLoading: false, isError: true, error: new Error(state.auditError), refetch: state.auditRefetch }
            : { data: { events: [] }, isLoading: false, isError: false, error: null, refetch: state.auditRefetch };
        },
      },
      listDoctorModalityPrices: Query({ data: [] }),
      setUnitSystemRate: Mutation(),
      setUnitModalityPrice: Mutation(),
      setDoctorModalityPrice: Mutation(),
    },
  },
}));

import FinanceDashboard from "../client/src/pages/finance/FinanceDashboard";

function hasText(root: ReactTestInstance, text: string) {
  return root.findAll((node: ReactTestInstance) => node.children.some((child: string | ReactTestInstance) => typeof child === "string" && child.includes(text))).length > 0;
}

describe("Painel Financeiro v2", () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    state.unitSummaryInputs = [];
    state.auditInputs = [];
    state.auditError = null;
    state.auditRefetch.mockReset();
  });

  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
  });

  it("renderiza o detalhe da unidade com as métricas operacionais retornadas pela consulta", () => {
    act(() => {
      renderer = create(<FinanceDashboard />);
    });

    expect(hasText(renderer.root, "Hospital da Criança")).toBe(true);
    expect(hasText(renderer.root, "Eventos no ciclo")).toBe(true);
    expect(hasText(renderer.root, "Soma para o sistema")).toBe(true);
    expect(hasText(renderer.root, "Soma dos valores registrados nos eventos do ciclo")).toBe(true);
    expect(hasText(renderer.root, "Taxa LAUDS × eventos do ciclo")).toBe(false);
    expect(hasText(renderer.root, "Margem atual")).toBe(false);
    expect(hasText(renderer.root, "Total de repasses médicos")).toBe(false);
  });

  it("abre o log usando exatamente a referência mensal que alimenta o indicador", () => {
    act(() => {
      renderer = create(<FinanceDashboard />);
    });
    const panelReference = state.unitSummaryInputs.at(-1)?.reference_date;
    const logButton = renderer.root.findAllByType("button").find((button: ReactTestInstance) => button.children.includes("Ver log do ciclo"));

    expect(panelReference).toBeTruthy();
    expect(logButton).toBeTruthy();

    act(() => {
      logButton?.props.onClick();
    });

    expect(state.auditInputs.find((call) => call.enabled === true)).toEqual({
      input: { unit_id: 42, reference_date: panelReference },
      enabled: true,
    });
  });

  it("apresenta falha e permite nova tentativa em vez de ocultar o erro como lista vazia", () => {
    state.auditError = "Consulta financeira indisponível";
    act(() => {
      renderer = create(<FinanceDashboard />);
    });
    const logButton = renderer.root.findAllByType("button").find((button: ReactTestInstance) => button.children.includes("Ver log do ciclo"));
    act(() => {
      logButton?.props.onClick();
    });

    expect(hasText(renderer.root, "Falha ao carregar o log auditável.")).toBe(true);
    expect(hasText(renderer.root, "Consulta financeira indisponível")).toBe(true);
    const retryButton = renderer.root.findAllByType("button").find((button: ReactTestInstance) => button.children.includes("Tentar novamente"));
    act(() => {
      retryButton?.props.onClick();
    });
    expect(state.auditRefetch).toHaveBeenCalledTimes(1);
  });
});
