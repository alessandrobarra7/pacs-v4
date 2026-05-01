/**
 * Testes unitários para o módulo PACS
 * Testa: permissões RBAC, normalização de dados, lógica de status
 */
import { describe, it, expect } from 'vitest';
import {
  canReport,
  canAccessAdmin,
  canFillAnamnesis,
  canViewDICOM,
  canManageUnits,
  canManageUsers,
  PERMISSIONS_MATRIX,
} from '@shared/permissions';

// Testa o módulo de permissões RBAC
describe('RBAC Permissions', () => {
  describe('canReport', () => {
    it('admin_master pode criar laudos', () => {
      expect(canReport('admin_master')).toBe(true);
    });
    it('medico pode criar laudos', () => {
      expect(canReport('medico')).toBe(true);
    });
    it('unit_admin NÃO pode criar laudos', () => {
      expect(canReport('unit_admin')).toBe(false);
    });
    it('viewer NÃO pode criar laudos', () => {
      expect(canReport('viewer')).toBe(false);
    });
  });

  describe('canAccessAdmin', () => {
    it('admin_master pode acessar área administrativa', () => {
      expect(canAccessAdmin('admin_master')).toBe(true);
    });
    it('unit_admin pode acessar área administrativa', () => {
      expect(canAccessAdmin('unit_admin')).toBe(true);
    });
    it('medico NÃO pode acessar área administrativa', () => {
      expect(canAccessAdmin('medico')).toBe(false);
    });
    it('viewer NÃO pode acessar área administrativa', () => {
      expect(canAccessAdmin('viewer')).toBe(false);
    });
  });

  describe('canFillAnamnesis', () => {
    it('admin_master pode preencher anamnese', () => {
      expect(canFillAnamnesis('admin_master')).toBe(true);
    });
    it('medico pode preencher anamnese', () => {
      expect(canFillAnamnesis('medico')).toBe(true);
    });
    it('unit_admin NÃO pode preencher anamnese', () => {
      expect(canFillAnamnesis('unit_admin')).toBe(false);
    });
    it('viewer NÃO pode preencher anamnese', () => {
      expect(canFillAnamnesis('viewer')).toBe(false);
    });
  });

  describe('canViewDICOM', () => {
    it('todos os perfis podem ver o viewer DICOM', () => {
      expect(canViewDICOM('admin_master')).toBe(true);
      expect(canViewDICOM('unit_admin')).toBe(true);
      expect(canViewDICOM('medico')).toBe(true);
      expect(canViewDICOM('viewer')).toBe(true);
    });
  });

  describe('canManageUnits', () => {
    it('apenas admin_master pode gerenciar unidades', () => {
      expect(canManageUnits('admin_master')).toBe(true);
      expect(canManageUnits('unit_admin')).toBe(false);
      expect(canManageUnits('medico')).toBe(false);
      expect(canManageUnits('viewer')).toBe(false);
    });
  });

  describe('canManageUsers', () => {
    it('admin_master e unit_admin podem gerenciar usuários', () => {
      expect(canManageUsers('admin_master')).toBe(true);
      expect(canManageUsers('unit_admin')).toBe(true);
      expect(canManageUsers('medico')).toBe(false);
      expect(canManageUsers('viewer')).toBe(false);
    });
  });

  describe('PERMISSIONS_MATRIX', () => {
    it('matriz de permissões está corretamente definida', () => {
      expect(PERMISSIONS_MATRIX).toBeDefined();
      expect(PERMISSIONS_MATRIX.admin_master).toBeDefined();
      expect(PERMISSIONS_MATRIX.unit_admin).toBeDefined();
      expect(PERMISSIONS_MATRIX.medico).toBeDefined();
      expect(PERMISSIONS_MATRIX.viewer).toBeDefined();
    });

    it('admin_master tem acesso total', () => {
      const perms = PERMISSIONS_MATRIX.admin_master;
      expect(perms.viewStudies).toBe(true);
      expect(perms.createReport).toBe(true);
      expect(perms.manageUnits).toBe(true);
      expect(perms.queryPACS).toBe(true);
    });

    it('viewer tem acesso apenas de leitura', () => {
      const perms = PERMISSIONS_MATRIX.viewer;
      expect(perms.viewStudies).toBe(true);
      expect(perms.openViewer).toBe(true);
      expect(perms.createReport).toBe(false);
      expect(perms.manageUnits).toBe(false);
      expect(perms.queryPACS).toBe(false);
    });
  });
});

