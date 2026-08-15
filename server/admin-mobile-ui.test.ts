import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const adminSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/AdminPage.tsx"),
  "utf8",
);
const usersSource = readFileSync(
  resolve(process.cwd(), "client/src/components/UsersPermissionsTab.tsx"),
  "utf8",
);
const layoutEditorSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/LayoutEditorPage.tsx"),
  "utf8",
);

describe("Administração — experiência mobile", () => {
  it("mantém a tabela de unidades no desktop e usa cartões no mobile", () => {
    expect(adminSource).toContain('className="hidden md:block bg-white rounded border border-gray-200 overflow-hidden"');
    expect(adminSource).toContain('className="md:hidden space-y-3"');
    expect(adminSource).toContain("Ver detalhes");
    expect(adminSource).toContain("Configuração da unidade");
  });

  it("preserva as ações administrativas essenciais da unidade", () => {
    expect(adminSource).toContain("handleOpenEditUnit(unit)");
    expect(adminSource).toContain("/admin/layouts/${unit.id}");
    expect(adminSource).toContain("updateUnit.mutate({ id: unit.id, isActive: !unit.isActive })");
    expect(adminSource).toContain("selectedUnitDetails");
  });

  it("troca a matriz larga de permissões por cartões empilhados no mobile", () => {
    expect(usersSource).toContain('className="hidden md:block"');
    expect(usersSource).toContain('className="md:hidden border-b border-gray-200 bg-gray-50 p-3"');
    expect(usersSource).toContain('className="md:hidden space-y-3 p-3"');
    expect(usersSource).toContain("mobile-unit-filter");
    expect(usersSource).toContain("onEditUser(user)");
  });

  it("oferece abas e controles organizados para edição de layout no mobile", () => {
    expect(layoutEditorSource).toContain('setMobileTab("preview")');
    expect(layoutEditorSource).toContain('setMobileTab("logos")');
    expect(layoutEditorSource).toContain('setMobileTab("bg")');
    expect(layoutEditorSource).toContain('setMobileTab("blocks")');
    expect(layoutEditorSource).toContain("Prévia A4");
    expect(layoutEditorSource).toContain("Logos");
    expect(layoutEditorSource).toContain("Fundo / Rodapé");
    expect(layoutEditorSource).toContain("whitespace-nowrap text-center transition-colors");
  });

  it("separa o cabeçalho mobile e impede overflow do editor e do canvas A4", () => {
    expect(layoutEditorSource).toContain('className="lg:hidden bg-white border-b border-gray-200 shadow-sm"');
    expect(layoutEditorSource).toContain('className="flex min-h-0 flex-1 overflow-hidden"');
    expect(layoutEditorSource).toContain('w-full min-w-0 lg:w-80');
    expect(layoutEditorSource).toContain("previewScale");
    expect(layoutEditorSource).toContain("transformOrigin: \"top left\"");
  });

  it("exibe apenas a seção selecionada no painel mobile e mantém todas no desktop", () => {
    expect(layoutEditorSource).toContain('mobileTab === "logos" ? "block" : "hidden lg:block"');
    expect(layoutEditorSource).toContain('mobileTab === "bg" ? "block" : "hidden lg:block"');
    expect(layoutEditorSource).toContain('mobileTab === "blocks" ? "block" : "hidden lg:block"');
  });
});
