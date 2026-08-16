import React, { type CSSProperties, type ReactNode } from "react";

export type ClinicalPatientDetailsProps = {
  patientName?: string;
  birthDate?: string;
  sex?: string;
  studyDate?: string;
  modality?: string;
  unitName?: string;
  children?: ReactNode;
};

const detailsStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: 2,
  fontSize: "8.5pt",
  lineHeight: 1.35,
  color: "#202833",
};

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  columnGap: 12,
  rowGap: 2,
};

const labelStyle: CSSProperties = {
  fontWeight: 700,
  color: "#3f4d5a",
};

export function ClinicalPatientName({ patientName }: Pick<ClinicalPatientDetailsProps, "patientName">) {
  return (
    <div data-clinical-patient-name style={{ width: "100%", fontSize: "11pt", fontWeight: 700, lineHeight: 1.35, color: "#111827", textTransform: "uppercase", letterSpacing: "0.02em" }}>
      {patientName || "—"}
    </div>
  );
}

export function ClinicalPatientDetails({
  birthDate,
  sex,
  studyDate,
  modality,
  children,
}: ClinicalPatientDetailsProps) {
  return (
    <div data-clinical-patient-details style={detailsStyle}>
      <div style={rowStyle}>
        <span><span style={labelStyle}>Data:</span>{" "}{studyDate || "—"}</span>
        {modality && <span><span style={labelStyle}>Modalidade:</span>{" "}{modality}</span>}
      </div>
      <div style={rowStyle}>
        <span><span style={labelStyle}>Data de nascimento:</span>{" "}{birthDate || "—"}</span>
        <span><span style={labelStyle}>Sexo:</span>{" "}{sex || "—"}</span>
      </div>
      {children}
    </div>
  );
}
