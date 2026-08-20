import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('Weasis Viewer Launch Protocol', () => {
  it('uses a short encoded protocol URI that points to a temporary XML manifest', async () => {
    const source = await readFile(new URL('./_core/index.ts', import.meta.url), 'utf-8');

    expect(source).toContain("app.get('/api/weasis-manifest/:token'");
    expect(source).toContain("res.type('application/xml').send(entry.xml)");
    expect(source).toContain('const manifestUrl = `${origin}/api/weasis-manifest/${manifestToken}`');
    expect(source).toContain('const cmd = `$dicom:get -w "${manifestUrl}"`');
    expect(source).toContain('launchUrl = `weasis://?${encodeURIComponent(cmd)}`');
  });

  it('keeps each direct DICOM URL behind an opaque token inside the manifest', async () => {
    const source = await readFile(new URL('./_core/index.ts', import.meta.url), 'utf-8');

    expect(source).toContain('const dicomDlTokens = new Map');
    expect(source).toContain('DirectDownloadFile="${escapeXml(fileUrl)}"');
    expect(source).toContain('weasisManifestTokens.set(manifestToken, { xml: manifest, expiresAt })');
  });
});
