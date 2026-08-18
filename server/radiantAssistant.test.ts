import { describe, expect, it } from "vitest";
import { buildRadiantAssistantInstaller, createRadiantAssistantTokenStore, RADIANT_ASSISTANT_SCHEME } from "./radiantAssistant";

describe("Assistente RadiAnt", () => {
  it("emite token opaco de uso único e rejeita reutilização", () => {
    const store = createRadiantAssistantTokenStore({ makeToken: () => "A".repeat(43) });
    const { token } = store.issue({ studyUid: "1.2.3", userId: 7 });

    expect(token).toHaveLength(43);
    expect(store.consume(token)).toMatchObject({ studyUid: "1.2.3", userId: 7 });
    expect(store.consume(token)).toBeNull();
  });

  it("rejeita token vencido e token em formato inesperado", () => {
    let timestamp = 0;
    const store = createRadiantAssistantTokenStore({ ttlMs: 10, now: () => timestamp, makeToken: () => "B".repeat(43) });
    const { token } = store.issue({ studyUid: "1.2.3", userId: 7 });
    timestamp = 11;

    expect(store.consume(token)).toBeNull();
    expect(store.consume("../invalido")).toBeNull();
  });

  it("gera instalador que registra apenas protocolo próprio e não toca no pacs.xml", () => {
    const script = buildRadiantAssistantInstaller("https://lauds.com.br");

    expect(script).toContain("$SchemeName = 'pacs-radiant'");
    expect(script).toContain("HKCU:\\Software\\Classes\\");
    expect(script).toContain("/api/radiant-assistant-download/");
    expect(script).toContain("Start-Process -FilePath $radiant -ArgumentList @('-d', $dicomPath)");
    expect(script).not.toContain("pacs.xml");
    expect(script).not.toContain("C-FIND");
    expect(script).not.toContain("C-MOVE");
  });

  it("aceita HTTPS e recusa origem HTTP fora de localhost", () => {
    expect(() => buildRadiantAssistantInstaller("http://portal-exemplo.local")).toThrow(/HTTPS/);
    expect(() => buildRadiantAssistantInstaller("http://localhost:3000")).not.toThrow();
  });
});
