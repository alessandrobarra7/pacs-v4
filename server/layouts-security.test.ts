import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routerPath = path.resolve(__dirname, "routers", "layouts.ts");

describe("segurança da leitura de layouts por unidade", () => {
  it("exige view_studies antes de retornar o layout solicitado", async () => {
    const source = await fs.readFile(routerPath, "utf8");
    const routeStart = source.indexOf("getByUnit: protectedProcedure");
    const routeEnd = source.indexOf("upsert: unitAdminProcedure", routeStart);
    const route = source.slice(routeStart, routeEnd);

    expect(route).toContain("canAccessUnit(ctx.user, input.unitId, 'view_studies')");
    expect(route).toContain("code: 'FORBIDDEN'");
  });
});
