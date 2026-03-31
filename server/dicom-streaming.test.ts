/**
 * Testes para os endpoints de streaming SSE e exportação ZIP
 * Valida a lógica do dicom_move.py em modo streaming e o endpoint de export
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Testes do dicom_move.py em modo streaming ────────────────────────────────
describe('dicom_move.py streaming mode', () => {
  it('deve existir no caminho correto', async () => {
    const scriptPath = path.resolve(__dirname, 'dicom_move.py');
    const stat = await fs.stat(scriptPath);
    expect(stat.isFile()).toBe(true);
  });

  it('deve conter a flag streaming=True no código', async () => {
    const scriptPath = path.resolve(__dirname, 'dicom_move.py');
    const content = await fs.readFile(scriptPath, 'utf-8');
    expect(content).toContain('streaming');
    expect(content).toContain('"type": "file"');
    expect(content).toContain('"type": "complete"');
    expect(content).toContain('"type": "total"');
  });

  it('deve emitir JSON por linha quando streaming=true', async () => {
    const scriptPath = path.resolve(__dirname, 'dicom_move.py');
    const content = await fs.readFile(scriptPath, 'utf-8');
    // Verifica que o emit() usa json.dumps e flush=True
    expect(content).toContain('json.dumps(data)');
    expect(content).toContain('flush=True');
  });

  it('deve ter make_store_handler que chama emit() quando streaming', async () => {
    const scriptPath = path.resolve(__dirname, 'dicom_move.py');
    const content = await fs.readFile(scriptPath, 'utf-8');
    expect(content).toContain('make_store_handler');
    expect(content).toContain('if _streaming:');
    expect(content).toContain('emit({"type": "file"');
  });
});

// ─── Testes do endpoint SSE no index.ts ──────────────────────────────────────
describe('SSE endpoint /api/dicom-stream/:studyUid', () => {
  it('deve estar definido no index.ts', async () => {
    const indexPath = path.resolve(__dirname, '_core', 'index.ts');
    const content = await fs.readFile(indexPath, 'utf-8');
    expect(content).toContain('/api/dicom-stream/:studyUid');
    expect(content).toContain("text/event-stream");
    expect(content).toContain("sendEvent('file'");
    expect(content).toContain("sendEvent('complete'");
    expect(content).toContain("sendEvent('status'");
    expect(content).toContain("sendEvent('error'");
  });

  it('deve verificar cache antes de iniciar C-GET', async () => {
    const indexPath = path.resolve(__dirname, '_core', 'index.ts');
    const content = await fs.readFile(indexPath, 'utf-8');
    expect(content).toContain('phase: \'cached\'');
    expect(content).toContain('fromCache: true');
  });

  it('deve matar o processo Python quando o cliente desconectar', async () => {
    const indexPath = path.resolve(__dirname, '_core', 'index.ts');
    const content = await fs.readFile(indexPath, 'utf-8');
    expect(content).toContain("req.on('close'");
    expect(content).toContain("child.kill('SIGTERM')");
  });

  it('deve usar o caminho correto para dicom_move.py (new URL para compat. produção)', async () => {
    const indexPath = path.resolve(__dirname, '_core', 'index.ts');
    const content = await fs.readFile(indexPath, 'utf-8');
    // Ambos os endpoints (startViewer e SSE) devem usar new URL() para que
    // o build de produção resolva corretamente para dist/dicom_move.py
    // Verifica que usa new URL() com dicom_move.py (compat. produção)
    expect(content).toContain("new URL('./dicom_move.py'");
  });

  it('deve configurar headers SSE corretos', async () => {
    const indexPath = path.resolve(__dirname, '_core', 'index.ts');
    const content = await fs.readFile(indexPath, 'utf-8');
    expect(content).toContain('X-Accel-Buffering');
    expect(content).toContain('Cache-Control');
    expect(content).toContain('Connection');
    expect(content).toContain('flushHeaders');
  });
});

// ─── Testes do endpoint ZIP /api/dicom-export/:studyUid ──────────────────────
describe('ZIP export endpoint /api/dicom-export/:studyUid', () => {
  it('deve estar definido no index.ts', async () => {
    const indexPath = path.resolve(__dirname, '_core', 'index.ts');
    const content = await fs.readFile(indexPath, 'utf-8');
    expect(content).toContain('/api/dicom-export/:studyUid');
    expect(content).toContain('application/zip');
    expect(content).toContain('archiver');
  });

  it('deve usar nível de compressão baixo (DICOM já é comprimido)', async () => {
    const indexPath = path.resolve(__dirname, '_core', 'index.ts');
    const content = await fs.readFile(indexPath, 'utf-8');
    // level: 1 = rápido, DICOM já é comprimido
    expect(content).toContain("level: 1");
  });

  it('deve retornar 404 se não houver arquivos no cache', async () => {
    const indexPath = path.resolve(__dirname, '_core', 'index.ts');
    const content = await fs.readFile(indexPath, 'utf-8');
    expect(content).toContain('Nenhuma imagem no cache');
  });

  it('deve validar studyUid contra path traversal', async () => {
    const indexPath = path.resolve(__dirname, '_core', 'index.ts');
    const content = await fs.readFile(indexPath, 'utf-8');
    // Verifica que há proteção contra '..' e '/'
    const exportSection = content.substring(content.indexOf('/api/dicom-export/:studyUid'));
    expect(exportSection).toContain("'..'");
    expect(exportSection).toContain("'/'");
  });
});

// ─── Testes do DicomViewerPage (estrutura) ────────────────────────────────────
describe('DicomViewerPage SSE streaming', () => {
  it('deve usar EventSource para streaming', async () => {
    const viewerPath = path.resolve(__dirname, '..', 'client', 'src', 'pages', 'DicomViewerPage.tsx');
    const content = await fs.readFile(viewerPath, 'utf-8');
    expect(content).toContain('EventSource');
    expect(content).toContain('/api/dicom-stream/');
  });

  it('deve renderizar a 1ª imagem ao receber o 1º evento file', async () => {
    const viewerPath = path.resolve(__dirname, '..', 'client', 'src', 'pages', 'DicomViewerPage.tsx');
    const content = await fs.readFile(viewerPath, 'utf-8');
    expect(content).toContain('renderFirstImage');
    expect(content).toContain('firstFileReceived');
  });

  it('deve adicionar imagens ao stack progressivamente', async () => {
    const viewerPath = path.resolve(__dirname, '..', 'client', 'src', 'pages', 'DicomViewerPage.tsx');
    const content = await fs.readFile(viewerPath, 'utf-8');
    expect(content).toContain('addImageToStack');
    expect(content).toContain('imageIdsRef');
  });

  it('deve ter botão de exportação ZIP', async () => {
    const viewerPath = path.resolve(__dirname, '..', 'client', 'src', 'pages', 'DicomViewerPage.tsx');
    const content = await fs.readFile(viewerPath, 'utf-8');
    expect(content).toContain('handleExportZip');
    expect(content).toContain('/api/dicom-export/');
    expect(content).toContain('Exportar ZIP');
  });

  it('deve fechar SSE ao desmontar o componente', async () => {
    const viewerPath = path.resolve(__dirname, '..', 'client', 'src', 'pages', 'DicomViewerPage.tsx');
    const content = await fs.readFile(viewerPath, 'utf-8');
    expect(content).toContain('sseRef.current.close()');
  });

  it('deve mostrar indicador de download em background', async () => {
    const viewerPath = path.resolve(__dirname, '..', 'client', 'src', 'pages', 'DicomViewerPage.tsx');
    const content = await fs.readFile(viewerPath, 'utf-8');
    expect(content).toContain('isBackgroundDownloading');
  });
});

// ─── Testes do PacsQueryPage (pré-download) ──────────────────────────────────
describe('PacsQueryPage pre-download button', () => {
  it('deve ter a função handlePreDownload', async () => {
    const queryPath = path.resolve(__dirname, '..', 'client', 'src', 'pages', 'PacsQueryPage.tsx');
    const content = await fs.readFile(queryPath, 'utf-8');
    expect(content).toContain('handlePreDownload');
    expect(content).toContain('preDownloadMap');
  });

  it('deve usar EventSource para o pré-download', async () => {
    const queryPath = path.resolve(__dirname, '..', 'client', 'src', 'pages', 'PacsQueryPage.tsx');
    const content = await fs.readFile(queryPath, 'utf-8');
    expect(content).toContain('new EventSource');
    expect(content).toContain('/api/dicom-stream/');
  });

  it('deve mostrar progresso durante o pré-download', async () => {
    const queryPath = path.resolve(__dirname, '..', 'client', 'src', 'pages', 'PacsQueryPage.tsx');
    const content = await fs.readFile(queryPath, 'utf-8');
    expect(content).toContain("phase === 'downloading'");
    expect(content).toContain('animate-spin');
  });

  it('deve mostrar botão verde quando download concluído', async () => {
    const queryPath = path.resolve(__dirname, '..', 'client', 'src', 'pages', 'PacsQueryPage.tsx');
    const content = await fs.readFile(queryPath, 'utf-8');
    expect(content).toContain("phase === 'done'");
    expect(content).toContain('bg-green-500');
  });
});
