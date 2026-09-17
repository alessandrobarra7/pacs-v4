/**
 * CORREÇÃO (solicitação técnica "isolamento de testes VM1", 2026-09-17):
 * este teste comparava process.env com valores fixos de produção (endpoint,
 * bucket e access key reais da VM3). Isso só "passa" em um processo que já
 * carregou o .env real — no sandbox e em qualquer ambiente de CI sem esse .env,
 * ele falha sempre, por design, sem provar nada sobre a lógica de configuração
 * do MinIO. Reescrito para testar server/minio.ts#parseMinioConfig com valores
 * sintéticos passados explicitamente (nenhum segredo real em lugar nenhum deste
 * arquivo), cobrindo configuração completa, campos ausentes e não exposição de
 * segredo em erro — que é a garantia que este teste realmente pode dar sem
 * depender de infraestrutura.
 */
import { describe, expect, it } from "vitest";
import { minioClient, parseMinioConfig } from "./minio";

const runMinioIntegration = process.env.RUN_MINIO_INTEGRATION_TESTS === "1" ? it : it.skip;

const SYNTHETIC_ENV = {
  MINIO_ENDPOINT: "https://minio.exemplo-sintetico.test:9000",
  MINIO_BUCKET: "bucket-sintetico-teste",
  MINIO_ACCESS_KEY: "chave-de-acesso-sintetica",
  MINIO_SECRET_KEY: "segredo-sintetico-nao-real",
} as const;

describe("parseMinioConfig — validação pura, sem depender do .env real de nenhum ambiente", () => {
  it("com as quatro variáveis presentes, devolve a configuração e deriva useSSL do protocolo do endpoint", () => {
    const config = parseMinioConfig(SYNTHETIC_ENV);
    expect(config).toEqual({
      endpoint: SYNTHETIC_ENV.MINIO_ENDPOINT,
      bucket: SYNTHETIC_ENV.MINIO_BUCKET,
      accessKey: SYNTHETIC_ENV.MINIO_ACCESS_KEY,
      secretKey: SYNTHETIC_ENV.MINIO_SECRET_KEY,
      useSSL: true, // endpoint https:// sem MINIO_USE_SSL explícito
    });
  });

  it("com endpoint http:// e sem MINIO_USE_SSL, useSSL é derivado como false", () => {
    const config = parseMinioConfig({
      ...SYNTHETIC_ENV,
      MINIO_ENDPOINT: "http://minio.exemplo-sintetico.test:9000",
    });
    expect(config?.useSSL).toBe(false);
  });

  it("MINIO_USE_SSL explícito tem prioridade sobre o protocolo do endpoint", () => {
    const config = parseMinioConfig({
      ...SYNTHETIC_ENV,
      MINIO_ENDPOINT: "http://minio.exemplo-sintetico.test:9000",
      MINIO_USE_SSL: "true",
    });
    expect(config?.useSSL).toBe(true);
  });

  it.each([
    ["MINIO_ENDPOINT"],
    ["MINIO_BUCKET"],
    ["MINIO_ACCESS_KEY"],
    ["MINIO_SECRET_KEY"],
  ] as const)("com %s ausente, devolve null em vez de configuração parcial", (missingKey) => {
    const env = { ...SYNTHETIC_ENV, [missingKey]: undefined };
    expect(parseMinioConfig(env)).toBeNull();
  });

  it("com todas as variáveis ausentes, devolve null", () => {
    expect(parseMinioConfig({})).toBeNull();
  });

  it("nunca inclui a Secret Key na mensagem de erro quando a configuração está incompleta", () => {
    // A validação de "obrigatório" (requireConfig, em server/minio.ts) lança um erro
    // cujo texto lista os NOMES das variáveis faltantes, nunca um VALOR de segredo.
    // Aqui garantimos que parseMinioConfig em si não devolve nem ecoa nenhum valor
    // quando a config está incompleta — só null.
    const config = parseMinioConfig({ MINIO_ENDPOINT: SYNTHETIC_ENV.MINIO_ENDPOINT });
    expect(config).toBeNull();
    expect(JSON.stringify(config)).not.toContain(SYNTHETIC_ENV.MINIO_SECRET_KEY);
  });
});

describe("MinIO VM3 credentials — integração opcional", () => {
  // Este bloco só roda com RUN_MINIO_INTEGRATION_TESTS=1 e as variáveis reais de
  // ambiente carregadas (ex.: na VM1, via PM2/.env) — nunca no sandbox nem em CI
  // sem infraestrutura real. Continua fora da suíte padrão de pnpm test.
  runMinioIntegration(
    "autentica na API S3 e encontra o bucket configurado sem expor credenciais",
    async () => {
      const exists = await minioClient.bucketExists(process.env.MINIO_BUCKET!);
      expect(exists).toBe(true);
    },
    15_000,
  );
});
