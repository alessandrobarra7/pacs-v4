import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "db.ts");

/**
 * Regressão (auditoria claude/corrige-banner-financeiro-preco-modalidade, 2026-10-10):
 *
 * O banner financeiro da página principal (FinancialBanner em PacsQueryPage.tsx,
 * alimentado por financeSimple.getUnitFinancialInfo -> getDoctorUnitFinancialInfo)
 * mostrava "Esta unidade ainda não possui configuração de preço para laudos" para
 * um médico que JÁ TINHA um preço ativo configurado — mas apenas por modalidade
 * (billing_doctor_modality_prices), sem nenhum preço padrão de unidade
 * (billing_doctor_unit_prices).
 *
 * Causa raiz: getDoctorUnitFinancialInfo chamava getActiveDoctorPrice(...) sem o
 * 5º argumento `modality`. getActiveDoctorPrice só consulta
 * billing_doctor_modality_prices quando esse argumento é passado — sem ele, cai
 * direto no fallback de preço padrão de unidade. A tela "Meu Financeiro"
 * (myModalityPrices, em financeSimple.ts) consulta billing_doctor_modality_prices
 * diretamente, por isso mostrava o valor certo enquanto o banner da página
 * principal mostrava a mensagem de "sem configuração".
 *
 * Este teste não usa banco real (o sandbox não tem DATABASE_URL — ver
 * "Isolamento de testes" no skill lauds-manus-handoff), então verifica a
 * presença do fallback no código-fonte de getDoctorUnitFinancialInfo, no mesmo
 * padrão já usado em competence-vigency.test.ts para código que depende de banco.
 */
describe("banner financeiro do médico considera preço por modalidade", () => {
  it("getDoctorUnitFinancialInfo cai para billing_doctor_modality_prices quando não há preço padrão de unidade", async () => {
    const source = await fs.readFile(dbPath, "utf8");
    const functionStart = source.indexOf("export async function getDoctorUnitFinancialInfo");
    expect(functionStart).toBeGreaterThan(-1);
    const functionEnd = source.indexOf("\nexport async function ", functionStart + 1);
    const fn = source.slice(functionStart, functionEnd === -1 ? undefined : functionEnd);

    // A chamada original (sem modality) continua existindo — ela checa o preço
    // padrão da unidade primeiro, que é o comportamento correto quando existe.
    expect(fn).toContain(
      "getActiveDoctorPrice(responsible.financial_responsible_id, unitId, doctorUserId, now)",
    );

    // CORREÇÃO: quando o preço padrão não existe, precisa consultar
    // billing_doctor_modality_prices antes de concluir price_per_report = null.
    expect(fn).toContain("if (price_per_report === null) {");
    expect(fn).toContain(".from(billing_doctor_modality_prices)");
    expect(fn).toContain("eq(billing_doctor_modality_prices.doctor_user_id, doctorUserId)");
    expect(fn).toContain("eq(billing_doctor_modality_prices.unit_id, unitId)");
  });
});
