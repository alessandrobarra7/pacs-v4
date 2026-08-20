import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"), "utf8");

describe("barra de progresso na tabela desktop", () => {
  it("renderiza uma linha complementar de progresso e preserva a abertura automática", () => {
    expect(page).toContain("const desktopPreDownload = preDownloadMap[study.studyInstanceUid]");
    expect(page).toContain("const isDesktopDownloadActive = desktopPreDownload?.phase === 'connecting' || desktopPreDownload?.phase === 'downloading'");
    expect(page).toContain("<td colSpan={11}");
    expect(page).toContain("grid flex-1 grid-cols-20 gap-1");
    expect(page).toContain("O visualizador abrirá automaticamente.");
    expect(page).toContain("handleVisualize(study, true)");
    expect(page).toContain("Clique em Visualizar para tentar novamente.");
  });
});
