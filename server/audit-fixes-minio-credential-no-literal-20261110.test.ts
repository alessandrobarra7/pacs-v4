import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * CORREÇÃO (auditoria-seguranca-rbac-20261110): a Manus encontrou, numa revisão
 * independente, que a credencial raiz real do MinIO (removida dos scripts de
 * setup num commit anterior desta mesma branch) ainda aparecia literalmente em
 * três documentos versionados (DEPLOY.md, docs/SECURITY_REVIEW_ANALYSIS.md,
 * docs/VM2_INFRAESTRUTURA.md). Este arquivo adiciona uma checagem estrutural
 * (pedida explicitamente no parecer da Manus, item 3 da recomendação final)
 * que falha se um valor hardcoded aparecer de novo em qualquer um desses
 * pontos — não apenas o valor antigo específico, mas QUALQUER literal no
 * lugar onde só uma variável de ambiente ou um placeholder deveria estar.
 *
 * Nenhum valor real de credencial é usado neste arquivo de teste.
 */

const repoRoot = resolve(__dirname, "..");

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf-8");
}

// Placeholder aceitável: qualquer coisa entre < > sem outro < ou > no meio
// (cobre tanto "<MINIO_ACCESS_KEY>" quanto placeholders mais antigos em
// português como "<usuário MinIO>" ou "<senha>").
const isPlaceholder = (value: string) => /^<[^<>]+>$/.test(value.trim());

