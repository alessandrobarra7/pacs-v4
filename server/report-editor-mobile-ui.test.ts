import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const editorSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/ReportEditorPage.tsx"),
  "utf8",
);
const sharedSheetSource = readFileSync(
  resolve(process.cwd(), "client/src/components/SharedReportSheet.tsx"),
  "utf8",
);
const pacsSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"),
  "utf8",
);
const sharedPrintSource = readFileSync(
  resolve(process.cwd(), "client/src/components/SharedReportPrint.tsx"),
  "utf8",
);

describe("ReportEditorPage — experiência mobile", () => {
  it("mantém o editor desktop separado do fluxo mobile", () => {
    expect(editorSource).toContain('className="hidden md:flex flex-1 overflow-hidden print:block"');
    expect(editorSource).toContain('className="relative flex md:hidden min-h-0 flex-1 flex-col bg-slate-50 print:hidden"');
    expect(editorSource).toContain("const [showMobileTools, setShowMobileTools] = useState(false)");
  });

  it("preserva as ações essenciais e ferramentas do laudo no celular", () => {
    expect(editorSource).toContain('aria-label={financialDocumentView ? "Baixar PDF do laudo" : "Imprimir laudo"}');
    expect(editorSource).toContain("onClick={handleSign}");
    expect(editorSource).toContain("Salvar rascunho");
    expect(editorSource).toContain("Ferramentas do laudo");
    expect(editorSource).toContain("Pré-visualizar laudo");
    expect(editorSource).toContain("ModelosTab");
    expect(editorSource).toContain("FrasesTab");
    expect(editorSource).toContain("CarimboTab");
  });

  it("oculta comandos de edição na abertura financeira e oferece somente download", () => {
    expect(editorSource).toContain('const financialDocumentView = reportSearch.get("financialView") === "1"');
    expect(editorSource).toContain("handleFinancialPdfDownload");
    expect(editorSource).toContain("!financialDocumentView && showMobileTools");
    expect(editorSource).toContain("!financialDocumentView && <aside");
  });

  it("usa documento fluido no mobile e preserva a folha compartilhada no desktop", () => {
    expect(editorSource).toContain('className="report-page"');
    expect(editorSource).toContain("<SharedReportSheet");
    // Bloqueio 1 (auditoria Manus 2026-09-24): a folha deixou de ter
    // dimensão A4 fixa — agora deriva de `pageSize` (A4/Letter), com o
    // mesmo padrão usado em ReportEditorPage/PacsQueryPage para o restante
    // do documento (paperW/paperH). Ainda preserva o legado de logo único.
    expect(sharedSheetSource).toContain('paperWidthMm = pageSize === "Letter" ? 216 : 210');
    expect(sharedSheetSource).toContain('paperHeightMm = pageSize === "Letter" ? 279 : 297');
    expect(sharedSheetSource).toContain('const legacyLogo = positions?.logo;');
    expect(sharedSheetSource).toContain('maxWidth: `${paperWidthMm}mm`');
    expect(sharedSheetSource).toContain('fontFamily = "Arial, Helvetica, sans-serif"');
    expect(editorSource).toContain("min-h-[350px]");
    expect(editorSource).toContain("bottom-20 right-4");
  });

  it("usa SharedReportSheet como canvas único com os mesmos blocos e coordenadas do layout administrativo", () => {
    expect(editorSource).toContain("<SharedReportSheet");
    expect(editorSource).toContain("SharedReportBodyGuide");
    expect(editorSource).toContain('data-placeholder={showBodyGuide ? "" : "Digite o laudo aqui..."}');
    expect(editorSource).toContain('const showSectionBodyGuide = !sectionHasContent && !isPreview;');
    expect(editorSource).toContain('data-placeholder={showSectionBodyGuide ? "" : `Digite o laudo de ${name}...`}');
    expect(sharedSheetSource).toContain('data-report-body-guide');
    expect(editorSource).toContain("positions={layoutBlockPos}");
    expect(editorSource).toContain("backgroundUrl={layoutBgUrl}");
    expect(editorSource).toContain("footerImageUrl={layoutFooterUrl}");
    expect(sharedSheetSource).toContain('data-layout-block={id}');
    expect(sharedSheetSource).toContain('data-layout-block="patientName"');
    expect(sharedSheetSource).toContain('data-layout-block="patientInfo"');
    expect(sharedSheetSource).toContain('data-layout-block="title"');
    expect(sharedSheetSource).toContain('data-layout-block="body"');
    expect(sharedSheetSource).toContain('data-layout-block="footer"');
    expect(sharedSheetSource).toContain('left: `${p.x}%`');
    expect(sharedSheetSource).toContain('top: `${p.y}%`');
  });

  it("usa o mesmo SharedReportSheet no editor clínico e na exportação", () => {
    expect(editorSource).toContain("ClinicalPatientDetails");
    expect(editorSource).toContain("patientNameContent: <ClinicalPatientName patientName={patientName} />");
    expect(pacsSource).toContain("ClinicalPatientDetails");
    expect(pacsSource).toContain("patientNameContent: <ClinicalPatientName patientName={patientName} />");
    expect(editorSource).toContain("renderSharedReportSheetHtml");
    expect(editorSource).toContain("positions: layoutBlockPos");
    expect(editorSource).toContain("footerImageUrl: footerBase64 || layoutFooterUrl");
    expect(pacsSource).toContain("renderSharedReportSheetHtml");
    expect(pacsSource).toContain("positions: blockPositionsQ");
    expect(pacsSource).toContain("footerImageUrl: footerBase64Q || lFooterUrl");
    expect(sharedPrintSource).toContain("renderToStaticMarkup");
    expect(sharedPrintSource).toContain("createElement(SharedReportSheet, props)");
  });

  it("refaz a consulta quando o administrador salva um layout em outra aba", () => {
    expect(editorSource).toContain('refetch: refetchUnitLayout');
    expect(editorSource).toContain('pacs-layout-updated');
    expect(editorSource).toContain('pacs-layout-updates');
    expect(editorSource).toContain('void refetchUnitLayout()');
  });

  it("usa o assinante persistido e a unidade do estudo ao abrir ou imprimir um laudo concluído", () => {
    expect(editorSource).toContain('getByStudyUidWithDoctor.useQuery');
    expect(editorSource).toContain('unit_id: unitId || undefined');
    expect(editorSource).toContain('const signedDoctorName = isSigned');
    expect(editorSource).toContain('const signedDoctorSignatureUrl = isSigned');
    expect(editorSource).toContain('signedDoctorName');
    expect(editorSource).toContain('signedDoctorSignatureUrl');
    expect(editorSource).not.toContain('isSigned && medCtx?.doctorName');
  });

  it("mantém a unidade na rota e reconhece o documento histórico primary quando ele é o único do estudo", () => {
    expect(editorSource).toContain('const unitIdFromRoute = Number(reportSearch.get("unitId")) || 0;');
    expect(editorSource).toContain('const unitId = studyInfo?.unitId ?? unitIdFromRoute;');
    expect(pacsSource).toContain('&unitId=${encodeURIComponent(String(effectiveUnitId))}');
  });

  /**
   * Regressão (auditoria Manus 2026-09-24, Parecer de Auditoria — Setor de
   * Laudos, Bloqueio 1): a impressão rápida (download) da lista de exames
   * tinha o formato do PDF hardcoded como 'a4', ignorando pageSizeQ — uma
   * unidade configurada para Letter baixava um PDF A4 por essa via,
   * divergente das outras 3 vias de geração do mesmo laudo.
   */
  it("impressão rápida (PacsQueryPage) usa pageSizeQ no jsPDF, não 'a4' fixo", () => {
    expect(pacsSource).not.toContain("new jsPDF('p', 'mm', 'a4')");
    expect(pacsSource).toContain("new jsPDF('p', 'mm', pageSizeQ.toLowerCase() as 'a4' | 'letter')");
  });

  /**
   * Regressão (Bloqueio 1): a folha compartilhada (SharedReportSheet) deixou
   * de ter A4/sem-margem fixos — as 4 vias que a renderizam para
   * impressão/PDF agora repassam pageSize e as 4 margens efetivas da
   * unidade (nunca mais um valor hardcoded independente da configuração).
   */
  it("as 4 vias de impressão/PDF repassam pageSize e margens efetivas ao SharedReportSheet", () => {
    // Via 1: impressão oficial / impressão rápida de laudo único
    // (renderPrintSheet, usado tanto para multi-seção quanto para página
    // única dentro de handlePrint em ReportEditorPage.tsx).
    expect(editorSource).toContain("marginTop: lMT");
    expect(editorSource).toContain("marginRight: lMR");
    expect(editorSource).toContain("marginBottom: lMB");
    expect(editorSource).toContain("marginLeft: lML");
    // Via 2: impressão rápida da lista de exames (PacsQueryPage.tsx) — usa
    // as mesmas variáveis com sufixo Q.
    expect(pacsSource).toContain("marginTop: lMT");
    expect(pacsSource).toContain("marginRight: lMR");
    expect(pacsSource).toContain("marginBottom: lMB");
    expect(pacsSource).toContain("marginLeft: lML");
    // Via 3: a folha em tela (WYSIWYG do editor clínico) também recebe as
    // preferências efetivas — é ela que o download financeiro rasteriza via
    // html2canvas, então precisa nascer já no tamanho/margem corretos.
    expect(editorSource).toContain("pageSize={effectiveLayoutPrefs.pageSize}");
    expect(editorSource).toContain("marginTop={effectiveLayoutPrefs.marginTop}");
    // Via 4 (PDF do financeiro, client/src/lib/financialReportPdfDownload.ts)
    // já lia pageSize/margens corretamente antes desta correção — mantido.
  });

  /**
   * Regressão (auditoria Manus 2026-09-24, Parecer de Auditoria — Setor de
   * Laudos, Bloqueio 2): saveSelection()/insertAtCursor() miravam sempre
   * docRef (instância desktop) fora do modo multi-seção — mesmo quando o
   * laudo simples estava sendo editado pela UI mobile (mobileDocRef). Um
   * Trecho inserido pelo toque no celular podia ir parar no editor desktop
   * oculto, ou perder a posição real do cursor. Corrigido introduzindo
   * getActiveEditableEl(), que usa getVisibleDoc() (já existia, decide
   * mobileDocRef vs docRef pela largura real da viewport) fora do modo
   * multi-seção, e sectionRefs no modo multi-seção (preservando o
   * comportamento anterior desse caminho).
   */
  it("saveSelection e insertAtCursor usam o editor ativo (mobile/desktop/seção em foco), não sempre docRef", () => {
    expect(editorSource).toContain("const getActiveEditableEl = useCallback((): HTMLDivElement | null => {");
    expect(editorSource).toContain("return getVisibleDoc();");
    // saveSelection não checa mais containment fixo contra docRef.current
    expect(editorSource).toContain("const activeEl = getActiveEditableEl();");
    expect(editorSource).toContain("if (sel && sel.rangeCount > 0 && activeEl?.contains(sel.anchorNode)) {");
    // insertAtCursor agora obtém o alvo via getActiveEditableEl() (não mais
    // um ternário fixo isMultiSection ? sectionRefs : docRef.current só seu —
    // outras funções, como addInlineImage, continuam com seu próprio ternário
    // por não fazerem parte deste bloqueio).
    expect(editorSource).toContain(
      "const insertAtCursor = useCallback((text: string, opts?: { smartSeparator?: boolean }) => {"
    );
    expect(editorSource).toContain("const targetEl = getActiveEditableEl();");
  });

  /**
   * Regressão (Bloqueio 2): arrastar-e-soltar uma frase pronta ("Trecho")
   * não aplicava o mesmo separador inteligente do clique — podia colar sem
   * espaço/quebra igual ao bug original de clique já corrigido antes. Os 2
   * pontos de drop de frase (multi-seção e página única) agora passam
   * smartSeparator: true, igual ao clique (onInsert dos painéis de Trechos).
   */
  it("arrastar-e-soltar de frase aplica smartSeparator, igual ao clique", () => {
    const dropPhraseInserts = editorSource.match(
      /insertAtCursor\(payload\.data, \{ smartSeparator: true \}\);/g
    ) ?? [];
    // 2 ocorrências: drop no modo multi-seção e no modo página única.
    expect(dropPhraseInserts.length).toBe(2);
  });

  /**
   * Regressão (Bloqueio 2): getCharBeforeRange não subia pela árvore quando
   * o cursor estava no início de um nó aninhado (ex.: início de um
   * <strong>/<em> sem irmão de texto no mesmo nível) — podia decidir
   * incorretamente se precisava inserir separador. Agora sobe por
   * current.parentNode procurando irmãos anteriores em cada nível, até o
   * limite do editor (boundary), sem escapar da área editável.
   */
  it("getCharBeforeRange sobe pela árvore (parentNode) até o limite do editor ao procurar o caractere anterior", () => {
    expect(editorSource).toContain("const getCharBeforeRange = (range: Range, boundary?: Node | null): string => {");
    expect(editorSource).toContain("current = current.parentNode;");
    expect(editorSource).toContain("while (current && current !== boundary) {");
    // A chamada em insertAtCursor agora passa o editor ativo como limite.
    expect(editorSource).toContain("getCharBeforeRange(sel.getRangeAt(0), targetEl)");
  });
});