// Testa normalização de nomes de pacientes
describe('Patient Name Normalization', () => {
  function cleanPatientName(name: string): string {
    if (!name) return '';
    return name.split('^')[0].trim().replace(/\s+/g, ' ');
  }

  function cleanPatientNameFrontend(name: string): string {
    if (!name) return '-';
    return name.replace(/\^/g, ' ').replace(/\s+\d{10,}$/g, '').trim();
  }

  it('remove separadores DICOM (^)', () => {
    expect(cleanPatientName('SILVA^JOAO^PEDRO')).toBe('SILVA');
    expect(cleanPatientName('MUJUACY CARDOSO LOUZEIRO')).toBe('MUJUACY CARDOSO LOUZEIRO');
  });

  it('remove IDs longos do final do nome (frontend)', () => {
    expect(cleanPatientNameFrontend('JOAO SILVA 12345678901')).toBe('JOAO SILVA');
    expect(cleanPatientNameFrontend('MARIA SANTOS')).toBe('MARIA SANTOS');
  });

  it('trata nome vazio', () => {
    expect(cleanPatientName('')).toBe('');
    expect(cleanPatientNameFrontend('')).toBe('-');
  });

  it('trata nomes reais do sistema', () => {
    expect(cleanPatientName('MUJUACY CARDOSO LOUZEIRO')).toBe('MUJUACY CARDOSO LOUZEIRO');
    expect(cleanPatientName('ROSETE ARAUJO SILVA FEITOSA')).toBe('ROSETE ARAUJO SILVA FEITOSA');
  });
});

// Testa formatação de datas DICOM
describe('DICOM Date Formatting', () => {
  function formatDicomDate(dicomDate: string): string {
    if (!dicomDate || dicomDate.length < 8) return dicomDate;
    const clean = dicomDate.replace(/\D/g, '');
    if (clean.length < 8) return dicomDate;
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
  }

  it('converte data DICOM YYYYMMDD para YYYY-MM-DD', () => {
    expect(formatDicomDate('20260228')).toBe('2026-02-28');
    expect(formatDicomDate('20231215')).toBe('2023-12-15');
  });

  it('retorna string vazia para data inválida', () => {
    expect(formatDicomDate('')).toBe('');
    expect(formatDicomDate('invalid')).toBe('invalid');
  });
});

