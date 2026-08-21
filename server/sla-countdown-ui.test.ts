import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const component = readFileSync(resolve(process.cwd(), "client/src/components/SlaCountdown.tsx"), "utf8");

describe("indicador visual de SLA clínico", () => {
  it("mantém o contador para SLAs com prazo e o estado vencido inequívoco", () => {
    expect(component).toContain("const remaining = dueMs - now;");
    expect(component).toContain('text-red-600 font-medium');
    expect(component).toContain("+{formatDuration(-remaining)}");
  });

  it("mostra pronto para laudar quando a anamnese existe sem prazo de SLA registrado", () => {
    expect(component).toContain("if (!readiness && hasAnamnesis)");
    expect(component).toContain("if (!readiness.due_at)");
    expect(component.match(/<span>Pronto<\/span>/g)?.length).toBe(3);
    expect(component).not.toContain("if (compact) return null; // na lista não mostrar nada");
  });
});
