/**
 * Orthanc REST API Helper
 * 
 * Integração com Orthanc em modo promíscuo (sem autenticação).
 * O Orthanc atua como gateway DICOM → DICOMweb:
 *   - Recebe exames de equipamentos externos via DICOM (C-STORE)
 *   - Faz C-FIND/C-GET para PACS remotos via REST API
 *   - Expõe DICOMweb (QIDO-RS, WADO-RS) para o viewer
 * 
 * Configuração esperada do Orthanc:
 *   - RemoteAccessAllowed: true
 *   - AuthenticationEnabled: não definido (sem senha)
 *   - UnknownSopClassAccepted: true (modo promíscuo)
 *   - DicomWeb plugin ativo em /dicom-web/
 */

interface OrthancStudy {
  ID: string;
  MainDicomTags: {
    StudyInstanceUID?: string;
    StudyDate?: string;
    StudyTime?: string;
    StudyDescription?: string;
    AccessionNumber?: string;
    PatientID?: string;
    PatientName?: string;
    PatientBirthDate?: string;
    PatientSex?: string;
    ReferringPhysicianName?: string;
    InstitutionName?: string;
  };
  PatientMainDicomTags?: {
    PatientName?: string;
    PatientID?: string;
    PatientBirthDate?: string;
    PatientSex?: string;
  };
  Series?: string[];
  IsStable?: boolean;
  LastUpdate?: string;
  Type?: string;
}

interface OrthancQueryResult {
  success: boolean;
  studies: NormalizedStudy[];
  count: number;
  error?: string;
}

export interface NormalizedStudy {
  studyInstanceUid: string;
  studyId: string;
  studyDate: string;
  studyTime: string;
  studyDescription: string;
  accessionNumber: string;
  patientName: string;
  patientId: string;
  patientBirthDate: string;
  patientSex: string;
  modality: string;
  numberOfSeries: string;
  numberOfInstances: string;
  orthancId?: string;
}

/**
 * Faz uma requisição HTTP para a REST API do Orthanc (sem autenticação)
 */
async function orthancRequest(
  baseUrl: string,
  path: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: object
): Promise<any> {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(30000), // 30s timeout
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Orthanc REST error ${response.status}: ${text}`);
  }

  return response.json();
}

/**
 * Verifica se o Orthanc está acessível
 */
export async function checkOrthancHealth(baseUrl: string): Promise<boolean> {
  try {
    await orthancRequest(baseUrl, '/system');
    return true;
  } catch {
    return false;
  }
}

/**
 * Busca estudos diretamente no Orthanc local (estudos já recebidos/armazenados)
 * Usa o endpoint /tools/find do Orthanc
 */
export async function queryStudiesLocal(
  baseUrl: string,
  filters: {
    patientName?: string;
    patientId?: string;
    modality?: string;
    studyDate?: string;
    accessionNumber?: string;
  }
): Promise<OrthancQueryResult> {
  try {
    // Monta query para /tools/find
    const query: Record<string, string> = {};

    if (filters.patientName) {
      query['PatientName'] = `*${filters.patientName}*`;
    }
    if (filters.patientId) {
      query['PatientID'] = `*${filters.patientId}*`;
    }
    if (filters.studyDate) {
      // Orthanc aceita formato YYYYMMDD ou YYYYMMDD-YYYYMMDD
      query['StudyDate'] = filters.studyDate.replace(/-/g, '');
    }
    if (filters.accessionNumber) {
      query['AccessionNumber'] = `*${filters.accessionNumber}*`;
    }
    if (filters.modality && filters.modality !== 'ALL') {
      query['ModalitiesInStudy'] = filters.modality;
    }

    const studyIds: string[] = await orthancRequest(baseUrl, '/tools/find', 'POST', {
      Level: 'Study',
      Query: query,
      Expand: false,
    });

    // Busca detalhes de cada estudo em paralelo (máx 50 por vez)
    const batchSize = 50;
    const studies: NormalizedStudy[] = [];

    for (let i = 0; i < studyIds.length; i += batchSize) {
      const batch = studyIds.slice(i, i + batchSize);
      const details = await Promise.all(
        batch.map(id => orthancRequest(baseUrl, `/studies/${id}`).catch(() => null))
      );

      for (const detail of details) {
        if (!detail) continue;
        const normalized = normalizeOrthancStudy(detail);
        if (normalized) studies.push(normalized);
      }
    }

    return { success: true, studies, count: studies.length };
  } catch (error: any) {
    return {
      success: false,
      studies: [],
      count: 0,
      error: error.message,
    };
  }
}

/**
 * Faz C-FIND no PACS remoto via Orthanc (usando modalidade cadastrada no Orthanc)
 * O Orthanc precisa ter o PACS remoto cadastrado em DicomModalities
 */
export async function queryStudiesRemote(
  baseUrl: string,
  modalityName: string,
  filters: {
    patientName?: string;
    patientId?: string;
    modality?: string;
    studyDate?: string;
    accessionNumber?: string;
  }
): Promise<OrthancQueryResult> {
  try {
    // Monta query DICOM para C-FIND via Orthanc
    const query: Record<string, string> = {
      PatientName: filters.patientName ? `*${filters.patientName}*` : '*',
      PatientID: filters.patientId ? `*${filters.patientId}*` : '',
      StudyDate: filters.studyDate ? filters.studyDate.replace(/-/g, '') : '',
      AccessionNumber: filters.accessionNumber ? `*${filters.accessionNumber}*` : '',
      StudyInstanceUID: '',
      StudyDescription: '',
      ModalitiesInStudy: (filters.modality && filters.modality !== 'ALL') ? filters.modality : '',
      NumberOfStudyRelatedSeries: '',
      NumberOfStudyRelatedInstances: '',
    };

    // POST /modalities/{name}/query → inicia C-FIND no PACS remoto
    const queryResponse = await orthancRequest(
      baseUrl,
      `/modalities/${modalityName}/query`,
      'POST',
      { Level: 'Study', Query: query }
    );

    const queryId = queryResponse.ID;

    // GET /queries/{id}/answers → lista os resultados
    const answerIds: string[] = await orthancRequest(baseUrl, `/queries/${queryId}/answers`);

    // Busca detalhes de cada resposta
    const studies: NormalizedStudy[] = [];
    for (const answerId of answerIds) {
      try {
        const content = await orthancRequest(
          baseUrl,
          `/queries/${queryId}/answers/${answerId}/content?simplify`
        );
        const normalized = normalizeQueryAnswer(content);
        if (normalized) studies.push(normalized);
      } catch {
        // Ignora erros individuais
      }
    }

    return { success: true, studies, count: studies.length };
  } catch (error: any) {
    return {
      success: false,
      studies: [],
      count: 0,
      error: error.message,
    };
  }
}

/**
 * Faz C-MOVE/C-GET para trazer um estudo do PACS remoto para o Orthanc local
 */
export async function retrieveStudyFromRemote(
  baseUrl: string,
  modalityName: string,
  studyInstanceUid: string
): Promise<{ success: boolean; orthancId?: string; error?: string }> {
  try {
    // POST /modalities/{name}/retrieve → C-MOVE para trazer o estudo
    await orthancRequest(baseUrl, `/modalities/${modalityName}/retrieve`, 'POST', {
      Level: 'Study',
      Resources: [studyInstanceUid],
      TargetAet: 'ORTHANC_U1', // AE Title do próprio Orthanc
    });

    // Aguarda o estudo aparecer no Orthanc (polling por até 30s)
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise(r => setTimeout(r, 3000));
      const result = await orthancRequest(baseUrl, '/tools/find', 'POST', {
        Level: 'Study',
        Query: { StudyInstanceUID: studyInstanceUid },
        Expand: false,
      });
      if (result.length > 0) {
        return { success: true, orthancId: result[0] };
      }
    }

    return { success: false, error: 'Estudo não chegou ao Orthanc após 30s' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Retorna a URL DICOMweb (WADO-RS) para um estudo no Orthanc
 * Usado para abrir o viewer OHIF/Cornerstone
 */
export function getDicomWebUrl(baseUrl: string, studyInstanceUid: string): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/dicom-web/studies/${studyInstanceUid}`;
}

