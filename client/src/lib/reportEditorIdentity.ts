// Identidade do documento aberto no editor de laudos.
//
// ADENDO 2 (parecer Manus sobre 5fea1cf): o editor tem campos contentEditable não
// controlados (DOM), estado de retificação e gatilhos automáticos. Se a rota troca de
// estudo/documento sem desmontar a página, qualquer um deles pode carregar conteúdo do
// documento anterior. Esta identidade é usada como React key da página (remonta tudo)
// e para validar, campo a campo, que dados do servidor e snapshots pertencem à rota.

export type ReportRouteIdentity = {
  studyUid: string;
  documentKey: string;
  unitId: number;
  financialView: boolean;
  printOnOpen: boolean;
  downloadOnOpen: boolean;
};

export function parseReportRouteIdentity(pathname: string, search: string): ReportRouteIdentity {
  const params = new URLSearchParams(search);
  return {
    studyUid: pathname.split("/").pop() || "",
    documentKey: params.get("document") || "primary",
    unitId: Number(params.get("unitId")) || 0,
    financialView: params.get("financialView") === "1",
    printOnOpen: params.get("print") === "1",
    downloadOnOpen: params.get("download") === "1",
  };
}

/** Chave estável do documento: muda sempre que estudo, documento, unidade ou modo mudam. */
export function reportDocumentKey(identity: ReportRouteIdentity): string {
  return [
    identity.studyUid,
    identity.documentKey,
    identity.unitId,
    identity.financialView ? "fin" : "",
    identity.printOnOpen ? "print" : "",
    identity.downloadOnOpen ? "download" : "",
  ].join("|");
}

type ReportOwnership = { study_instance_uid?: string | null; document_key?: string | null } | null | undefined;

/**
 * O laudo devolvido pelo servidor pertence à rota atual?
 * Mantém a compatibilidade do servidor: um estudo com um único laudo "primary" é
 * devolvido também para outros documentKey (laudos legados).
 */
export function reportBelongsToRoute(report: ReportOwnership, studyUid: string, documentKey: string): boolean {
  if (!report) return false;
  if (!report.study_instance_uid || report.study_instance_uid !== studyUid) return false;
  const key = report.document_key || "primary";
  return key === documentKey || key === "primary";
}

/** Snapshot da retificação, ligado ao documento e ao laudo em que foi capturado. */
export type PendingRevision = { studyUid: string; documentKey: string; reportId: number; body: string };

export function pendingRevisionMatches(
  pending: PendingRevision | null,
  current: { studyUid: string; documentKey: string; reportId: number | null | undefined },
): boolean {
  return Boolean(
    pending
      && current.reportId != null
      && pending.reportId === current.reportId
      && pending.studyUid === current.studyUid
      && pending.documentKey === current.documentKey,
  );
}
