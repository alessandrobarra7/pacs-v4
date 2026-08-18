import { describe, it, expect } from 'vitest';

describe('Horos Viewer Launch Protocol', () => {
  it('should format horos url scheme correctly with DownloadURL method', () => {
    const studyUid = '1.2.840.113619.2.415.3.2831193700.534.1786793198.951';
    const origin = 'https://lauds.com.br';
    const token = 'a'.repeat(48);
    const zipUrl = `${origin}/api/dicom-export-dl/${token}`;
    const launchUrl = `horos://?methodName=DownloadURL&URL=${encodeURIComponent(zipUrl)}&Display=YES`;

    expect(launchUrl).toContain('horos://?methodName=DownloadURL');
    expect(launchUrl).toContain(encodeURIComponent(zipUrl));
    expect(launchUrl).toContain('Display=YES');
  });

  it('uses a public temporary export route instead of the cookie-protected ZIP route', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('./_core/index.ts', import.meta.url), 'utf-8');

    expect(source).toContain("app.get('/api/dicom-export-dl/:token'");
    expect(source).toContain('const dicomZipTokens = new Map');
    expect(source).toContain('dicomZipTokens.set(zipToken, { studyUid, expiresAt })');
    expect(source).toContain('horos://?methodName=DownloadURL&URL=${encodeURIComponent(zipUrl)}&Display=YES');
  });
});
