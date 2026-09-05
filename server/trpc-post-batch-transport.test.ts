import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const mainSource = readFileSync(resolve(root, "client/src/main.tsx"), "utf8");
const serverSource = readFileSync(resolve(root, "server/_core/index.ts"), "utf8");

describe("transporte tRPC em lote por POST", () => {
  it("move as entradas de query batch para o corpo HTTP no cliente", () => {
    expect(mainSource).toContain('httpBatchLink({');
    expect(mainSource).toContain('methodOverride: "POST"');
    expect(mainSource).toContain('credentials: "include"');
  });

  it("habilita o method override somente no adaptador tRPC", () => {
    const middlewareStart = serverSource.indexOf('createExpressMiddleware({');
    const middlewareEnd = serverSource.indexOf('})', middlewareStart);
    const middlewareConfig = serverSource.slice(middlewareStart, middlewareEnd);

    expect(middlewareStart).toBeGreaterThan(-1);
    expect(middlewareConfig).toContain('allowMethodOverride: true');
    expect(serverSource).toContain("app.use('/api/trpc', loginRateLimiterBatchAware)");
  });
});
