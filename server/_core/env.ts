export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Bug fix N6: duração da sessão configurável via env (padrão: 24h)
  sessionDurationHours: parseInt(process.env.SESSION_DURATION_HOURS ?? "24", 10),
  // BUG-5 FIX: timeout do C-GET configurável via env (padrão: 600000ms = 10min)
  dicomGetTimeoutMs: parseInt(process.env.DICOM_GET_TIMEOUT_MS ?? "600000", 10),
};
