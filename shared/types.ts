/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

// ─── Layout de Laudos ────────────────────────────────────────────────────────
import { z } from "zod";

export const layoutPreferencesSchema = z.object({
  fontFamily:        z.string().default("Arial"),
  fontSize:          z.number().int().min(8).max(18).default(11),
  lineHeight:        z.number().min(1).max(3).default(1.6),
  marginTop:         z.number().min(0).max(60).default(20),
  marginRight:       z.number().min(0).max(60).default(25),
  marginBottom:      z.number().min(0).max(60).default(25),
  marginLeft:        z.number().min(0).max(60).default(25),
  headerBorderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1a365d"),
  headerTextColor:   z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1a365d"),
  accentBgColor:     z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#f0f4f8"),
  accentBorderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#d0d7de"),
  logoHeight:        z.number().min(20).max(150).default(60),
  logoAlign:         z.enum(["left", "center", "right"]).default("left"),
  signaturePosition: z.enum(["bottom-right", "bottom-left", "bottom-center"]).default("bottom-right"),
  showStamp:         z.boolean().default(true),
  showCrm:           z.boolean().default(true),
  showHeaderDivider: z.boolean().default(true),
  showPatientTable:  z.boolean().default(true),
  pageSize:          z.enum(["A4", "Letter"]).default("A4"),
});

export type LayoutPreferences = z.infer<typeof layoutPreferencesSchema>;

/**
 * Valores padrão do layout — NÃO alterar sem atualizar ReportDocument.tsx ao mesmo tempo.
 */
export const DEFAULT_LAYOUT_PREFERENCES: LayoutPreferences = {
  fontFamily:        "Arial",
  fontSize:          11,
  lineHeight:        1.6,
  marginTop:         20,
  marginRight:       25,
  marginBottom:      25,
  marginLeft:        25,
  headerBorderColor: "#1a365d",
  headerTextColor:   "#1a365d",
  accentBgColor:     "#f0f4f8",
  accentBorderColor: "#d0d7de",
  logoHeight:        60,
  logoAlign:         "left",
  signaturePosition: "bottom-right",
  showStamp:         true,
  showCrm:           true,
  showHeaderDivider: true,
  showPatientTable:  true,
  pageSize:          "A4",
};

/**
 * Snapshot do layout congelado no momento da assinatura do laudo.
 * Garante que laudos históricos sejam renderizados com o layout original.
 */
export interface LayoutSnapshot {
  preferences:  LayoutPreferences;
  header_html:  string | null;
  footer_html:  string | null;
  capturedAt:   string; // ISO 8601
}
