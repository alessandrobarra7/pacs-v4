/**
 * FinanceModals — Componentes compartilhados do módulo financeiro
 * LaudosModal e DoctorRow usados por FinanceDashboard e FinancePagamentos
 * Desenvolvimento StudioBarra7
 */
import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { CheckCircle2, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type FinanceEventOrigin = "legacy" | "catalog";
type FinanceEventRow = {
  id: number | string;
  patient_name: string | null;
  modality_snapshot: string | null;
  study_date: Date | string | null;
  signed_at: Date | string | null;
  doctor_amount_due: string | null;
  doctor_received_at: Date | string | null;
  source: FinanceEventOrigin;
};

export const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

export function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

// ─── Modal de laudos individuais ─────────────────────────────────────────────
export function LaudosModal({
  doctorUserId, unitId, referenceDate, doctorName, onClose
}: {
  doctorUserId: number;
  unitId: number;
  referenceDate: string;
  doctorName: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error, refetch } = trpc.financeSimple.eventsByDoctorUnit.useQuery({
    doctor_user_id: doctorUserId,
    unit_id: unitId,
    reference_date: referenceDate,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <p className="text-white font-semibold">{doctorName}</p>
            <p className="text-slate-400 text-xs">Laudos individuais do ciclo</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-10 bg-slate-800 rounded animate-pulse" />)}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-rose-300 text-sm">
              <p className="font-semibold text-rose-200">Falha ao carregar os eventos financeiros.</p>
              <p className="mt-1 text-xs text-rose-300">{error instanceof Error ? error.message : "Não foi possível consultar o detalhe de pagamentos."}</p>
              <Button type="button" variant="outline" size="sm" className="mt-4 border-rose-400/50 text-rose-100 hover:bg-rose-500/10" onClick={() => void refetch()}>Tentar novamente</Button>
            </div>
          ) : !data?.length ? (
            <div className="p-8 text-center text-slate-500 text-sm">Nenhum laudo encontrado.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-6 py-3 text-slate-400 font-medium text-xs uppercase">Paciente</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">Modalidade</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs uppercase">Data</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs uppercase">Valor</th>
                  <th className="text-right px-6 py-3 text-slate-400 font-medium text-xs uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {(data as FinanceEventRow[]).map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-3 text-white truncate max-w-[180px]">{ev.patient_name ?? "—"}<span className={`ml-1.5 text-[10px] font-semibold uppercase ${ev.source === "catalog" ? "text-cyan-400" : "text-slate-500"}`}>{ev.source === "catalog" ? "Catálogo" : "Legado"}</span></td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {ev.modality_snapshot ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {fmtDate(ev.study_date ?? ev.signed_at)}
                    </td>
                    <td className="px-4 py-3 text-amber-400 text-right font-medium">
                      {ev.doctor_amount_due ? fmtBRL(Number(ev.doctor_amount_due)) : "—"}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {ev.doctor_received_at ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" /> {fmtDate(ev.doctor_received_at)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-400 text-xs">
                          <Clock className="h-3.5 w-3.5" /> Pendente
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Linha de médico (compartilhada) ─────────────────────────────────────────
export function DoctorRow({
  doctor, unitId, referenceDate
}: {
  doctor: {
    doctor_user_id: number;
    doctor_name: string;
    total_laudos: number;
    doctor_total: number;
    doctor_paid: number;
    doctor_pending: number;
    doctor_pending_count: number;
    last_received_at?: Date | null;
  };
  unitId: number;
  referenceDate: string;
}) {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const utils = trpc.useUtils();
  const markPaid = trpc.financeSimple.markDoctorPaid.useMutation({
    onSuccess: () => {
      toast.success(`Pagamento de ${doctor.doctor_name} marcado como pago`);
      utils.financeSimple.doctorSummaryByUnit.invalidate();
      utils.financeSimple.unitSummary.invalidate();
      utils.financeSimple.dashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const canMark = user?.role === "admin_master" || user?.role === "unit_admin" || user?.role === "responsavel_financeiro";
  const allPaid = (doctor.doctor_pending_count ?? 0) === 0;

  return (
    <>
      <div className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-800/30 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <span className="text-amber-400 text-xs font-bold">
              {(doctor.doctor_name ?? "?").charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{doctor.doctor_name ?? "Médico"}</p>
            <p className="text-xs text-slate-400">
              {doctor.total_laudos} laudo{doctor.total_laudos !== 1 ? "s" : ""}
              {doctor.last_received_at && (
                <span className="ml-2 text-emerald-500">· pago em {fmtDate(doctor.last_received_at)}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-amber-400">{fmtBRL(doctor.doctor_total)}</p>
            {!allPaid && (
              <p className="text-xs text-rose-400">{fmtBRL(doctor.doctor_pending)} pend.</p>
            )}
            {allPaid && (
              <p className="text-xs text-emerald-400 flex items-center gap-1 justify-end">
                <CheckCircle2 className="h-3 w-3" /> Pago
              </p>
            )}
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="text-xs text-slate-400 hover:text-cyan-400 transition-colors underline underline-offset-2"
          >
            Ver laudos
          </button>
          {canMark && !allPaid && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-emerald-600/50 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500 h-7 px-2.5"
              disabled={markPaid.isPending}
              onClick={() => markPaid.mutate({
                doctor_user_id: doctor.doctor_user_id,
                unit_id: unitId,
                reference_date: referenceDate,
              })}
            >
              {markPaid.isPending ? "..." : "Marcar pago"}
            </Button>
          )}
          {allPaid && (
            <span className="text-xs text-emerald-400 w-[80px] text-center">✓ Quitado</span>
          )}
        </div>
      </div>
      {showModal && (
        <LaudosModal
          doctorUserId={doctor.doctor_user_id}
          unitId={unitId}
          referenceDate={referenceDate}
          doctorName={doctor.doctor_name ?? "Médico"}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// ─── Modal de configuração de preços padrão da unidade ───────────────────────
// FIX (2026-09-24, achado ao vivo com Alessandro logado como responsavel_financeiro):
// duas correções nesta modal.
//
// 1) UX enganosa / bloqueio invisível: getUnitDefaultPrices (leitura) é
//    liberado para responsavel_financeiro via assertAdmin(), mas
//    setUnitDefaultPrices (escrita) sempre foi restrito a admin_master no
//    backend. A modal, porém, renderizava os dois campos como inputs
//    editáveis e o botão "Salvar Preços" sempre habilitado para qualquer
//    role — um responsavel_financeiro conseguia editar o número, clicar
//    Salvar, e só então recebia o erro cru "FORBIDDEN" (sem tradução), sem
//    nunca ter tido chance real de salvar. Confirmado ao vivo em produção:
//    o clique gerou o toast "FORBIDDEN" e nada foi persistido. Agora a modal
//    verifica o role local (useAuth) e renderiza os valores como somente
//    leitura para quem não é admin_master, sem inputs nem botão de salvar —
//    a UI deixa de prometer uma ação que o backend nunca ia permitir.
//
// 2) "Preço Médico" é um valor morto para o cálculo real: default_doctor_price
//    fica salvo em `units`, mas NENHUM dos dois motores de faturamento
//    (server/db.ts, criação de billing_visit_events; server/catalogFinancial.ts,
//    criação de billing_catalog_study_events) o lê como fallback do que o
//    médico recebe — o comentário no próprio server/db.ts é explícito: "O
//    valor do médico nunca usa fallback global". Sem isso ficar claro na
//    tela, um administrador pode achar que configurar esse campo garante um
//    piso de pagamento, quando na prática o laudo fica "pending_doctor_price"
//    até haver um preço por modalidade (ou por legenda, ver DoctorPriceManager)
//    configurado especificamente para aquele médico. Adicionado aviso
//    explícito abaixo do campo.
export function PriceConfigModal({ unitId, unitName, onClose }: { unitId: number; unitName: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const canEdit = user?.role === "admin_master";
  const { data, isLoading } = trpc.financeSimple.getUnitDefaultPrices.useQuery({ unit_id: unitId });
  const [sysPrice, setSysPrice] = useState("");
  const [docPrice, setDocPrice] = useState("");
  useEffect(() => {
    if (!isLoading && data) {
      setSysPrice(String(data.default_system_price ?? 0));
      setDocPrice(String(data.default_doctor_price ?? 0));
    }
  }, [data, isLoading]);
  const save = trpc.financeSimple.setUnitDefaultPrices.useMutation({
    onSuccess: () => {
      toast.success("Preços atualizados");
      utils.financeSimple.unitSummary.invalidate();
      onClose();
    },
    onError: (e) => toast.error(
      e.data?.code === "FORBIDDEN"
        ? "Somente o administrador geral pode alterar os preços padrão da unidade."
        : e.message
    ),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <p className="text-white font-semibold">Preços Padrão</p>
            <p className="text-slate-400 text-xs">{unitName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <div className="h-10 bg-slate-800 rounded animate-pulse" />
              <div className="h-10 bg-slate-800 rounded animate-pulse" />
            </div>
          ) : !canEdit ? (
            <>
              <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                Você pode consultar os preços padrão desta unidade, mas somente o administrador geral pode alterá-los.
              </p>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1.5">Preço Sistema (R$)</label>
                <p className="text-white text-sm bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2">{sysPrice || "0"}</p>
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1.5">Preço Médico (R$) — valor de referência</label>
                <p className="text-white text-sm bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2">{docPrice || "0"}</p>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Este valor não é usado automaticamente no cálculo do repasse. O que cada médico recebe é definido por
                  preço por modalidade ou por legenda, configurados na lista de médicos abaixo.
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1.5">Preço Sistema (R$)</label>
                <Input type="number" min="0" step="0.01" value={sysPrice} onChange={(e) => setSysPrice(e.target.value)} placeholder="0.00" className="bg-slate-800 border-slate-600 text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1.5">Preço Médico (R$) — valor de referência</label>
                <Input type="number" min="0" step="0.01" value={docPrice} onChange={(e) => setDocPrice(e.target.value)} placeholder="0.00" className="bg-slate-800 border-slate-600 text-white" />
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Atenção: este valor NÃO é usado automaticamente no cálculo do repasse ao médico. O que cada médico
                  recebe por laudo é definido pelo preço por modalidade ou por legenda, configurados na lista de
                  médicos abaixo. Use este campo só como referência/anotação interna.
                </p>
              </div>
            </>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 border-slate-600 text-slate-300" onClick={onClose}>{canEdit ? "Cancelar" : "Fechar"}</Button>
            {canEdit && (
              <Button className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white" disabled={save.isPending || isLoading} onClick={() => save.mutate({ unit_id: unitId, default_system_price: parseFloat(sysPrice) || 0, default_doctor_price: parseFloat(docPrice) || 0 })}>
                {save.isPending ? "Salvando..." : "Salvar Preços"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de configuração de ciclo de pagamento ─────────────────────────────
export function CycleConfigModal({ unitId, unitName, onClose }: { unitId: number; unitName: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  // FIX (2026-09-23, revisão Manus — bloqueio crítico 2): antes, um erro ao
  // carregar o ciclo (ex.: FORBIDDEN que existia na procedure até este fix)
  // deixava startDay/endDay vazios, e o parseInt("") || fallback abaixo
  // convertia isso silenciosamente em 1 e 31 — clicar em Salvar sobrescrevia
  // o ciclo real da unidade sem o usuário perceber. Agora o carregamento com
  // erro é mostrado explicitamente e o botão Salvar fica desabilitado até os
  // dados carregarem com sucesso.
  const { data, isLoading, isError, error } = trpc.financeSimple.getUnitCycle.useQuery({ unit_id: unitId });
  const [startDay, setStartDay] = useState("");
  const [endDay, setEndDay] = useState("");
  const [loadedOnce, setLoadedOnce] = useState(false);
  useEffect(() => {
    if (!isLoading && data) {
      setStartDay(String(data.start_day ?? 1));
      setEndDay(String(data.end_day ?? 31));
      setLoadedOnce(true);
    }
  }, [data, isLoading]);
  const save = trpc.financeSimple.setUnitCycle.useMutation({
    onSuccess: () => {
      toast.success("Ciclo de pagamento atualizado");
      utils.financeSimple.unitSummary.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const startDayNum = parseInt(startDay) || 1;
  const endDayNum = parseInt(endDay) || 31;
  const crossesMonth = startDayNum > endDayNum;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <p className="text-white font-semibold">Ciclo de Pagamento</p>
            <p className="text-slate-400 text-xs">{unitName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-slate-400">Defina o dia de início e fim do ciclo mensal de pagamento desta unidade.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1.5">Dia de Início</label>
              <Input type="number" min="1" max="31" value={startDay} onChange={(e) => setStartDay(e.target.value)} placeholder="1" className="bg-slate-800 border-slate-600 text-white" />
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wide block mb-1.5">Dia de Fim</label>
              <Input type="number" min="1" max="31" value={endDay} onChange={(e) => setEndDay(e.target.value)} placeholder="31" className="bg-slate-800 border-slate-600 text-white" />
            </div>
          </div>
          <div className={`rounded-lg px-4 py-3 text-xs ${crossesMonth ? "bg-violet-500/10 border border-violet-500/30 text-violet-300" : "bg-slate-800/60 border border-slate-700 text-slate-300"}`}>
            {crossesMonth ? (
              <span>Ciclo cruza meses: do dia <strong>{startDayNum}</strong> ao dia <strong>{endDayNum}</strong> do mês seguinte</span>
            ) : (
              <span>Ciclo mensal: do dia <strong>{startDayNum}</strong> ao dia <strong>{endDayNum}</strong> do mesmo mês</span>
            )}
          </div>
          {isError && (
            <div className="rounded-lg px-4 py-3 text-xs bg-red-500/10 border border-red-500/30 text-red-300">
              Não foi possível carregar o ciclo atual desta unidade{error?.message ? `: ${error.message}` : "."} Feche e tente novamente — os valores abaixo não refletem a configuração real enquanto isso não for resolvido.
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 border-slate-600 text-slate-300" onClick={onClose}>Cancelar</Button>
            <Button
              className="flex-1 bg-violet-600 hover:bg-violet-500 text-white"
              disabled={save.isPending || !loadedOnce || isError}
              onClick={() => save.mutate({ unit_id: unitId, start_day: startDayNum, end_day: endDayNum })}
            >
              {save.isPending ? "Salvando..." : "Salvar Ciclo"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
