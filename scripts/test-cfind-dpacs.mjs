#!/usr/bin/env node
/**
 * SCRIPT DE TESTE C-FIND — Orthanc Local DPACS
 * =============================================
 * Servidor: 172.168.3.250
 * Porta:    3004
 * AE Title: DPACS
 *
 * Uso:
 *   node scripts/test-cfind-dpacs.mjs
 *   node scripts/test-cfind-dpacs.mjs --from 20260101 --to 20260325
 *   node scripts/test-cfind-dpacs.mjs --patient "JOAO*"
 *   node scripts/test-cfind-dpacs.mjs --modality CT
 *   node scripts/test-cfind-dpacs.mjs --limit 50
 *   node scripts/test-cfind-dpacs.mjs --verbose
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

// ─── Configuração do servidor DPACS ───────────────────────────────────────────
const DPACS_CONFIG = {
  host: "172.168.3.250",
  port: 3004,
  calledAETitle: "DPACS",
  callingAETitle: "LAUDS",
};

// ─── Parse de argumentos CLI ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
};
const hasFlag = (flag) => args.includes(flag);

if (hasFlag("--help") || hasFlag("-h")) {
  console.log(`
LAUDS — Teste C-FIND para Orthanc Local DPACS
=============================================
Servidor: ${DPACS_CONFIG.host}:${DPACS_CONFIG.port} (AE: ${DPACS_CONFIG.calledAETitle})

Uso:
  node scripts/test-cfind-dpacs.mjs [opções]

Opções:
  --from YYYYMMDD    Data inicial (padrão: hoje)
  --to   YYYYMMDD    Data final   (padrão: hoje)
  --patient "NOME*"  Filtrar por nome do paciente (suporta wildcard *)
  --modality CT|MR|CR|DX|US|...  Filtrar por modalidade
  --limit N          Máximo de resultados (padrão: 200)
  --verbose          Exibir dataset DICOM bruto do primeiro resultado
  --all              Buscar todos os exames (sem filtro de data)
  --help             Exibir esta ajuda

Exemplos:
  node scripts/test-cfind-dpacs.mjs
  node scripts/test-cfind-dpacs.mjs --from 20260101 --to 20260325
  node scripts/test-cfind-dpacs.mjs --patient "MARIA*"
  node scripts/test-cfind-dpacs.mjs --modality CT --limit 50
  node scripts/test-cfind-dpacs.mjs --all --limit 100
`);
  process.exit(0);
}

// ─── Datas padrão ─────────────────────────────────────────────────────────────
const today = new Date();
const formatDate = (d) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

const todayStr = formatDate(today);
const fromDate = getArg("--from") || todayStr;
const toDate = getArg("--to") || todayStr;
const patientFilter = getArg("--patient") || "";
const modalityFilter = getArg("--modality") || "";
const maxResults = parseInt(getArg("--limit") || "200", 10);
const verbose = hasFlag("--verbose");
const allStudies = hasFlag("--all");

// ─── Carregar dcmjs-dimse ─────────────────────────────────────────────────────
let dcmjsDimse;
try {
  dcmjsDimse = require("dcmjs-dimse");
} catch (e) {
  console.error("❌ Erro: dcmjs-dimse não encontrado. Execute: pnpm add dcmjs-dimse");
  process.exit(1);
}

const { Client, requests, Dataset, constants } = dcmjsDimse;
const { SopClass, Status } = constants;

// ─── Função auxiliar para extrair valor do dataset ───────────────────────────
function getField(dataset, ...fields) {
  for (const field of fields) {
    try {
      const val = dataset.getValue(field);
      if (val !== undefined && val !== null && val !== "") {
        if (typeof val === "object" && val.Alphabetic) return val.Alphabetic;
        if (Array.isArray(val) && val[0]?.Alphabetic) return val[0].Alphabetic;
        return String(val);
      }
    } catch {}
  }
  return "";
}

// ─── Função principal de teste ────────────────────────────────────────────────
async function testCFind() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║         LAUDS — Teste C-FIND Orthanc Local DPACS            ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\n📡 Servidor:  ${DPACS_CONFIG.host}:${DPACS_CONFIG.port}`);
  console.log(`🏷️  AE Title:  ${DPACS_CONFIG.calledAETitle} (chamando como: ${DPACS_CONFIG.callingAETitle})`);
  if (!allStudies) {
    console.log(`📅 Período:   ${fromDate} → ${toDate}`);
  } else {
    console.log(`📅 Período:   TODOS OS EXAMES`);
  }
  if (patientFilter) console.log(`👤 Paciente:  ${patientFilter}`);
  if (modalityFilter) console.log(`🔬 Modalidade: ${modalityFilter}`);
  console.log(`📊 Limite:    ${maxResults} resultados`);
  console.log("\n⏳ Conectando ao servidor DICOM...\n");

  const startTime = Date.now();
  const results = [];

  return new Promise((resolve) => {
    const client = new Client();

    client.on("connected", () => {
      console.log("✅ Conexão estabelecida com sucesso!\n");
    });

    client.on("closed", () => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

      if (results.length === 0) {
        console.log("⚠️  Nenhum estudo encontrado para os filtros aplicados.");
        console.log("\nSugestões:");
        console.log("  • Tente --all para buscar sem filtro de data");
        console.log("  • Verifique se o AE Title DPACS está correto no Orthanc");
        console.log("  • Confirme que a porta 3004 está aberta no servidor");
      } else {
        console.log(`\n✅ ${results.length} estudo(s) encontrado(s) em ${elapsed}s`);
        console.log("─".repeat(90));
        console.log(
          `${"#".padEnd(4)} ${"PACIENTE".padEnd(35)} ${"DATA".padEnd(10)} ${"MOD".padEnd(6)} ${"SÉRIES/IMGS".padEnd(12)} ${"STUDY UID".substring(0, 20)}`
        );
        console.log("─".repeat(90));

        results.forEach((study, idx) => {
          const num = String(idx + 1).padEnd(4);
          const patient = (study.patientName || "N/A").substring(0, 34).padEnd(35);
          const date = (study.studyDate || "N/A").padEnd(10);
          const mod = (study.modality || "-").padEnd(6);
          const si = `${study.numberOfSeries || 0}s/${study.numberOfInstances || 0}i`.padEnd(12);
          const uid = (study.studyInstanceUID || "").substring(0, 20);
          console.log(`${num} ${patient} ${date} ${mod} ${si} ${uid}`);
        });

        console.log("─".repeat(90));

        if (verbose && results.length > 0) {
          console.log("\n📋 Dataset DICOM bruto do primeiro resultado:");
          console.log(JSON.stringify(results[0], null, 2));
        }
      }

      console.log(`\n⏱️  Tempo total: ${elapsed}s`);
      console.log("═".repeat(90));
      resolve(results);
    });

    client.on("error", (err) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`\n❌ ERRO de conexão após ${elapsed}s:`);
      console.error(`   ${err.message || err}`);
      console.log("\nVerifique:");
      console.log(`  • O servidor ${DPACS_CONFIG.host}:${DPACS_CONFIG.port} está acessível?`);
      console.log(`  • O AE Title "${DPACS_CONFIG.calledAETitle}" está configurado no Orthanc?`);
      console.log(`  • A VM onde você está rodando tem acesso à rede 172.168.3.0/22?`);
      console.log(`  • Firewall/iptables bloqueando a porta ${DPACS_CONFIG.port}?`);
      resolve([]);
    });

    // ─── Montar query C-FIND ─────────────────────────────────────────────────
    const queryDataset = new Dataset({
      PatientName: patientFilter || "",
      PatientID: "",
      StudyDate: allStudies ? "" : fromDate === toDate ? fromDate : `${fromDate}-${toDate}`,
      StudyTime: "",
      AccessionNumber: "",
      ModalitiesInStudy: modalityFilter || "",
      StudyDescription: "",
      StudyInstanceUID: "",
      NumberOfStudyRelatedSeries: "",
      NumberOfStudyRelatedInstances: "",
    });

    const findRequest = new requests.CFindRequest(
      requests.CFindRequest.StudyRootInformationModel
    );
    findRequest.setDataset(queryDataset);

    findRequest.on("response", (response) => {
      if (results.length >= maxResults) return;

      if (
        response.getStatus() === Status.Pending ||
        response.getStatus() === Status.PendingWithWarnings
      ) {
        const ds = response.getDataset();
        if (!ds) return;

        const study = {
          patientName: getField(ds, "PatientName"),
          patientID: getField(ds, "PatientID"),
          studyDate: getField(ds, "StudyDate"),
          studyTime: getField(ds, "StudyTime"),
          accessionNumber: getField(ds, "AccessionNumber"),
          modality: getField(ds, "ModalitiesInStudy"),
          studyDescription: getField(ds, "StudyDescription"),
          studyInstanceUID: getField(ds, "StudyInstanceUID"),
          numberOfSeries: getField(ds, "NumberOfStudyRelatedSeries"),
          numberOfInstances: getField(ds, "NumberOfStudyRelatedInstances"),
        };

        results.push(study);
        process.stdout.write(`\r   Recebendo... ${results.length} estudo(s)`);
      }
    });

    client.addRequest(findRequest);
    client.send(
      DPACS_CONFIG.host,
      DPACS_CONFIG.port,
      DPACS_CONFIG.callingAETitle,
      DPACS_CONFIG.calledAETitle
    );
  });
}

// ─── Executar ─────────────────────────────────────────────────────────────────
testCFind().catch((err) => {
  console.error("❌ Erro inesperado:", err);
  process.exit(1);
});
