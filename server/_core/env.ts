export const ENV = {
  get cookieSecret() {
    return process.env.JWT_SECRET ?? "";
  },
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  // Bug fix N6: duração da sessão configurável via env (padrão: 24h)
  get sessionDurationHours() {
    return parseInt(process.env.SESSION_DURATION_HOURS ?? "24", 10);
  },
  // BUG-5 FIX: timeout do C-GET configurável via env (padrão: 600000ms = 10min)
  get dicomGetTimeoutMs() {
    return parseInt(process.env.DICOM_GET_TIMEOUT_MS ?? "600000", 10);
  },
};
