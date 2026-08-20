import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Catálogo central de exames e documentos independentes', () => {
  it('restringe a manutenção do catálogo e dos mapeamentos PACS ao admin_master', async () => {
    const router = await fs.readFile(path.resolve(__dirname, 'routers', 'examCatalog.ts'), 'utf-8');
    expect(router).toContain('list: adminProcedure.query');
    expect(router).toContain('save: adminProcedure.input');
    expect(router).toContain('removePacsMapping: adminProcedure');
    expect(router).toContain('documentsForExam: protectedProcedure');
  });

  it('mantém a descrição PACS como referência e exige uma legenda selecionada para laudar', async () => {
    const pacs = await fs.readFile(path.resolve(__dirname, 'routers', 'pacs.ts'), 'utf-8');
    expect(pacs).toContain('getActivePacsExamMappings');
    expect(pacs).toContain('const studyDescription = rawDesc;');
    expect(pacs).toContain('suggestedExamLegendId: mappedExam?.id ?? null');
    expect(pacs).not.toContain('meta?.description_override');

    const list = await fs.readFile(path.resolve(__dirname, '..', 'client', 'src', 'pages', 'PacsQueryPage.tsx'), 'utf-8');
    const reportStart = list.indexOf('const handleReport = async');
    const reportEnd = list.indexOf('const handleListenAudio', reportStart);
    const reportHandler = list.slice(reportStart, reportEnd);
    expect(reportHandler).not.toContain('exam_label_');
    expect(reportHandler).not.toContain('description_override');
    expect(reportHandler).toContain('Selecione uma legenda cadastrada antes de gerar os laudos.');
    expect(reportHandler).toContain('selection.documents_snapshot');
    expect(list).not.toContain('function EditableExamName');
    expect(list).not.toContain('ExamPickerModal');
  });

  it('modela unicidade por estudo, unidade e documento sem destruir os laudos legados', async () => {
    const schema = await fs.readFile(path.resolve(__dirname, '..', 'drizzle', 'schema.ts'), 'utf-8');
    expect(schema).toContain('document_key: varchar("document_key", { length: 80 }).notNull().default("primary")');
    expect(schema).toContain('reports_uid_unit_document_idx');
    expect(schema).toContain('exam_legend_documents');
    expect(schema).toContain('exam_legend_pacs_mappings');

    const migration = await fs.readFile(path.resolve(__dirname, '..', 'drizzle', '0048_exam_catalog_documents.sql'), 'utf-8');
    expect(migration).toContain("DEFAULT 'primary'");
    expect(migration).toContain('DROP INDEX `reports_uid_unit_idx`');
    expect(migration).toContain('ADD UNIQUE INDEX `reports_uid_unit_document_idx`');
  });

  it('vincula o editor a um documento e não grava o título clínico como override da legenda do estudo', async () => {
    const editor = await fs.readFile(path.resolve(__dirname, '..', 'client', 'src', 'pages', 'ReportEditorPage.tsx'), 'utf-8');
    expect(editor).toContain('const documentKey = reportSearch.get("document") || "primary";');
    expect(editor).toContain('document_key: documentKey');
    expect(editor).toContain('document_label_snapshot: documentLabelFromRoute');
    expect(editor).not.toContain('const saveMetadata = trpc.studyMetadata.save.useMutation()');
  });
});
