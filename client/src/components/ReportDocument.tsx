import { forwardRef, useImperativeHandle, useRef, useCallback } from "react";
import DOMPurify from 'dompurify';

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
  showSignature?: boolean;
  readOnly?: boolean;
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
      showSignature = false,
      readOnly = false,
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

    return (
      <div
        ref={containerRef}
        id="report-document"
        className="bg-white text-black shadow-lg mx-auto"
        style={{
          width: "210mm",
          minHeight: "297mm",
          padding: "20mm 25mm 25mm 25mm",
          fontFamily: "Arial, sans-serif",
          fontSize: "11pt",
          lineHeight: "1.6",
          boxSizing: "border-box",
        }}
      >
        {/* Cabeçalho */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderBottom: "2px solid #1a365d",
            paddingBottom: "10px",
            marginBottom: "16px",
            gap: "16px",
          }}
        >
          {unitLogoUrl && (
            <img
              src={unitLogoUrl}
              alt="Logo"
              style={{ height: "60px", objectFit: "contain" }}
            />
          )}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: "14pt",
                fontWeight: "bold",
                color: "#1a365d",
              }}
            >
              {unitName || "Unidade de Saúde"}
            </div>
            <div style={{ fontSize: "9pt", color: "#555" }}>
              Laudo de Exame de Imagem
            </div>
          </div>
        </div>

        {/* Dados do Paciente */}
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
                  background: "#f0f4f8",
                  fontWeight: "bold",
                  width: "120px",
                  border: "1px solid #d0d7de",
                }}
              >
                Paciente:
              </td>
              <td
                style={{
                  padding: "4px 8px",
                  border: "1px solid #d0d7de",
                  textTransform: "uppercase",
                }}
              >
                {patientName || "—"}
              </td>
              <td
                style={{
                  padding: "4px 8px",
                  background: "#f0f4f8",
                  fontWeight: "bold",
                  width: "100px",
                  border: "1px solid #d0d7de",
                }}
              >
                Data:
              </td>
              <td
                style={{
                  padding: "4px 8px",
                  border: "1px solid #d0d7de",
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
                  background: "#f0f4f8",
                  fontWeight: "bold",
                  border: "1px solid #d0d7de",
                }}
              >
                Modalidade:
              </td>
              <td
                style={{
                  padding: "4px 8px",
                  border: "1px solid #d0d7de",
                }}
              >
                {modality || "—"}
              </td>
              <td
                style={{
                  padding: "4px 8px",
                  background: "#f0f4f8",
                  fontWeight: "bold",
                  border: "1px solid #d0d7de",
                }}
              >
                Médico:
              </td>
              <td
                style={{
                  padding: "4px 8px",
                  border: "1px solid #d0d7de",
                }}
              >
                {doctorName || "—"}
              </td>
            </tr>
          </tbody>
        </table>

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
            color: "#1a365d",
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
            fontSize: "11pt",
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
              textAlign: "center",
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
                  margin: "0 auto 8px",
                }}
              />
            )}
            <div style={{ fontWeight: "bold", fontSize: "10pt" }}>
              {doctorName}
            </div>
            {crm && (
              <div style={{ fontSize: "9pt", color: "#555" }}>CRM: {crm}</div>
            )}
          </div>
        )}

        {/* Rodapé */}
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
      </div>
    );
  }
);

ReportDocument.displayName = "ReportDocument";
export default ReportDocument;
