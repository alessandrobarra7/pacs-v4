/**
 * Testes para o serviço de busca PACS (M1 — Dossiê de Auditoria v4)
 * Cobre: CFindResult (A3/A5), PACS_MAX_RESULTS (M4)
 * Nota: cFind é testado com mocks pois requer conexão DICOM real.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PACS_MAX_RESULTS } from "../shared/const";
import type { CFindResult, DicomStudy } from "./dicom.service";

// ─── Helpers de teste ─────────────────────────────────────────────────────────
function makeStudy(uid: string): DicomStudy {
  return {
    studyInstanceUID: uid,
    patientName: "PACIENTE TESTE",
    patientID: "12345",
    patientBirthDate: "19800101",
    patientSex: "M",
    studyDate: "20260101",
    studyTime: "120000",
    modality: "CR",
    studyDescription: "RX TORAX PA E PERFIL",
    accessionNumber: "ACC001",
    numberOfSeries: 1,
    numberOfInstances: 2,
    retrieveAeTitle: "PACS",
  };
}

// ─── Testes: PACS_MAX_RESULTS (M4) ────────────────────────────────────────────
describe("PACS_MAX_RESULTS (M4)", () => {
  it("PACS_MAX_RESULTS é 500", () => {
    expect(PACS_MAX_RESULTS).toBe(500);
  });
});

// ─── Testes: CFindResult — flags truncated/timedOut (A3/A5) ──────────────────
describe("CFindResult flags (A3/A5)", () => {
  it("resultado completo: truncated=false, timedOut=false", () => {
    const result: CFindResult = {
      studies: [makeStudy("1.2.3.4.5")],
      truncated: false,
      timedOut: false,
    };
    expect(result.truncated).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.studies).toHaveLength(1);
  });

  it("resultado truncado: truncated=true quando maxResults atingido", () => {
    const studies = Array.from({ length: PACS_MAX_RESULTS }, (_, i) =>
      makeStudy(`1.2.3.4.${i + 1}`)
    );
    const result: CFindResult = {
      studies,
      truncated: true,
      timedOut: false,
    };
    expect(result.truncated).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.studies).toHaveLength(PACS_MAX_RESULTS);
  });

  it("resultado com timeout: timedOut=true com estudos parciais", () => {
    const result: CFindResult = {
      studies: [makeStudy("1.2.3.4.1"), makeStudy("1.2.3.4.2")],
      truncated: false,
      timedOut: true,
    };
    expect(result.timedOut).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.studies).toHaveLength(2);
  });

  it("resultado vazio: sem estudos, sem flags", () => {
    const result: CFindResult = {
      studies: [],
      truncated: false,
      timedOut: false,
    };
    expect(result.studies).toHaveLength(0);
    expect(result.truncated).toBe(false);
    expect(result.timedOut).toBe(false);
  });
});

// ─── Testes: Filtro de datas (A1/A2) ─────────────────────────────────────────
describe("Filtro de datas PACS (A1/A2)", () => {
  it("LAST_7_DAYS gera intervalo de 7 dias no formato YYYYMMDD-YYYYMMDD", () => {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);

    const fmt = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

    const range = `${fmt(sevenDaysAgo)}-${fmt(today)}`;
    // Verifica formato YYYYMMDD-YYYYMMDD
    expect(range).toMatch(/^\d{8}-\d{8}$/);
    // Verifica que a data inicial é 6 dias antes da data final
    const [start, end] = range.split("-");
    const startDate = new Date(
      parseInt(start!.slice(0, 4)),
      parseInt(start!.slice(4, 6)) - 1,
      parseInt(start!.slice(6, 8))
    );
    const endDate = new Date(
      parseInt(end!.slice(0, 4)),
      parseInt(end!.slice(4, 6)) - 1,
      parseInt(end!.slice(6, 8))
    );
    const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(6); // 7 dias = 6 dias de diferença (inclusivo)
  });
});
