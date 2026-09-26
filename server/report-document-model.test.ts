// Testes de regressão da Fase 1 da unificação dos geradores de PDF/
// impressão de laudos (pedido de Alessandro, 26/09/2026; plano aprovado
// pela Manus em "Avaliação técnica — unificação dos geradores de PDF e
// impressão de laudos"). Testa client/src/lib/reportDocumentModel.ts
// diretamente — são funções puras, sem DOM, então usamos comportamento
// real (não source-string), como já é o padrão dos testes de
// pdfPageGeometry.ts e reportPagination.ts.

import { describe, expect, it } from "vitest";
import {
  buildCanonicalPatient,
  buildDoctorFooterHtml,
  formatClinicalDate,
  formatClinicalPatientName,
  formatClinicalSex,
  mergeLayoutWithSnapshotFallback,
  normalizeCanonicalLogos,
  PHYSICAL_PAGE_ELEMENTS,
  resolveEffectiveLayoutSource,
  shouldRepeatOnPhysicalPage,
} from "../client/src/lib/reportDocumentModel";

describe("resolveEffectiveLayoutSource — snapshot vs. layout atual da unidade", () => {
  it("laudo assinado com snapshot usa o snapshot, não o layout atual", () => {
    const result = resolveEffectiveLayoutSource("signed", { id: "snapshot" }, { id: "unit" });
    expect(result.source).toBe("snapshot");
    expect(result.layout).toEqual({ id: "snapshot" });
  });

  it("laudo retificado com snapshot usa o snapshot", () => {
    const result = resolveEffectiveLayoutSource("revised", { id: "snapshot" }, { id: "unit" });
    expect(result.source).toBe("snapshot");
  });

  it("laudo assinado SEM snapshot (laudo antigo) cai no layout atual da unidade", () => {
    const result = resolveEffectiveLayoutSource("signed", null, { id: "unit" });
    expect(result.source).toBe("unit");
    expect(result.layout).toEqual({ id: "unit" });
  });

  it("rascunho sempre usa o layout atual, mesmo se por algum motivo houver um snapshot", () => {
    const result = resolveEffectiveLayoutSource("draft", { id: "snapshot" }, { id: "unit" });
    expect(result.source).toBe("unit");
  });

  it("cancelado sempre usa o layout atual", () => {
    const result = resolveEffectiveLayoutSource("cancelled", { id: "snapshot" }, { id: "unit" });
    expect(result.source).toBe("unit");
  });

  it("sem layout nenhum disponível, retorna layout null sem lançar", () => {
    const result = resolveEffectiveLayoutSource("draft", null, null);
    expect(result.layout).toBeNull();
  });
});

describe("mergeLayoutWithSnapshotFallback — snapshot antigo sem todos os campos", () => {
  it("campos do snapshot sobrescrevem o layout base", () => {
    const merged = mergeLayoutWithSnapshotFallback({ pageSize: "A4", marginTop: 20 }, { marginTop: 30 });
    expect(merged).toEqual({ pageSize: "A4", marginTop: 30 });
  });

  it("campo ausente no snapshot antigo cai no valor do layout base (nunca undefined)", () => {
    const merged = mergeLayoutWithSnapshotFallback({ pageSize: "A4", marginTop: 20 }, {});
    expect(merged.pageSize).toBe("A4");
    expect(merged.marginTop).toBe(20);
  });

  it("layout base ausente não lança — trata como objeto vazio", () => {
    const merged = mergeLayoutWithSnapshotFallback(null, { marginTop: 30 });
    expect(merged).toEqual({ marginTop: 30 });
  });
});

describe("normalizeCanonicalLogos — fallback para logo legado da unidade", () => {
  it("usa os logos configurados no layout quando existem", () => {
    const logos = normalizeCanonicalLogos([{ url: "a.png", width: 200, height: 50 }], "legacy.png");
    expect(logos).toEqual([{ url: "a.png", width: 200, height: 50 }]);
  });

  it("cai no logo legado units.logo_url quando o layout não tem nenhum logo configurado", () => {
    const logos = normalizeCanonicalLogos([], "legacy.png");
    expect(logos).toEqual([{ url: "legacy.png", label: "Logo" }]);
  });

  it("cai no legado também quando layoutLogos é null/undefined", () => {
    expect(normalizeCanonicalLogos(null, "legacy.png")).toEqual([{ url: "legacy.png", label: "Logo" }]);
    expect(normalizeCanonicalLogos(undefined, "legacy.png")).toEqual([{ url: "legacy.png", label: "Logo" }]);
  });

  it("sem layout logos e sem legado, retorna array vazio (nunca inventa logo)", () => {
    expect(normalizeCanonicalLogos([], null)).toEqual([]);
  });

  it("descarta logos configurados sem url e limita a 3", () => {
    const logos = normalizeCanonicalLogos(
      [{ url: "" }, { url: "a.png" }, { url: "b.png" }, { url: "c.png" }, { url: "d.png" }] as any,
      null,
    );
    expect(logos).toEqual([{ url: "a.png" }, { url: "b.png" }, { url: "c.png" }]);
  });
});

describe("formatClinicalDate — DICOM (AAAAMMDD) e ISO (AAAA-MM-DD) para dd/mm/aaaa", () => {
  it("formata data DICOM", () => {
    expect(formatClinicalDate("20260923")).toBe("23/09/2026");
  });

  it("formata data ISO/SQL", () => {
    expect(formatClinicalDate("2026-09-23")).toBe("23/09/2026");
  });

  it("formata data ISO com hora (timestamp completo)", () => {
    expect(formatClinicalDate("2026-09-23T00:00:00.000Z")).toBe("23/09/2026");
  });

  it("entrada vazia retorna null, não uma string inválida", () => {
    expect(formatClinicalDate("")).toBeNull();
    expect(formatClinicalDate(null)).toBeNull();
    expect(formatClinicalDate(undefined)).toBeNull();
  });

  it("entrada irreconhecível retorna null em vez de lançar", () => {
    expect(formatClinicalDate("não é uma data")).toBeNull();
  });
});

