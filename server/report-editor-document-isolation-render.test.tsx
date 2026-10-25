// @vitest-environment jsdom
// ADENDO 2 (parecer Manus sobre 5fea1cf): isolamento do documento no ReportEditorPage REAL.
//  1  A com rascunho exclusivo -> B sem laudo: tela, salvar, assinar, imprimir e baixar sem nada de A.
//  2  Retificação capturada em A não pode ser confirmada em B (troca de rota) nem em outro
//     laudo devolvido para a mesma rota.
//  3  financialView=1 em rascunho: botão indisponível e handler não gera PDF.
//  4  Gatilhos print=1 / download=1 disparam uma vez por documento, e de novo no documento seguinte.
// Somente dados SINTÉTICOS.
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

type FakeReport = { id: number; study_instance_uid: string; document_key: string; status: string; body: string; unit_id?: number };

const spies = vi.hoisted(() => ({
  create: vi.fn(async (_input: unknown) => ({ id: 901 })),
  update: vi.fn(async (_input: unknown) => ({})),
  sign: vi.fn(async (_input: unknown) => ({ doctor_amount_due: "0" })),
  revise: vi.fn(async (_input: unknown) => ({})),
  toastError: vi.fn(),
  windowOpen: vi.fn(),
  html2canvas: vi.fn(),
  pdfSave: vi.fn(),
  reports: new Map<string, unknown>(),
  printedHtml: [] as string[],
  capturedPages: [] as string[],
}));

vi.mock("wouter", () => ({ useLocation: () => [window.location.pathname, vi.fn()] }));
vi.mock("sonner", () => ({ toast: { error: spies.toastError, success: vi.fn(), info: vi.fn(), warning: vi.fn(), message: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 7, role: "medico", name: "Dr. Sintetico" } }) }));
vi.mock("html2canvas", () => ({
  default: (element: HTMLElement) => {
    spies.capturedPages.push(element.textContent ?? "");
    spies.html2canvas(element);
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "width", { value: 794 });
    Object.defineProperty(canvas, "height", { value: 1123 });
    canvas.toDataURL = () => "data:image/jpeg;base64,AAAA";
    return Promise.resolve(canvas);
  },
}));
vi.mock("jspdf", () => ({
  default: class { addImage() {} addPage() {} save(name: string) { spies.pdfSave(name); } output() { return ""; } internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } }; },
}));
vi.mock("@/lib/trpc", () => {
  const mutationFor = (path: string) => {
    const map: Record<string, unknown> = { "reports.create": spies.create, "reports.update": spies.update, "reports.sign": spies.sign, "reports.revise": spies.revise };
    return { mutateAsync: (map[path] as (input: unknown) => Promise<unknown>) ?? vi.fn(async () => ({})), mutate: vi.fn(), isPending: false };
  };
  const queryFor = (path: string, input: { studyInstanceUid?: string; documentKey?: string } | undefined) => {
    if (path === "reports.getByStudyUid" || path === "reports.getByStudyUidWithDoctor") {
      const report = spies.reports.get(`${input?.studyInstanceUid}|${input?.documentKey}`) ?? null;
      return { data: report, isLoading: false, refetch: vi.fn() };
    }
    if (/list|List/.test(path)) return { data: [], isLoading: false, refetch: vi.fn() };
    return { data: undefined, isLoading: false, refetch: vi.fn() };
  };
  const proxy = (path: string[]): unknown => new Proxy(function () {}, {
    get(_t, key: string) {
      if (key === "useQuery") return (input: never) => queryFor(path.join("."), input);
      if (key === "useMutation") return () => mutationFor(path.join("."));
      if (["invalidate", "refetch", "setData", "fetch"].includes(key)) return vi.fn(async () => undefined);
      if (key === "then") return undefined;
      return proxy([...path, key]);
    },
    apply() { return proxy(path); },
  });
  return { trpc: new Proxy({}, { get(_t, key: string) { return key === "useUtils" ? () => proxy(["utils"]) : proxy([key]); } }) };
});

import ReportEditorPage from "@/pages/ReportEditorPage";

