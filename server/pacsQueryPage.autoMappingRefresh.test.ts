import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("../client/src/pages/PacsQueryPage.tsx", import.meta.url), "utf8");

describe("PacsQueryPage — atualização após mapeamento automático", () => {
  it("invalida as seleções de legenda quando a consulta PACS retorna estudos", () => {
    const onSuccessStart = pageSource.indexOf("const queryPacs = trpc.pacs.query.useMutation");
    const invalidation = pageSource.indexOf("trpcUtils.studyExamLegend.getBatch.invalidate()", onSuccessStart);
    const resultsUpdate = pageSource.indexOf("setQueryResults(data.studies || []);", onSuccessStart);

    expect(onSuccessStart).toBeGreaterThanOrEqual(0);
    expect(resultsUpdate).toBeGreaterThan(onSuccessStart);
    expect(invalidation).toBeGreaterThan(resultsUpdate);
  });
});
