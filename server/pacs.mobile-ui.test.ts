import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"),
  "utf8",
);
const headerSource = readFileSync(
  resolve(process.cwd(), "client/src/components/AppHeader.tsx"),
  "utf8",
);
const attachmentsModalSource = readFileSync(
  resolve(process.cwd(), "client/src/components/PatientAttachmentsModal.tsx"),
  "utf8",
);
const viewerSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/DicomViewerPage.tsx"),
  "utf8",
);

describe("PacsQueryPage mobile study list contract", () => {
  it("keeps the desktop table and renders a separate mobile card list", () => {
    expect(pageSource).toContain('className="hidden md:block"');
    expect(pageSource).toContain('className="md:hidden p-3 space-y-2 bg-gray-50/70"');
    expect(pageSource).toContain("pagedResults.map((study, idx) => {");
  });

  it("matches the compact mobile hierarchy from the visual reference", () => {
    expect(pageSource).toContain('className="md:hidden bg-white border-b border-gray-200 p-5 shrink-0"');
    expect(pageSource).toContain("Escolher data");
    expect(pageSource).toContain("rounded-xl border border-gray-200 bg-white px-4 py-3");
    expect(pageSource).toContain("mobileStatusCls");
    expect(pageSource).toContain("break-words pr-1 text-[15px] font-bold uppercase leading-tight");
    expect(pageSource).not.toContain("truncate pr-1 text-[15px] font-bold uppercase leading-tight ${patientNameEdited");
    expect(pageSource).toContain("mt-1 truncate rounded pr-1 text-xs uppercase leading-tight text-gray-500 group-hover:text-cyan-800");
    expect(pageSource).toContain("mt-1.5 flex items-start gap-2");
    expect(pageSource).toContain("max-w-[92px] shrink-0 items-center rounded-full");
    expect(headerSource).toContain("mobileUnitLabel");
    expect(headerSource).toContain("Abrir menu");
    expect(headerSource).toContain("md:hidden absolute bottom-6");
  });

  it("keeps the date picker wired to both responsive triggers and the PACS query", () => {
    expect(pageSource).toContain("const [calendarOpen, setCalendarOpen] = useState(false)");
    expect(pageSource).toContain("<Dialog open={calendarOpen} onOpenChange={handleCalendarDialogChange}>");
    expect(pageSource).toContain("<DialogContent");
    expect(pageSource).toContain("const handleCalendarSelect = (date: Date | undefined)");
    expect(pageSource).toContain("onSelect={setCalendarDraftDate}");
    expect(pageSource).toContain("openCalendarDialog");
    expect(pageSource).toContain("handleCalendarDialogChange");
    expect(pageSource).toContain("const applyCalendarDraft = () =>");
    expect(pageSource).toContain("const applyCalendarToday = () =>");
    expect(pageSource).toContain("<DialogClose asChild>");
    expect(pageSource).toContain("Fechar");
    expect(pageSource).toContain("Hoje");
    expect(pageSource).toContain("runQuery({ period: 'custom', studyDate });");
    expect(pageSource).toContain("sessionStorage.setItem(filterSessionKey, JSON.stringify(newFilters))");
    expect(pageSource).toContain("studyDate = studyDate.replace(/-/g, '')");
  });

  it("uses the updated action sequence and handlers for mobile actions", () => {
    expect(pageSource).toContain("setIsAttachmentsModalOpen(true)");
    expect(pageSource).toContain("setIsAnamnesisModalOpen(true)");
    expect(pageSource).toContain("handleListenAudio(study)");
    expect(pageSource).toContain("handleReport(study)");
    expect(pageSource).toContain("handlePrintReport(study)");
  });

  it("separa ações, status e prioridade clínica para acomodar todos os perfis em telas estreitas", () => {
    expect(pageSource).toContain('className="grid shrink-0 grid-flow-col auto-cols-8 justify-end gap-1.5"');
    expect(pageSource).toContain('aria-label="Sinalização clínica e prazo de laudo"');
    expect(pageSource).toContain('className="mt-2 flex w-full flex-col items-stretch gap-1.5 border-t border-gray-100 pt-2"');
    expect(pageSource).toContain('className="flex w-full flex-wrap items-center justify-center gap-1"');
    expect(pageSource).toContain('const canMarkStudyPriority = user?.role === "operador" || user?.role === "atendente"');
  });

  it("mantém a seleção de legenda canônica disponível no cartão móvel sem abrir o visualizador", () => {
    expect(pageSource).toContain("<StudyLegendPicker");
    expect(pageSource).toContain("selections={legendSelectionsByStudyUid.get(study.studyInstanceUid) ?? []}");
    expect(pageSource).toContain('event.stopPropagation()');
    expect(pageSource).toContain('["operador", "atendente", "medico", "admin_master"]');
  });

  it("mostra o progresso real do pré-download abaixo das ações e abre o viewer ao concluir", () => {
    expect(pageSource).toContain("const mobilePreDownload = preDownloadMap[study.studyInstanceUid]");
    expect(pageSource).toContain("const isMobileDownloadActive = mobilePreDownload?.phase === 'connecting' || mobilePreDownload?.phase === 'downloading'");
    expect(pageSource).toContain("grid grid-cols-10 gap-1");
    expect(pageSource).toContain("Baixando imagens para abrir o visualizador");
    expect(pageSource).toContain("o visualizador abrirá automaticamente.");
    expect(pageSource).toContain("handleVisualize(study, true)");
    expect(pageSource).toContain("openViewerAfterDownloadRef");
  });

  it("restores Laudar as a desktop table action without bypassing RBAC", () => {
    expect(pageSource).toContain('title="Laudar exame">Laudar</th>');
    expect(pageSource).toContain("{canLaudo ? (");
    expect(pageSource).toContain('aria-label="Laudar exame"');
    expect(pageSource).toContain("edit_reports");
  });

  it("normalizes DICOM patient names before displaying them", () => {
    expect(pageSource).toContain("replace(/\\^+/g, ' ').replace(/\\s{2,}/g, ' ').trim()");
    expect(pageSource).toContain(".toUpperCase()");
  });

  it("mantém um único controle de edição no card mobile", () => {
    expect(pageSource).toContain('aria-label="Editar nome do paciente"');
    expect(pageSource).toContain('<Pencil className="h-3.5 w-3.5" aria-hidden="true" />');
    expect(pageSource).not.toContain('>✏️</button>');
    expect(pageSource).not.toContain('patientNameEdited && <Pencil className="ml-1 inline h-3 w-3');
  });

  it("mantém o modal de anexos enxuto e com upload preservado", () => {
    expect(attachmentsModalSource).not.toContain("Anexos e Fotos do Paciente");
    expect(attachmentsModalSource).toContain("Anexos do paciente");
    expect(attachmentsModalSource).toContain("Fotografar");
    expect(attachmentsModalSource).toContain("Anexar arquivo");
    expect(attachmentsModalSource).toContain("Nenhum anexo · 0 arquivos");
    expect(attachmentsModalSource).toContain("{attachments.length} {attachments.length === 1 ? \"arquivo\" : \"arquivos\"}");
    expect(attachmentsModalSource).toContain('capture="environment"');
    expect(attachmentsModalSource).toContain("multiple");
    expect(attachmentsModalSource).toContain("Fechar");
    expect(attachmentsModalSource).not.toContain("Fotografe com a câmera do dispositivo ou envie múltiplos arquivos");
  });

  it("organiza o viewer mobile com cabeçalho, ações principais e rodapé de anamnese", () => {
    expect(viewerSource).toContain("Cabeçalho mobile: paciente/exame + ações principais");
    expect(viewerSource).toContain("Laudo falado");
    expect(viewerSource).toContain("Requisição");
    expect(viewerSource).toContain("handleOpenReportFromMobile");
    expect(viewerSource).toContain("handleMobileVoiceReport");
    expect(viewerSource).toContain("Anamnese compacta no rodapé mobile");
    expect(viewerSource).toContain("Navegação mobile entre imagens");
    expect(viewerSource).toContain('hidden md:flex items-center justify-between px-3 py-1.5');
    expect(viewerSource).toContain('hidden md:flex flex-col gap-0.5');
    expect(viewerSource).toContain("mobileViewerError");
    expect(viewerSource).toContain("hidden max-w-md rounded-lg bg-gray-900");
    expect(viewerSource).toContain("sessionStorage.getItem(`study_${studyUid}`)");
  });
});
