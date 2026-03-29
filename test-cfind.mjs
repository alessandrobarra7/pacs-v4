import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const DicomDimse = _require('dicom-dimse');

const ip = '179.67.254.135';
const port = 11112;
const remoteAE = 'PACSML';
const localAE = 'LAUDS';

console.log(`Testando C-FIND: ${ip}:${port} AE=${remoteAE}`);

const service = new DicomDimse(ip, port);

const searchData = {
  '00100010': '',      // Patient Name (wildcard)
  '00100020': '',      // Patient ID
  '00080020': '',      // Study Date
  '00080060': '',      // Modality
  '00080050': '',      // Accession Number
  '0020000D': '',      // Study Instance UID
  '00080030': '',      // Study Time
  '00081030': '',      // Study Description
  '00201206': '',      // Number of Series
  '00201208': '',      // Number of Instances
};

const config = {
  hostAE: remoteAE,
  sourceAE: localAE,
  qrLevel: 'STUDY',
};

const timeout = setTimeout(() => {
  console.error('TIMEOUT: Sem resposta após 15 segundos');
  process.exit(1);
}, 15000);

service.doFind(config, searchData, (err, results) => {
  clearTimeout(timeout);
  
  if (err) {
    console.error('ERRO C-FIND:', err.message);
    process.exit(1);
  }
  
  if (!results || !Array.isArray(results)) {
    console.log('Nenhum resultado retornado');
    process.exit(0);
  }
  
  console.log(`\n✅ C-FIND bem-sucedido! ${results.length} estudos encontrados\n`);
  
  results.slice(0, 5).forEach((r, i) => {
    const get = (tag) => {
      const entry = r[tag];
      if (!entry) return '';
      const v = entry.value;
      if (Buffer.isBuffer(v)) return v.toString('utf8').replace(/\0/g, '').trim();
      return String(v ?? '').trim();
    };
    
    console.log(`Estudo ${i + 1}:`);
    console.log(`  Paciente: ${get('00100010').replace(/\^/g, ' ').trim()}`);
    console.log(`  Data: ${get('00080020')}`);
    console.log(`  Modalidade: ${get('00080060')}`);
    console.log(`  UID: ${get('0020000D')}`);
    console.log('');
  });
  
  if (results.length > 5) {
    console.log(`... e mais ${results.length - 5} estudos`);
  }
});
