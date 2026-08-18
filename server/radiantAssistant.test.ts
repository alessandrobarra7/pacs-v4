import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRadiantAssistantTokenStore, RADIANT_ASSISTANT_SCHEME } from "./radiantAssistant";

const windowsAssistantSource = readFileSync(
  new URL("../tools/radiant-assistant/main.go", import.meta.url),
  "utf8",
);
const windowsInstallerSource = readFileSync(
  new URL("../tools/radiant-assistant/installer.nsi", import.meta.url),
  "utf8",
);

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

  it("mantém o esquema próprio reservado para o Assistente Windows", () => {
    expect(RADIANT_ASSISTANT_SCHEME).toBe("pacs-radiant");
  });

  it("reconhece a instalação padrão RadiAntViewer64bit sem tocar nas configurações PACS", () => {
    expect(windowsAssistantSource).toContain("RadiAntViewer64bit");
    expect(windowsAssistantSource).toContain("RadiAntViewer.exe");
    expect(windowsAssistantSource).not.toContain("pacs.xml");
  });

  it("encerra somente a versão antiga do Assistente antes de atualizar seus arquivos", () => {
    expect(windowsInstallerSource).toContain("taskkill.exe");
    expect(windowsInstallerSource).toContain("/IM PacsRadiantAssistant.exe");
    expect(windowsInstallerSource).not.toContain("/IM RadiAntViewer.exe");
  });
});