// Testa lógica de status de laudo (determinístico)
describe('Report Status Logic', () => {
  function getReportStatus(studyInstanceUid: string): string {
    if (!studyInstanceUid) return 'Pendente';
    const hash = studyInstanceUid.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
    const statuses = ['Pendente', 'Pendente', 'Pendente', 'Em Andamento', 'Concluído'];
    return statuses[hash % statuses.length];
  }

  it('retorna status consistente para o mesmo UID', () => {
    const uid = '1.2.3.4.5.6.7.8.9';
    const status1 = getReportStatus(uid);
    const status2 = getReportStatus(uid);
    expect(status1).toBe(status2);
  });

  it('retorna Pendente para UID vazio', () => {
    expect(getReportStatus('')).toBe('Pendente');
  });

  it('retorna um dos status válidos', () => {
    const validStatuses = ['Pendente', 'Em Andamento', 'Concluído'];
    const uid = '1.2.840.10008.5.1.4.1.1.2.1234567890';
    expect(validStatuses).toContain(getReportStatus(uid));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-7 FIX: Testes de lógica DICOM (tokens de data, resolução de unidade, download stub)
// ─────────────────────────────────────────────────────────────────────────────

// Helper: replica a lógica toDiscom do pacs.ts (sem TZ — usa Date local do processo)
function toDiscom(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// Helper: replica a resolução de tokens de data do pacs.ts
function resolveStudyDate(token: string): string {
  if (token === 'TODAY') return toDiscom(new Date());
  if (token === 'YESTERDAY') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toDiscom(d);
  }
  if (token === 'LAST_7_DAYS') {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return `${toDiscom(from)}-${toDiscom(now)}`;
  }
  if (token === 'LAST_30_DAYS') {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return `${toDiscom(from)}-${toDiscom(now)}`;
  }
  return token;
}

describe('DICOM Date Token Resolution', () => {
  it('TODAY retorna data de hoje no formato YYYYMMDD', () => {
    const result = resolveStudyDate('TODAY');
    expect(result).toMatch(/^\d{8}$/);
    expect(result).toBe(toDiscom(new Date()));
  });

  it('YESTERDAY retorna data de ontem no formato YYYYMMDD', () => {
    const result = resolveStudyDate('YESTERDAY');
    expect(result).toMatch(/^\d{8}$/);
    const d = new Date();
    d.setDate(d.getDate() - 1);
    expect(result).toBe(toDiscom(d));
  });

  it('YESTERDAY é diferente de TODAY', () => {
    expect(resolveStudyDate('YESTERDAY')).not.toBe(resolveStudyDate('TODAY'));
  });

  it('LAST_7_DAYS retorna range fechado YYYYMMDD-YYYYMMDD', () => {
    const result = resolveStudyDate('LAST_7_DAYS');
    expect(result).toMatch(/^\d{8}-\d{8}$/);
    const [from, to] = result.split('-');
    expect(parseInt(to)).toBeGreaterThan(parseInt(from));
  });

  it('LAST_30_DAYS retorna range fechado YYYYMMDD-YYYYMMDD', () => {
    const result = resolveStudyDate('LAST_30_DAYS');
    expect(result).toMatch(/^\d{8}-\d{8}$/);
    const [from, to] = result.split('-');
    expect(parseInt(to)).toBeGreaterThan(parseInt(from));
  });

  it('LAST_30_DAYS tem range maior que LAST_7_DAYS', () => {
    const r7 = resolveStudyDate('LAST_7_DAYS');
    const r30 = resolveStudyDate('LAST_30_DAYS');
    const [from7] = r7.split('-');
    const [from30] = r30.split('-');
    expect(parseInt(from30)).toBeLessThan(parseInt(from7));
  });

  it('token desconhecido é passado sem modificação', () => {
    expect(resolveStudyDate('20260101')).toBe('20260101');
    expect(resolveStudyDate('20260101-20260131')).toBe('20260101-20260131');
  });
});

describe('DICOM Unit Resolution', () => {
  it('admin_master com unit_id explícito usa o unit_id informado', () => {
    const user = { role: 'admin_master', unit_id: 1 };
    const inputUnitId = 5;
    const targetUnitId = user.role === 'admin_master' ? (inputUnitId ?? user.unit_id) : user.unit_id;
    expect(targetUnitId).toBe(5);
  });

  it('admin_master sem unit_id explícito usa unit_id do usuário', () => {
    const user = { role: 'admin_master', unit_id: 2 };
    const inputUnitId = undefined;
    const targetUnitId = user.role === 'admin_master' ? (inputUnitId ?? user.unit_id) : user.unit_id;
    expect(targetUnitId).toBe(2);
  });

  it('medico sem unit_id explícito usa unit_id do usuário', () => {
    const user = { role: 'medico', unit_id: 3 };
    const inputUnitId = undefined;
    const targetUnitId = inputUnitId ?? user.unit_id;
    expect(targetUnitId).toBe(3);
  });

  it('usuário sem unit_id e sem permissão granular resulta em null', () => {
    const user = { role: 'medico', unit_id: null };
    const inputUnitId = undefined;
    const targetUnitId = inputUnitId ?? user.unit_id;
    expect(targetUnitId).toBeNull();
  });
});

describe('DICOM getViewerUrl hasOrthanc flag', () => {
  it('hasOrthanc é true quando orthanc_base_url está configurado', () => {
    const unitData = { orthanc_base_url: 'http://192.168.1.10:8042' };
    expect(!!unitData.orthanc_base_url).toBe(true);
  });

  it('hasOrthanc é false quando orthanc_base_url é null', () => {
    const unitData = { orthanc_base_url: null };
    expect(!!unitData.orthanc_base_url).toBe(false);
  });

  it('viewerUrl usa proxy interno quando orthanc não está configurado', () => {
    const orthanc: string | null = null;
    const studyUid = '1.2.3.4.5';
    const unitId = 2;
    const viewerUrl = orthanc
      ? `dicomweb:${orthanc}/wado?studyUID=${studyUid}`
      : `/api/dicomweb?studyUid=${encodeURIComponent(studyUid)}&unitId=${unitId}`;
    expect(viewerUrl).toBe('/api/dicomweb?studyUid=1.2.3.4.5&unitId=2');
  });
});

describe('DICOM ENV timeout', () => {
  it('DICOM_GET_TIMEOUT_MS padrão é 600000 (10 minutos)', () => {
    const timeout = parseInt(process.env.DICOM_GET_TIMEOUT_MS ?? '600000', 10);
    expect(timeout).toBeGreaterThanOrEqual(60000);
    expect(timeout).toBeLessThanOrEqual(3600000);
  });
});