describe("audit-fixes-minio-credential-no-literal-20261110", () => {
  describe("scripts/setup-minio-vm2.sh (único que grava /etc/default/minio)", () => {
    it("exige MINIO_ROOT_USER e MINIO_ROOT_PASSWORD via variável de ambiente (guarda presente)", () => {
      const content = readRepoFile("scripts/setup-minio-vm2.sh");
      expect(content).toMatch(/:\s*"\$\{MINIO_ROOT_USER:\?/);
      expect(content).toMatch(/:\s*"\$\{MINIO_ROOT_PASSWORD:\?/);
    });

    it("nunca atribui um literal a MINIO_ROOT_USER/MINIO_ROOT_PASSWORD (só referencia a própria env var)", () => {
      const content = readRepoFile("scripts/setup-minio-vm2.sh");
      const assignmentLines = content
        .split("\n")
        .filter((line) => /^\s*MINIO_ROOT_(USER|PASSWORD)=/.test(line));
      expect(assignmentLines.length).toBeGreaterThan(0);
      for (const line of assignmentLines) {
        expect(line).toMatch(/MINIO_ROOT_(USER|PASSWORD)=\$\{?MINIO_ROOT_(USER|PASSWORD)\}?/);
      }
    });
  });

  describe("scripts/setup-minio-bucket.sh (usa as env vars sem nunca atribuí-las)", () => {
    it("exige MINIO_ROOT_USER e MINIO_ROOT_PASSWORD via variável de ambiente (guarda presente)", () => {
      const content = readRepoFile("scripts/setup-minio-bucket.sh");
      expect(content).toMatch(/:\s*"\$\{MINIO_ROOT_USER:\?/);
      expect(content).toMatch(/:\s*"\$\{MINIO_ROOT_PASSWORD:\?/);
    });

    it("o comando 'mc alias set' só referencia as env vars, nunca um literal", () => {
      const content = readRepoFile("scripts/setup-minio-bucket.sh");
      const aliasLine = content.split("\n").find((line) => line.includes("mc alias set"));
      expect(aliasLine).toBeDefined();
      expect(aliasLine).toMatch(/\$\{MINIO_ROOT_USER\}/);
      expect(aliasLine).toMatch(/\$\{MINIO_ROOT_PASSWORD\}/);
    });

    it("os echos finais de credenciais não imprimem o valor, só o nome da env var", () => {
      const content = readRepoFile("scripts/setup-minio-bucket.sh");
      // Não deve haver "echo" seguido de um valor de senha fixo após "MINIO_SECRET_KEY="
      const secretEchoLine = content.split("\n").find((line) => line.includes("MINIO_SECRET_KEY="));
      expect(secretEchoLine).toBeDefined();
      expect(secretEchoLine).not.toMatch(/MINIO_SECRET_KEY=[^(]/); // deve ser seguido de "(valor de ...", não de um literal
    });
  });

  describe("DEPLOY.md", () => {
    it("toda ocorrência de MINIO_ACCESS_KEY= usa placeholder, nunca o usuário real", () => {
      const content = readRepoFile("DEPLOY.md");
      const matches = [...content.matchAll(/MINIO_ACCESS_KEY=(<[^>]*>|\S+)/g)];
      expect(matches.length).toBeGreaterThan(0);
      for (const m of matches) {
        expect(isPlaceholder(m[1])).toBe(true);
      }
    });
  });

  describe("docs/SECURITY_REVIEW_ANALYSIS.md", () => {
    it("accessKey/secretKey do exemplo minio.ts usam placeholder, não valores reais", () => {
      const content = readRepoFile("docs/SECURITY_REVIEW_ANALYSIS.md");

      const accessMatch = content.match(/MINIO_ACCESS_KEY \|\| "([^"]+)"/);
      expect(accessMatch).not.toBeNull();
      expect(isPlaceholder(accessMatch![1])).toBe(true);

      const secretMatch = content.match(/MINIO_SECRET_KEY \|\| "([^"]+)"/);
      expect(secretMatch).not.toBeNull();
      expect(isPlaceholder(secretMatch![1])).toBe(true);
    });
  });

  describe("docs/VM2_INFRAESTRUTURA.md", () => {
    it("tabela de credenciais usa placeholder para usuário e senha admin", () => {
      const content = readRepoFile("docs/VM2_INFRAESTRUTURA.md");

      const userRow = content.match(/\*\*Usuário admin\*\* \| `([^`]+)`/);
      expect(userRow).not.toBeNull();
      expect(isPlaceholder(userRow![1])).toBe(true);

      const passRow = content.match(/\*\*Senha admin\*\* \| `([^`]+)`/);
      expect(passRow).not.toBeNull();
      expect(isPlaceholder(passRow![1])).toBe(true);
    });

    it("heredoc /etc/default/minio usa placeholder para MINIO_ROOT_USER/MINIO_ROOT_PASSWORD", () => {
      const content = readRepoFile("docs/VM2_INFRAESTRUTURA.md");

      const userLine = content.match(/MINIO_ROOT_USER=(\S+)/);
      expect(userLine).not.toBeNull();
      expect(isPlaceholder(userLine![1])).toBe(true);

      const passLine = content.match(/MINIO_ROOT_PASSWORD=(\S+)/);
      expect(passLine).not.toBeNull();
      expect(isPlaceholder(passLine![1])).toBe(true);
    });

    it("comando 'mc alias set' usa placeholder para usuário e senha, não literais", () => {
      const content = readRepoFile("docs/VM2_INFRAESTRUTURA.md");

      const aliasLine = content.match(/mc alias set vm2minio http:\/\/127\.0\.0\.1:9000 (\S+) '([^']+)'/);
      expect(aliasLine).not.toBeNull();
      expect(isPlaceholder(aliasLine![1])).toBe(true);
      expect(isPlaceholder(aliasLine![2])).toBe(true);
    });
  });

  describe("varredura geral: nenhum dos arquivos revisados contém o usuário MinIO legado", () => {
    it("'lauds_admin' não aparece mais em nenhum dos documentos/scripts revisados pela Manus", () => {
      for (const relPath of [
        "DEPLOY.md",
        "docs/SECURITY_REVIEW_ANALYSIS.md",
        "docs/VM2_INFRAESTRUTURA.md",
        "scripts/setup-minio-vm2.sh",
        "scripts/setup-minio-bucket.sh",
      ]) {
        const content = readRepoFile(relPath);
        expect(content).not.toContain("lauds_admin");
      }
    });
  });
});
