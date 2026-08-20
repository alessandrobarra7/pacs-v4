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

  it("consulta a prioridade por unidade e a exibe abaixo do status em desktop e mobile", () => {
    expect(page).toContain("trpc.studyPriority.getBatch.useQuery");
    expect(page).toContain("priorityByStudyUid.get(study.studyInstanceUid)");
    expect(page.match(/<StudyPriorityControls/g)?.length).toBe(2);
    expect(page).toContain('Sinalizado por {markedByName || "outro usuário"}');
  });
});
