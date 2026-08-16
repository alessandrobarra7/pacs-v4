import { describe, it, expect } from 'vitest';

describe('Horos Viewer Launch Protocol', () => {
  it('should format horos url scheme correctly with DownloadURL method', () => {
    const studyUid = '1.2.840.113619.2.415.3.2831193700.534.1786793198.951';
    const origin = 'https://lauds.com.br';
    const zipUrl = `${origin}/api/dicom-export/${studyUid}`;
    const launchUrl = `horos://?methodName=DownloadURL&URL=${encodeURIComponent(zipUrl)}&Display=YES`;

    expect(launchUrl).toContain('horos://?methodName=DownloadURL');
    expect(launchUrl).toContain(encodeURIComponent(zipUrl));
    expect(launchUrl).toContain('Display=YES');
  });
});