/**
 * Retorna a URL do Orthanc Explorer para um estudo
 */
export function getOrthancExplorerUrl(baseUrl: string, orthancStudyId: string): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/app/explorer.html#study?uuid=${orthancStudyId}`;
}

/**
 * Normaliza um estudo retornado pelo endpoint /studies/{id} do Orthanc
 */
function normalizeOrthancStudy(detail: OrthancStudy): NormalizedStudy | null {
  if (!detail?.ID) return null;

  const tags = detail.MainDicomTags || {};
  const patientTags = detail.PatientMainDicomTags || {};

  return {
    studyInstanceUid: tags.StudyInstanceUID || '',
    studyId: detail.ID,
    studyDate: formatDicomDate(tags.StudyDate || ''),
    studyTime: tags.StudyTime || '',
    studyDescription: tags.StudyDescription || '',
    accessionNumber: tags.AccessionNumber || '',
    patientName: cleanPatientName(patientTags.PatientName || tags.PatientName || ''),
    patientId: patientTags.PatientID || tags.PatientID || '',
    patientBirthDate: patientTags.PatientBirthDate || '',
    patientSex: patientTags.PatientSex || '',
    modality: '',
    numberOfSeries: String(detail.Series?.length || 0),
    numberOfInstances: '',
    orthancId: detail.ID,
  };
}

/**
 * Normaliza uma resposta C-FIND retornada pelo Orthanc
 */
function normalizeQueryAnswer(content: Record<string, string>): NormalizedStudy | null {
  if (!content) return null;

  return {
    studyInstanceUid: content['StudyInstanceUID'] || '',
    studyId: content['StudyID'] || '',
    studyDate: formatDicomDate(content['StudyDate'] || ''),
    studyTime: content['StudyTime'] || '',
    studyDescription: content['StudyDescription'] || '',
    accessionNumber: content['AccessionNumber'] || '',
    patientName: cleanPatientName(content['PatientName'] || ''),
    patientId: content['PatientID'] || '',
    patientBirthDate: content['PatientBirthDate'] || '',
    patientSex: content['PatientSex'] || '',
    modality: content['ModalitiesInStudy'] || content['Modality'] || '',
    numberOfSeries: content['NumberOfStudyRelatedSeries'] || '',
    numberOfInstances: content['NumberOfStudyRelatedInstances'] || '',
  };
}

/**
 * Converte data DICOM YYYYMMDD para YYYY-MM-DD
 */
function formatDicomDate(dicomDate: string): string {
  if (!dicomDate || dicomDate.length < 8) return dicomDate;
  const clean = dicomDate.replace(/\D/g, '');
  if (clean.length < 8) return dicomDate;
  return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
}

/**
 * Remove ID do paciente do nome (padrão: "NOME^ID" → "NOME")
 */
function cleanPatientName(name: string): string {
  if (!name) return '';
  // Remove sufixo após ^ (separador DICOM)
  return name.split('^')[0].trim().replace(/\s+/g, ' ');
}
