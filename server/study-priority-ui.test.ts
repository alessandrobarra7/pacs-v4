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
    expect(page.match(/<StudyPriorityDesktopCell/g)?.length).toBe(2);
    expect(page).toContain('Sinalizado por {markedByName || "outro usuário"}');
  });

  it("mantém o estado clínico visível ao médico sem conceder controles de alteração", () => {
    expect(page).toContain("!priority && !canMark");
    expect(page).toContain("Sem prioridade clínica");
    expect(page).toContain("canMark && isOwnPriority");
  });

  it("expõe Urgência e Prioridade máxima em colunas compactas na tabela desktop", () => {
    expect(page).toContain('title="Urgência">Urg.</th>');
    expect(page).toContain('title="Prioridade máxima">Prior.</th>');
    expect(page).toContain('type="urgencia"');
    expect(page).toContain('type="prioridade_maxima"');
    expect(page).toContain("<td colSpan={13}");
  });
});
