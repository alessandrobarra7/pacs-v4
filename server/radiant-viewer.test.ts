import { describe, it, expect } from 'vitest';

describe('Radiant Viewer Launch Protocol (PACS Query/Retrieve)', () => {
  it('should format radiant url scheme correctly with -pstv and optional -paet', () => {
    const studyUid = '1.2.840.113619.2.415.3.2831193700.534.1786793198.951';
    const aeTitle = 'PACSML';
    
    const launchUrl = `radiant://?n=paet&v=${encodeURIComponent(aeTitle)}&n=pstv&v=0020000D&v=${encodeURIComponent(`"${studyUid}"`)}`;

    expect(launchUrl).toContain('radiant://?n=paet&v=PACSML');
    expect(launchUrl).toContain('&n=pstv&v=0020000D&v=');
    expect(launchUrl).toContain(encodeURIComponent(`"${studyUid}"`));
  });
});
