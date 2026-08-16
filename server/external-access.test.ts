import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("documento público em navegador móvel", () => {
  it("declara português do Brasil e impede tradução automática do DOM React", () => {
    const html = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");

    expect(html).toContain('<html lang="pt-BR" translate="no" class="notranslate">');
    expect(html).not.toContain('<html lang="en">');
  });
});
