import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/DicomViewerPage.tsx"), "utf8");

describe("renderização progressiva de estudo DICOM grande", () => {
  it("limita a frequência de atualizações da barra de download", () => {
    expect(source).toContain("const streamingProgressTimerRef");
    expect(source).toContain("setTimeout(flushStreamingProgress, 150)");
    expect(source).toContain("scheduleStreamingProgress(localReceived, localTotal)");
  });

  it("não solicita séries enquanto os arquivos ainda estão sendo gravados no cache", () => {
    expect(source).toContain('phase === "ready" && totalCount > 0 && imageCount >= totalCount');
    expect(source).toContain("}, 750);");
    expect(source).not.toContain("firstImageRender.then(() => {");
  });

  it("evita busca linear da posição de cada arquivo ao reabrir um cache grande", () => {
    const serverSource = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf8");
    const cachedStreamSection = serverSource.slice(
      serverSource.indexOf("if (dcmFiles.length > 0) {"),
      serverSource.indexOf("// Inicia C-GET via Python", serverSource.indexOf("if (dcmFiles.length > 0) {")),
    );

    expect(cachedStreamSection).toContain("for (let index = 0; index < dcmFiles.length; index += 1)");
    expect(cachedStreamSection).not.toContain("dcmFiles.indexOf(");
  });
});
