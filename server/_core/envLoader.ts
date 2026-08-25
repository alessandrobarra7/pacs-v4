import fs from "fs";
import path from "path";
import { parse } from "dotenv";

type EnvironmentTarget = Record<string, string | undefined>;

export function loadEnvironmentFiles(
  envPaths: string[],
  target: EnvironmentTarget = process.env,
  logger: (message: string) => void = console.log,
): string[] {
  const loadedPaths = new Set<string>();
  const loaded: string[] = [];

  for (const envPath of envPaths) {
    const normalizedEnvPath = path.resolve(envPath);
    if (loadedPaths.has(normalizedEnvPath) || !fs.existsSync(normalizedEnvPath)) continue;

    loadedPaths.add(normalizedEnvPath);
    const parsed = parse(fs.readFileSync(normalizedEnvPath));
    let appliedCount = 0;

    for (const [key, value] of Object.entries(parsed)) {
      if (!value.trim()) continue;
      target[key] = value;
      appliedCount += 1;
    }

    loaded.push(normalizedEnvPath);
    logger(`[dotenv] Loaded ${appliedCount} non-empty vars from ${normalizedEnvPath}`);
  }

  return loaded;
}
