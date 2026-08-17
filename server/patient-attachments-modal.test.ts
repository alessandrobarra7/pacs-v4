import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const modalSource = readFileSync(
  resolve(process.cwd(), "client/src/components/PatientAttachmentsModal.tsx"),
  "utf8",
);

describe("PatientAttachmentsModal mobile preview", () => {
  it("exibe controles explícitos de voltar e fechar na prévia de imagem", () => {
    expect(modalSource).toContain("Voltar");
    expect(modalSource).toContain("Fechar");
    expect(modalSource).toContain("ChevronLeft");
    expect(modalSource).toContain("showCloseButton={false}");
  });

  it("retorna à galeria ou fecha o modal completo de forma controlada", () => {
    expect(modalSource).toContain("onClick={() => setPreviewAttachment(null)}");
    expect(modalSource).toContain("setPreviewAttachment(null);\n                onClose();");
  });
});
