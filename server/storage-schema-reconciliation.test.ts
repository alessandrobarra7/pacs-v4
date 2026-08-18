import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

describe("reconciliação de schema do storage VM3", () => {
  it("declara no Drizzle os índices de estudo já existentes no banco real", async () => {
    const schema = await fs.readFile(path.join(projectRoot, "drizzle", "schema.ts"), "utf8");

    expect(schema).toContain('index("idx_study_audio_uid").on(table.study_instance_uid)');
    expect(schema).toContain('index("idx_study_attachments_uid").on(table.study_instance_uid)');
    expect(schema).toContain('export_file_key: varchar("export_file_key", { length: 500 })');
    expect(schema).toContain('export_file_url: varchar("export_file_url", { length: 500 })');
  });

  it("mantém uma migration idempotente para tabelas, índices e exportações de laudo", async () => {
    const migration = await fs.readFile(
      path.join(projectRoot, "drizzle", "0047_storage_vm3_reconciliation.sql"),
      "utf8",
    );

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `study_audio_reports`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `study_attachments`");
    expect(migration).toContain("index_name = 'idx_study_audio_uid'");
    expect(migration).toContain("index_name = 'idx_study_attachments_uid'");
    expect(migration).toContain("column_name = 'export_file_key'");
    expect(migration).toContain("column_name = 'export_file_url'");
  });
});
