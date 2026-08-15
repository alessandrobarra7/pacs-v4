import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/PacsQueryPage.tsx"),
  "utf8",
);
const headerSource = readFileSync(
  resolve(process.cwd(), "client/src/components/AppHeader.tsx"),
  "utf8",
);

describe("PacsQueryPage mobile study list contract", () => {
  it("keeps the desktop table and renders a separate mobile card list", () => {
    expect(pageSource).toContain('className="hidden md:block"');
    expect(pageSource).toContain('className="md:hidden p-3 space-y-2 bg-gray-50/70"');
    expect(pageSource).toContain("pagedResults.map((study, idx) => {");
  });

  it("matches the compact mobile hierarchy from the visual reference", () => {
    expect(pageSource).toContain('className="md:hidden bg-white border-b border-gray-200 p-5 shrink-0"');
    expect(pageSource).toContain("Escolher data");
    expect(pageSource).toContain("rounded-xl border border-gray-200 bg-white px-4 py-3");
    expect(pageSource).toContain("mobileStatusCls");
    expect(pageSource).toContain("break-words pr-1 text-[15px] font-bold uppercase leading-tight");
    expect(pageSource).not.toContain("truncate pr-1 text-[15px] font-bold uppercase leading-tight ${patientNameEdited");
    expect(pageSource).toContain("mt-1 truncate pr-1 text-xs uppercase leading-tight text-gray-500");
    expect(pageSource).toContain("mt-1.5 flex items-start gap-2");
    expect(pageSource).toContain("max-w-[92px] shrink-0 items-center rounded-full");
    expect(headerSource).toContain("mobileUnitLabel");
    expect(headerSource).toContain("Abrir menu");
    expect(headerSource).toContain("md:hidden absolute bottom-6");
  });

  it("keeps the date picker wired to both responsive triggers and the PACS query", () => {
    expect(pageSource).toContain("const [calendarOpen, setCalendarOpen] = useState(false)");
    expect(pageSource).toContain("<Dialog open={calendarOpen} onOpenChange={handleCalendarDialogChange}>");
    expect(pageSource).toContain("<DialogContent");
    expect(pageSource).toContain("const handleCalendarSelect = (date: Date | undefined)");
    expect(pageSource).toContain("onSelect={setCalendarDraftDate}");
    expect(pageSource).toContain("openCalendarDialog");
    expect(pageSource).toContain("handleCalendarDialogChange");
    expect(pageSource).toContain("const applyCalendarDraft = () =>");
    expect(pageSource).toContain("const applyCalendarToday = () =>");
    expect(pageSource).toContain("<DialogClose asChild>");
    expect(pageSource).toContain("Fechar");
    expect(pageSource).toContain("Hoje");
    expect(pageSource).toContain("runQuery({ period: 'custom', studyDate });");
    expect(pageSource).toContain("sessionStorage.setItem(filterSessionKey, JSON.stringify(newFilters))");
    expect(pageSource).toContain("studyDate = studyDate.replace(/-/g, '')");
  });

  it("uses the existing permission gates and handlers for mobile actions", () => {
    expect(pageSource).toContain("{canViewer && (");
    expect(pageSource).toContain("{canLaudo && (");
    expect(pageSource).toContain("{canPrint && (");
    expect(pageSource).toContain("handleVisualize(study)");
    expect(pageSource).toContain("handleReport(study)");
    expect(pageSource).toContain("handlePrintReport(study)");
    expect(pageSource).toContain("handlePreDownload(study)");
  });

  it("normalizes DICOM patient names before displaying them", () => {
    expect(pageSource).toContain("replace(/\\^+/g, ' ').replace(/\\s{2,}/g, ' ').trim()");
    expect(pageSource).toContain(".toUpperCase()");
  });
});
