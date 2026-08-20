import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const audioPath = path.resolve(__dirname, "routers", "audioReports.ts");
const attachmentPath = path.resolve(__dirname, "routers", "annotations.ts");
const clientPath = path.resolve(__dirname, "..", "client", "src");

describe("política clínica de áudio e anexos", () => {
  it("mantém o áudio restrito a médico e operador, mas permite consultar anexos a qualquer usuário com acesso ao estudo", async () => {
    const [audioSource, attachmentSource] = await Promise.all([
      fs.readFile(audioPath, "utf8"),
      fs.readFile(attachmentPath, "utf8"),
    ]);

    expect(audioSource).toContain('role !== "medico" && role !== "operador"');
    expect(audioSource).toContain("assertClinicalMediaViewer(ctx.user.role)");
    expect(attachmentSource).not.toContain("assertClinicalMediaViewer");
    expect(attachmentSource).toContain('await assertDicomFileAccess(ctx.user, input.study_instance_uid, "view_studies")');
    expect(attachmentSource).toContain('await assertDicomFileAccess(ctx.user, studyUid, "view_studies")');
  });

  it("restringe upload e exclusão ao médico autor", async () => {
    const [audioSource, attachmentSource] = await Promise.all([
      fs.readFile(audioPath, "utf8"),
      fs.readFile(attachmentPath, "utf8"),
    ]);

    for (const source of [audioSource, attachmentSource]) {
      expect(source).toContain('if (role !== "medico")');
      expect(source).toContain("assertClinicalMediaDoctor(ctx.user.role)");
    }
    expect(audioSource).toContain("record.user_id !== ctx.user.id");
    expect(attachmentSource).toContain("row.user_id !== ctx.user.id");
  });

  it("mantém gestão de mídia restrita, mas expõe anexos de leitura a quem pode visualizar o estudo", async () => {
    const [audioModal, attachmentModal, dicomViewer, pacsQuery] = await Promise.all([
      fs.readFile(path.join(clientPath, "components", "AudioReportsModal.tsx"), "utf8"),
      fs.readFile(path.join(clientPath, "components", "PatientAttachmentsModal.tsx"), "utf8"),
      fs.readFile(path.join(clientPath, "pages", "DicomViewerPage.tsx"), "utf8"),
      fs.readFile(path.join(clientPath, "pages", "PacsQueryPage.tsx"), "utf8"),
    ]);

    expect(audioModal).toContain('const canManageAudio = currentUser?.role === "medico" && allowRecording');
    expect(attachmentModal).toContain('const canManageAttachments = currentUser?.role === "medico"');
    expect(dicomViewer).toContain('const canAccessClinicalMedia = currentUser?.role === "medico" || currentUser?.role === "operador"');
    expect(dicomViewer).toContain("const canViewAttachments = Boolean(currentUser?.id)");
    expect(dicomViewer).toContain("{ enabled: !!studyUid && canViewAttachments }");
    expect(dicomViewer).toContain("if (!canViewAttachments) return null;");
    expect(pacsQuery).toContain("const canAccessClinicalMedia = user?.role === 'medico' || user?.role === 'operador'");
    expect(pacsQuery).toContain("const canViewAttachments = Boolean(user?.id)");
    expect(pacsQuery).toContain("if (!canViewAttachments) return null;");
    expect(pacsQuery).toContain("{canViewAttachments && isAttachmentsModalOpen && selectedStudy && (");
  });
});
