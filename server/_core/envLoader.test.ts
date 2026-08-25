import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvironmentFiles } from "./envLoader";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("loadEnvironmentFiles", () => {
  it("combina os arquivos em ordem sem deixar valor vazio apagar credenciais operacionais", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pacs-env-"));
    temporaryDirectories.push(directory);
    const operationalEnv = path.join(directory, "operational.env");
    const projectEnv = path.join(directory, "project.env");

    await fs.writeFile(operationalEnv, "DATABASE_URL=mysql://vm2/pacs\nMINIO_BUCKET=lauds\n");
    await fs.writeFile(projectEnv, "JWT_SECRET=local-session-secret\nDATABASE_URL=\nAPP_TIME_ZONE=America/Fortaleza\n");

    const target: Record<string, string | undefined> = {};
    const logs: string[] = [];
    const loaded = loadEnvironmentFiles([operationalEnv, projectEnv], target, (message) => logs.push(message));

    expect(loaded).toEqual([path.resolve(operationalEnv), path.resolve(projectEnv)]);
    expect(target).toMatchObject({
      DATABASE_URL: "mysql://vm2/pacs",
      MINIO_BUCKET: "lauds",
      JWT_SECRET: "local-session-secret",
      APP_TIME_ZONE: "America/Fortaleza",
    });
    expect(logs).toHaveLength(2);
    expect(logs.join("\n")).not.toContain("mysql://vm2/pacs");
    expect(logs.join("\n")).not.toContain("local-session-secret");
  });

  it("não recarrega o mesmo arquivo quando ele aparece em mais de um caminho", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pacs-env-"));
    temporaryDirectories.push(directory);
    const envFile = path.join(directory, "shared.env");
    await fs.writeFile(envFile, "JWT_SECRET=secret\n");

    const logs: string[] = [];
    const loaded = loadEnvironmentFiles([envFile, path.resolve(envFile)], {}, (message) => logs.push(message));

    expect(loaded).toEqual([path.resolve(envFile)]);
    expect(logs).toHaveLength(1);
  });
});
