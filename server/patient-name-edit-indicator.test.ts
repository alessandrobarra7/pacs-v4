import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"), "utf8");

describe("apresentação uniforme do nome do paciente", () => {
  it("não altera a cor do nome conforme uma correção histórica persistida", () => {
    expect(source).not.toContain("patientNameEdited");
    expect(source).not.toContain('title="Nome editado no portal"');
    expect(source).toContain('className="font-semibold text-sm leading-tight uppercase text-gray-900"');
    expect(source).toContain('text-[15px] font-bold uppercase leading-tight text-amber-800');
  });

  it("oferece a mesma ação visível de edição a quem possui a permissão clínica", () => {
    expect(source).toContain('aria-label="Editar nome do paciente"');
    expect(source).toContain('border-gray-200 bg-white text-gray-400');
    expect(source).not.toContain('opacity-0 group-hover:opacity-100');
  });
});
