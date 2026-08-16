import { describe, it, expect } from 'vitest';

describe('Radiant Viewer Launch Protocol', () => {
  it('should format radiant url scheme correctly with n=f and quoted file URLs', () => {
    const fileUrls = [
      'https://lauds.com.br/api/dicom-dl/token1',
      'https://lauds.com.br/api/dicom-dl/token2',
    ];
    const params = fileUrls.map((u: string) => `v=${encodeURIComponent(`"${u}"`)}`).join('&');
    const launchUrl = `radiant://?n=f&${params}`;

    expect(launchUrl).toContain('radiant://?n=f&');
    expect(launchUrl).toContain('v=');
    expect(launchUrl).toContain(encodeURIComponent('"https://lauds.com.br/api/dicom-dl/token1"'));
  });
});
