/**
 * DICOM Service — C-FIND via dcmjs-dimse
 * Busca estudos em servidores PACS usando apenas IP, Porta e AE Title
 */

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const dcmjsDimse = _require('dcmjs-dimse');

const { Client } = dcmjsDimse;
const { CFindRequest, CEchoRequest } = dcmjsDimse.requests;
const { Status } = dcmjsDimse.constants;

export interface DicomStudy {
  studyInstanceUID: string;
  patientName: string;
  patientID: string;
  patientBirthDate: string;
  patientSex: string;
  studyDate: string;
  studyTime: string;
  modality: string;
  studyDescription: string;
  accessionNumber: string;
  numberOfSeries: number;
  numberOfInstances: number;
  retrieveAeTitle: string;
}

export interface CFindConfig {
  ip: string;
  port: number;
  remoteAeTitle: string;
  localAeTitle?: string;
}

export interface CFindFilters {
  patientName?: string;
  patientID?: string;
  studyDate?: string;  // YYYYMMDD ou YYYYMMDD-YYYYMMDD
  modality?: string;
  accessionNumber?: string;
}

/**
 * Extrai valor de string de um campo do dataset dcmjs-dimse
 * O dataset tem estrutura: dataset.elements.FieldName
 * PatientName é array de objetos: [{ Alphabetic: "NOME^SOBRENOME" }]
 */
function getField(elements: Record<string, unknown>, key: string): string {
  try {
    const val = elements[key];
    if (val === undefined || val === null) return '';
    
    // PatientName é array de objetos com chave Alphabetic
    if (Array.isArray(val)) {
      const first = val[0];
      if (first && typeof first === 'object') {
        const obj = first as Record<string, unknown>;
        // Tenta Alphabetic primeiro (nome DICOM padrão)
        if (obj.Alphabetic) return String(obj.Alphabetic).trim();
        // Fallback: primeiro valor string do objeto
        const strVal = Object.values(obj).find(v => typeof v === 'string');
        if (strVal) return String(strVal).trim();
      }
      return '';
    }
    
    return String(val).trim();
  } catch {
    return '';
  }
}

/**
 * Limpa nome do paciente DICOM (substitui ^ por espaço)
 */
function cleanPatientName(raw: string): string {
  return raw.replace(/\^+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Executa C-FIND no nível STUDY contra um servidor PACS
 */
export function cFind(
  config: CFindConfig,
  filters: CFindFilters = {},
  maxResults = 500
): Promise<DicomStudy[]> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const studies: DicomStudy[] = [];
    let resolved = false;

    const searchCriteria: Record<string, string> = {
      PatientName: filters.patientName ? `*${filters.patientName}*` : '',
      PatientID: filters.patientID || '',
      StudyDate: filters.studyDate || '',
      ModalitiesInStudy: filters.modality || '',
      AccessionNumber: filters.accessionNumber || '',
      StudyDescription: '',
      StudyInstanceUID: '',
      PatientBirthDate: '',
      PatientSex: '',
      NumberOfStudyRelatedSeries: '',
      NumberOfStudyRelatedInstances: '',
      RetrieveAETitle: '',
    };

    const request = CFindRequest.createStudyFindRequest(searchCriteria);

    request.on('response', (response: any) => {
      try {
        if (response.getStatus() === Status.Pending && response.hasDataset()) {
          const dataset = response.getDataset();
          // Os campos ficam em dataset.elements
          const el: Record<string, unknown> = dataset.elements || dataset;

          const study: DicomStudy = {
            studyInstanceUID: getField(el, 'StudyInstanceUID'),
            patientName: cleanPatientName(getField(el, 'PatientName')),
            patientID: getField(el, 'PatientID'),
            patientBirthDate: getField(el, 'PatientBirthDate'),
            patientSex: getField(el, 'PatientSex'),
            studyDate: getField(el, 'StudyDate'),
            studyTime: getField(el, 'StudyTime'),
            modality: getField(el, 'ModalitiesInStudy') || getField(el, 'Modality'),
            studyDescription: getField(el, 'StudyDescription'),
            accessionNumber: getField(el, 'AccessionNumber'),
            numberOfSeries: parseInt(getField(el, 'NumberOfStudyRelatedSeries') || '0', 10) || 0,
            numberOfInstances: parseInt(getField(el, 'NumberOfStudyRelatedInstances') || '0', 10) || 0,
            retrieveAeTitle: getField(el, 'RetrieveAETitle'),
          };

          if (study.studyInstanceUID) {
            studies.push(study);
            if (studies.length >= maxResults && !resolved) {
              resolved = true;
              try { client.abort(); } catch { /* ignore */ }
              resolve(studies);
            }
          }
        }
      } catch (e) {
        console.warn('[DICOM] Erro ao processar resposta C-FIND:', e);
      }
    });

    client.on('networkError', (err: Error) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Erro de conexão com PACS ${config.ip}:${config.port} — ${err.message}`));
      }
    });

    client.on('closed', () => {
      if (!resolved) {
        resolved = true;
        resolve(studies);
      }
    });

    client.addRequest(request);

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (studies.length > 0) {
          try { client.abort(); } catch { /* ignore */ }
          resolve(studies);
        } else {
          try { client.abort(); } catch { /* ignore */ }
          reject(new Error(`C-FIND timeout após 60s para ${config.ip}:${config.port}`));
        }
      }
    }, 60000);

    client.on('closed', () => clearTimeout(timeout));

    client.send(
      config.ip,
      config.port,
      config.localAeTitle || 'LAUDS',
      config.remoteAeTitle
    );
  });
}

/**
 * Testa conectividade com C-ECHO
 */
export function cEcho(config: CFindConfig): Promise<boolean> {
  return new Promise((resolve) => {
    const client = new Client();
    const request = new CEchoRequest();
    let done = false;

    request.on('response', (response: any) => {
      if (!done) {
        done = true;
        resolve(response.getStatus() === Status.Success);
      }
    });

    client.on('networkError', () => {
      if (!done) { done = true; resolve(false); }
    });

    client.on('closed', () => {
      if (!done) { done = true; resolve(false); }
    });

    const timeout = setTimeout(() => {
      if (!done) { done = true; try { client.abort(); } catch {} resolve(false); }
    }, 5000);

    request.on('response', () => clearTimeout(timeout));

    client.addRequest(request);
    client.send(
      config.ip,
      config.port,
      config.localAeTitle || 'LAUDS',
      config.remoteAeTitle
    );
  });
}
