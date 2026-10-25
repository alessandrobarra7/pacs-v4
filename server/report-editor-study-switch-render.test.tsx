// @vitest-environment jsdom
// ADENDO (parecer Manus 50a9ef3): comportamento REAL do ReportEditorPage em jsdom.
//  A/B/C — troca de UID sem remontar: nada do Estudo A sobrevive no Estudo B
//          (chave ausente ou JSON inválido), com estado transitório "Carregando…".
//  D     — sem estudo resolvido, salvar/assinar/imprimir/baixar não executam nada,
//          e com estudo válido os payloads levam só dados do estudo atual.
//  E     — datas undefined / vazias / só espaços / DICOM nas saídas de tela.
// Só dados SINTÉTICOS. Nenhum dado clínico real.
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(async () => {
  const ReactModule = await import("react");
  (globalThis as unknown as { React: unknown }).React = ReactModule.default ?? ReactModule;
  return {};
});

const spies = vi.hoisted(() => ({
  create: vi.fn(async () => ({ id: 101 })),
  update: vi.fn(async () => ({})),
  sign: vi.fn(async () => ({ doctor_amount_due: "0" })),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  windowOpen: vi.fn(() => null),
  existingReport: undefined as unknown,
}));

vi.mock("wouter", () => ({ useLocation: () => [window.location.pathname, vi.fn()] }));
vi.mock("sonner", () => ({ toast: { error: spies.toastError, success: spies.toastSuccess, info: vi.fn(), warning: vi.fn(), message: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 7, role: "medico", name: "Dr. Sintetico" } }) }));
vi.mock("@/lib/trpc", () => {
  const mutationFor = (path: string) => {
    if (path === "reports.create") return { mutateAsync: spies.create, mutate: vi.fn(), isPending: false };
    if (path === "reports.update") return { mutateAsync: spies.update, mutate: vi.fn(), isPending: false };
    if (path === "reports.sign") return { mutateAsync: spies.sign, mutate: vi.fn(), isPending: false };
    return { mutateAsync: vi.fn(async () => ({})), mutate: vi.fn(), isPending: false };
  };
  const queryFor = (path: string) => {
    if (path === "reports.getByStudyUid") return { data: spies.existingReport, isLoading: false, refetch: vi.fn() };
    if (/list|List/.test(path)) return { data: [], isLoading: false, refetch: vi.fn() };
    return { data: undefined, isLoading: false, refetch: vi.fn() };
  };
  const proxy = (path: string[]): unknown => new Proxy(function () {}, {
    get(_t, key: string) {
      if (key === "useQuery") return () => queryFor(path.join("."));
      if (key === "useMutation") return () => mutationFor(path.join("."));
      if (key === "invalidate" || key === "refetch" || key === "setData" || key === "fetch") return vi.fn(async () => undefined);
      if (key === "then") return undefined;
      return proxy([...path, key]);
    },
    apply() { return proxy(path); },
  });
  return { trpc: new Proxy({}, { get(_t, key: string) { return key === "useUtils" ? () => proxy(["utils"]) : proxy([key]); } }) };
});

import ReportEditorPage from "@/pages/ReportEditorPage";

