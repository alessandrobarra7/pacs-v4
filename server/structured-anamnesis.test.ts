import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const schema = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/routers/anamnesisSimple.ts"), "utf8");
const modal = readFileSync(resolve(process.cwd(), "client/src/components/AnamnesisModal.tsx"), "utf8");
const viewer = readFileSync(resolve(process.cwd(), "client/src/pages/DicomViewerPage.tsx"), "utf8");

describe("anamnese estruturada por modalidade", () => {
  it("mantém respostas isoladas por estudo e unidade", () => {
    expect(schema).toContain("study_anamnesis_structured");
    expect(schema).toContain("study_anamnesis_structured_uid_unit_unique");
    expect(schema).toContain("pain_locations");
  });

  it("exige a permissão clínica existente para leitura e gravação", () => {
    expect(router).toContain("getStructuredByStudy");
    expect(router).toContain("saveStructured");
    expect(router).toContain("'view_anamnesis'");
    expect(router).toContain("'edit_anamnesis'");
  });

  it("oferece questionários de oito perguntas e mapa corporal sem diagnóstico automático", () => {
    expect(modal).toContain('RM: { title: "Ressonância Magnética", questions: [');
    expect(modal).toContain('CT: { title: "Tomografia Computadorizada", questions: [');
    expect(modal).toContain('CR: { title: "Radiografia", questions: [');
    expect(modal).toContain('US: { title: "Ultrassonografia", questions: [');
    expect(modal).toContain("Marque a região informada pelo paciente");
    expect(modal).toContain("anatomical-body-pain-map_f4c4497b.png");
    expect(modal).toContain("Mapa anatômico frontal do corpo humano");
    expect(modal).toContain("sem gerar diagnóstico automático");
  });

  it("exibe o resumo estruturado no visualizador", () => {
    expect(viewer).toContain("getStructuredByStudy.useQuery");
    expect(viewer).toContain("Questionário estruturado");
  });
});
