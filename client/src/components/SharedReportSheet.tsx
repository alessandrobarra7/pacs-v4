import React from "react";
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
  patientNameContent?: ReactNode;
  patientInfo?: ReactNode;
  title?: ReactNode;
  body?: ReactNode;
  footer?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /**
   * Tamanho físico da folha e margens efetivas (mm), vindos de
   * LayoutPreferences (DEFAULT_LAYOUT_PREFERENCES em shared/types.ts).
   * Opcionais e retrocompatíveis: quando ausentes, mantém o comportamento
   * histórico deste componente (folha A4, sem margem — os blocos ocupavam
   * 100% da folha física). Correção da auditoria Manus 2026-09-24
   * (Parecer de Auditoria — Setor de Laudos, Bloqueio 1): antes deste campo
   * existir, as 4 vias de geração de PDF/impressão ignoravam por completo o
   * pageSize/margens configurados pelo administrador quando renderizavam
   * esta folha compartilhada — a folha sempre saía A4 sem margem,
   * independente da unidade.
   */
  pageSize?: "A4" | "Letter";
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
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
  patientNameContent,
  patientInfo,
  title,
  body,
  footer,
  className = "",
  style,
  children,
  pageSize = "A4",
  marginTop = 0,
  marginRight = 0,
  marginBottom = 0,
  marginLeft = 0,
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
  // Dimensão física real da folha (A4/Letter) — antes fixa em 297mm/210mm,
  // ignorando o pageSize configurado (Bloqueio 1, auditoria Manus 2026-09-24).
  const paperWidthMm = pageSize === "Letter" ? 216 : 210;
  const paperHeightMm = pageSize === "Letter" ? 279 : 297;
  const paperStyle: CSSProperties = {
    height: `${paperHeightMm}mm`,
    width: "100%",
    maxWidth: `${paperWidthMm}mm`,
    marginInline: "auto",
    position: "relative",
    overflow: "hidden",
    background: "#fff",
    color: "#111",
    fontFamily,
    fontSize: `${fontSize}pt`,
    lineHeight,
    boxSizing: "border-box",
    // Margens efetivas da unidade, aplicadas como padding da folha física.
    padding: `${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm`,
    ...style,
  };
  // Os blocos (logo, paciente, título, corpo, rodapé) são posicionados em
  // percentual dentro da ÁREA ÚTIL (já descontadas as margens), não da folha
  // física inteira — por isso ficam num wrapper relativo próprio, cujo
  // padding-box é 100% da área útil (box-sizing:border-box no pai já reduziu
  // o content-box pelas margens).
  const contentStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
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
      <div className="shared-report-sheet-content" style={contentStyle}>
      {["logo1", "logo2", "logo3"].map((id, index) => {
        const position = merged[id];
        const logo = logos[index];
        if (!position?.visible || !logo) return null;
        return (
          <div key={id} data-layout-block={id} style={{ ...blockStyle(position, fallbackPositions[id]), display: "flex", alignItems: "center", justifyContent: "center", padding: 4, zIndex: 2 }}>
            {/* CORREÇÃO (auditoria claude/corrige-logo-px-editor-vs-pdf): logo.width/
                logo.height (px) eram salvos pelo editor de layout (campos "Largura (px)"
                / "Altura (px)") mas nunca lidos aqui — a imagem sempre esticava para
                100%/100% da caixa de posição (percentual, ajustada só pelas alças de
                arraste no canvas). Resultado: o valor configurado numericamente não
                tinha nenhum efeito visual, nem no preview do editor nem no PDF/impressão
                final (ambos usam este mesmo componente via renderSharedReportSheetHtml).
                Agora o px configurado é o tamanho-alvo real do logo, respeitado de forma
                idêntica em editor e PDF; maxWidth/maxHeight:100% preserva o limite da
                caixa de posição para não invadir blocos vizinhos, e o fallback para
                100%/100% mantém compatibilidade com layouts antigos sem width/height. */}
            <img
              src={logo.url}
              alt={logo.label || `Logo ${index + 1}`}
              style={{
                width: logo.width ? `${logo.width}px` : "100%",
                height: logo.height ? `${logo.height}px` : "100%",
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                display: "block",
              }}
            />
          </div>
        );
      })}

      {merged.patientName?.visible && (
        <div data-layout-block="patientName" style={{ ...blockStyle(merged.patientName, fallbackPositions.patientName), display: "flex", alignItems: "center", padding: "0 8px", zIndex: 3 }}>
          {patientNameContent ?? <span style={{ fontSize: "11.5pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.02em" }}>{patientName || "—"}</span>}
        </div>
      )}

      {merged.patientInfo?.visible && (
        <div data-layout-block="patientInfo" style={{ ...blockStyle(merged.patientInfo, fallbackPositions.patientInfo), display: "flex", alignItems: "center", padding: "4px 8px", zIndex: 3 }}>
          {patientInfo}
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

      {merged.footer?.visible && (() => {
        // CORREÇÃO (parecer de bloqueio da Manus, Fase 2 da unificação de
        // PDF, 27/09/2026): a imagem de rodapé era posicionada como fundo
        // absoluto cobrindo 100% do bloco, com a assinatura/carimbo do
        // médico centralizada POR CIMA dela na mesma área — a homologação
        // visual em Chromium confirmou sobreposição real (overlap: true)
        // nas 3 páginas testadas, em A4 e Letter, tornando o texto da
        // assinatura ilegível sobre o banner. Esse comportamento já
        // existia mesmo no editor ao vivo (ReportEditorPage.tsx), só
        // ficava mascarado por só aparecer na última página e por uma
        // margem extra reservada (screenFooterReservedMm) — a unificação
        // (Fase 2/3) apenas tornou visível em todas as páginas físicas o
        // que já era um problema latente do componente compartilhado.
        // Decisão do Alessandro (27/09/2026): empilhar verticalmente — a
        // imagem ocupa uma faixa própria acima, a assinatura fica sempre
        // abaixo dela.
        //
        // CORREÇÃO 2 (parecer de bloqueio da Manus, revisão 2,
        // 27/09/2026): o primeiro empilhamento fixava a altura do bloco
        // em blockPositions.footer.h% com overflow:hidden, e a imagem
        // limitada a max-height:55% *desse bloco fixo*. Quando a
        // assinatura/carimbo do médico precisava de mais espaço que os
        // 45% restantes, ela era cortada (doctorClipped:true, confirmado
        // por medição DOM em Chromium nas 3 páginas, A4 e Letter) — o
        // bloco padrão simplesmente não era alto o bastante para imagem
        // + assinatura completa ao mesmo tempo. A Manus explicitamente
        // avisou que só remover overflow:hidden não bastaria, pois o
        // conteúdo poderia invadir a margem física, o corpo do laudo ou
        // a página seguinte.
        //
        // Correção (duas camadas, sem medição JS — CSS puro, válido em
        // qualquer motor de renderização real):
        // 1) Prioridade de espaço: o conteúdo do médico (assinatura/
        //    carimbo/nome/CRM) ocupa sua altura NATURAL (flex "0 0 auto",
        //    nunca comprimido) e vem por ÚLTIMO no eixo vertical. A
        //    imagem de rodapé é o elemento flexível — ocupa o que sobra,
        //    com um teto calculado em mm (não em %, pois o bloco não tem
        //    mais altura fixa) a partir da altura configurada do bloco,
        //    preservando a intenção do admin de que a imagem não domine
        //    o rodapé, mas cedendo espaço à assinatura sempre que
        //    necessário. Isso sozinho já resolve o caso relatado (bloco
        //    ~85px, assinatura ~68px — cabem os dois quando a imagem para
        //    de reservar 55% fixo e passa a ceder espaço).
        // 2) Rede de segurança contra invasão (só entra em ação se o
        //    conteúdo do médico sozinho, sem nenhuma imagem, ainda assim
        //    não couber na altura configurada — configuração extrema):
        //    o bloco é ANCORADO PELA BORDA INFERIOR (bottom, não top),
        //    então, se precisar crescer, cresce SEMPRE PARA CIMA — nunca
        //    invade a margem física nem a página seguinte, que ficam
        //    abaixo dele. E o crescimento para cima tem um teto rígido
        //    (maxHeight) calculado a partir da borda inferior do bloco
        //    "body", com uma folga de segurança — o bloco de rodapé
        //    jamais sobrepõe o corpo do laudo. Dentro desses dois limites
        //    físicos (nunca abaixo, nunca sobre o corpo), overflow:hidden
        //    permanece como última garantia.
        const footerPos = merged.footer ?? fallbackPositions.footer;
        const bodyPos = merged.body ?? fallbackPositions.body;
        const usableHeightMm = Math.max(1, paperHeightMm - marginTop - marginBottom);
        const footerBlockHeightMm = (footerPos.h / 100) * usableHeightMm;
        const footerImageMaxHeightMm = footerImageUrl ? Math.max(6, footerBlockHeightMm * 0.55) : 0;
        // Distância fixa da borda inferior da área útil até a borda
        // inferior do bloco de rodapé configurado — preservada como
        // âncora (o bloco nunca desce além do que o admin configurou).
        const footerBottomPercent = Math.max(0, 100 - footerPos.y - footerPos.h);
        // Teto de crescimento (para cima): do topo configurado do rodapé
        // até 1% abaixo da borda inferior do bloco "body", nunca menor
        // que a altura já configurada (nunca encolhe o que já funcionava).
        const bodyBottomPercent = bodyPos.y + bodyPos.h;
        const footerMaxHeightPercent = Math.max(
          footerPos.h,
          footerPos.y + footerPos.h - bodyBottomPercent - 1
        );
        return (
          <div
            data-layout-block="footer"
            style={{
              position: "absolute",
              left: `${footerPos.x}%`,
              bottom: `${footerBottomPercent}%`,
              width: `${footerPos.w}%`,
              minHeight: `${footerPos.h}%`,
              maxHeight: `${footerMaxHeightPercent}%`,
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: footerImageUrl ? "flex-start" : "center",
              overflow: "hidden",
              zIndex: 4,
            }}
          >
            {footerImageUrl && (
              <img
                src={footerImageUrl}
                alt="Rodapé"
                style={{ width: "100%", flex: "0 1 auto", minHeight: 0, maxHeight: `${footerImageMaxHeightMm}mm`, objectFit: "contain", display: "block" }}
              />
            )}
            <div style={{ width: "100%", flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {footer}
            </div>
          </div>
        );
      })()}

      {children}
      </div>
    </div>
  );
}
