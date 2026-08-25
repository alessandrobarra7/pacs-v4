export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // Bug fix N6: duração da sessão configurável via env (padrão: 24h)
  sessionDurationHours: parseInt(process.env.SESSION_DURATION_HOURS ?? "24", 10),
  // BUG-5 FIX: timeout do C-GET configurável via env (padrão: 600000ms = 10min)
  dicomGetTimeoutMs: parseInt(process.env.DICOM_GET_TIMEOUT_MS ?? "600000", 10),
};
