import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const dcmjsDimse = _require('dcmjs-dimse');

const { Client } = dcmjsDimse;
const { CFindRequest } = dcmjsDimse.requests;
const { Status } = dcmjsDimse.constants;

const ip = '179.67.254.135';
const port = 11112;
const remoteAE = 'PACSML';
const localAE = 'LAUDS';

const client = new Client();
const studies = [];
let resolved = false;

function getField(el, key) {
  try {
    const val = el[key];
    if (val === undefined || val === null) return '';
    if (Array.isArray(val)) {
      const first = val[0];
      if (first && typeof first === 'object') {
        if (first.Alphabetic) return String(first.Alphabetic).trim();
        const strVal = Object.values(first).find(v => typeof v === 'string');
        if (strVal) return String(strVal).trim();
      }
      return '';
    }
    return String(val).trim();
  } catch { return ''; }
}

const request = CFindRequest.createStudyFindRequest({
  PatientName: '',
  PatientID: '',
  StudyDate: '',
  ModalitiesInStudy: '',
  AccessionNumber: '',
  StudyDescription: '',
  StudyInstanceUID: '',
  PatientBirthDate: '',
  PatientSex: '',
  NumberOfStudyRelatedSeries: '',
  NumberOfStudyRelatedInstances: '',
});

request.on('response', (response) => {
  if (response.getStatus() === Status.Pending && response.hasDataset()) {
    const dataset = response.getDataset();
    const el = dataset.elements || dataset;
    
    const study = {
      uid: getField(el, 'StudyInstanceUID'),
      patient: getField(el, 'PatientName').replace(/\^+/g, ' ').trim(),
      date: getField(el, 'StudyDate'),
      modality: getField(el, 'ModalitiesInStudy'),
      description: getField(el, 'StudyDescription'),
      series: getField(el, 'NumberOfStudyRelatedSeries'),
      instances: getField(el, 'NumberOfStudyRelatedInstances'),
    };
    
    if (study.uid) {
      studies.push(study);
      if (studies.length >= 10 && !resolved) {
        resolved = true;
        try { client.abort(); } catch {}
        printResults();
      }
    }
  }
});

client.on('networkError', (err) => {
  console.error('ERRO:', err.message);
  process.exit(1);
});

client.on('closed', () => {
  if (!resolved) { resolved = true; printResults(); }
});

function printResults() {
  console.log(`\n✅ C-FIND OK! ${studies.length} estudos\n`);
  studies.forEach((s, i) => {
    console.log(`[${i+1}] ${s.patient || '(sem nome)'} | ${s.date} | ${s.modality} | ${s.description} | ${s.series}s/${s.instances}i`);
  });
  process.exit(0);
}

client.addRequest(request);
setTimeout(() => { if (!resolved) { resolved = true; printResults(); } }, 15000);
client.send(ip, port, localAE, remoteAE);
