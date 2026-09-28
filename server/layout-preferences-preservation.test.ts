import { describe, expect, it } from "vitest";
import { buildLayoutUpdateValues } from "./routers/layouts";
import { DEFAULT_LAYOUT_PREFERENCES } from "../shared/types";

const SAFE_HEADER = "<p>Cabeçalho seguro</p>";
const SAFE_FOOTER = "<p>Rodapé seguro</p>";

function updateInput(overrides: Record<string, unknown> = {}) {
  return {
    unitId: 7,
    backgroundImageUrl: "https://example.test/fundo.png",
    backgroundOpacity: 0.8,
    backgroundSize: "cover" as const,
    footerImageUrl: "https://example.test/rodape.png",
    logos: [{ url: "https://example.test/logo.png", width: 120, height: 60, label: "Unidade" }],
    blockPositions: { title: { x: 1, y: 2, w: 90, h: 6, visible: true } },
    ...overrides,
  };
}

describe("layouts.upsert — preservação de preferences", () => {
  it("não inclui preferences no update quando o cliente não enviou o campo", () => {
    const values = buildLayoutUpdateValues(
      updateInput(),
      SAFE_HEADER,
      SAFE_FOOTER,
    );

    expect(values).not.toHaveProperty("preferences");
  });

  it("preserva preferences já armazenadas quando aplica um update sem esse campo", () => {
    const existing = {
      preferences: { ...DEFAULT_LAYOUT_PREFERENCES, pageSize: "Letter" as const, marginTop: 37 },
      footer_image_url: "https://example.test/rodape-anterior.png",
    };
    const values = buildLayoutUpdateValues(
      updateInput({ footerImageUrl: "https://example.test/rodape-novo.png" }),
      SAFE_HEADER,
      SAFE_FOOTER,
    );

    const afterUpdate = { ...existing, ...values };

    expect(afterUpdate.preferences).toEqual(existing.preferences);
    expect(afterUpdate.footer_image_url).toBe("https://example.test/rodape-novo.png");
  });

  it("inclui preferences quando o cliente as envia explicitamente", () => {
    const preferences = { ...DEFAULT_LAYOUT_PREFERENCES, pageSize: "Letter" as const, marginLeft: 31 };
    const values = buildLayoutUpdateValues(
      updateInput({ preferences }),
      SAFE_HEADER,
      SAFE_FOOTER,
    );

    expect(values).toHaveProperty("preferences", preferences);
  });
});
