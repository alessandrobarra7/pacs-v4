export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// ─── Constantes PACS (M4: centralizadas aqui em vez de espalhadas) ────────────
/** Número máximo de estudos retornados por uma busca C-FIND no PACS */
export const PACS_MAX_RESULTS = 500;

/** Tamanho máximo de upload de imagem em bytes (2 MB) */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Tamanho máximo de upload de imagem em bytes para exibição no frontend (2 MB) */
export const MAX_UPLOAD_MB = 2;
