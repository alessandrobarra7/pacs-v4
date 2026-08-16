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

  it("uses Pointer Events and touch-action none for mobile drag and resize", () => {
    expect(layoutEditorSource).toContain("const handlePointerDown");
    expect(layoutEditorSource).toContain("const handlePointerMove");
    expect(layoutEditorSource).toContain("onPointerCancel={handlePointerUp}");
    expect(layoutEditorSource).toContain('touchAction: "none"');
    expect(layoutEditorSource).toContain("window.addEventListener('pointermove'");
    expect(layoutEditorSource).toContain("window.addEventListener('pointercancel'");
  });

  it("protects dragging from null refs and missing blocks", () => {
    expect(layoutEditorSource).toContain("const drag = dragging.current;");
    expect(layoutEditorSource).toContain("const { block, origX, origY } = drag;");
    expect(layoutEditorSource).toContain("if (!current) return prev;");
    expect(layoutEditorSource).not.toContain("dragging.current!.origX");
    expect(layoutEditorSource).not.toContain("dragging.current!.origY");
  });
});
