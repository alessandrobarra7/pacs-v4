import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("./authorization", () => ({
  canAccessUnit: vi.fn().mockResolvedValue(true),
  requireUnitPermission: vi.fn().mockResolvedValue(undefined),
  getAllowedUnitIds: vi.fn().mockResolvedValue(null),
  resolveRequestedUnit: vi.fn().mockResolvedValue(null),
  getAdminManagedUnitIds: vi.fn().mockResolvedValue(null),
  getStudyUnitId: vi.fn().mockResolvedValue(null),
}));

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getDb: vi.fn(),
    getReportById: vi.fn(),
    createReport: vi.fn(),
    removeVisitEventForReport: vi.fn(),
    createAuditLog: vi.fn(),
  };
});

import { createReport, getDb, getReportById } from "./db";

function context(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-master",
      name: "Administrador",
      email: null,
      username: "admin",
      password_hash: null,
      loginMethod: "local",
      role: "admin_master",
      unit_id: 10,
      isActive: true,
      expiration_date: null,
      crm: null,
      signature_url: null,
      stamp_url: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { ip: "127.0.0.1", headers: { "user-agent": "vitest" } } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function signedCatalogReport() {
  return {
    id: 50,
    unit_id: 10,
    study_instance_uid: "1.2.3.4",
    document_key: "primary",
    status: "signed",
    body: "<p>Laudo assinado</p>",
    version: 1,
    study_id: null,
    template_id: null,
    author_user_id: 7,
    previousVersionId: null,
    signedAt: new Date(),
    signedBy: 7,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;
}

function chain(result: unknown) {
  return { from: () => ({ where: async () => result }) };
}

describe("cancelamento auditável de laudo assinado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancela o laudo e os eventos vinculados sem apagar o histórico", async () => {
    const updateSets: unknown[] = [];
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(chain([{ id: 5, documents_snapshot: [{ key: "primary", label: "Principal", sort_order: 1 }] }]))
        .mockReturnValueOnce(chain([{ id: 50, document_key: "primary", status: "signed", version: 1, body: "<p>Laudo assinado</p>" }]))
        .mockReturnValueOnce(chain([]))
        .mockReturnValueOnce(chain([{ id: 9, doctor_received_at: null, system_paid_at: null }])),
      insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
      update: vi.fn(() => ({ set: (values: unknown) => {
        updateSets.push(values);
        return { where: async () => undefined };
      } })),
    };
    vi.mocked(getDb).mockResolvedValue({ transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx) } as any);
    vi.mocked(getReportById).mockResolvedValue(signedCatalogReport());

    const result = await appRouter.createCaller(context()).reports.delete({ id: 50, reason: "Laudo clínico invalidado" });

    expect(result).toMatchObject({ success: true, cancelled: true, cancelled_events: 1, cancelled_reports: 1 });
    expect(updateSets).toContainEqual({ status: "cancelled" });
    expect(updateSets).toContainEqual(expect.objectContaining({
      financial_status: "cancelled",
      cancellation_report_id: 50,
      cancellation_reason: "Laudo clínico invalidado",
    }));
  });

  it("recusa o cancelamento quando o evento financeiro já possui baixa", async () => {
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(chain([{ id: 5, documents_snapshot: [{ key: "primary", label: "Principal", sort_order: 1 }] }]))
        .mockReturnValueOnce(chain([{ id: 50, document_key: "primary", status: "signed", version: 1, body: "<p>Laudo assinado</p>" }]))
        .mockReturnValueOnce(chain([]))
        .mockReturnValueOnce(chain([{ id: 9, doctor_received_at: new Date(), system_paid_at: null }])),
      insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
      update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
    };
    vi.mocked(getDb).mockResolvedValue({ transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx) } as any);
    vi.mocked(getReportById).mockResolvedValue(signedCatalogReport());

    await expect(
      appRouter.createCaller(context()).reports.delete({ id: 50, reason: "Laudo clínico invalidado" }),
    ).rejects.toThrow("evento financeiro já baixado");
  });

  it("cancela todos os documentos assinados da seleção composta e o evento único", async () => {
    const auditEntries: unknown[] = [];
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(chain([{ id: 5, documents_snapshot: [{ key: "cervical" }, { key: "lombar" }] }]))
        .mockReturnValueOnce(chain([
          { id: 50, document_key: "cervical", status: "signed", version: 1, body: "<p>Cervical</p>" },
          { id: 51, document_key: "lombar", status: "revised", version: 2, body: "<p>Lombar</p>" },
        ]))
        .mockReturnValueOnce(chain([]))
        .mockReturnValueOnce(chain([{ id: 9, doctor_received_at: null, system_paid_at: null }])),
      insert: vi.fn(() => ({ values: vi.fn(async (values: unknown) => { auditEntries.push(values); }) })),
      update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
    };
    vi.mocked(getDb).mockResolvedValue({ transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx) } as any);
    vi.mocked(getReportById).mockResolvedValue({ ...signedCatalogReport(), document_key: "cervical" });

    const result = await appRouter.createCaller(context()).reports.delete({ id: 50, reason: "Inconsistência em exame composto" });

    expect(result).toMatchObject({ success: true, cancelled: true, cancelled_reports: 2, cancelled_events: 1 });
    expect(auditEntries.some((entry) => Array.isArray(entry))).toBe(true);
    const auditBatch = auditEntries.at(-1) as Array<{ target_id: string; metadata: { cancelledReportIds: number[] } }>;
    expect(auditBatch).toHaveLength(2);
    expect(auditBatch.map((entry) => entry.target_id).sort()).toEqual(["50", "51"]);
    expect(auditBatch[0].metadata.cancelledReportIds).toEqual([50, 51]);
  });

  it("cria a ocorrência dois somente depois de um cancelamento auditável", async () => {
    vi.mocked(getDb).mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: async () => [{ status: "cancelled", billing_occurrence: 1 }],
        })),
      })),
    } as any);
    vi.mocked(createReport).mockResolvedValue(91);

    const result = await appRouter.createCaller(context()).reports.create({
      study_instance_uid: "1.2.3.4",
      unit_id: 10,
      document_key: "primary",
      body: "<p>Novo laudo</p>",
      new_occurrence: true,
    });

    expect(result).toEqual({ id: 91 });
    expect(createReport).toHaveBeenCalledWith(expect.objectContaining({
      status: "draft",
      billing_occurrence: 2,
    }));
  });
});
