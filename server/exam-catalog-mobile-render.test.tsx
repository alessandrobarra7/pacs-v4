// @vitest-environment jsdom
// ADENDO (revisão f0548a7): renderização real da página do Catálogo em jsdom.
//  - bloqueio 1: a contagem exibida bate com os cartões na tela e reinicia ao filtrar;
//  - bloqueio 2: ao abrir Criar/Editar o foco entra no dialog (título), o campo de nome
//    não é focado, Tab fica preso no dialog e Escape devolve o foco ao gatilho.
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// O vitest compila o JSX com o runtime clássico (React.createElement); a página não importa
// React explicitamente porque o Vite do app usa o runtime automático. Expõe React global.
const state = vi.hoisted(async () => {
  const ReactModule = await import("react");
  (globalThis as unknown as { React: unknown }).React = ReactModule.default ?? ReactModule;
  return { entries: [] as unknown[] };
});

vi.mock("wouter", () => ({ useLocation: () => ["/admin", vi.fn()] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
let currentEntries: unknown[] = [];
const resolvedEntries = () => currentEntries;
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
    trpc: {
      useUtils: () => ({ examCatalog: { list: { invalidate: vi.fn() } } }),
      examCatalog: {
        list: { useQuery: () => ({ data: resolvedEntries(), isLoading: false }) },
        listUnits: { useQuery: () => ({ data: [] }) },
        save: { useMutation: mutation },
        removePacsMapping: { useMutation: mutation },
      },
    },
  };
});

import ExamCatalogPage from "@/pages/ExamCatalogPage";

function makeEntries(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    exam_name: `EXAME ${String(i + 1).padStart(3, "0")}`,
    modality: i === 0 ? "CT" : "CR",
    bilateral: false,
    sort_order: i,
    is_active: true,
    financial_event_count: 1,
    documents: [{ id: i + 1, document_key: "principal", document_label: "Laudo", sort_order: 0 }],
    pacsMappings: [],
    unavailableUnitIds: [],
  }));
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // Radix usa APIs que o jsdom não implementa.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  window.matchMedia = window.matchMedia || ((() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

async function render(n: number) {
  await state;
  currentEntries = makeEntries(n);
  await act(async () => { root.render(<ExamCatalogPage embedded />); });
}

const configButtons = () => Array.from(document.querySelectorAll("button")).filter((b) => b.textContent?.trim() === "Configurar");
const findButton = (text: string) => Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim().startsWith(text));
const statusText = () => Array.from(document.querySelectorAll("p")).find((p) => p.textContent?.startsWith("Exibindo"))?.textContent;

async function click(el: Element | undefined | null) {
  expect(el).toBeTruthy();
  await act(async () => { (el as HTMLElement).click(); });
}

describe("Catálogo — paginação renderizada (bloqueio 1)", () => {
  it("60 resultados: 60 cartões, sem Mostrar mais", async () => {
    await render(60);
    expect(configButtons()).toHaveLength(60);
    expect(findButton("Mostrar mais")).toBeUndefined();
  });

  it("61 resultados: após um clique mostra 61 cartões e 'Exibindo 61 de 61'", async () => {
    await render(61);
    expect(configButtons()).toHaveLength(60);
    expect(statusText()).toBe("Exibindo 60 de 61");
    await click(findButton("Mostrar mais"));
    expect(configButtons()).toHaveLength(61);
    expect(statusText()).toBe("Exibindo 61 de 61");
    expect(findButton("Mostrar mais")).toBeUndefined();
  });

  it("121 resultados: 120 de 121 e depois 121 de 121", async () => {
    await render(121);
    await click(findButton("Mostrar mais"));
    expect(statusText()).toBe("Exibindo 120 de 121");
    await click(findButton("Mostrar mais"));
    expect(configButtons()).toHaveLength(121);
    expect(statusText()).toBe("Exibindo 121 de 121");
  });

  it("alterar a busca depois de expandir volta ao primeiro bloco com a contagem do novo filtro", async () => {
    await render(121);
    await click(findButton("Mostrar mais"));
    expect(configButtons()).toHaveLength(120);
    const search = document.querySelector<HTMLInputElement>('input[placeholder="Buscar legenda canônica"]');
    expect(search).toBeTruthy();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setValue.call(search, "EXAME 0");
      search!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // "EXAME 0" casa EXAME 001..099 = 99 resultados -> volta para 60.
    expect(configButtons()).toHaveLength(60);
    expect(statusText()).toBe("Exibindo 60 de 99");
  });
});

describe("Catálogo — foco do modal (bloqueio 2)", () => {
  async function openAndCheck(trigger: HTMLElement, title: string) {
    trigger.focus();
    await click(trigger);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    const active = document.activeElement as HTMLElement;
    expect(dialog!.contains(active)).toBe(true);
    expect(active.textContent).toBe(title);
    expect(active.tagName).toBe("H2");
    expect(active.tagName).not.toBe("INPUT");
    return dialog as HTMLElement;
  }

  it("Editar: foco no título dentro do dialog, nome não focado; Escape devolve ao gatilho", async () => {
    await render(3);
    const trigger = configButtons()[0];
    const dialog = await openAndCheck(trigger, "Editar exame canônico");
    const nameInput = dialog.querySelector("input");
    expect(document.activeElement).not.toBe(nameInput);
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    // O FocusScope do Radix devolve o foco ao gatilho num setTimeout(0) após desmontar.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("Criar: foco no título 'Novo exame canônico'", async () => {
    await render(3);
    await openAndCheck(findButton("Novo exame") as HTMLElement, "Novo exame canônico");
  });

  it("Tab e Shift+Tab ficam presos no dialog (FocusScope com loop)", async () => {
    await render(3);
    const dialog = await openAndCheck(configButtons()[0], "Editar exame canônico");
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [href]'));
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    last.focus();
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })); });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(first);
    first.focus();
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })); });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(last);
  });
});
