import fs from "node:fs";

const pagePath = "/home/ubuntu/pacs-portal/client/src/pages/ReportEditorPage.tsx";
const fragmentPath = "/home/ubuntu/pacs-portal/scripts/single-page-canvas.fragment.txt";
const source = fs.readFileSync(pagePath, "utf8");
const fragment = fs.readFileSync(fragmentPath, "utf8");
const startMarker = "              /* MODO PÁGINA Única:";
const endMarker = "      {/* ── EDITOR MOBILE";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0 || end <= start) {
  throw new Error(`Não foi possível localizar o modo de página única: start=${start}, end=${end}`);
}
const next = source.slice(0, start) + fragment + source.slice(end);
fs.writeFileSync(pagePath, next);
console.log(`Canvas desktop substituído: ${start}..${end}`);
