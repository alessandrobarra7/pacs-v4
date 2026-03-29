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
let count = 0;

const request = CFindRequest.createStudyFindRequest({
  PatientName: '',
  PatientID: '',
  StudyDate: '',
  ModalitiesInStudy: '',
  AccessionNumber: '',
  StudyDescription: '',
  StudyInstanceUID: '',
  NumberOfStudyRelatedSeries: '',
  NumberOfStudyRelatedInstances: '',
});

request.on('response', (response) => {
  if (response.getStatus() === Status.Pending && response.hasDataset()) {
    count++;
    if (count === 1) {
      const dataset = response.getDataset();
      console.log('\n=== DATASET KEYS (primeiro resultado) ===');
      console.log(JSON.stringify(Object.keys(dataset), null, 2));
      console.log('\n=== DATASET VALUES ===');
      // Mostra os primeiros 20 campos
      const keys = Object.keys(dataset).slice(0, 20);
      keys.forEach(k => {
        console.log(`  ${k}: ${JSON.stringify(dataset[k])}`);
      });
      console.log('\n=== DATASET toString ===');
      console.log(dataset.toString ? dataset.toString().substring(0, 500) : 'sem toString');
    }
    if (count >= 3) {
      try { client.abort(); } catch {}
      process.exit(0);
    }
  }
});

client.on('networkError', (err) => {
  console.error('ERRO:', err.message);
  process.exit(1);
});

client.on('closed', () => {
  console.log(`\nTotal: ${count} respostas`);
  process.exit(0);
});

client.addRequest(request);
setTimeout(() => process.exit(0), 15000);
client.send(ip, port, localAE, remoteAE);
