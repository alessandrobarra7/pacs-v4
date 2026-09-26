// Testes de regressão da Fase 1 da unificação dos geradores de PDF/
// impressão de laudos (pedido de Alessandro, 26/09/2026; plano aprovado
// pela Manus em "Avaliação técnica — unificação dos geradores de PDF e
// impressão de laudos"; correção dos 2 bloqueios do "Parecer de revisão —
// Fase 1 da unificação dos geradores de PDF", 26/09/2026). Testa
// client/src/lib/reportDocumentModel.ts diretamente — são funções puras,
// sem DOM, então usamos comportamento real (não source-string), como já é
// o padrão dos testes de pdfPageGeometry.ts e reportPagination.ts.

import { describe, expect, it } from "vitest";
import {
  buildCanonicalPatient,
  buildDoctorFooterHtml,
  formatClinicalDate,
  formatClinicalPatientName,
  formatClinicalSex,
  normalizeCanonicalLogos,
  PHYSICAL_PAGE_ELEMENTS,
  resolveEffectiveReportLayout,
  shouldRepeatOnPhysicalPage,
} from "../client/src/lib/reportDocumentModel";

describe("resolveEffectiveReportLayout — snapshot vs. layout atual da unidade (Bloqueio 1 corrigido)", () => {
  const unitLayout = {
    header_html: "<h1>unit</h1>",
    footer_html: null,
    background_image_url: "/unit-bg.png",
    background_opacity: 1,
    background_size: "cover",
    footer_image_url: "/unit-footer.png",
    logos: [{ url: "/unit-logo.png", width: 200, height: 50 }],
    block_positions: { logo1: { x: 2, y: 2, w: 26, h: 11, visible: true } },
    preferences: { pageSize: "Letter" as const, marginTop: 17, marginRight: 20, marginBottom: 25, marginLeft: 20, fontSize: 12, lineHeight: 1.6 },
  };

  it("laudo assinado com snapshot parcial preserva os campos de preferences ausentes no snapshot (o próprio bug reproduzido pela Manus)", () => {
    const result = resolveEffectiveReportLayout({
      status: "signed",
      unitLayout,
      reportLayoutSnapshot: { preferences: { fontSize: 10 } },
    });
    expect(result?.preferences).toEqual({
      pageSize: "Letter",
      marginTop: 17,
      marginRight: 20,
      marginBottom: 25,
      marginLeft: 20,
      fontSize: 10, // snapshot venceu
      lineHeight: 1.6, // preservado da unidade — não desapareceu
    });
  });

  it("valor de preferência presente no snapshot vence o da unidade", () => {
    const result = resolveEffectiveReportLayout({
      status: "signed",
      unitLayout,
      reportLayoutSnapshot: { preferences: { pageSize: "A4", marginTop: 30 } },
    });
    expect(result?.preferences.pageSize).toBe("A4");
    expect(result?.preferences.marginTop).toBe(30);
    expect(result?.preferences.fontSize).toBe(12); // não presente no snapshot — preservado
  });

  it("logos: campo atômico — usa o do snapshot quando a chave existe, mesmo que seja um array diferente", () => {
    const snapshotLogos = [{ url: "/snapshot-logo.png", width: 100, height: 30 }];
    const result = resolveEffectiveReportLayout({
      status: "signed",
      unitLayout,
      reportLayoutSnapshot: { logos: snapshotLogos },
    });
    expect(result?.logos).toEqual(snapshotLogos);
  });

  it("logos: campo atômico — snapshot com logos explicitamente null (laudo assinado sem nenhum logo) NÃO herda os logos atuais da unidade", () => {
    const result = resolveEffectiveReportLayout({
      status: "signed",
      unitLayout,
      reportLayoutSnapshot: { logos: null },
    });
    expect(result?.logos).toBeNull();
  });

  it("logos: campo ausente no snapshot (chave nem existe) cai no valor da unidade", () => {
    const result = resolveEffectiveReportLayout({
      status: "signed",
      unitLayout,
      reportLayoutSnapshot: { preferences: { fontSize: 10 } },
    });
    expect(result?.logos).toEqual(unitLayout.logos);
  });

  it("block_positions e background_* seguem a mesma regra de fallback atômico", () => {
    const result = resolveEffectiveReportLayout({
      status: "signed",
      unitLayout,
      reportLayoutSnapshot: { block_positions: { logo1: { x: 10, y: 10, w: 20, h: 10, visible: true } } },
    });
    expect(result?.block_positions).toEqual({ logo1: { x: 10, y: 10, w: 20, h: 10, visible: true } });
    expect(result?.background_image_url).toBe(unitLayout.background_image_url); // não presente no snapshot
  });

  it("revisado (revised) com snapshot usa o resultado mesclado, igual a signed", () => {
    const result = resolveEffectiveReportLayout({
      status: "revised",
      unitLayout,
      reportLayoutSnapshot: { preferences: { pageSize: "A4" } },
    });
    expect(result?.source).toBe("snapshot");
    expect(result?.preferences.pageSize).toBe("A4");
  });

  it("rascunho sempre usa o layout atual, mesmo se por algum motivo houver um snapshot", () => {
    const result = resolveEffectiveReportLayout({
      status: "draft",
      unitLayout,
      reportLayoutSnapshot: { preferences: { pageSize: "A4" } },
    });
    expect(result?.source).toBe("unit");
    expect(result?.preferences).toEqual(unitLayout.preferences);
  });

  it("cancelado sempre usa o layout atual", () => {
    const result = resolveEffectiveReportLayout({ status: "cancelled", unitLayout, reportLayoutSnapshot: { preferences: { pageSize: "A4" } } });
    expect(result?.source).toBe("unit");
  });

  it("laudo assinado SEM snapshot (laudo antigo) cai no layout atual da unidade, sem mescla nenhuma", () => {
    const result = resolveEffectiveReportLayout({ status: "signed", unitLayout, reportLayoutSnapshot: null });
    expect(result?.source).toBe("unit");
    expect(result?.preferences).toEqual(unitLayout.preferences);
  });

  it("sem layout nenhum disponível (nem unidade, nem snapshot), retorna null sem lançar", () => {
    expect(resolveEffectiveReportLayout({ status: "draft", unitLayout: null, reportLayoutSnapshot: null })).toBeNull();
  });

  it("não muta os objetos de entrada", () => {
    const unitCopy = JSON.parse(JSON.stringify(unitLayout));
    resolveEffectiveReportLayout({ status: "signed", unitLayout, reportLayoutSnapshot: { preferences: { fontSize: 10 } } });
    expect(unitLayout).toEqual(unitCopy);
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

describe("formatClinicalDate — DICOM (AAAAMMDD) e ISO (AAAA-MM-DD) para dd/mm/aaaa, com validação real de calendário (Bloqueio 2 corrigido)", () => {
  it("formata data DICOM válida", () => {
    expect(formatClinicalDate("20260923")).toBe("23/09/2026");
  });

  it("formata data ISO/SQL válida", () => {
    expect(formatClinicalDate("2026-09-23")).toBe("23/09/2026");
  });

  it("formata data ISO com hora (timestamp completo)", () => {
    expect(formatClinicalDate("2026-09-23T00:00:00.000Z")).toBe("23/09/2026");
  });

  it("29/02 é válido em ano bissexto (2024)", () => {
    expect(formatClinicalDate("20240229")).toBe("29/02/2024");
  });

  it("29/02 é INVÁLIDO fora de ano bissexto (2023) — antes da correção isso passava", () => {
    expect(formatClinicalDate("20230229")).toBeNull();
  });

  it("mês 13 é inválido — antes da correção virava '40/13/2026'", () => {
    expect(formatClinicalDate("20261340")).toBeNull();
  });

  it("dia 30 de fevereiro é inválido (ISO) — antes da correção virava '30/02/2026'", () => {
    expect(formatClinicalDate("2026-02-30")).toBeNull();
  });

  it("dia 0 e mês 0 são inválidos", () => {
    expect(formatClinicalDate("20260000")).toBeNull();
    expect(formatClinicalDate("2026-00-10")).toBeNull();
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

  it("data de calendário impossível vira null no paciente canônico, não uma data errada", () => {
    const patient = buildCanonicalPatient({ name: "TESTE", birthDate: "20261340" });
    expect(patient.birthDate).toBeNull();
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
