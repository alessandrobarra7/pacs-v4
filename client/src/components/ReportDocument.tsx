import { forwardRef, useImperativeHandle, useRef, useCallback } from "react";
import DOMPurify from 'dompurify';
import { DEFAULT_LAYOUT_PREFERENCES, type LayoutPreferences } from '../../../shared/types';

// F1-4: Sanitiza HTML antes de atribuir ao innerHTML (previne XSS no visualizador de laudos)
function sanitizeForDisplay(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'sub', 'sup', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr',
      'ul', 'ol', 'li', 'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col',
    ],
    ALLOWED_ATTR: [
      'style', 'class', 'id', 'align', 'valign',
      'href', 'target', 'rel',
      'src', 'alt', 'width', 'height',
      'colspan', 'rowspan', 'span',
    ],
    ALLOW_DATA_ATTR: false,
  });
}

export interface ReportDocumentHandle {
  insertAtCursor: (text: string) => void;
  getContent: () => string;
  setContent: (html: string) => void;
  getElement: () => HTMLElement | null;
}

interface ReportDocumentProps {
  unitLogoUrl?: string | null;
  unitName?: string;
  patientName?: string;
  studyDate?: string;
  modality?: string;
  examTitle?: string;
  doctorName?: string;
  crm?: string;
  signatureUrl?: string | null;
  /** URL do carimbo do médico (stamp_url) */
  stampUrl?: string | null;
  showSignature?: boolean;
  readOnly?: boolean;
  /** HTML personalizado do cabeçalho (já sanitizado pelo backend) */
  headerHtml?: string | null;
  /** HTML personalizado do rodapé (já sanitizado pelo backend) */
  footerHtml?: string | null;
  /** Preferências visuais do layout da unidade */
  preferences?: Partial<LayoutPreferences>;
}