describe("formatClinicalSex", () => {
  it("M vira Masculino, F vira Feminino", () => {
    expect(formatClinicalSex("M")).toBe("Masculino");
    expect(formatClinicalSex("f")).toBe("Feminino");
  });

  it("valor fora de M/F retorna em maiúsculas", () => {
    expect(formatClinicalSex("o")).toBe("O");
  });

  it("vazio retorna null", () => {
    expect(formatClinicalSex("")).toBeNull();
    expect(formatClinicalSex(null)).toBeNull();
  });
});

describe("formatClinicalPatientName", () => {
  it("remove separador DICOM (^) e colapsa espaços múltiplos", () => {
    expect(formatClinicalPatientName("RAIMUNDO^NESTOR^^SERPA  MORAES")).toBe("RAIMUNDO NESTOR SERPA MORAES");
  });

  it("nome vazio retorna o placeholder padrão em vez de string vazia", () => {
    expect(formatClinicalPatientName("")).toBe("Não informado");
    expect(formatClinicalPatientName(null)).toBe("Não informado");
  });
});

describe("buildCanonicalPatient — ponto único de formatação usado pelos 3 caminhos", () => {
  it("monta o paciente canônico a partir de dados DICOM crus", () => {
    const patient = buildCanonicalPatient({
      name: "RAIMUNDO^NESTOR^SERPA^MORAES",
      birthDate: "19540119",
      sex: "M",
      studyDate: "20260923",
      modality: "CR",
      accessionNumber: "ACC123",
    });
    expect(patient).toEqual({
      name: "RAIMUNDO NESTOR SERPA MORAES",
      birthDate: "19/01/1954",
      sex: "Masculino",
      studyDate: "23/09/2026",
      modality: "CR",
      accessionNumber: "ACC123",
    });
  });

  it("monta o paciente canônico a partir de dados no formato do financeiro (ISO)", () => {
    const patient = buildCanonicalPatient({ name: "TESTE", studyDate: "2026-09-23" });
    expect(patient.studyDate).toBe("23/09/2026");
    expect(patient.birthDate).toBeNull();
    expect(patient.sex).toBeNull();
  });
});

describe("buildDoctorFooterHtml — rodapé de assinatura unificado e escapado", () => {
  const baseSigner = {
    name: "Dr(a) Claudia Cipriano",
    crm: "3488",
    stampDataUrl: null,
    signatureDataUrl: null,
    signedAtFormatted: "26/09/2026, 14:18",
    status: "signed" as const,
  };

  it("laudo em rascunho não gera rodapé de assinatura (string vazia)", () => {
    expect(buildDoctorFooterHtml({ ...baseSigner, status: "draft" })).toBe("");
  });

  it("laudo assinado sem nome do médico não gera rodapé", () => {
    expect(buildDoctorFooterHtml({ ...baseSigner, name: null })).toBe("");
  });

  it("laudo assinado com nome gera o bloco completo", () => {
    const html = buildDoctorFooterHtml(baseSigner);
    expect(html).toContain('class="doctor-footer"');
    expect(html).toContain("Dr(a) Claudia Cipriano");
    expect(html).toContain("CRM: 3488");
    expect(html).toContain("26/09/2026, 14:18");
    expect(html).not.toContain("RETIFICADO");
  });

  it("laudo retificado inclui o selo RETIFICADO", () => {
    const html = buildDoctorFooterHtml({ ...baseSigner, status: "revised" });
    expect(html).toContain("RETIFICADO");
  });

  it("nome/CRM do médico são escapados contra injeção de HTML — corrige inconsistência dos 2 caminhos que não escapavam antes", () => {
    const html = buildDoctorFooterHtml({
      ...baseSigner,
      name: '<img src=x onerror="alert(1)">',
      crm: '"><script>alert(2)</script>',
    });
    expect(html).not.toContain("<img src=x onerror=");
    expect(html).not.toContain("<script>alert(2)</script>");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("inclui carimbo e assinatura quando as URLs base64 estão presentes", () => {
    const html = buildDoctorFooterHtml({ ...baseSigner, stampDataUrl: "data:image/png;base64,AAA", signatureDataUrl: "data:image/png;base64,BBB" });
    expect(html).toContain('class="stamp-img"');
    expect(html).toContain('class="sig-img"');
  });
});

describe("shouldRepeatOnPhysicalPage / PHYSICAL_PAGE_ELEMENTS — regra única aprovada em 26/09/2026", () => {
  it("todos os 5 elementos repetem em toda página física, em qualquer posição", () => {
    for (const element of PHYSICAL_PAGE_ELEMENTS) {
      expect(shouldRepeatOnPhysicalPage(element, 0, 5)).toBe(true);
      expect(shouldRepeatOnPhysicalPage(element, 4, 5)).toBe(true);
    }
  });

  it("a lista de elementos inclui carimbo/assinatura do médico e a imagem de rodapé — os dois que o editor do médico hoje restringe à última página", () => {
    expect(PHYSICAL_PAGE_ELEMENTS).toContain("doctorFooter");
    expect(PHYSICAL_PAGE_ELEMENTS).toContain("footerImage");
  });
});
