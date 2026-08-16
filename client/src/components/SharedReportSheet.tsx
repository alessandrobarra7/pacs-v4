import type { CSSProperties, ReactNode } from "react";

export type SharedBlockPosition = {
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
};

export type SharedBlockPositions = Record<string, SharedBlockPosition>;

export type SharedReportLogo = {
  url: string;
  width: number;
  height: number;
  label?: string;
};

export type SharedReportSheetProps = {
  positions: SharedBlockPositions | null | undefined;
  logos?: SharedReportLogo[];
  backgroundUrl?: string | null;
  backgroundOpacity?: number;
  backgroundSize?: string;
  footerImageUrl?: string | null;
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  patientName?: string;
  patientInfo?: ReactNode;
  title?: ReactNode;
  body?: ReactNode;
  footer?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

const fallbackPositions: SharedBlockPositions = {
  logo1: { x: 2, y: 2, w: 26, h: 11, visible: true },
  logo2: { x: 37, y: 2, w: 26, h: 11, visible: true },
  logo3: { x: 72, y: 2, w: 26, h: 11, visible: true },
  patientInfo: { x: 2, y: 15, w: 96, h: 9, visible: true },
  patientName: { x: 2, y: 25, w: 96, h: 5, visible: true },
  title: { x: 2, y: 31, w: 96, h: 6, visible: true },
  body: { x: 2, y: 38, w: 96, h: 48, visible: true },
  footer: { x: 2, y: 88, w: 96, h: 9, visible: true },
};

function blockStyle(position: SharedBlockPosition | undefined, defaults: SharedBlockPosition): CSSProperties {
  const p = position ?? defaults;
  return {
    position: "absolute",
    left: `${p.x}%`,
    top: `${p.y}%`,
    width: `${p.w}%`,
    height: `${p.h}%`,
    boxSizing: "border-box",
  };
}

/**
 * Estrutura visual para um corpo ainda não preenchido.
 * Ela orienta o médico sem gravar achados, técnica ou conclusão fictícios.
 */
export function SharedReportBodyGuide() {
  const sectionStyle: CSSProperties = {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    minHeight: "1.55em",
    borderBottom: "1px solid rgba(148, 163, 184, 0.28)",
    padding: "3px 0",
  };
  return (
    <div data-report-body-guide aria-hidden="true" style={{ color: "#94a3b8", fontSize: "0.9em", lineHeight: 1.65 }}>
      <div style={{ textAlign: "center", fontSize: "1.05em", fontWeight: 700, letterSpacing: "0.05em", color: "#64748b", marginBottom: 12 }}>
        LAUDO RADIOLOGICO
      </div>
      <div style={sectionStyle}><strong style={{ color: "#64748b" }}>Técnica:</strong><span style={{ flex: 1 }}>Digite a técnica do exame...</span></div>
      <div style={sectionStyle}><strong style={{ color: "#64748b" }}>Achados:</strong><span style={{ flex: 1 }}>Descreva os achados radiológicos...</span></div>
      <div style={sectionStyle}><strong style={{ color: "#64748b" }}>Conclusão:</strong><span style={{ flex: 1 }}>Registre a impressão diagnóstica...</span></div>
    </div>
  );
}

export function SharedReportSheet({
  positions,
  logos = [],
  backgroundUrl,
  backgroundOpacity = 1,
  backgroundSize = "cover",
  footerImageUrl,
  fontFamily = "Arial, Helvetica, sans-serif",
  fontSize = 11,
  lineHeight = 1.6,
  patientName,
  patientInfo,
  title,
  body,
  footer,
  className = "",
  style,
  children,
}: SharedReportSheetProps) {
  const merged: SharedBlockPositions = { ...fallbackPositions, ...(positions ?? {}) };
  // Compatibilidade: layouts antigos persistiam uma única chave `logo`.
  // A folha canônica expande esse bloco para logo1/2/3 somente quando as
  // posições novas ainda não existem, evitando divergência entre admin e clínico.
  const legacyLogo = positions?.logo;
  if (legacyLogo) {
    ["logo1", "logo2", "logo3"].forEach((id, index) => {
      if (!positions?.[id]) {
        const step = Math.min(24, legacyLogo.w + 4);
        merged[id] = {
          ...fallbackPositions[id],
          ...legacyLogo,
          x: Math.max(0, Math.min(100 - legacyLogo.w, legacyLogo.x + index * step)),
          y: Math.max(0, Math.min(100 - legacyLogo.h, legacyLogo.y)),
        };
      }
    });
  }
  const paperStyle: CSSProperties = {
    height: "297mm",
    minHeight: "1123px",
    width: "100%",
    maxWidth: "210mm",
    marginInline: "auto",
    position: "relative",
    overflow: "hidden",
    background: "#fff",
    color: "#111",
    fontFamily,
    fontSize: `${fontSize}pt`,
    lineHeight,
    boxSizing: "border-box",
    ...style,
  };

  return (
    <div className={`shared-report-sheet ${className}`} style={paperStyle} data-shared-report-sheet>
      {backgroundUrl && (
        <img
          src={backgroundUrl}
          alt="Fundo do laudo"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ zIndex: 0, opacity: backgroundOpacity, objectFit: backgroundSize === "contain" ? "contain" : "cover" }}
        />
      )}

      {["logo1", "logo2", "logo3"].map((id, index) => {
        const position = merged[id];
        const logo = logos[index];
        if (!position?.visible || !logo) return null;
        return (
          <div key={id} data-layout-block={id} style={{ ...blockStyle(position, fallbackPositions[id]), display: "flex", alignItems: "center", justifyContent: "center", padding: 4, zIndex: 2 }}>
            <img src={logo.url} alt={logo.label || `Logo ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
          </div>
        );
      })}

      {merged.patientInfo?.visible && (
        <div data-layout-block="patientInfo" style={{ ...blockStyle(merged.patientInfo, fallbackPositions.patientInfo), display: "flex", alignItems: "center", padding: "4px 8px", zIndex: 3 }}>
          {patientInfo}
        </div>
      )}

      {merged.patientName?.visible && (
        <div data-layout-block="patientName" style={{ ...blockStyle(merged.patientName, fallbackPositions.patientName), display: "flex", alignItems: "center", padding: "0 8px", zIndex: 3 }}>
          <span style={{ fontSize: "11.5pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.02em" }}>{patientName || "—"}</span>
        </div>
      )}

      {merged.title?.visible && (
        <div data-layout-block="title" style={{ ...blockStyle(merged.title, fallbackPositions.title), display: "flex", alignItems: "center", justifyContent: "center", padding: "0 8px", zIndex: 3 }}>
          {title}
        </div>
      )}

      {merged.body?.visible && (
        <div data-layout-block="body" style={{ ...blockStyle(merged.body, fallbackPositions.body), display: "flex", flexDirection: "column", padding: "8px 12px", overflow: "auto", zIndex: 3 }}>
          {body}
        </div>
      )}

      {merged.footer?.visible && (
        <div data-layout-block="footer" style={{ ...blockStyle(merged.footer, fallbackPositions.footer), display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", zIndex: 4 }}>
          {footerImageUrl && <img src={footerImageUrl} alt="Rodapé" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
          <div style={{ position: "relative", zIndex: 1, width: "100%" }}>{footer}</div>
        </div>
      )}

      {children}
    </div>
  );
}