const STUDY_A = "1.2.826.0.1.3680043.SINT.A";
const STUDY_B = "1.2.826.0.1.3680043.SINT.B";
const sessionA = {
  patientName: "PACIENTE^SINTETICO^ALFA",
  patientBirthDate: "19800102",
  patientSex: "F",
  studyDate: "20261020",
  modality: "CT",
  studyDescription: "TC SINTETICA ALFA",
  unitName: "UNIDADE TESTE",
  unitId: 9,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  await h;
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  window.matchMedia = ((query: string) => ({ matches: query.includes("max-width"), media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  window.open = spies.windowOpen as unknown as typeof window.open;
  document.execCommand = vi.fn(() => true);
  sessionStorage.clear();
  spies.existingReport = undefined;
  Object.values(spies).forEach((value) => { if (typeof value === "function" && "mockClear" in value) (value as ReturnType<typeof vi.fn>).mockClear(); });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

async function openStudy(uid: string, { flush = true } = {}) {
  window.history.pushState({}, "", `/reports/create/${uid}`);
  if (flush) {
    await act(async () => { root.render(<ReportEditorPage />); });
  } else {
    // Render síncrono SEM descarregar efeitos: captura o primeiro frame após a troca de UID.
    act(() => { root.render(<ReportEditorPage />); }); // act descarrega; usado só quando necessário
  }
}

const pageText = () => document.body.textContent ?? "";
const buttonsByText = (re: RegExp) => Array.from(document.querySelectorAll("button")).filter((b) => re.test(b.textContent ?? "") || re.test(b.getAttribute("aria-label") ?? "") || re.test(b.title ?? ""));
const allSpiesIdle = () => {
  expect(spies.create).not.toHaveBeenCalled();
  expect(spies.update).not.toHaveBeenCalled();
  expect(spies.sign).not.toHaveBeenCalled();
  expect(spies.windowOpen).not.toHaveBeenCalled();
};

describe("ReportEditorPage — troca de estudo sem vazamento A→B (bloqueio 1)", () => {
  it("A válido → B sem chave: nada de A aparece; estado final 'Dados do estudo indisponíveis'", async () => {
    sessionStorage.setItem(`study_${STUDY_A}`, JSON.stringify(sessionA));
    await openStudy(STUDY_A);
    expect(pageText()).toContain("PACIENTE SINTETICO ALFA");
    expect(pageText()).toContain("02/01/1980");

    await openStudy(STUDY_B);
    const text = pageText();
    expect(text).not.toContain("PACIENTE SINTETICO ALFA");
    expect(text).not.toContain("02/01/1980");
    expect(text).not.toContain("20/10/2026");
    expect(text).not.toContain("TC SINTETICA ALFA");
    expect(text).toContain("Dados do estudo indisponíveis");
  });

  it("A válido → B com JSON inválido: mesmo resultado", async () => {
    sessionStorage.setItem(`study_${STUDY_A}`, JSON.stringify(sessionA));
    sessionStorage.setItem(`study_${STUDY_B}`, "{isto-nao-e-json");
    await openStudy(STUDY_A);
    await openStudy(STUDY_B);
    expect(pageText()).not.toContain("PACIENTE SINTETICO ALFA");
    expect(pageText()).toContain("Dados do estudo indisponíveis");
  });

  it("A válido → B com JSON que não é objeto (array/número): tratado como inválido", async () => {
    sessionStorage.setItem(`study_${STUDY_A}`, JSON.stringify(sessionA));
    sessionStorage.setItem(`study_${STUDY_B}`, "[1,2,3]");
    await openStudy(STUDY_A);
    await openStudy(STUDY_B);
    expect(pageText()).not.toContain("PACIENTE SINTETICO ALFA");
    expect(pageText()).toContain("Dados do estudo indisponíveis");
  });

  it("estado transitório: primeiro render do novo UID já não tem A e mostra 'Carregando…'", async () => {
    sessionStorage.setItem(`study_${STUDY_A}`, JSON.stringify(sessionA));
    await openStudy(STUDY_A);
    window.history.pushState({}, "", `/reports/create/${STUDY_B}`);
    // Captura o HTML do primeiro commit (antes do efeito de leitura do UID B rodar).
    let firstCommitText = "";
    const Probe = () => {
      React.useLayoutEffect(() => { firstCommitText = document.body.textContent ?? ""; });
      return null;
    };
    await act(async () => { root.render(<><ReportEditorPage /><Probe /></>); });
    expect(firstCommitText).not.toContain("PACIENTE SINTETICO ALFA");
    expect(firstCommitText).toContain("Carregando…");
    expect(pageText()).toContain("Dados do estudo indisponíveis");
  });
});

describe("ReportEditorPage — ações bloqueadas sem estudo resolvido (bloqueio 2)", () => {
  it("botões de salvar, assinar e imprimir/baixar ficam desabilitados", async () => {
    await openStudy(STUDY_B);
    const actions = buttonsByText(/Salvar|Assinar|Imprimir|Baixar PDF/i);
    expect(actions.length).toBeGreaterThan(0);
    for (const button of actions) expect(button.disabled, button.textContent ?? button.title).toBe(true);
  });

  it("handlers revalidam: forçar o clique não chama mutações nem abre janela de impressão", async () => {
    await openStudy(STUDY_B);
    // O React não despacha onClick de botão com a prop disabled, então chamamos o
    // handler ligado ao botão diretamente — é o que aconteceria se a UI ficasse
    // habilitada por engano. A guarda precisa existir DENTRO do handler.
    const invoked: string[] = [];
    for (const button of buttonsByText(/Salvar|Assinar|Imprimir|Baixar PDF/i)) {
      const propsKey = Object.keys(button).find((key) => key.startsWith("__reactProps$"));
      const onClick = propsKey ? (button as unknown as Record<string, { onClick?: (event?: unknown) => unknown }>)[propsKey].onClick : undefined;
      if (!onClick) continue;
      invoked.push(button.textContent?.trim() || button.title || "?");
      await act(async () => { await onClick({ preventDefault() {}, stopPropagation() {} }); });
    }
    expect(invoked.length).toBeGreaterThanOrEqual(3);
    allSpiesIdle();
    expect(spies.toastError).toHaveBeenCalled();
    const messages = spies.toastError.mock.calls.map((call) => String(call[0]));
    expect(messages.some((m) => m.includes("os dados do estudo não estão disponíveis"))).toBe(true);
  });

  it("com estudo B válido, assinar envia somente dados de B (nenhum dado de A no payload)", async () => {
    sessionStorage.setItem(`study_${STUDY_A}`, JSON.stringify(sessionA));
    sessionStorage.setItem(`study_${STUDY_B}`, JSON.stringify({ ...sessionA, patientName: "PACIENTE^SINTETICO^BETA", studyDate: "20261021", studyDescription: "TC SINTETICA BETA", unitId: 10 }));
    await openStudy(STUDY_A);
    await openStudy(STUDY_B);
    // Preenche o corpo editável visível para permitir assinar.
    const editable = Array.from(document.querySelectorAll<HTMLElement>("[data-editor-content][contenteditable='true']"));
    expect(editable.length).toBeGreaterThan(0);
    editable.forEach((el) => { el.innerHTML = "<p>Laudo sintetico de teste.</p>"; });
    const sign = buttonsByText(/Assinar/i).find((b) => !b.disabled);
    expect(sign).toBeTruthy();
    await act(async () => { sign!.click(); });
    expect(spies.sign).toHaveBeenCalledTimes(1);
    const payload = JSON.stringify((spies.sign.mock.calls[0] as unknown[])[0]) + JSON.stringify(spies.create.mock.calls);
    expect(payload).toContain("PACIENTE^SINTETICO^BETA");
    expect(payload).toContain("20261021");
    expect(payload).not.toContain("ALFA");
    expect(payload).not.toContain("20261020");
  });
});

/** Valores exibidos em cada campo de data, em TODAS as folhas/cartões presentes na tela. */
function dateFieldValues() {
  const values: Record<string, string[]> = { nascimentoFolha: [], dataFolha: [], nascimentoMobile: [] };
  // Folha desktop (simples e multisseção): <span><span>Rótulo:</span> valor</span>
  for (const label of Array.from(document.querySelectorAll("span"))) {
    const name = label.textContent?.trim();
    const parent = label.parentElement;
    if (!parent || parent.firstElementChild !== label) continue;
    const value = (parent.textContent ?? "").slice((label.textContent ?? "").length).trim();
    if (name === "Data de nascimento:") values.nascimentoFolha.push(value);
    if (name === "Data:") values.dataFolha.push(value);
  }
  // Cartão mobile: <span>Nascimento:</span><p>valor</p>
  for (const label of Array.from(document.querySelectorAll("span"))) {
    if (label.textContent?.trim() !== "Nascimento:") continue;
    const value = label.nextElementSibling?.textContent?.trim() ?? "";
    values.nascimentoMobile.push(value);
  }
  return values;
}

describe("ReportEditorPage — datas neutras em todos os layouts da tela (bloqueio 3)", () => {
  const cases: Array<[string, string | undefined, string]> = [
    ["undefined", undefined, "—"],
    ["vazia", "", "—"],
    ["só espaços", "   ", "—"],
    ["DICOM válida", "19800102", "02/01/1980"],
  ];

  for (const multi of [false, true]) {
    for (const [label, value, expected] of cases) {
      it(`${multi ? "multisseção" : "documento simples"} — data ${label} → '${expected}' em nascimento (folha e mobile) e data do estudo`, async () => {
        const info: Record<string, unknown> = { ...sessionA, patientBirthDate: value, studyDate: value };
        if (value === undefined) { delete info.patientBirthDate; delete info.studyDate; }
        if (multi) info.examNames = ["EXAME SINTETICO UM", "EXAME SINTETICO DOIS"];
        sessionStorage.setItem(`study_${STUDY_A}`, JSON.stringify(info));
        await openStudy(STUDY_A);
        const fields = dateFieldValues();
        expect(fields.nascimentoFolha.length, "folha desktop renderizada").toBeGreaterThan(0);
        expect(fields.dataFolha.length).toBeGreaterThan(0);
        expect(fields.nascimentoMobile.length, "cartão mobile renderizado").toBeGreaterThan(0);
        for (const v of [...fields.nascimentoFolha, ...fields.dataFolha, ...fields.nascimentoMobile]) {
          expect(v).toBe(expected);
          expect(v).not.toBe(new Date().toLocaleDateString("pt-BR"));
        }
      });
    }
  }
});
