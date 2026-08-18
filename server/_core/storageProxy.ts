import type { Express } from "express";
import type { Response } from "express";
import { Readable } from "node:stream";
import { ENV } from "./env";

async function getPresignedStorageUrl(key: string): Promise<string> {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    throw new Error("Storage proxy not configured");
  }
  const forgeUrl = new URL("v1/storage/presign/get", ENV.forgeApiUrl.replace(/\/+$/, "") + "/");
  forgeUrl.searchParams.set("path", key);
  const forgeResp = await fetch(forgeUrl, {
    headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
  });
  if (!forgeResp.ok) {
    throw new Error(`Storage backend error: ${forgeResp.status}`);
  }
  const { url } = (await forgeResp.json()) as { url?: string };
  if (!url) throw new Error("Empty signed URL from backend");
  return url;
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const params = req.params as unknown as Record<string, string | undefined>;
    const key = params["0"];
    if (!key || key.includes("..")) {
      res.status(400).send("Missing or invalid storage key");
      return;
    }
    try {
      const url = await getPresignedStorageUrl(key);
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (error) {
      console.error("[StorageProxy] failed:", error);
      res.status(502).send("Storage proxy error");
    }
  });
}

export async function streamStorageDownload(res: Response, key: string, filename: string) {
  try {
    const url = await getPresignedStorageUrl(key);
    const objectResponse = await fetch(url);
    if (!objectResponse.ok || !objectResponse.body) {
      throw new Error(`Storage object error: ${objectResponse.status}`);
    }
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store, private");
    const contentLength = objectResponse.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);
    Readable.fromWeb(objectResponse.body as any).pipe(res);
  } catch (error) {
    console.error("[StorageProxy] installer download failed:", error);
    if (!res.headersSent) res.status(502).json({ error: "Não foi possível baixar o instalador." });
  }
}
