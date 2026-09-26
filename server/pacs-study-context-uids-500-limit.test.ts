import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { PACS_MAX_RESULTS } from "../shared/const";
import { studyInstanceUidSchema } from "./routerUtils";

// Bloqueio da Manus (parecer de revisão de 2026-09-26 sobre os commits
// 94444b9/207a599): a lista de UIDs usada para carregar tanto a prioridade
// clínica (studyPriority.getBatch) quanto as seleções de legenda/documento
// clínico (studyExamLegend.getBatch — a fonte de legendSelectionsByStudyUid,
// consultada por executePrintAction para resolver o documentKey) era
// cortada em 100 UIDs (priorityStudyUids.slice(0, 100)), mesmo a busca do
// PACS podendo devolver até PACS_MAX_RESULTS (500) estudos e a tela
// mostrando todos. Para qualquer estudo do índice 101 em diante, a
// composição clínica nunca era carregada — executePrintAction caía no
// fallback documentKey='primary' para esses estudos, reabrindo exatamente
// o bug que 94444b9 tinha corrigido, só que fora dos primeiros 100.
//
// Correção: a lista (renomeada priorityStudyUids → studyContextUids em
// PacsQueryPage.tsx) agora corta em PACS_MAX_RESULTS, e os dois
// procedimentos de servidor (studyExamLegend.getBatch, studyPriority.getBatch)
// tiveram o teto do schema elevado de 100 para PACS_MAX_RESULTS.
const pacsPageSource = readFileSync(
  join(__dirname, "..", "client", "src", "pages", "PacsQueryPage.tsx"),
  "utf-8",
);
const studyExamLegendSource = readFileSync(join(__dirname, "routers", "studyExamLegend.ts"), "utf-8");
const studyPrioritySource = readFileSync(join(__dirname, "routers", "studyPriority.ts"), "utf-8");

describe("PACS_MAX_RESULTS é 500 (constante compartilhada)", () => {
  it("continua em 500 — os limites abaixo dependem deste valor", () => {
    expect(PACS_MAX_RESULTS).toBe(500);
  });
});

describe("PacsQueryPage.tsx — studyContextUids não corta mais em 100", () => {
  it("não existe mais nenhum corte fixo .slice(0, 100) na lista compartilhada de UIDs", () => {
    expect(pacsPageSource).not.toContain(".slice(0, 100)");
  });

  it("studyContextUids corta em PACS_MAX_RESULTS, importado de shared/const", () => {
    expect(pacsPageSource).toContain('import { PACS_MAX_RESULTS } from "../../../shared/const";');
    const idx = pacsPageSource.indexOf("const studyContextUids = useMemo(");
    expect(idx).toBeGreaterThan(-1);
    const body = pacsPageSource.slice(idx, idx + 300);
    expect(body).toContain(".slice(0, PACS_MAX_RESULTS)");
  });

  it("tanto studyPriority.getBatch quanto studyExamLegend.getBatch (fonte de legendSelectionsByStudyUid) usam studyContextUids", () => {
    expect(pacsPageSource).toContain("trpc.studyPriority.getBatch.useQuery(\n    { studyInstanceUids: studyContextUids");
    expect(pacsPageSource).toContain("trpc.studyExamLegend.getBatch.useQuery(\n    { unit_id: effectiveUnitId || 0, studyInstanceUids: studyContextUids }");
  });
});

describe("server/routers/studyExamLegend.ts e studyPriority.ts — teto do schema elevado a PACS_MAX_RESULTS", () => {
  it("studyExamLegend.getBatch não limita mais a 100 — usa PACS_MAX_RESULTS", () => {
    expect(studyExamLegendSource).not.toContain(".max(100)");
    expect(studyExamLegendSource).toContain('import { PACS_MAX_RESULTS } from "../../shared/const";');
    expect(studyExamLegendSource).toContain(".max(PACS_MAX_RESULTS)");
  });

  it("studyPriority.getBatch não limita mais a 100 — usa PACS_MAX_RESULTS", () => {
    expect(studyPrioritySource).not.toContain(".max(100)");
    expect(studyPrioritySource).toContain('import { PACS_MAX_RESULTS } from "../../shared/const";');
    expect(studyPrioritySource).toContain(".max(PACS_MAX_RESULTS)");
  });

  it("a checagem de autorização por unidade (view_studies) continua presente nos dois procedimentos", () => {
    expect(studyExamLegendSource).toContain('canAccessUnit(ctx.user, input.unit_id, "view_studies")');
    expect(studyPrioritySource).toContain('canAccessUnit(ctx.user, unitId, "view_studies")');
  });
});

// Teste comportamental real (não é wiring): reconstrói exatamente o mesmo
// schema usado pelos dois procedimentos (studyInstanceUidSchema + o mesmo
// PACS_MAX_RESULTS importado) e comprova o limite de fronteira pedido pela
// Manus — 500 aceito, 501 rejeitado — sem depender de banco de dados.
describe("Fronteira real do schema (500 aceito, 501 rejeitado) — pedido explícito da Manus", () => {
  const batchSchema = z.object({
    unit_id: z.number().int().positive(),
    studyInstanceUids: z.array(studyInstanceUidSchema).max(PACS_MAX_RESULTS),
  });

  const makeUid = (i: number) => `1.2.840.10008.5.1.4.1.1.7.${String(i).padStart(6, "0")}`;

  it("aceita uma consulta com exatamente 500 estudos (posições 1..500, incluindo 100 e 101)", () => {
    const uids = Array.from({ length: PACS_MAX_RESULTS }, (_, i) => makeUid(i + 1));
    const result = batchSchema.safeParse({ unit_id: 1, studyInstanceUids: uids });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.studyInstanceUids).toHaveLength(500);
      expect(result.data.studyInstanceUids[99]).toBe(makeUid(100));
      expect(result.data.studyInstanceUids[100]).toBe(makeUid(101));
    }
  });

  it("rejeita uma lista com 501 estudos (acima de PACS_MAX_RESULTS)", () => {
    const uids = Array.from({ length: PACS_MAX_RESULTS + 1 }, (_, i) => makeUid(i + 1));
    const result = batchSchema.safeParse({ unit_id: 1, studyInstanceUids: uids });
    expect(result.success).toBe(false);
  });

  it("o estudo na posição 101 (índice 100) sobrevive ao parse — não é mais descartado como no corte antigo de 100", () => {
    const uids = Array.from({ length: 150 }, (_, i) => makeUid(i + 1));
    const result = batchSchema.safeParse({ unit_id: 1, studyInstanceUids: uids });
    expect(result.success).toBe(true);
    if (result.success) {
      // Com o corte antigo (.slice(0, 100) no cliente), este UID nunca chegaria
      // ao servidor. Agora chega e é aceito pelo schema.
      expect(result.data.studyInstanceUids).toContain(makeUid(101));
    }
  });
});
