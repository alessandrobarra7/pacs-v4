import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"), "utf8");

describe("contagem de imagens nas listagens de estudos", () => {
  it("usa a quantidade retornada pelo PACS no lugar do tempo relativo no móvel e no desktop", () => {
    expect(page).toContain("const imageCount = Number.parseInt(String(study.numberOfInstances ?? ''), 10);");
    expect(page).toContain("'imagem' : 'imagens'");
    expect(page).toContain("'Imagens não informadas'");
    expect(page).toContain("<span>{imageCountLabel}</span>");
    expect(page).toContain('<div className="text-xs text-gray-400 mt-0.5">{imageCountLabel}</div>');
    expect(page).not.toContain("relativeTime(");
  });
});
