import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const router = readFileSync(resolve(process.cwd(), "server/routers/studyPriority.ts"), "utf8");

describe("sinalização clínica de prioridade", () => {
  it("restringe a autoria a operador e atendente e valida a unidade real do estudo", () => {
    expect(router).toContain('role !== "operador" && role !== "atendente"');
    expect(router).toContain('assertDicomFileAccess(ctx.user, input.studyInstanceUid, "view_studies")');
    expect(router).toContain('input.unit_id !== undefined && input.unit_id !== unitId');
  });

  it("preserva a autoria e bloqueia alterações por outros usuários", () => {
    expect(router).toContain('current.marked_by_user_id !== ctx.user.id');
    expect(router).toContain('somente o autor pode alterá-la');
    expect(router).toContain('priority: input.priority');
    expect(router).toContain('CLEAR_STUDY_PRIORITY');
  });
});
