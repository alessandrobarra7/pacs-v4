import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const audioModalSource = readFileSync(
  resolve(process.cwd(), "client/src/components/AudioReportsModal.tsx"),
  "utf8",
);
const audioRouterSource = readFileSync(
  resolve(process.cwd(), "server/routers/audioReports.ts"),
  "utf8",
);

describe("Player móvel de áudios vinculados", () => {
  it("oferece retorno, avanço, progresso e velocidades clínicas", () => {
    expect(audioModalSource).toContain("seekBy(-10)");
    expect(audioModalSource).toContain("seekBy(10)");
    expect(audioModalSource).toContain("type=\"range\"");
    expect(audioModalSource).toContain("const rates = [1, 1.25, 1.5, 2]");
  });

  it("usa um único fechamento explícito e mantém os controles no player ativo", () => {
    expect(audioModalSource).toContain("showCloseButton={false}");
    expect(audioModalSource).toContain("closeAudioModal");
    expect(audioModalSource).toContain("Reproduzindo agora");
    expect(audioModalSource).toContain("Áudio selecionado");
    expect(audioModalSource).not.toContain("import { Mic, Square, Trash2, X,");
  });

  it("normaliza o áudio privado para a rota autenticada do Portal", () => {
    expect(audioRouterSource).toContain("toProxyUrl(reference)");
    expect(audioRouterSource).not.toContain("storageGetUrl(reference)");
  });
});
