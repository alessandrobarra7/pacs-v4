import { describe, expect, it } from "vitest";
import { createRadiantAssistantTokenStore, RADIANT_ASSISTANT_SCHEME } from "./radiantAssistant";

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
});
