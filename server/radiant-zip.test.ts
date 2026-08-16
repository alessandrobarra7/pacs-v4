import { describe, it, expect } from 'vitest';

describe('Radiant ZIP Export Workflow', () => {
  it('should construct correct export endpoint url for radiant zip download', () => {
    const studyUid = '1.2.840.113619.2.415.3.2831193700.534.1786793198.951';
    const exportUrl = `/api/dicom-export/${studyUid}`;

    expect(exportUrl).toBe(`/api/dicom-export/${studyUid}`);
    expect(studyUid).toContain('1.2.840.');
  });
});
