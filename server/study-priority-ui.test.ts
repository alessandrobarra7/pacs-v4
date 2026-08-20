import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"), "utf8");

describe("prioridade clínica na listagem de estudos", () => {
  it("oferece Urgência e Prioridade máxima apenas para operador e atendente", () => {
    expect(page).toContain('user?.role === "operador" || user?.role === "atendente"');
    expect(page).toContain('>Urgência</button>');
    expect(page).toContain('>Prioridade máxima</button>');
  });

  it("consulta a prioridade por unidade e preserva indicadores nos dois layouts", () => {
    expect(page).toContain("trpc.studyPriority.getBatch.useQuery");
    expect(page).toContain("priorityByStudyUid.get(study.studyInstanceUid)");
    expect(page.match(/<StudyPriorityControls/g)?.length).toBe(1);
    expect(page).toContain("studyPriority && (");
    expect(page).toContain('Sinalizado por {markedByName || "outro usuário"}');
  });

  it("mantém o estado clínico visível ao médico sem conceder controles de alteração", () => {
    expect(page).toContain("!priority && !canMark");
    expect(page).toContain("Sem prioridade clínica");
    expect(page).toContain("canMark && isOwnPriority");
  });

  it("exibe o alerta clínico na própria linha somente quando houver sinalização", () => {
    expect(page).not.toContain('title="Urgência">Urg.</th>');
    expect(page).not.toContain('title="Prioridade máxima">Prior.</th>');
    expect(page).not.toContain("StudyPriorityDesktopCell");
    expect(page).toContain("studyPriority.priority === \"urgencia\"");
    expect(page).toContain("<td colSpan={11}");
  });
});
