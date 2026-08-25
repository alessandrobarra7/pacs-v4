import path from "path";
import { fileURLToPath } from "url";
import { loadEnvironmentFiles } from "./envLoader";

const directory = path.dirname(fileURLToPath(import.meta.url));

loadEnvironmentFiles([
  "/opt/pacs-portal/.env",
  path.resolve(directory, ".env"),
  path.resolve(directory, "../.env"),
  path.resolve(process.cwd(), ".env"),
]);
