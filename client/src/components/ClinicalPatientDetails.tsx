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
    <div data-clinical-patient-name style={{ width: "100%", fontSize: "9pt", lineHeight: 1.35, color: "#17202a" }}>
      <span style={labelStyle}>Nome do paciente:</span>{" "}
      <span style={{ textTransform: "uppercase" }}>{patientName || "—"}</span>
    </div>
  );
}

export function ClinicalPatientDetails({
  birthDate,
  sex,
  studyDate,
  modality,
  unitName,
  children,
}: ClinicalPatientDetailsProps) {
  return (
    <div data-clinical-patient-details style={detailsStyle}>
      {unitName && (
        <div style={{ textAlign: "center", fontSize: "9pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 2 }}>
          {unitName}
        </div>
      )}
      <div style={rowStyle}>
        <span><span style={labelStyle}>Data de nascimento:</span>{" "}{birthDate || "—"}</span>
        <span><span style={labelStyle}>Sexo:</span>{" "}{sex || "—"}</span>
      </div>
      <div style={rowStyle}>
        <span><span style={labelStyle}>Data de realização do exame:</span>{" "}{studyDate || "—"}</span>
        {modality && <span><span style={labelStyle}>Modalidade:</span>{" "}{modality}</span>}
      </div>
      {children}
    </div>
  );
}
