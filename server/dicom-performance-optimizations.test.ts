import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, "_core", "index.ts");

describe("otimizações de desempenho DICOM", () => {
  it("lê somente cabeçalhos limitados e paraleliza a ordenação clínica", async () => {
    const source = await fs.readFile(indexPath, "utf8");
    const orderedFunction = source.slice(
      source.indexOf("async function getOrderedDicomFiles"),
      source.indexOf("async function startServer"),
    );

    expect(source).toContain("const DICOM_ORDER_HEADER_BYTES = 256 * 1024");
    expect(source).toContain("const DICOM_ORDER_READ_CONCURRENCY = 12");
    expect(orderedFunction).toContain("fileSystem.open(path.join(studyDir, fileName), 'r')");
    expect(orderedFunction).toContain("handle.read(header, 0, header.length, 0)");
    expect(orderedFunction).toContain("Promise.all(Array.from({ length: workerCount }, () => worker()))");
    expect(orderedFunction).not.toContain("fileSystem.readFile(`${studyDir}/${fileName}`)");
  });

  it("mantém a autorização e usa cache somente na rota de arquivo individual", async () => {
    const source = await fs.readFile(indexPath, "utf8");
    const routeStart = source.indexOf("app.get('/api/dicom-files/:studyUid/:filename'");
    const routeEnd = source.indexOf("// Lista arquivos DICOM", routeStart);
    const fileRoute = source.slice(routeStart, routeEnd);

    expect(source).toContain('import { assertCachedDicomFileAccess } from "../authorization"');
    expect(fileRoute).toContain("await assertCachedDicomFileAccess((req as any).dicomUser, studyUid, 'view_studies')");
    expect(fileRoute).toContain("requireAuth");
  });
});
