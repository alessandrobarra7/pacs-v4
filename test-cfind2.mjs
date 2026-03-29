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

console.log(`Testando C-FIND: ${ip}:${port} AE=${remoteAE}`);

const client = new Client();
const studies = [];

const request = CFindRequest.createStudyFindRequest({
  PatientName: '',
  PatientID: '',
  StudyDate: '',
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
    });
  }
});

client.on('networkError', (err) => {
  console.error('ERRO de rede:', err.message);
  process.exit(1);
});

client.on('closed', () => {
  console.log(`\n✅ C-FIND concluído! ${studies.length} estudos encontrados\n`);
  studies.slice(0, 5).forEach((s, i) => {
    console.log(`Estudo ${i+1}: ${s.patient} | ${s.date} | ${s.modality} | ${s.uid.substring(0,30)}...`);
  });
  if (studies.length > 5) console.log(`... e mais ${studies.length - 5} estudos`);
});

client.addRequest(request);

const timeout = setTimeout(() => {
  console.error('TIMEOUT após 20s');
  process.exit(1);
}, 20000);

client.on('closed', () => clearTimeout(timeout));
client.send(ip, port, localAE, remoteAE);
