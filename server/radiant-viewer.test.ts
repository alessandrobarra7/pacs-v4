import { describe, it, expect } from 'vitest';

describe('Radiant Viewer Launch Protocol (Individual Files)', () => {
  it('should format radiant url scheme correctly with n=file&v=', () => {
    const fileUrls = [
      'https://lauds.com.br/api/dicom-dl/token1',
      'https://lauds.com.br/api/dicom-dl/token2'
    ];
    
    const args = fileUrls.map((u: string) => `n=file&v=${encodeURIComponent(`"${u}"`)}`).join('&');
    const launchUrl = `radiant://?${args}`;

    expect(launchUrl).toContain('radiant://?n=file&v=');
    expect(launchUrl).toContain(encodeURIComponent(`"${fileUrls[0]}"`));
    expect(launchUrl).toContain(encodeURIComponent(`"${fileUrls[1]}"`));
  });
});
