import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }

const url = new URL(dbUrl);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port || '3306'),
  user: url.username,
  password: url.password,
  database: url.pathname.replace('/', ''),
  ssl: { rejectUnauthorized: false },
});

const templates = [
  {
    name: 'Tomografia de Crânio sem Contraste — Padrão',
    modality: 'TC',
    exam_title: 'Tomografia Computadorizada de Crânio sem Contraste',
    body: `<h3>Técnica</h3>
<p>Tomografia computadorizada do crânio sem administração de contraste endovenoso, com cortes axiais de 5 mm.</p>

<h3>Achados</h3>
<p><strong>Parênquima cerebral:</strong> Densidade e morfologia preservadas, sem evidência de lesão expansiva, hemorrágica ou isquêmica aguda.</p>
<p><strong>Sistema ventricular:</strong> Morfologia e dimensões normais, sem sinais de hidrocefalia.</p>
<p><strong>Espaços subaracnóideos:</strong> Amplitude normal para a faixa etária.</p>
<p><strong>Estruturas da linha média:</strong> Centradas.</p>
<p><strong>Estruturas ósseas:</strong> Sem fraturas ou lesões líticas/blásticas.</p>

<h3>Impressão Diagnóstica</h3>
<p>Tomografia computadorizada do crânio sem contraste sem alterações significativas.</p>`,
  },
  {
    name: 'Ressonância de Joelho — Padrão',
    modality: 'RM',
    exam_title: 'Ressonância Magnética de Joelho',
    body: `<h3>Técnica</h3>
<p>Ressonância magnética do joelho realizada em aparelho de 1,5 Tesla, com sequências DP Fat-Sat nos planos coronal, sagital e axial, T1 sagital e T2 coronal.</p>

<h3>Achados</h3>
<p><strong>Menisco medial:</strong> Morfologia e sinal preservados, sem evidência de rotura.</p>
<p><strong>Menisco lateral:</strong> Morfologia e sinal preservados, sem evidência de rotura.</p>
<p><strong>Ligamento cruzado anterior:</strong> Íntegro, com sinal e tensão preservados.</p>
<p><strong>Ligamento cruzado posterior:</strong> Íntegro.</p>
<p><strong>Ligamentos colaterais:</strong> Medial e lateral íntegros.</p>
<p><strong>Cartilagem articular:</strong> Espessura e sinal preservados nos compartimentos femorotibial medial, lateral e femoropatelar.</p>
<p><strong>Ossos:</strong> Sem fraturas, edema ósseo ou lesões focais.</p>
<p><strong>Partes moles periarticulares:</strong> Sem alterações relevantes.</p>

<h3>Impressão Diagnóstica</h3>
<p>Ressonância magnética do joelho sem alterações significativas.</p>`,
  },
  {
    name: 'Ressonância de Coluna Lombar — Padrão',
    modality: 'RM',
    exam_title: 'Ressonância Magnética de Coluna Lombar',
    body: `<h3>Técnica</h3>
<p>Ressonância magnética da coluna lombar realizada em aparelho de 1,5 Tesla, com sequências T1 e T2 nos planos sagital e axial.</p>

<h3>Achados</h3>
<p><strong>Alinhamento:</strong> Lordose lombar fisiológica preservada, sem sinais de escoliose.</p>
<p><strong>Corpos vertebrais:</strong> Morfologia, altura e sinal preservados de L1 a S1.</p>
<p><strong>Discos intervertebrais:</strong> Altura e sinal preservados nos níveis estudados.</p>
<p><strong>L3-L4:</strong> Sem alterações significativas.</p>
<p><strong>L4-L5:</strong> Sem alterações significativas.</p>
<p><strong>L5-S1:</strong> Sem alterações significativas.</p>
<p><strong>Canal vertebral:</strong> Calibre normal em todos os níveis.</p>
<p><strong>Foramens neurais:</strong> Pérvios bilateralmente.</p>
<p><strong>Cone medular:</strong> Posicionado em nível habitual (L1), sinal preservado.</p>
<p><strong>Partes moles paravertebrais:</strong> Sem alterações relevantes.</p>

<h3>Impressão Diagnóstica</h3>
<p>Ressonância magnética da coluna lombar sem alterações significativas.</p>`,
  },
];

for (const t of templates) {
  try {
    const [rows] = await conn.execute(
      'SELECT id FROM templates WHERE name = ? AND isGlobal = 1 LIMIT 1',
      [t.name]
    );
    if (rows.length > 0) {
      console.log('SKIP (already exists):', t.name);
      continue;
    }
    await conn.execute(
      'INSERT INTO templates (name, modality, exam_title, bodyTemplate, isGlobal, isActive, unit_id, owner_user_id) VALUES (?, ?, ?, ?, 1, 1, NULL, NULL)',
      [t.name, t.modality, t.exam_title, t.body]
    );
    console.log('OK:', t.name);
  } catch (e) {
    console.log('ERROR:', t.name, '-', e.message.substring(0, 100));
  }
}

await conn.end();
console.log('Done!');
