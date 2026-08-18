import { createHash } from "crypto";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { describeRadiantInstaller, getRadiantInstallerReleaseAssetName } from "./radiantInstaller";

describe("artefato local do instalador RadiAnt", () => {
  it("descreve arquivo local e calcula checksum SHA-256", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "radiant-installer-"));
    const installer = path.join(root, "PacsRadiantAssistantSetup.exe");
    const body = Buffer.from("portable-executable-test");
    await writeFile(installer, body);

    const metadata = await describeRadiantInstaller(installer);

    expect(metadata.bytes).toBe(body.length);
    expect(metadata.fileName).toBe("PacsRadiantAssistantSetup.exe");
    expect(metadata.sha256).toBe(createHash("sha256").update(body).digest("hex"));
  });

  it("recusa diretórios como instalador", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "radiant-installer-dir-"));
    const directory = path.join(root, "not-an-installer");
    await mkdir(directory);

    await expect(describeRadiantInstaller(directory)).rejects.toThrow("not a file");
  });

  it("aceita apenas versão de release prevista", () => {
    expect(getRadiantInstallerReleaseAssetName("v0.1.0-pilot")).toBe("PacsRadiantAssistantSetup.exe-v0.1.0-pilot");
    expect(() => getRadiantInstallerReleaseAssetName("../main")).toThrow("Invalid installer release version");
  });
});
