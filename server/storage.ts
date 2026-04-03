/**
 * Storage local — logos de unidades e carimbos de médicos
 * Arquivos salvos em /uploads/ dentro do diretório do projeto na VM1.
 * Servidos estaticamente pelo Express em /uploads/*.
 *
 * Com apenas ~50 arquivos pequenos (logos + carimbos), armazenamento local
 * é mais simples e confiável do que depender do MinIO.
 */
import fs from "fs";
import path from "path";

// Diretório base de uploads — relativo à raiz do projeto
const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

/**
 * Garante que o subdiretório existe.
 */
function ensureDir(subDir: string): string {
  const dir = path.join(UPLOADS_DIR, subDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Salva um arquivo no disco local e retorna a URL pública relativa.
 * @param relKey  Caminho relativo (ex: "logos/unit_1_123.png")
 * @param data    Buffer com o conteúdo do arquivo
 * @param _contentType  Ignorado (mantido por compatibilidade com a interface anterior)
 * @returns { key, url } — url é a URL pública acessível pelo browser
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = relKey.replace(/^\/+/, "");
  const subDir = path.dirname(key);
  const fileName = path.basename(key);

  ensureDir(subDir);

  const filePath = path.join(UPLOADS_DIR, key);
  const buffer = typeof data === "string" ? Buffer.from(data, "utf-8") : Buffer.from(data);
  fs.writeFileSync(filePath, buffer);

  // URL pública: /uploads/logos/unit_1_123.png
  const url = `/uploads/${key}`;
  return { key, url };
}

/**
 * Retorna a URL pública de um arquivo já salvo.
 * @param relKey Caminho relativo (ex: "logos/unit_1_123.png")
 */
export async function storageGet(
  relKey: string,
  _expiresIn = 3600
): Promise<{ key: string; url: string }> {
  const key = relKey.replace(/^\/+/, "");
  const url = `/uploads/${key}`;
  return { key, url };
}
