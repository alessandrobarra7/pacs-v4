import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { templatesRouter } from "./routers/templates";

function callerAs(role: string) {
  return templatesRouter.createCaller({
    user: { id: 41, role, unit_id: 7 },
    req: { ip: "127.0.0.1", headers: {} },
    res: {},
  } as any);
}

describe("administração exclusiva dos modelos de laudo", () => {
  it("bloqueia um médico em todas as rotas que criam, alteram ou removem modelos", async () => {
    const caller = callerAs("medico");
    const operations = [
      caller.create({ name: "Teste", bodyTemplate: "Conteúdo" }),
      caller.update({ id: 1, name: "Teste" }),
      caller.delete({ id: 1 }),
      caller.createPersonal({ name: "Teste", bodyTemplate: "Conteúdo" }),
      caller.updatePersonal({ id: 1, name: "Teste" }),
      caller.deletePersonal({ id: 1 }),
      caller.useAsBase({ id: 1 }),
    ];

    for (const operation of operations) {
      await expect(operation).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("remove Modelos de Laudo dos controles configuráveis de usuário e de grupo", () => {
    const permissionsTab = readFileSync(resolve(process.cwd(), "client/src/components/UsersPermissionsTab.tsx"), "utf8");
    const userForm = readFileSync(resolve(process.cwd(), "client/src/components/UserFormDialog.tsx"), "utf8");
    const groupMatrix = readFileSync(resolve(process.cwd(), "client/src/components/PermissionsMatrixTab.tsx"), "utf8");
    const adminRouter = readFileSync(resolve(process.cwd(), "server/routers/admin.ts"), "utf8");

    expect(permissionsTab).not.toContain('{ key: "manage_templates", label: "Modelos de Laudo" }');
    expect(userForm).not.toContain('{ key: "manage_templates", label: "Gerenciar Templates" }');
    expect(groupMatrix).toContain('.filter((permission) => permission !== "manage_templates")');
    expect(adminRouter).toContain("permissionsWithoutTemplateAdministration");
    expect(adminRouter).toContain("{ ...perms, manage_templates: false }");
  });

  it("mantém os modelos visíveis, mas oculta suas ações administrativas para outros perfis", () => {
    const templatesPage = readFileSync(resolve(process.cwd(), "client/src/pages/Templates.tsx"), "utf8");
    expect(templatesPage).toContain('const canManageTemplates = currentUser?.role === "admin_master"');
    expect(templatesPage).toContain("Os Modelos de Laudo são administrados exclusivamente pelo Administrador Master.");
    expect(templatesPage).toContain("{canManageTemplates && <>");
  });
});
