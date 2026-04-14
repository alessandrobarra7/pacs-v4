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

// Exames da listagem base — (exam_name, modality, bilateral)
const exams = [
  // ============================================================
  // RADIOGRAFIA (RX)
  // ============================================================
  // Tórax
  ['Tórax PA', 'RX', false],
  ['Tórax PA e Perfil', 'RX', false],
  ['Tórax AP e Perfil', 'RX', false],
  ['Tórax PA e Oblíquas', 'RX', false],
  ['Tórax Trauma', 'RX', false],
  ['Arcos Costais Direito', 'RX', false],
  ['Arcos Costais Esquerdo', 'RX', false],
  ['Clavícula Direita', 'RX', false],
  ['Clavícula Esquerda', 'RX', false],
  ['Clavículas Bilateral', 'RX', true],
  // Abdome
  ['Abdome Simples AP', 'RX', false],
  ['Abdome Ortostático', 'RX', false],
  ['Abdome Decúbito', 'RX', false],
  ['Abdome Agudo', 'RX', false],
  ['Abdome AP e Ortostático', 'RX', false],
  // Coluna Cervical
  ['Coluna Cervical AP e Perfil', 'RX', false],
  ['Coluna Cervical AP Perfil e Oblíquas', 'RX', false],
  ['Coluna Cervical com Flexão e Extensão', 'RX', false],
  ['Odontoide / Boca Aberta', 'RX', false],
  // Coluna Torácica
  ['Coluna Torácica AP e Perfil', 'RX', false],
  // Coluna Lombar
  ['Coluna Lombar AP e Perfil', 'RX', false],
  ['Coluna Lombar com Flexão e Extensão', 'RX', false],
  // Sacro / Cóccix / Bacia
  ['Sacro e Cóccix', 'RX', false],
  ['Articulações Sacroilíacas', 'RX', false],
  ['Bacia AP', 'RX', false],
  ['Pelve AP', 'RX', false],
  ['Quadris Bilateral AP', 'RX', true],
  ['Quadril Direito', 'RX', false],
  ['Quadril Esquerdo', 'RX', false],
  // Ombro / Cintura Escapular
  ['Ombro Direito AP', 'RX', false],
  ['Ombro Esquerdo AP', 'RX', false],
  ['Ombro Direito AP e Perfil', 'RX', false],
  ['Ombro Esquerdo AP e Perfil', 'RX', false],
  ['Ombros Bilateral', 'RX', true],
  ['Escápula Direita', 'RX', false],
  ['Escápula Esquerda', 'RX', false],
  ['Escápulas Bilateral', 'RX', true],
  // Úmero / Cotovelo / Antebraço
  ['Úmero Direito', 'RX', false],
  ['Úmero Esquerdo', 'RX', false],
  ['Úmeros Bilateral', 'RX', true],
  ['Cotovelo Direito AP e Perfil', 'RX', false],
  ['Cotovelo Esquerdo AP e Perfil', 'RX', false],
  ['Cotovelos Bilateral', 'RX', true],
  ['Antebraço Direito AP e Perfil', 'RX', false],
  ['Antebraço Esquerdo AP e Perfil', 'RX', false],
  ['Antebraços Bilateral', 'RX', true],
  // Punho / Mão / Dedos
  ['Punho Direito AP e Perfil', 'RX', false],
  ['Punho Esquerdo AP e Perfil', 'RX', false],
  ['Punhos Bilateral', 'RX', true],
  ['Mão Direita AP e Perfil', 'RX', false],
  ['Mão Esquerda AP e Perfil', 'RX', false],
  ['Mãos Bilateral', 'RX', true],
  ['Idade Óssea', 'RX', false],
  // Seios da Face / Face / Crânio
  ['Seios da Face Fronto-Naso e Mento-Naso', 'RX', false],
  ['Crânio AP e Perfil', 'RX', false],
  ['Mandíbula', 'RX', false],
  ['ATM Bilateral', 'RX', true],
  ['Órbitas', 'RX', false],
  // Joelho / Fêmur / Tíbia e Fíbula
  ['Fêmur Direito', 'RX', false],
  ['Fêmur Esquerdo', 'RX', false],
  ['Joelho Direito AP e Perfil', 'RX', false],
  ['Joelho Esquerdo AP e Perfil', 'RX', false],
  ['Joelhos Bilateral', 'RX', true],
  ['Joelhos Bilateral com Axial de Patela', 'RX', true],
  ['Patelas Bilateral', 'RX', true],
  ['Tíbia e Fíbula Direita AP e Perfil', 'RX', false],
  ['Tíbia e Fíbula Esquerda AP e Perfil', 'RX', false],
  ['Tíbias e Fíbulas Bilateral', 'RX', true],
  // Tornozelo / Pé
  ['Tornozelo Direito AP e Perfil', 'RX', false],
  ['Tornozelo Esquerdo AP e Perfil', 'RX', false],
  ['Tornozelos Bilateral', 'RX', true],
  ['Calcâneo Direito', 'RX', false],
  ['Calcâneo Esquerdo', 'RX', false],
  ['Calcâneos Bilateral', 'RX', true],
  ['Pé Direito AP e Oblíqua', 'RX', false],
  ['Pé Esquerdo AP e Oblíqua', 'RX', false],
  ['Pés Bilateral', 'RX', true],
  ['Pé Direito com Carga', 'RX', false],
  ['Pé Esquerdo com Carga', 'RX', false],
  ['Pés Bilateral com Carga', 'RX', true],
  // Mamografia
  ['Mamografia Bilateral', 'RX', true],
  ['Mamografia Bilateral para Rastreamento', 'RX', true],
  ['Mamografia Bilateral Diagnóstica', 'RX', true],
  ['Mamografia Unilateral Direita', 'RX', false],
  ['Mamografia Unilateral Esquerda', 'RX', false],
  ['Mamografia com Magnificação', 'RX', false],
  ['Mamografia com Compressão Localizada', 'RX', false],
  ['Mamografia com Implantes', 'RX', false],
  // Densitometria
  ['Densitometria Óssea Coluna Lombar', 'RX', false],
  ['Densitometria Óssea Fêmur Proximal', 'RX', false],
  ['Densitometria Óssea Coluna Lombar e Fêmur', 'RX', false],
  ['Densitometria Óssea Corpo Inteiro', 'RX', false],

  // ============================================================
  // TOMOGRAFIA COMPUTADORIZADA (TC)
  // ============================================================
  // Crânio / Face / Pescoço
  ['Tomografia de Crânio', 'TC', false],
  ['Tomografia de Crânio sem Contraste', 'TC', false],
  ['Tomografia de Crânio com Contraste', 'TC', false],
  ['Tomografia de Seios da Face', 'TC', false],
  ['Tomografia de Face', 'TC', false],
  ['Tomografia de Órbitas', 'TC', false],
  ['Tomografia de Ossos Temporais', 'TC', false],
  ['Tomografia de Mastoides', 'TC', false],
  ['Tomografia de Mandíbula', 'TC', false],
  ['Tomografia de ATM', 'TC', false],
  ['Tomografia de Pescoço', 'TC', false],
  ['Tomografia de Pescoço com Contraste', 'TC', false],
  // Coluna
  ['Tomografia de Coluna Cervical', 'TC', false],
  ['Tomografia de Coluna Torácica', 'TC', false],
  ['Tomografia de Coluna Lombar', 'TC', false],
  ['Tomografia de Coluna Lombossacra', 'TC', false],
  // Tórax
  ['Tomografia de Tórax', 'TC', false],
  ['Tomografia de Tórax sem Contraste', 'TC', false],
  ['Tomografia de Tórax com Contraste', 'TC', false],
  ['Angiotomografia de Tórax', 'TC', false],
  ['Tomografia de Alta Resolução do Tórax', 'TC', false],
  // Abdome / Pelve
  ['Tomografia de Abdome Superior', 'TC', false],
  ['Tomografia de Abdome Total', 'TC', false],
  ['Tomografia de Pelve', 'TC', false],
  ['Tomografia de Abdome e Pelve', 'TC', false],
  ['Tomografia de Vias Urinárias', 'TC', false],
  ['Urotomografia', 'TC', false],
  ['Angiotomografia de Aorta Abdominal', 'TC', false],
  // Membros Superiores
  ['Tomografia de Ombro Direito', 'TC', false],
  ['Tomografia de Ombro Esquerdo', 'TC', false],
  ['Tomografia de Cotovelo Direito', 'TC', false],
  ['Tomografia de Cotovelo Esquerdo', 'TC', false],
  ['Tomografia de Punho Direito', 'TC', false],
  ['Tomografia de Punho Esquerdo', 'TC', false],
  ['Tomografia de Mão Direita', 'TC', false],
  ['Tomografia de Mão Esquerda', 'TC', false],
  // Membros Inferiores
  ['Tomografia de Quadril Direito', 'TC', false],
  ['Tomografia de Quadril Esquerdo', 'TC', false],
  ['Tomografia de Fêmur Direito', 'TC', false],
  ['Tomografia de Fêmur Esquerdo', 'TC', false],
  ['Tomografia de Joelho Direito', 'TC', false],
  ['Tomografia de Joelho Esquerdo', 'TC', false],
  ['Tomografia de Perna Direita', 'TC', false],
  ['Tomografia de Perna Esquerda', 'TC', false],
  ['Tomografia de Tornozelo Direito', 'TC', false],
  ['Tomografia de Tornozelo Esquerdo', 'TC', false],
  ['Tomografia de Pé Direito', 'TC', false],
  ['Tomografia de Pé Esquerdo', 'TC', false],

  // ============================================================
  // RESSONÂNCIA MAGNÉTICA (RM)
  // ============================================================
  // Crânio / Face / Sela / Órbitas
  ['Ressonância Magnética de Crânio', 'RM', false],
  ['Ressonância Magnética de Encéfalo', 'RM', false],
  ['Ressonância Magnética de Sela Túrquica', 'RM', false],
  ['Ressonância Magnética de Órbitas', 'RM', false],
  ['Ressonância Magnética de Face', 'RM', false],
  ['Ressonância Magnética de Seios da Face', 'RM', false],
  ['Ressonância Magnética de Mastoides', 'RM', false],
  ['Ressonância Magnética de ATM', 'RM', false],
  // Coluna
  ['Ressonância Magnética de Coluna Cervical', 'RM', false],
  ['Ressonância Magnética de Coluna Torácica', 'RM', false],
  ['Ressonância Magnética de Coluna Lombar', 'RM', false],
  ['Ressonância Magnética de Coluna Lombossacra', 'RM', false],
  ['Ressonância Magnética de Coluna Total', 'RM', false],
  // Abdome / Pelve
  ['Ressonância Magnética de Abdome Superior', 'RM', false],
  ['Ressonância Magnética de Abdome Total', 'RM', false],
  ['Ressonância Magnética de Pelve', 'RM', false],
  ['Ressonância Magnética de Fígado', 'RM', false],
  ['Ressonância Magnética de Vias Biliares', 'RM', false],
  ['Colangiorressonância', 'RM', false],
  ['Ressonância Magnética de Pâncreas', 'RM', false],
  ['Ressonância Magnética de Pelve Feminina', 'RM', false],
  ['Ressonância Magnética de Próstata', 'RM', false],
  // Tórax / Cardíaca
  ['Ressonância Magnética de Tórax', 'RM', false],
  ['Ressonância Magnética Cardíaca', 'RM', false],
  // Membros Superiores
  ['Ressonância Magnética de Ombro Direito', 'RM', false],
  ['Ressonância Magnética de Ombro Esquerdo', 'RM', false],
  ['Ressonância Magnética de Cotovelo Direito', 'RM', false],
  ['Ressonância Magnética de Cotovelo Esquerdo', 'RM', false],
  ['Ressonância Magnética de Punho Direito', 'RM', false],
  ['Ressonância Magnética de Punho Esquerdo', 'RM', false],
  ['Ressonância Magnética de Mão Direita', 'RM', false],
  ['Ressonância Magnética de Mão Esquerda', 'RM', false],
  // Membros Inferiores
  ['Ressonância Magnética de Quadril Direito', 'RM', false],
  ['Ressonância Magnética de Quadril Esquerdo', 'RM', false],
  ['Ressonância Magnética de Coxa Direita', 'RM', false],
  ['Ressonância Magnética de Coxa Esquerda', 'RM', false],
  ['Ressonância Magnética de Joelho Direito', 'RM', false],
  ['Ressonância Magnética de Joelho Esquerdo', 'RM', false],
  ['Ressonância Magnética de Perna Direita', 'RM', false],
  ['Ressonância Magnética de Perna Esquerda', 'RM', false],
  ['Ressonância Magnética de Tornozelo Direito', 'RM', false],
  ['Ressonância Magnética de Tornozelo Esquerdo', 'RM', false],
  ['Ressonância Magnética de Pé Direito', 'RM', false],
  ['Ressonância Magnética de Pé Esquerdo', 'RM', false],

  // ============================================================
  // ULTRASSONOGRAFIA (US)
  // ============================================================
  // USG Geral
  ['Ultrassonografia de Abdome Total', 'US', false],
  ['Ultrassonografia de Abdome Superior', 'US', false],
  ['Ultrassonografia de Pelve', 'US', false],
  ['Ultrassonografia de Rins e Vias Urinárias', 'US', false],
  ['Ultrassonografia de Próstata Abdominal', 'US', false],
  ['Ultrassonografia de Tireoide', 'US', false],
  ['Ultrassonografia de Mamas Bilateral', 'US', true],
  ['Ultrassonografia de Mama Direita', 'US', false],
  ['Ultrassonografia de Mama Esquerda', 'US', false],
  ['Ultrassonografia de Partes Moles', 'US', false],
  ['Ultrassonografia de Parede Abdominal', 'US', false],
  ['Ultrassonografia de Bolsa Escrotal', 'US', false],
  ['Ultrassonografia Transvaginal', 'US', false],
  ['Ultrassonografia Obstétrica', 'US', false],
  ['Ultrassonografia Morfológica', 'US', false],
  ['Ultrassonografia com Doppler Obstétrico', 'US', false],
  // Doppler
  ['Doppler de Carótidas e Vertebrais', 'US', false],
  ['Doppler Venoso de Membro Inferior Direito', 'US', false],
  ['Doppler Venoso de Membro Inferior Esquerdo', 'US', false],
  ['Doppler Venoso de Membros Inferiores', 'US', true],
  ['Doppler Arterial de Membro Inferior Direito', 'US', false],
  ['Doppler Arterial de Membro Inferior Esquerdo', 'US', false],
  ['Doppler Arterial de Membros Inferiores', 'US', true],
  ['Doppler Venoso de Membro Superior Direito', 'US', false],
  ['Doppler Venoso de Membro Superior Esquerdo', 'US', false],
  ['Doppler Arterial Renal', 'US', false],
  ['Doppler de Aorta e Ilíacas', 'US', false],
];

let inserted = 0;
let skipped = 0;

for (const [exam_name, modality, bilateral] of exams) {
  try {
    const [rows] = await conn.execute(
      'SELECT id FROM exam_legends WHERE exam_name = ? AND modality = ? LIMIT 1',
      [exam_name, modality]
    );
    if (rows.length > 0) {
      skipped++;
      continue;
    }
    await conn.execute(
      'INSERT INTO exam_legends (exam_name, modality, bilateral) VALUES (?, ?, ?)',
      [exam_name, modality, bilateral ? 1 : 0]
    );
    inserted++;
  } catch (e) {
    console.log('ERROR:', exam_name, '-', e.message.substring(0, 80));
  }
}

await conn.end();
console.log(`Done! Inserted: ${inserted}, Skipped (already exists): ${skipped}, Total: ${exams.length}`);
