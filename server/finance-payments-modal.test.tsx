import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  error: null as string | null,
  refetch: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1, role: "admin_master" } }) }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button> }));
vi.mock("@/components/ui/input", () => ({ Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} /> }));
vi.mock("lucide-react", () => ({ CheckCircle2: () => null, Clock: () => null, X: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ financeSimple: { doctorSummaryByUnit: { invalidate: vi.fn() }, unitSummary: { invalidate: vi.fn() }, dashboard: { invalidate: vi.fn() } } }),
    financeSimple: {
      eventsByDoctorUnit: {
        useQuery: () => state.error
          ? { data: undefined, isLoading: false, isError: true, error: new Error(state.error), refetch: state.refetch }
          : { data: [], isLoading: false, isError: false, error: null, refetch: state.refetch },
      },
      markDoctorPaid: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

import { LaudosModal } from "../client/src/pages/finance/FinanceModals";

function hasText(root: ReactTestInstance, text: string) {
  return root.findAll((node) => node.children.some((child) => typeof child === "string" && child.includes(text))).length > 0;
}

describe("modal de pagamentos", () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    state.error = null;
    state.refetch.mockReset();
  });

  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
  });

  it("apresenta erro e permite nova tentativa em vez de ocultar a falha como lista vazia", () => {
    state.error = "Detalhe financeiro indisponível";
    act(() => {
      renderer = create(<LaudosModal doctorUserId={5} unitId={12} referenceDate="2026-08-21T12:00:00.000Z" doctorName="Dra. Ana" onClose={vi.fn()} />);
    });

    expect(hasText(renderer.root, "Falha ao carregar os eventos financeiros.")).toBe(true);
    expect(hasText(renderer.root, "Detalhe financeiro indisponível")).toBe(true);
    const retry = renderer.root.findAllByType("button").find((button) => button.children.includes("Tentar novamente"));
    act(() => {
      retry?.props.onClick();
    });
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });
});
