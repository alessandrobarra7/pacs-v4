/**
 * Testes de isolamento de acesso a arquivos DICOM por unidade (Setores 05-06)
 * Valida que assertDicomFileAccess protege corretamente todas as rotas de cache.
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Isolamento de Cache DICOM por Unidade (Setores 05-06)', () => {
  it('deve conter a função assertDicomFileAccess exportada em authorization.ts', async () => {
    const authPath = path.resolve(__dirname, 'authorization.ts');
    const content = await fs.readFile(authPath, 'utf-8');
    expect(content).toContain('export async function assertDicomFileAccess');
    expect(content).toContain('studies_cache');
    expect(content).toContain('study_metadata');
  });

  it('deve aplicar assertDicomFileAccess nas rotas de cache DICOM em index.ts', async () => {
    const indexPath = path.resolve(__dirname, '_core', 'index.ts');
    const content = await fs.readFile(indexPath, 'utf-8');
    // Verifica proteção nas rotas de cache-status, files, thumbnail, export e launch
    expect(content).toContain("app.get('/api/dicom-cache-status/:studyUid'");
    expect(content).toContain("app.get('/api/dicom-files/:studyUid/:filename'");
    expect(content).toContain("app.get('/api/dicom-files/:studyUid'");
    expect(content).toContain("app.get('/api/dicom-thumbnail/:studyUid/:filename'");
    expect(content).toContain("app.get('/api/dicom-export/:studyUid'");
    expect(content).toContain("app.get('/api/dicom-viewer-launch/:studyUid'");
    expect(content).toContain("assertDicomFileAccess");
  });
});
