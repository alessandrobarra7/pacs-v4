/**
 * Regressão de wiring de interface — criação de usuários
 * (ACHADO_CRIACAO_USUARIOS_FUNCAO_E_APARENCIA_2026-10-15, parecer técnico
 * da Manus).
 *
 * Testes 12-17 do parecer. Segue o mesmo padrão já aceito nesta base (ver
 * o teste "H" em units-doctor-scope.test.ts): checagem do SOURCE dos
 * arquivos .tsx envolvidos, já que o projeto não tem testing-library/jsdom
 * configurado para montar componentes React de verdade. O que se prova
 * aqui é fato de código (qual mutation é chamada, com que payload, que
 * prop é lida, que condicional existe) — não um detalhe de como o texto
 * foi formatado.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSource(relPath: string): string {
  return readFileSync(resolve(__dirname, "..", relPath), "utf-8");
}

describe("Interface — criação de usuários (testes 12-17 do parecer Manus)", () => {
  it("12. 'Novo usuário' acionado a partir de uma unidade repassa o unitId ao modal (não descarta mais)", () => {
    const src = readSource("client/src/pages/AdminPage.tsx");
    // A assinatura antiga era `handleNewUserForUnit = (_unitId: number, ...)`
    // (parâmetro prefixado com _ = deliberadamente não usado). Agora o
    // parâmetro é usado de verdade.
    expect(src).not.toMatch(/handleNewUserForUnit\s*=\s*\(_unitId/);
    expect(src).toMatch(/handleNewUserForUnit\s*=\s*\(unitId/);
    expect(src).toMatch(/setForcedUnitId\(unitId\)/);
    // E o modal recebe essa unidade.
    expect(src).toMatch(/forcedUnitId=\{forcedUnitId\}/);
  });

  it("13. unit_admin vê apenas papéis permitidos e a unidade travada dentro do seu escopo", () => {
    const src = readSource("client/src/components/UserFormDialog.tsx");
    // Lista de papéis filtrada quando o chamador é unit_admin (exclui
    // admin_master e unit_admin do próprio seletor de papel).
    expect(src).toMatch(/visibleRoles\s*=\s*currentUserRole === "unit_admin"/);
    expect(src).toMatch(/r\.value !== "admin_master" && r\.value !== "unit_admin"/);
    expect(src).toMatch(/\{visibleRoles\.map/);
    // Seleção de unidade trava em uma única unidade para unit_admin.
    expect(src).toMatch(/currentUserRole === "unit_admin"[\s\S]{0,80}return \[defaultPermission\(unitId, role\)\]/);
  });

  it("14. a tela não chama mais auth.createLocalUser para a criação administrativa normal; usa admin.createUser", () => {
    const src = readSource("client/src/pages/AdminPage.tsx");
    expect(src).not.toMatch(/trpc\.auth\.createLocalUser/);
    expect(src).toMatch(/trpc\.admin\.createUser\.useMutation/);
  });

  it("15. após sucesso na criação, a lista de usuários é invalidada/refeita", () => {
    const src = readSource("client/src/pages/AdminPage.tsx");
    const match = src.match(/const createUser = trpc\.admin\.createUser\.useMutation\(\{[\s\S]{0,300}?\}\);/);
    expect(match).not.toBeNull();
    expect(match![0]).toMatch(/refetchUsers\(\)/);
  });

  it("16. unit_admin não vê 'Excluir usuário'; 'Remover vínculo da unidade' permanece disponível", () => {
    const tabSrc = readSource("client/src/components/UsersPermissionsTab.tsx");
    expect(tabSrc).toMatch(/canDeleteUsers\s*=\s*currentUserRole === "admin_master"/);
    expect(tabSrc).toMatch(/\{canDeleteUsers && \(/);

    const adminPageSrc = readSource("client/src/pages/AdminPage.tsx");
    // A remoção de vínculo (diferente de exclusão de conta) continua
    // disponível independentemente do papel — ela já é a alternativa segura
    // recomendada pelo parecer para unit_admin.
    expect(adminPageSrc).toMatch(/removeUserUnitLink/);
    expect(adminPageSrc).toMatch(/currentUserRole=\{currentUser\?\.role\}/);
  });

  it("17. regressão admin_master: multiunidade mantida na tela, e upload de carimbo/assinatura continua como etapa pós-criação", () => {
    const src = readSource("client/src/pages/AdminPage.tsx");
    // unitIds deriva de todas as unidades marcadas no formulário (multiunidade).
    expect(src).toMatch(/const unitIds = \(data\.permissions \|\| \[\]\)\.map\(\(p\) => p\.unit_id\)/);
    // Carimbo e assinatura continuam sendo enviados como mutations
    // separadas e explícitas depois que o usuário já existe.
    const createUserBlock = src.match(/createUser\.mutate\(\{[\s\S]*?onSuccess: \(result: any\) => \{[\s\S]*?\},\s*\}\);/);
    expect(createUserBlock).not.toBeNull();
    expect(createUserBlock![0]).toMatch(/updateStamp\.mutate\(/);
    expect(createUserBlock![0]).toMatch(/updateMedical\.mutate\(/);
  });
});
