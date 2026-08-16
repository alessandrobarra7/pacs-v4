import React from "react";
import { SharedReportSheet, type SharedReportSheetProps } from "./SharedReportSheet";

/**
 * Camada visual exclusiva do ambiente médico e da impressão.
 *
 * O admin continua renderizando SharedReportSheet diretamente. Aqui usamos a
 * mesma geometria persistida, mas aplicamos a linguagem visual do
 * ReportDocument do código de referência: identificação em painel discreto,
 * título institucional e corpo com rótulo de laudo.
 */
export function ClinicalReportSheet({
  patientInfo,
  title,
  body,
  footer,
  ...sheetProps
}: SharedReportSheetProps) {
  return (
    <SharedReportSheet
      {...sheetProps}
      patientInfo={
        <div
          data-clinical-patient-panel
          style={{
            width: "100%",
            minHeight: "100%",
            display: "flex",
            alignItems: "center",
            padding: "4px 8px",
            border: "1px solid #d9e0e7",
            background: "#f8fafc",
            boxSizing: "border-box",
            color: "#243447",
          }}
        >
          {patientInfo}
        </div>
      }
      title={
        <div
          data-clinical-exam-title
          style={{
            width: "100%",
            textAlign: "center",
            fontWeight: 700,
            fontSize: "12pt",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "6px 8px",
            borderTop: "1px solid #d9e0e7",
            borderBottom: "1px solid #d9e0e7",
            color: "#17202a",
            boxSizing: "border-box",
          }}
        >
          {title}
        </div>
      }
      body={
        <div
          data-clinical-report-body
          style={{
            width: "100%",
            minHeight: "100%",
            padding: "8px 12px",
            boxSizing: "border-box",
            color: "#111827",
            background: "#fff",
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: "10pt",
              marginBottom: 6,
              color: "#243447",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Laudo:
          </div>
          {body}
        </div>
      }
      footer={
        <div
          data-clinical-report-footer
          style={{
            width: "100%",
            padding: "8px 10px",
            borderTop: "1px solid #d0d7de",
            boxSizing: "border-box",
            background: "#fff",
          }}
        >
          {footer}
        </div>
      }
    />
  );
}

export default ClinicalReportSheet;
