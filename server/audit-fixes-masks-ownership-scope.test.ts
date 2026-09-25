/**
 * Regressão (auditoria Manus 2026-09-24, Parecer de Auditoria — Setor de
 * Laudos, Bloqueio 3): a condição de posse usada por updateReportMask/
 * deleteReportMask (server/db.ts, reportMaskOwnershipCondition) tinha dois
 * furos de isolamento:
 *
 *  - Caminho não-admin: filtrava só por id + owner_user_id, sem exigir que a
 *    máscara pertencesse à unidade informada (unitId). Um usuário dono de
 *    uma máscara pessoal na unidade B, mas também com acesso à unidade A,
 *    podia chamar a procedure com unitId=A (autorização de acesso à unidade
 *    A aceita por canAccessUnit) e o id de uma máscara sua da unidade B — a
 *    condição no banco não exigia report_masks.unit_id = A, então a linha
 *    de B era alterada mesmo assim.
 *  - Caminho admin: filtrava só por id + unit_id, sem exigir scope='unit'.
 *    Um admin da unidade X podia editar/apagar uma máscara PESSOAL de outro
 *    usuário da mesma unidade X — contrariando a política documentada
 *    (admin só mexe em máscaras de escopo unit; pessoais só o dono edita).
 *
 * Este teste chama reportMaskOwnershipCondition diretamente (função pura,
 * não toca banco) e compara a condição retornada, campo a campo, com a
 * combinação exata de colunas/valores esperada — a mesma técnica de
 * verificação estrutural já usada em catalog-financial-pricing.test.ts para
 * provar isolamento de escopo sem precisar de um banco real.
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { report_masks } from "../drizzle/schema";
import { reportMaskOwnershipCondition } from "./db";

describe("reportMaskOwnershipCondition — isolamento de posse e de unidade", () => {
  it("usuário comum: exige id + owner_user_id + unit_id (não escala para outra unidade)", () => {
    const condition = reportMaskOwnershipCondition(5, 30, false, 5);
    expect(condition).toEqual(
      and(
        eq(report_masks.id, 5),
        eq(report_masks.owner_user_id, 30),
        eq(report_masks.unit_id, 5),
      ),
    );
  });

  it("cenário Manus 1 — dono de máscara pessoal da unidade B tentando editar com unitId=A: condição usa A, não B", () => {
    // A máscara real (id=77) pertence à unidade B=9, mas o usuário chama a
    // procedure autorizado para a unidade A=4 (onde ele também tem acesso).
    // A condição construída DEVE amarrar unit_id ao valor autorizado (A=4),
    // nunca ao valor real da máscara (B=9) — só assim uma linha cujo
    // unit_id de fato seja 9 falha a bater no WHERE e o UPDATE/DELETE não
    // afeta nenhuma linha (NOT_FOUND no router).
    const maskOwnerId = 30;
    const authorizedUnitId = 4; // unidade A
    const condition = reportMaskOwnershipCondition(77, maskOwnerId, false, authorizedUnitId);
    expect(condition).toEqual(
      and(
        eq(report_masks.id, 77),
        eq(report_masks.owner_user_id, maskOwnerId),
        eq(report_masks.unit_id, authorizedUnitId), // = 4 (A), NUNCA 9 (B)
      ),
    );
    // A condição usa exatamente authorizedUnitId (4) como valor de
    // unit_id — nunca o unit_id real da máscara (9, unidade B). O objeto
    // retornado é comparado campo a campo acima via toEqual: se o código
    // amarrasse o valor errado (9), a comparação já teria falhado.
  });

  it("usuário comum tentando editar máscara de outro usuário na própria unidade: condição amarra ao owner_user_id do chamador, não ao dono real", () => {
    const callerId = 20;
    const condition = reportMaskOwnershipCondition(77, callerId, false, 5);
    // A condição sempre compara owner_user_id contra QUEM CHAMA a procedure
    // (callerId=20), nunca contra o dono real da máscara — se a máscara
    // pertence a outro usuário, uma linha real não bate e o UPDATE/DELETE
    // afeta 0 linhas (NOT_FOUND), mesmo que id e unitId estejam corretos.
    expect(condition).toEqual(
      and(
        eq(report_masks.id, 77),
        eq(report_masks.owner_user_id, callerId),
        eq(report_masks.unit_id, 5),
      ),
    );
  });

  it("admin: exige id + unit_id + scope='unit' (não alcança máscara pessoal de outro usuário)", () => {
    const condition = reportMaskOwnershipCondition(9, 1, true, 5);
    expect(condition).toEqual(
      and(
        eq(report_masks.id, 9),
        eq(report_masks.unit_id, 5),
        eq(report_masks.scope, "unit"),
      ),
    );
    // scope='unit' está presente explicitamente na condição (3ª cláusula
    // do toEqual acima) — uma máscara real com scope='personal' nunca bate
    // aqui, mesmo com id/unit_id corretos (fecha o Bloqueio 3, parte "admin
    // edita pessoal de outro usuário").
  });

  it("admin tentando editar máscara de outra unidade: condição amarra unit_id à unidade autorizada, não à real", () => {
    const authorizedUnitId = 5;
    const condition = reportMaskOwnershipCondition(9, 1, true, authorizedUnitId);
    expect(condition).toEqual(
      and(
        eq(report_masks.id, 9),
        eq(report_masks.unit_id, authorizedUnitId),
        eq(report_masks.scope, "unit"),
      ),
    );
    // A condição usa exatamente authorizedUnitId (5) — uma máscara real de
    // outra unidade (ex.: unit_id=7) não aparece em nenhuma cláusula.
  });

  it("admin e usuário comum produzem condições estruturalmente diferentes (scope só entra no caminho admin)", () => {
    const adminCondition = reportMaskOwnershipCondition(9, 1, true, 5);
    const userCondition = reportMaskOwnershipCondition(9, 1, false, 5);
    // Estruturas diferentes: só a condição admin exige scope='unit'; só a
    // condição de usuário comum exige owner_user_id.
    expect(adminCondition).not.toEqual(userCondition);
    expect(adminCondition).toEqual(
      and(eq(report_masks.id, 9), eq(report_masks.unit_id, 5), eq(report_masks.scope, "unit")),
    );
    expect(userCondition).toEqual(
      and(eq(report_masks.id, 9), eq(report_masks.owner_user_id, 1), eq(report_masks.unit_id, 5)),
    );
  });
});
