/**
 * Bug fix N1: Infere a extensão real do arquivo a partir do data URI.
 * Evita que WebP/JPEG/GIF sejam salvos com extensão .png incorreta.
 */
export function inferExtension(dataUri: string): string {
  const match = dataUri.match(/^data:image\/([a-z+]+);base64,/);
  const mime = match?.[1] || 'png';
  if (mime === 'jpeg') return 'jpg';
  if (mime === 'svg+xml') return 'svg';
  return mime; // png, gif, webp
}

/**
 * Bug fix 5.2: Valida magic bytes para garantir que o buffer é uma imagem real.
 * Aceita PNG, JPEG, GIF e WebP.
 */
export function isValidImageBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true;
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true;
  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  // WebP: RIFF....WEBP
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return true;
  return false;
}

export function detectImageMimeType(buf: Buffer): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return "image/jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export function detectAudioMimeType(buf: Buffer): "audio/mpeg" | "audio/wav" | "audio/ogg" | "audio/webm" | null {
  if (buf.length < 4) return null;
  if (buf.slice(0, 3).toString("ascii") === "ID3" || (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0)) return "audio/mpeg";
  if (buf.length >= 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WAVE") return "audio/wav";
  if (buf.slice(0, 4).toString("ascii") === "OggS") return "audio/ogg";
  if (buf.length >= 4 && buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return "audio/webm";
  return null;
}

export function extensionForMediaMimeType(mimeType: string): string {
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
  };
  return extensions[mimeType] ?? "bin";
}
