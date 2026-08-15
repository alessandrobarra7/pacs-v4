import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const layoutEditorSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/LayoutEditorPage.tsx"),
  "utf8",
);
const adminPageSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/AdminPage.tsx"),
  "utf8",
);
const usersTabSource = readFileSync(
  resolve(process.cwd(), "client/src/components/UsersPermissionsTab.tsx"),
  "utf8",
);

describe("Admin Mobile UI & Advanced Layout Editor Contract", () => {
  it("renders mobile-friendly cards and modals in AdminPage", () => {
    expect(adminPageSource).toContain("md:hidden");
    expect(adminPageSource).toContain("Unidades");
    expect(adminPageSource).toContain("Usuários");
  });

  it("organizes permissions in UsersPermissionsTab", () => {
    expect(usersTabSource).toContain("grid-cols-2");
    expect(usersTabSource).toContain("role");
  });

  it("supports the advanced layout editor with multi-logo slots and real preview mode", () => {
    expect(layoutEditorSource).toContain("logo1");
    expect(layoutEditorSource).toContain("logo2");
    expect(layoutEditorSource).toContain("logo3");
    expect(layoutEditorSource).toContain("patientName");
    expect(layoutEditorSource).toContain("patientInfo");
    expect(layoutEditorSource).toContain("previewMode");
    expect(layoutEditorSource).toContain("Modo de posicionamento");
  });
});
