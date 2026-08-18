import crypto from "crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Response } from "express";

export const RADIANT_INSTALLER_FILE_NAME = "PacsRadiantAssistantSetup.exe";
export const DEFAULT_RADIANT_INSTALLER_PATH = `/var/lib/pacs-radiant-assistant/${RADIANT_INSTALLER_FILE_NAME}`;

export type RadiantInstallerDescriptor = {
  filePath: string;
  fileName: string;
  bytes: number;
  sha256: string;
};

export async function describeRadiantInstaller(filePath = process.env.RADIANT_ASSISTANT_INSTALLER_PATH || DEFAULT_RADIANT_INSTALLER_PATH): Promise<RadiantInstallerDescriptor> {
  const metadata = await stat(filePath);
  if (!metadata.isFile()) throw new Error("Installer artifact is not a file");

  const digest = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(filePath);
    input.on("data", chunk => digest.update(chunk));
    input.on("end", resolve);
    input.on("error", reject);
  });

  return {
    filePath,
    fileName: RADIANT_INSTALLER_FILE_NAME,
    bytes: metadata.size,
    sha256: digest.digest("hex"),
  };
}

export async function streamRadiantInstaller(res: Response, filePath?: string) {
  try {
    const installer = await describeRadiantInstaller(filePath);
    res.setHeader("Content-Type", "application/vnd.microsoft.portable-executable");
    res.setHeader("Content-Disposition", `attachment; filename="${installer.fileName}"`);
    res.setHeader("Content-Length", String(installer.bytes));
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("X-Installer-SHA256", installer.sha256);
    res.setHeader("X-Content-Type-Options", "nosniff");
    createReadStream(installer.filePath).pipe(res);
  } catch (error) {
    console.error("[RadiAnt Installer] local artifact unavailable:", error);
    if (!res.headersSent) {
      res.status(503).json({ error: "Instalador RadiAnt indisponível temporariamente." });
    }
  }
}

export function getRadiantInstallerReleaseAssetName(version: string) {
  if (!/^v\d+\.\d+\.\d+(-[a-z0-9.-]+)?$/i.test(version)) {
    throw new Error("Invalid installer release version");
  }
  return `${RADIANT_INSTALLER_FILE_NAME}-${version}`;
}
