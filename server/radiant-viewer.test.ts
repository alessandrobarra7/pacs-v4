import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const serverSource = fs.readFileSync(path.join(projectRoot, "server/_core/index.ts"), "utf8");
const viewerSource = fs.readFileSync(path.join(projectRoot, "client/src/pages/DicomViewerPage.tsx"), "utf8");

describe("Integração RadiAnt por Assistente local", () => {
  it("emite e consome estudo temporário pelo endpoint próprio do Assistente", () => {
    expect(serverSource).toContain("/api/radiant-assistant-launch/:studyUid");
    expect(serverSource).toContain("/api/radiant-assistant-download/:token");
    expect(serverSource).toContain("radiantAssistantTokens.consume(req.params.token)");
    expect(serverSource).toContain("assertCachedDicomFileAccess");
  });

  it("não mantém o launch legado DownloadURL para RadiAnt", () => {
    expect(serverSource).toContain("O RadiAnt usa o Assistente local.");
    expect(serverSource).not.toContain("launchUrl = `radiant://?methodName=DownloadURL");
  });

  it("expõe ativação e launch RadiAnt no visualizador sem remover Horos", () => {
    expect(viewerSource).toContain("/api/radiant-assistant-installer");
    expect(viewerSource).toContain("/api/radiant-assistant-launch/${studyUid}");
    expect(viewerSource).toContain("Ativar RadiAnt");
    expect(viewerSource).toContain("handleOpenViewer('horos')");
  });
});