const ReportDocument = forwardRef<ReportDocumentHandle, ReportDocumentProps>(
  function ReportDocument(
    {
      unitLogoUrl,
      unitName,
      patientName,
      studyDate,
      modality,
      examTitle,
      doctorName,
      crm,
      signatureUrl,
      stampUrl,
      showSignature = false,
      readOnly = false,
      headerHtml,
      footerHtml,
      preferences,
    },
    ref
  ) {
    const editorRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const savedRange = useRef<Range | null>(null);

    const saveSelection = useCallback(() => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && editorRef.current) {
        const range = sel.getRangeAt(0);
        if (editorRef.current.contains(range.startContainer)) {
          savedRange.current = range.cloneRange();
        }
      }
    }, []);

    useImperativeHandle(ref, () => ({
      insertAtCursor(text: string) {
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus();
        let range: Range | null = null;
        if (savedRange.current && editor.contains(savedRange.current.startContainer)) {
          range = savedRange.current;
        } else {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).startContainer)) {
            range = sel.getRangeAt(0);
          }
        }
        if (range) {
          range.deleteContents();
          const textNode = document.createTextNode(text);
          range.insertNode(textNode);
          range.setStartAfter(textNode);
          range.collapse(true);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          savedRange.current = range.cloneRange();
        } else {
          const p = document.createElement("p");
          p.textContent = text;
          editor.appendChild(p);
        }
      },
      getContent() {
        return editorRef.current?.innerHTML ?? "";
      },
      setContent(html: string) {
        if (editorRef.current) {
          if (!html.includes("<")) {
            // Texto puro: envolver em parágrafos (sem HTML, sem risco de XSS)
            editorRef.current.innerHTML = html
              .split("\n\n")
              .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
              .join("");
          } else {
            // F1-4: Sanitizar HTML antes de atribuir ao innerHTML
            editorRef.current.innerHTML = sanitizeForDisplay(html);
          }
        }
      },
      getElement() {
        return containerRef.current;
      },
    }));

    // studyDate já vem formatada como DD/MM/YYYY do ReportEditorPage
    const formatDate = (dateStr?: string) => dateStr ?? "";

    // Mesclar preferences com defaults — garante que campos ausentes usem valores padrão
    const prefs: LayoutPreferences = { ...DEFAULT_LAYOUT_PREFERENCES, ...preferences };

    // Alinhamento da assinatura
    const sigAlign = prefs.signaturePosition === 'bottom-left' ? 'left'
      : prefs.signaturePosition === 'bottom-center' ? 'center' : 'right';
    const sigMargin = prefs.signaturePosition === 'bottom-right' ? '0 0 8px auto'
      : prefs.signaturePosition === 'bottom-left' ? '0 auto 8px 0' : '0 auto 8px';

    return (
      <div
        ref={containerRef}
        id="report-document"
        className="bg-white text-black shadow-lg mx-auto"
        style={{
          width: prefs.pageSize === 'Letter' ? '216mm' : '210mm',
          minHeight: prefs.pageSize === 'Letter' ? '279mm' : '297mm',
          padding: `${prefs.marginTop}mm ${prefs.marginRight}mm ${prefs.marginBottom}mm ${prefs.marginLeft}mm`,
          fontFamily: `${prefs.fontFamily}, sans-serif`,
          fontSize: `${prefs.fontSize}pt`,
          lineHeight: String(prefs.lineHeight),
          boxSizing: "border-box",
        }}
      >
        {/* Cabeçalho — HTML personalizado OU cabeçalho padrão */}
        {headerHtml ? (
          <div
            dangerouslySetInnerHTML={{ __html: sanitizeForDisplay(headerHtml) }}
            style={{ marginBottom: '16px' }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              borderBottom: prefs.showHeaderDivider ? `2px solid ${prefs.headerBorderColor}` : 'none',
              paddingBottom: "10px",
              marginBottom: "16px",
              gap: "16px",
              justifyContent: prefs.logoAlign === 'right' ? 'flex-end'
                : prefs.logoAlign === 'center' ? 'center' : 'flex-start',
            }}
          >
            {unitLogoUrl && (
              <img
                src={unitLogoUrl}
                alt="Logo"
                style={{ height: `${prefs.logoHeight}px`, objectFit: "contain" }}
              />
            )}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: "14pt",
                  fontWeight: "bold",
                  color: prefs.headerTextColor,
                }}
              >
                {unitName || "Unidade de Saúde"}
              </div>
              <div style={{ fontSize: "9pt", color: "#555" }}>
                Laudo de Exame de Imagem
              </div>
            </div>
          </div>
        )}

        {/* Dados do Paciente */}
        {prefs.showPatientTable && (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginBottom: "16px",
              fontSize: "10pt",
            }}
          >
            <tbody>
              <tr>
                <td
                  style={{
                    padding: "4px 8px",
                    background: prefs.accentBgColor,
                    fontWeight: "bold",
                    width: "120px",
                    border: `1px solid ${prefs.accentBorderColor}`,
                  }}
                >
                  Paciente:
                </td>
                <td
                  style={{
                    padding: "4px 8px",
                    border: `1px solid ${prefs.accentBorderColor}`,
                    textTransform: "uppercase",
                  }}
                >
                  {patientName || "—"}
                </td>
                <td
                  style={{
                    padding: "4px 8px",
                    background: prefs.accentBgColor,
                    fontWeight: "bold",
                    width: "100px",
                    border: `1px solid ${prefs.accentBorderColor}`,
                  }}
                >
                  Data:
                </td>
                <td
                  style={{
                    padding: "4px 8px",
                    border: `1px solid ${prefs.accentBorderColor}`,
                    width: "120px",
                  }}
                >
                  {formatDate(studyDate)}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    padding: "4px 8px",
                    background: prefs.accentBgColor,
                    fontWeight: "bold",
                    border: `1px solid ${prefs.accentBorderColor}`,
                  }}
                >
                  Modalidade:
                </td>
                <td
                  style={{
                    padding: "4px 8px",
                    border: `1px solid ${prefs.accentBorderColor}`,
                  }}
                >
                  {modality || "—"}
                </td>
                <td
                  style={{
                    padding: "4px 8px",
                    background: prefs.accentBgColor,
                    fontWeight: "bold",
                    border: `1px solid ${prefs.accentBorderColor}`,
                  }}
                >
                  Médico:
                </td>
                <td
                  style={{
                    padding: "4px 8px",
                    border: `1px solid ${prefs.accentBorderColor}`,
                  }}
                >
                  {doctorName || "—"}
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Título do Exame */}
        {examTitle && (
          <div
            style={{
              textAlign: "center",
              fontWeight: "bold",
              fontSize: "12pt",
              marginBottom: "16px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {examTitle}
          </div>
        )}

        {/* Corpo do Laudo */}
        <div
          style={{
            fontWeight: "bold",
            fontSize: "10pt",
            marginBottom: "6px",
            color: prefs.headerTextColor,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Laudo:
        </div>
        <div
          ref={editorRef}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          spellCheck
          style={{
            minHeight: "180px",
            outline: readOnly ? "none" : "1px solid #cbd5e0",
            padding: "10px",
            borderRadius: "4px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: readOnly ? "transparent" : "#fafafa",
            fontSize: `${prefs.fontSize}pt`,
            lineHeight: "1.8",
          }}
          data-placeholder="Digite o laudo aqui..."
          onMouseUp={saveSelection}
          onKeyUp={saveSelection}
          onFocus={saveSelection}
        />

        {/* Assinatura */}
        {showSignature && (
          <div
            style={{
              marginTop: "40px",
              paddingTop: "16px",
              borderTop: "1px solid #d0d7de",
              textAlign: sigAlign as "left" | "center" | "right",
            }}
          >
            {signatureUrl && (
              <img
                src={signatureUrl}
                alt="Assinatura"
                style={{
                  maxHeight: "60px",
                  maxWidth: "200px",
                  objectFit: "contain",
                  display: "block",
                  margin: sigMargin,
                }}
              />
            )}
            {/* Carimbo do médico */}
            {prefs.showStamp && stampUrl && (
              <img
                src={stampUrl}
                alt="Carimbo"
                style={{
                  maxHeight: "50px",
                  maxWidth: "200px",
                  objectFit: "contain",
                  display: "block",
                  margin: sigMargin,
                }}
              />
            )}
            <div style={{ fontWeight: "bold", fontSize: "10pt" }}>
              {doctorName}
            </div>
            {prefs.showCrm && crm && (
              <div style={{ fontSize: "9pt", color: "#555" }}>CRM: {crm}</div>
            )}
          </div>
        )}

        {/* Rodapé — HTML personalizado OU rodapé padrão */}
        {footerHtml ? (
          <div
            dangerouslySetInnerHTML={{ __html: sanitizeForDisplay(footerHtml) }}
            style={{ marginTop: '30px' }}
          />
        ) : (
          <div
            style={{
              marginTop: "30px",
              paddingTop: "8px",
              borderTop: "1px solid #e2e8f0",
              fontSize: "8pt",
              color: "#888",
              textAlign: "center",
            }}
          >
            Documento gerado em {new Date().toLocaleDateString("pt-BR")} às{" "}
            {new Date().toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </div>
    );
  }
);

ReportDocument.displayName = "ReportDocument";
export default ReportDocument;