const A = "1.2.826.0.1.3680043.SINT.ISO.A";
const B = "1.2.826.0.1.3680043.SINT.ISO.B";
const BODY_A = "CORPO_SINTETICO_EXCLUSIVO_DO_ESTUDO_ALFA";
const BODY_B = "CORPO_SINTETICO_DO_ESTUDO_BETA";
const session = (name: string, unitId = 9) => JSON.stringify({ patientName: name, patientBirthDate: "19800102", patientSex: "F", studyDate: "20261020", modality: "CT", studyDescription: `TC ${name}`, unitName: "UNIDADE TESTE", unitId });
const report = (id: number, uid: string, status: string, body: string): FakeReport => ({ id, study_instance_uid: uid, document_key: "primary", status, body: `<p>${body}</p>`, unit_id: 9 });

let container: HTMLDivElement;
let root: Root;

function fakePrintWindow() {
  const doc = document.implementation.createHTMLDocument("print");
  const originalWrite = doc.write.bind(doc);
  doc.write = ((html: string) => { spies.printedHtml.push(html); originalWrite(html); }) as typeof doc.write;
  return { document: doc, print: vi.fn(), close: vi.fn(), focus: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), setTimeout: window.setTimeout.bind(window), closed: false };
}

beforeEach(async () => {
  await h;
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  spies.windowOpen.mockImplementation(() => fakePrintWindow());
  window.open = spies.windowOpen as unknown as typeof window.open;
  document.execCommand = vi.fn(() => true);
  sessionStorage.clear();
  spies.reports.clear();
  spies.printedHtml.length = 0;
  spies.capturedPages.length = 0;
  for (const fn of [spies.create, spies.update, spies.sign, spies.revise, spies.toastError, spies.windowOpen, spies.html2canvas, spies.pdfSave]) fn.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

async function go(uid: string, query = "") {
  window.history.pushState({}, "", `/reports/create/${uid}${query}`);
  await act(async () => { root.render(<ReportEditorPage />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

const editables = () => Array.from(document.querySelectorAll<HTMLElement>("[contenteditable]"));
const button = (re: RegExp) => Array.from(document.querySelectorAll("button")).find((b) => re.test((b.textContent ?? "").trim()) || re.test(b.getAttribute("aria-label") ?? ""));
function invokeOnClick(el: Element | undefined) {
  expect(el, "botão existe").toBeTruthy();
  const key = Object.keys(el!).find((k) => k.startsWith("__reactProps$"))!;
  return (el as unknown as Record<string, { onClick: (e?: unknown) => unknown }>)[key].onClick({ preventDefault() {}, stopPropagation() {} });
}

describe("1 — corpo do laudo de A não sobrevive em B", () => {
  it("A com rascunho exclusivo → B válido sem laudo: tela, salvar, assinar, imprimir e baixar sem nada de A", async () => {
    sessionStorage.setItem(`study_${A}`, session("SINT^ALFA"));
    sessionStorage.setItem(`study_${B}`, session("SINT^BETA"));
    spies.reports.set(`${A}|primary`, report(11, A, "draft", BODY_A));

    await go(A);
    expect(editables().some((el) => el.innerHTML.includes(BODY_A)), "A hidratou o rascunho").toBe(true);

    await go(B);
    // Tela
    expect(document.body.innerHTML).not.toContain(BODY_A);
    for (const el of editables()) expect(el.innerHTML).not.toContain(BODY_A);

    // Salvar (sem digitar nada: corpo deve estar vazio, nunca o de A)
    await act(async () => { await invokeOnClick(button(/^Salvar/)); });
    for (const call of spies.create.mock.calls) expect(JSON.stringify(call)).not.toContain(BODY_A);
    for (const call of spies.update.mock.calls) expect(JSON.stringify(call)).not.toContain(BODY_A);

    // Assinar com conteúdo digitado em B
    editables().forEach((el) => { el.innerHTML = `<p>${BODY_B}</p>`; });
    await act(async () => { await invokeOnClick(button(/^Assinar/)); });
    const all = JSON.stringify([spies.create.mock.calls, spies.update.mock.calls, spies.sign.mock.calls]);
    expect(all).not.toContain(BODY_A);
    expect(all).not.toContain("ALFA");
    expect(all).toContain(BODY_B);
  });

  it("imprimir e baixar PDF em B (assinado) usam somente o corpo de B", async () => {
    sessionStorage.setItem(`study_${A}`, session("SINT^ALFA"));
    sessionStorage.setItem(`study_${B}`, session("SINT^BETA"));
    spies.reports.set(`${A}|primary`, report(11, A, "draft", BODY_A));
    spies.reports.set(`${B}|primary`, report(12, B, "signed", BODY_B));

    await go(A);
    await go(B);
    await act(async () => { await invokeOnClick(button(/^Imprimir/)); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(spies.windowOpen).toHaveBeenCalled();
    const printed = spies.printedHtml.join("\n") + (spies.windowOpen.mock.results.map((r) => (r.value as { document: Document }).document.documentElement.outerHTML).join("\n"));
    expect(printed).not.toContain(BODY_A);

    await go(B, "?financialView=1");
    await act(async () => { await invokeOnClick(button(/Baixar PDF/)); });
    expect(spies.capturedPages.join("\n")).not.toContain(BODY_A);
  });

  it("laudo devolvido pelo servidor que pertence a OUTRO estudo é ignorado e o editor fica limpo", async () => {
    sessionStorage.setItem(`study_${B}`, session("SINT^BETA"));
    // Servidor (ou cache) responde para B com o laudo de A.
    spies.reports.set(`${B}|primary`, report(11, A, "signed", BODY_A));
    await go(B);
    expect(document.body.innerHTML).not.toContain(BODY_A);
    expect(button(/^Retificar/)).toBeUndefined();
    editables().forEach((el) => { el.innerHTML = `<p>${BODY_B}</p>`; });
    await act(async () => { await invokeOnClick(button(/^Assinar/)); });
    expect(spies.update).not.toHaveBeenCalled(); // não atualiza o laudo 11 (de A)
    expect(JSON.stringify(spies.sign.mock.calls)).not.toContain('"id":11');
  });
});

describe("2 — retificação não atravessa documentos", () => {
  async function openReviseModal() {
    await act(async () => { await invokeOnClick(button(/^Retificar/)); });
    await act(async () => { await invokeOnClick(button(/^Salvar Retificação/)); });
    const textarea = document.querySelector("textarea");
    expect(textarea, "modal de motivo aberto").toBeTruthy();
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => { setValue.call(textarea, "Motivo sintetico de teste"); textarea!.dispatchEvent(new Event("input", { bubbles: true })); });
  }

  it("A assinado → modal aberto com corpo de A → navegar para B assinado: reviseReport nunca é chamado", async () => {
    sessionStorage.setItem(`study_${A}`, session("SINT^ALFA"));
    sessionStorage.setItem(`study_${B}`, session("SINT^BETA"));
    spies.reports.set(`${A}|primary`, report(21, A, "signed", BODY_A));
    spies.reports.set(`${B}|primary`, report(22, B, "signed", BODY_B));
    await go(A);
    await openReviseModal();
    const confirmA = button(/^Confirmar Retificação/);
    expect(confirmA).toBeTruthy();

    await go(B);
    // O modal de A não existe mais em B.
    expect(button(/^Confirmar Retificação/)).toBeUndefined();
    expect(document.querySelector("textarea")).toBeNull();
    // Mesmo invocando o handler capturado do botão antigo, nada é aplicado a B.
    try { await act(async () => { await invokeOnClick(confirmA); }); } catch { /* nó antigo desmontado */ }
    expect(spies.revise).not.toHaveBeenCalled();
  });

  it("mesma rota, mas o servidor passa a devolver OUTRO laudo: confirmação recusada", async () => {
    sessionStorage.setItem(`study_${A}`, session("SINT^ALFA"));
    spies.reports.set(`${A}|primary`, report(31, A, "signed", BODY_A));
    await go(A);
    await openReviseModal();
    // Ex.: nova ocorrência/retificação concorrente trocou o laudo ativo da rota.
    spies.reports.set(`${A}|primary`, report(32, A, "signed", "OUTRO_CORPO"));
    await act(async () => { root.render(<ReportEditorPage />); });
    await act(async () => { await invokeOnClick(button(/^Confirmar Retificação/)); });
    expect(spies.revise).not.toHaveBeenCalled();
    expect(spies.toastError.mock.calls.map((c) => String(c[0])).some((m) => m.includes("O documento mudou"))).toBe(true);
  });

  it("controle: no mesmo laudo, a retificação é enviada normalmente", async () => {
    sessionStorage.setItem(`study_${A}`, session("SINT^ALFA"));
    spies.reports.set(`${A}|primary`, report(41, A, "signed", BODY_A));
    await go(A);
    await openReviseModal();
    await act(async () => { await invokeOnClick(button(/^Confirmar Retificação/)); });
    expect(spies.revise).toHaveBeenCalledTimes(1);
    expect(spies.revise.mock.calls[0][0]).toMatchObject({ id: 41, reason: "Motivo sintetico de teste" });
  });
});

describe("3 — financialView=1 manual em rascunho", () => {
  it("botão Baixar PDF indisponível e handler não gera PDF", async () => {
    sessionStorage.setItem(`study_${A}`, session("SINT^ALFA"));
    spies.reports.set(`${A}|primary`, report(51, A, "draft", BODY_A));
    await go(A, "?financialView=1");
    const download = button(/Baixar PDF/);
    expect(download).toBeTruthy();
    expect((download as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { await invokeOnClick(download); });
    expect(spies.html2canvas).not.toHaveBeenCalled();
    expect(spies.pdfSave).not.toHaveBeenCalled();
    expect(spies.toastError.mock.calls.map((c) => String(c[0])).some((m) => m.includes("assinado ou retificado"))).toBe(true);
  });

  it("financialView=1 sem laudo nenhum: também bloqueado", async () => {
    sessionStorage.setItem(`study_${A}`, session("SINT^ALFA"));
    await go(A, "?financialView=1");
    await act(async () => { await invokeOnClick(button(/Baixar PDF/)); });
    expect(spies.html2canvas).not.toHaveBeenCalled();
    expect(spies.pdfSave).not.toHaveBeenCalled();
  });
});

describe("4 — gatilhos automáticos por documento", () => {
  it("print=1: uma vez em A (mesmo com re-render) e de novo em B", async () => {
    // print=1 imprime na PRÓPRIA janela (handlePrint(true)): interceptamos document.write
    // para não apagar a árvore de teste e contamos o que seria impresso.
    const writes: string[] = [];
    const originalWrite = document.write;
    const originalClose = document.close;
    document.write = ((html: string) => { writes.push(html); }) as typeof document.write;
    document.close = (() => {}) as typeof document.close;
    window.print = vi.fn();
    try {
      sessionStorage.setItem(`study_${A}`, session("SINT^ALFA"));
      sessionStorage.setItem(`study_${B}`, session("SINT^BETA"));
      spies.reports.set(`${A}|primary`, report(61, A, "signed", BODY_A));
      spies.reports.set(`${B}|primary`, report(62, B, "signed", BODY_B));
      await go(A, "?print=1");
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      // O HTML escrito é a casca da impressão (o corpo é materializado depois nas páginas
      // físicas); o <title> identifica o paciente do documento impresso.
      const printsOf = (body: string) => writes.filter((html) => html.includes(body === BODY_A ? "SINT ALFA" : "SINT BETA")).length;
      expect(printsOf(BODY_A), "A imprimiu uma vez").toBe(1);
      await act(async () => { root.render(<ReportEditorPage />); });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(printsOf(BODY_A), "A não imprime duas vezes").toBe(1);
      await go(B, "?print=1");
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(printsOf(BODY_B), "B imprime").toBe(1);
      expect(writes.filter((html) => html.includes("SINT ALFA") && html.includes("SINT BETA")).length, "nunca A e B juntos").toBe(0);
    } finally {
      document.write = originalWrite;
      document.close = originalClose;
    }
  });

  it("financialView=1&download=1: baixa A uma vez e B uma vez", async () => {
    sessionStorage.setItem(`study_${A}`, session("SINT^ALFA"));
    sessionStorage.setItem(`study_${B}`, session("SINT^BETA"));
    spies.reports.set(`${A}|primary`, report(71, A, "signed", BODY_A));
    spies.reports.set(`${B}|primary`, report(72, B, "signed", BODY_B));
    await go(A, "?financialView=1&download=1");
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const afterA = spies.pdfSave.mock.calls.length + spies.toastError.mock.calls.length;
    expect(afterA, "A tentou baixar").toBeGreaterThan(0);
    await act(async () => { root.render(<ReportEditorPage />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(spies.pdfSave.mock.calls.length + spies.toastError.mock.calls.length).toBe(afterA);
    await go(B, "?financialView=1&download=1");
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(spies.pdfSave.mock.calls.length + spies.toastError.mock.calls.length, "B tentou baixar").toBeGreaterThan(afterA);
  });
});
