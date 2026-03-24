#!/usr/bin/env node
/**
 * ============================================================
 * LAUDS — Script de Teste C-FIND (DICOM Query)
 * ============================================================
 *
 * Uso:
 *   node scripts/test-cfind.mjs [opções]
 *
 * Opções:
 *   --ip <ip>           IP do servidor PACS (padrão: 179.67.254.135)
 *   --port <porta>      Porta DICOM (padrão: 11112)
 *   --aet <ae_title>    AE Title do servidor (padrão: PACSML)
 *   --local <ae_title>  AE Title local (padrão: LAUDS)
 *   --date <YYYYMMDD>   Data específica (ex: 20240101)
 *   --from <YYYYMMDD>   Data início do intervalo
 *   --to <YYYYMMDD>     Data fim do intervalo
 *   --patient <nome>    Filtrar por nome do paciente (parcial, ex: "CARLOS*")
 *   --modality <mod>    Filtrar por modalidade (ex: CR, CT, MR, US)
 *   --accession <num>   Filtrar por número de acesso
 *   --limit <n>         Máximo de resultados (padrão: 50)
 *   --timeout <s>       Timeout em segundos (padrão: 30)
 *   --verbose           Mostrar dataset DICOM bruto
 *   --help              Mostrar esta ajuda
 *
 * Exemplos:
 *   # Testar conexão básica (estudos de hoje)
 *   node scripts/test-cfind.mjs
 *
 *   # Buscar estudos dos últimos 7 dias
 *   node scripts/test-cfind.mjs --from 20260315 --to 20260322
 *
 *   # Buscar por paciente específico
 *   node scripts/test-cfind.mjs --patient "CARLOS*"
 *
 *   # Buscar por modalidade CR dos últimos 30 dias
 *   node scripts/test-cfind.mjs --modality CR --from 20260220 --to 20260322
 *
 *   # Testar servidor diferente
 *   node scripts/test-cfind.mjs --ip 192.168.1.100 --port 4242 --aet ORTHANC
 *
 *   # Ver dataset bruto do primeiro resultado
 *   node scripts/test-cfind.mjs --limit 1 --verbose
 * ============================================================
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ─── Configuração padrão (servidor de teste rxhtl) ───────────────────────────
const DEFAULT_CONFIG = {
  ip: '179.67.254.135',
  port: 11112,
  aet: 'PACSML',
  localAet: 'LAUDS',
  limit: 50,
  timeout: 30,
};

// ─── Parse de argumentos CLI ─────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { ...DEFAULT_CONFIG, verbose: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ip':       opts.ip        = args[++i]; break;
      case '--port':     opts.port      = parseInt(args[++i]); break;
      case '--aet':      opts.aet       = args[++i]; break;
      case '--local':    opts.localAet  = args[++i]; break;
      case '--date':     opts.date      = args[++i]; break;
      case '--from':     opts.from      = args[++i]; break;
      case '--to':       opts.to        = args[++i]; break;
      case '--patient':  opts.patient   = args[++i]; break;
      case '--modality': opts.modality  = args[++i]; break;
      case '--accession':opts.accession = args[++i]; break;
      case '--limit':    opts.limit     = parseInt(args[++i]); break;
      case '--timeout':  opts.timeout   = parseInt(args[++i]); break;
      case '--verbose':  opts.verbose   = true; break;
      case '--help':
        console.log(helpText());
        process.exit(0);
    }
  }

  // Se --date fornecido, usa como intervalo de um dia
  if (opts.date && !opts.from && !opts.to) {
    opts.from = opts.date;
    opts.to   = opts.date;
  }

  // Padrão: hoje
  if (!opts.from && !opts.to) {
    const today = new Date();
    const yyyy  = today.getFullYear();
    const mm    = String(today.getMonth() + 1).padStart(2, '0');
    const dd    = String(today.getDate()).padStart(2, '0');
    opts.from   = `${yyyy}${mm}${dd}`;
    opts.to     = `${yyyy}${mm}${dd}`;
  }

  return opts;
}

// ─── Helpers de formatação ───────────────────────────────────────────────────
function formatDate(dicomDate) {
  if (!dicomDate || dicomDate.length < 8) return dicomDate || '—';
  return `${dicomDate.slice(6, 8)}/${dicomDate.slice(4, 6)}/${dicomDate.slice(0, 4)}`;
}

function formatName(raw) {
  if (!raw) return '—';
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === 'object') {
      return (first.Alphabetic || first.alphabetic || JSON.stringify(first))
        .replace(/\^+/g, ' ').trim();
    }
    return String(raw[0]).replace(/\^+/g, ' ').trim();
  }
  return String(raw).replace(/\^+/g, ' ').trim();
}

function getField(elements, ...keys) {
  for (const key of keys) {
    const val = elements[key];
    if (val !== undefined && val !== null && val !== '') return val;
  }
  return null;
}

function pad(str, len) {
  const s = String(str || '');
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

function colorize(text, code) {
  return `\x1b[${code}m${text}\x1b[0m`;
}

function helpText() {
  return `
${colorize('LAUDS — Teste C-FIND DICOM', '1;36')}

Uso: node scripts/test-cfind.mjs [opções]

Opções:
  --ip <ip>           IP do servidor PACS      (padrão: ${DEFAULT_CONFIG.ip})
  --port <porta>      Porta DICOM              (padrão: ${DEFAULT_CONFIG.port})
  --aet <ae_title>    AE Title do servidor     (padrão: ${DEFAULT_CONFIG.aet})
  --local <ae_title>  AE Title local           (padrão: ${DEFAULT_CONFIG.localAet})
  --date <YYYYMMDD>   Data específica
  --from <YYYYMMDD>   Data início do intervalo
  --to <YYYYMMDD>     Data fim do intervalo
  --patient <nome>    Filtrar por paciente      (ex: "CARLOS*")
  --modality <mod>    Filtrar por modalidade    (ex: CR, CT, MR, US)
  --accession <num>   Filtrar por nº de acesso
  --limit <n>         Máximo de resultados      (padrão: ${DEFAULT_CONFIG.limit})
  --timeout <s>       Timeout em segundos       (padrão: ${DEFAULT_CONFIG.timeout})
  --verbose           Mostrar dataset DICOM bruto
  --help              Mostrar esta ajuda
`;
}

// ─── Extração de dados do dataset ────────────────────────────────────────────
function extractStudy(dataset) {
  const el = dataset.elements || dataset;
  return {
    studyInstanceUID:  getField(el, 'StudyInstanceUID') || '',
    patientName:       formatName(getField(el, 'PatientName')),
    patientID:         getField(el, 'PatientID') || '',
    patientBirthDate:  getField(el, 'PatientBirthDate') || '',
    patientSex:        getField(el, 'PatientSex') || '',
    studyDate:         getField(el, 'StudyDate') || '',
    studyTime:         getField(el, 'StudyTime') || '',
    modality:          getField(el, 'ModalitiesInStudy', 'Modality') || '',
    studyDescription:  getField(el, 'StudyDescription') || '',
    accessionNumber:   getField(el, 'AccessionNumber') || '',
    numberOfSeries:    getField(el, 'NumberOfStudyRelatedSeries') || 0,
    numberOfInstances: getField(el, 'NumberOfStudyRelatedInstances') || 0,
    retrieveAeTitle:   getField(el, 'RetrieveAETitle') || '',
  };
}

// ─── Execução do C-FIND ───────────────────────────────────────────────────────
async function runCFind(opts) {
  const dcmjs = require('dcmjs-dimse');
  const { Client, requests, Dataset, implementation } = dcmjs;

  return new Promise((resolve, reject) => {
    const client = new Client();
    const studies = [];
    let rawDatasets = [];
    const timer = setTimeout(() => {
      console.log(colorize(`\n⏱  Timeout de ${opts.timeout}s atingido. Retornando ${studies.length} resultado(s) coletados.`, '33'));
      resolve({ studies, rawDatasets });
    }, opts.timeout * 1000);

    // Monta o dataset de query
    const queryDataset = new Dataset({
      PatientName:                  opts.patient   || '',
      PatientID:                    '',
      PatientBirthDate:             '',
      PatientSex:                   '',
      StudyDate:                    (opts.from && opts.to) ? `${opts.from}-${opts.to}` : '',
      StudyTime:                    '',
      StudyDescription:             '',
      AccessionNumber:              opts.accession || '',
      ModalitiesInStudy:            opts.modality  || '',
      StudyInstanceUID:             '',
      NumberOfStudyRelatedSeries:   '',
      NumberOfStudyRelatedInstances:'',
      RetrieveAETitle:              '',
      QueryRetrieveLevel:           'STUDY',
    });

    const request = new requests.CFindRequest(
      requests.CFindRequest.StudyRootInformationModel
    );
    request.setDataset(queryDataset);

    request.on('response', (response) => {
      if (response.hasDataset()) {
        const dataset = response.getDataset();
        rawDatasets.push(dataset);
        const study = extractStudy(dataset);
        studies.push(study);
        if (studies.length >= opts.limit) {
          console.log(colorize(`\n⚠  Limite de ${opts.limit} resultado(s) atingido.`, '33'));
          clearTimeout(timer);
          resolve({ studies, rawDatasets });
        }
      }
    });

    client.on('connected', () => {
      process.stdout.write(colorize('✓ Conectado', '32'));
    });

    client.on('closed', () => {
      clearTimeout(timer);
      resolve({ studies, rawDatasets });
    });

    client.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    client.addRequest(request);
    client.send(opts.ip, opts.port, opts.localAet, opts.aet);
  });
}

// ─── Exibição dos resultados ──────────────────────────────────────────────────
function printResults(studies, opts) {
  if (studies.length === 0) {
    console.log(colorize('\n  Nenhum estudo encontrado para os filtros informados.', '33'));
    return;
  }

  console.log('\n' + colorize(`  ${studies.length} estudo(s) encontrado(s):`, '1;32') + '\n');

  // Cabeçalho
  const header = [
    pad('#',    4),
    pad('Paciente',          30),
    pad('Data',    10),
    pad('Mod',     5),
    pad('S/I',     7),
    pad('Descrição',         25),
    pad('Acesso',  12),
    pad('ID Paciente',       14),
  ].join(' │ ');

  const separator = '─'.repeat(header.length);
  console.log(colorize('  ' + separator, '90'));
  console.log(colorize('  ' + header, '1'));
  console.log(colorize('  ' + separator, '90'));

  studies.forEach((s, i) => {
    const row = [
      pad(i + 1,              4),
      pad(s.patientName,     30),
      pad(formatDate(s.studyDate), 10),
      pad(s.modality,         5),
      pad(`${s.numberOfSeries}s/${s.numberOfInstances}i`, 7),
      pad(s.studyDescription,25),
      pad(s.accessionNumber, 12),
      pad(s.patientID,       14),
    ].join(' │ ');
    const color = i % 2 === 0 ? '0' : '2';
    console.log(colorize('  ' + row, color));
  });

  console.log(colorize('  ' + separator, '90'));
}

function printVerbose(rawDatasets, limit = 3) {
  console.log(colorize(`\n  Dataset DICOM bruto (primeiros ${Math.min(limit, rawDatasets.length)} resultado(s)):`, '1;35'));
  rawDatasets.slice(0, limit).forEach((ds, i) => {
    console.log(colorize(`\n  ─── Dataset [${i + 1}] ───`, '35'));
    const el = ds.elements || ds;
    const keys = Object.keys(el).filter(k => el[k] !== '' && el[k] !== null);
    keys.forEach(k => {
      const val = JSON.stringify(el[k]);
      console.log(`    ${colorize(pad(k, 35), '36')} ${val}`);
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();

  console.log('\n' + colorize('═══════════════════════════════════════════════════', '1;34'));
  console.log(colorize('  LAUDS — Teste de Integração C-FIND DICOM', '1;34'));
  console.log(colorize('═══════════════════════════════════════════════════', '1;34'));
  console.log(`\n  Servidor:   ${colorize(opts.ip, '1')}:${colorize(opts.port, '1')}  AE: ${colorize(opts.aet, '1')}  Local: ${colorize(opts.localAet, '1')}`);
  console.log(`  Período:    ${colorize(formatDate(opts.from), '1')} → ${colorize(formatDate(opts.to), '1')}`);
  if (opts.patient)   console.log(`  Paciente:   ${colorize(opts.patient, '1')}`);
  if (opts.modality)  console.log(`  Modalidade: ${colorize(opts.modality, '1')}`);
  if (opts.accession) console.log(`  Acesso:     ${colorize(opts.accession, '1')}`);
  console.log(`  Limite:     ${colorize(opts.limit, '1')} resultados  │  Timeout: ${colorize(opts.timeout + 's', '1')}`);
  console.log();

  process.stdout.write('  Conectando ao servidor PACS... ');
  const startTime = Date.now();

  try {
    const { studies, rawDatasets } = await runCFind(opts);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(colorize(` (${elapsed}s)\n`, '90'));
    printResults(studies, opts);

    if (opts.verbose && rawDatasets.length > 0) {
      printVerbose(rawDatasets);
    }

    // Resumo final
    console.log('\n' + colorize('  ─── Resumo ───', '90'));
    console.log(`  Total de estudos:  ${colorize(studies.length, '1;32')}`);
    console.log(`  Tempo de resposta: ${colorize(elapsed + 's', '1')}`);
    if (studies.length > 0) {
      const modalidades = [...new Set(studies.map(s => s.modality).filter(Boolean))];
      if (modalidades.length > 0) {
        console.log(`  Modalidades:       ${colorize(modalidades.join(', '), '1')}`);
      }
      const totalInstancias = studies.reduce((acc, s) => acc + Number(s.numberOfInstances || 0), 0);
      console.log(`  Total de imagens:  ${colorize(totalInstancias, '1')}`);
    }
    console.log();

    process.exit(0);
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(colorize(` FALHOU (${elapsed}s)`, '1;31'));
    console.error('\n' + colorize('  ✗ Erro na conexão C-FIND:', '1;31'));
    console.error(`    ${err.message || err}`);
    console.log('\n  Verifique:');
    console.log(`    • O servidor ${opts.ip}:${opts.port} está acessível?`);
    console.log(`    • O AE Title "${opts.aet}" está correto?`);
    console.log(`    • O AE Title local "${opts.localAet}" está autorizado no servidor?`);
    console.log(`    • Firewall permite conexões na porta ${opts.port}?`);
    console.log();
    process.exit(1);
  }
}

main();
