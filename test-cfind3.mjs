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

// Filtro: últimos 7 dias
const now = new Date();
const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
const fmt = (d) => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
const studyDate = `${fmt(sevenDaysAgo)}-${fmt(now)}`;

console.log(`Testando C-FIND: ${ip}:${port} AE=${remoteAE}`);
console.log(`Filtro de data: ${studyDate}`);

const client = new Client();
const studies = [];
let resolved = false;

const request = CFindRequest.createStudyFindRequest({
  PatientName: '',
  PatientID: '',
  StudyDate: studyDate,
  ModalitiesInStudy: '',
  AccessionNumber: '',
});

request.on('response', (response) => {
  if (response.getStatus() === Status.Pending && response.hasDataset()) {
    const dataset = response.getDataset();
    const get = (key) => {
      try { return String(dataset[key] ?? '').trim(); } catch { return ''; }
    };
    studies.push({
      uid: get('StudyInstanceUID'),
      patient: get('PatientName').replace(/\^/g, ' ').trim(),
      date: get('StudyDate'),
      modality: get('ModalitiesInStudy') || get('Modality'),
      description: get('StudyDescription'),
    });
    
    // Limita a 100 resultados
    if (studies.length >= 100 && !resolved) {
      resolved = true;
      try { client.abort(); } catch {}
      printResults();
    }
  }
});

client.on('networkError', (err) => {
  console.error('ERRO de rede:', err.message);
  process.exit(1);
});

client.on('closed', () => {
  if (!resolved) {
    resolved = true;
    printResults();
  }
});

function printResults() {
  console.log(`\n✅ C-FIND concluído! ${studies.length} estudos encontrados\n`);
  studies.slice(0, 10).forEach((s, i) => {
    console.log(`Estudo ${i+1}: ${s.patient || '(sem nome)'} | ${s.date} | ${s.modality} | ${s.description || ''}`);
  });
  if (studies.length > 10) console.log(`... e mais ${studies.length - 10} estudos`);
  process.exit(0);
}

client.addRequest(request);

const timeout = setTimeout(() => {
  if (!resolved) {
    resolved = true;
    if (studies.length > 0) {
      printResults();
    } else {
      console.error('TIMEOUT após 60s sem resultados');
      process.exit(1);
    }
  }
}, 60000);

client.on('closed', () => clearTimeout(timeout));
client.send(ip, port, localAE, remoteAE);
