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

  it("alinha a sinalização clínica e o SLA ao lado do sexo na ficha desktop do paciente", () => {
    expect(page).toContain("(sex || studyPriority || hasAnamnesis || slaReadiness) && (");
    expect(page).toContain('className="mt-0.5 flex items-center gap-2"');
    expect(page).toContain('{sex && <span className="text-xs text-gray-400">{sex}</span>}');
    expect(page).toContain("const slaReadiness = slaReadinessMap[study.studyInstanceUid]");
    expect(page).not.toContain("{/* Status & SLA */}");
  });

  it("compõe o SLA dentro da área de prioridade clínica no cartão móvel", () => {
    expect(page).toContain("indicator?: ReactNode;");
    expect(page).toContain("(priority || indicator) && (");
    expect(page).toContain("indicator={");
    expect(page.match(/<SlaCountdown/g)?.length).toBe(2);
  });
});
