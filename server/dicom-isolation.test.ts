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

  it('deve autorizar o estudo antes de excluir somente seu cache DICOM', async () => {
    const indexPath = path.resolve(__dirname, '_core', 'index.ts');
    const content = await fs.readFile(indexPath, 'utf-8');
    const routeStart = content.indexOf("app.delete('/api/dicom-files/:studyUid'");
    const routeEnd = content.indexOf("app.get('/api/dicom-series/:studyUid'", routeStart);
    const route = content.slice(routeStart, routeEnd);

    expect(route).toContain("assertDicomFileAccess((req as any).dicomUser, studyUid, 'view_studies')");
    expect(route).toContain('invalidateOrderedDicomFiles(studyDir)');
    expect(route).toContain('fs.rm(studyDir, { recursive: true, force: true })');
  });

  // CORREÇÃO (auditoria-seguranca-rbac-20261110): /api/dicom-series/:studyUid expunha
  // metadados de série (descrição clínica, modalidade, lista de arquivos) a qualquer
  // usuário autenticado, de qualquer unidade, sem checagem de autorização (IDOR).
  it('deve autorizar o estudo antes de listar as séries DICOM (IDOR)', async () => {
    const indexPath = path.resolve(__dirname, '_core', 'index.ts');
    const content = await fs.readFile(indexPath, 'utf-8');
    const routeStart = content.indexOf("app.get('/api/dicom-series/:studyUid'");
    expect(routeStart).toBeGreaterThan(-1);
    const routeEnd = content.indexOf("app.get('/api/dicom-thumbnail/:studyUid/:filename'", routeStart);
    expect(routeEnd).toBeGreaterThan(routeStart);
    const route = content.slice(routeStart, routeEnd);

    // A checagem de autorização deve vir ANTES da leitura do cache em disco
    // (getOrderedDicomFiles), não depois.
    const authCallIdx = route.indexOf("assertDicomFileAccess((req as any).dicomUser, studyUid, 'view_studies')");
    const cacheReadIdx = route.indexOf('getOrderedDicomFiles(studyDir)');
    expect(authCallIdx).toBeGreaterThan(-1);
    expect(cacheReadIdx).toBeGreaterThan(-1);
    expect(authCallIdx).toBeLessThan(cacheReadIdx);
  });
});
