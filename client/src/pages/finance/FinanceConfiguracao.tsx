/**
 * FinanceConfiguracao — Tela de configuração financeira por unidade
 * Bloco A: Dados financeiros da unidade (responsável, ciclo, preços padrão)
 * Bloco B: Tabela de médicos com valor/laudo e badge de status
 * Bloco C: Checklist de implantação (unitFinancialReadiness)
 * Bloco D: Ações de reprocessamento
 * Desenvolvimento StudioBarra7
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2, AlertCircle, Settings, CalendarDays,
  Users, RefreshCw, ChevronDown, Building2, Link2, UserPlus, X, Plus, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FinanceShell } from "./FinanceShell";
import { fmtBRL, PriceConfigModal, CycleConfigModal } from "./FinanceModals";
import { ModalityPricesSection } from "@/components/DoctorPriceManager";

function isoDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function fmtDatePt(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function nextCycleStartDate(cycleStartDay?: number | null): string {
  const today = new Date();
  const day = Math.min(Math.max(cycleStartDay ?? 1, 1), 28);
  const candidate = new Date(today.getFullYear(), today.getMonth(), day);
  if (candidate <= new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    candidate.setMonth(candidate.getMonth() + 1);
  }
  return isoDate(candidate);
}

/// ─── Bloco B: Linha de médico com preço configurável inline ──────────────
function DoctorPriceRow({ doctor, unitId, financialResponsibleId, cycleStartDay, onSaved }: {
  doctor: { doctor_user_id: number; doctor_name: string; price_per_report: number | null };
  unitId: number;
  financialResponsibleId: number | null;
  cycleStartDay?: number | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(doctor.price_per_report ?? ""));
  const [startsAt, setStartsAt] = useState(isoDate(new Date()));
  const utils = trpc.useUtils();
  const save = trpc.financeSimple.setDoctorPriceDirect.useMutation({
    onSuccess: () => {
      toast.success(`Preço de ${doctor.doctor_name} atualizado`);
      utils.financeSimple.listDoctorsForUnit.invalidate({ unit_id: unitId });
      utils.financeSimple.unitFinancialReadiness.invalidate();
      setEditing(false);
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  // P3: price_per_report pode vir como string do MySQL DECIMAL — forçar Number()
  const hasPrice = doctor.price_per_report !== null && Number(doctor.price_per_report) > 0;

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-[var(--fin-panel-soft)] transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-7 h-7 rounded-full bg-[var(--fin-warn-wash)] flex items-center justify-center shrink-0">
          <span className="text-[var(--fin-warn)] text-xs font-bold">
            {(doctor.doctor_name ?? "?").charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm text-[var(--fin-text)] truncate">{doctor.doctor_name}</p>
          {!editing && (
            <p className="text-xs text-[var(--fin-muted-dim)]">
              {hasPrice ? fmtBRL(Number(doctor.price_per_report)) + "/laudo" : "Sem preço configurado"}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        {!hasPrice && !editing && (
          <span className="text-xs bg-[var(--fin-danger-wash)] text-[var(--fin-danger)] border border-[var(--fin-danger-border)] px-2 py-0.5 rounded-full">
            Sem preço
          </span>
        )}
        {hasPrice && !editing && (
          <span className="text-xs bg-[var(--fin-success-wash)] text-[var(--fin-success)] border border-[var(--fin-success-wash)] px-2 py-0.5 rounded-full">
            Configurado
          </span>
        )}
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              type="number" min="0" step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-7 w-24 bg-[var(--fin-panel-2)] border-[var(--fin-line-strong)] text-[var(--fin-text)] text-xs"
              placeholder="0.00"
              autoFocus
            />
            <Input
              type="date"
              value={startsAt}
              min={hasPrice ? nextCycleStartDate(cycleStartDay) : isoDate(new Date())}
              onChange={(e) => setStartsAt(e.target.value)}
              className="h-7 w-36 bg-[var(--fin-panel-2)] border-[var(--fin-line-strong)] text-[var(--fin-text)] text-xs"
              title={hasPrice ? "Alterações de preço iniciam na abertura do próximo ciclo" : "Data de início da primeira configuração"}
            />
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs bg-[var(--fin-accent)] hover:bg-[var(--fin-accent-hover)]"
              disabled={save.isPending}
              onClick={() => save.mutate({ unitId: unitId, doctorUserId: doctor.doctor_user_id, pricePerReport: String(parseFloat(price) || 0), startsAt: new Date(`${startsAt}T12:00:00`).toISOString() })}
            >
              {save.isPending ? "..." : "Salvar"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-[var(--fin-muted-dim)]" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button
            size="sm" variant="ghost"
            className="h-7 px-2.5 text-xs text-[var(--fin-muted-dim)] hover:text-[var(--fin-accent)]"
            onClick={() => {
              setPrice(String(doctor.price_per_report ?? ""));
              setStartsAt(hasPrice ? nextCycleStartDate(cycleStartDay) : isoDate(new Date()));
              setEditing(true);
            }}
          >
            Editar
          </Button>
        )}
      </div>
      {/* M5A: Preços por Modalidade — integrado na linha do médico */}
      {financialResponsibleId && (
        <div className="px-4 pb-3">
          <ModalityPricesSection
            doctor={{ id: doctor.doctor_user_id, name: doctor.doctor_name, crm: null }}
            financialResponsibleId={financialResponsibleId}
            unitId={unitId}
          />
        </div>
      )}
    </div>
  );
}

// ─── Preços por legenda canônica ────────────────────────────────────────────
function DoctorLegendPricesSection({ doctors, unitId, financialResponsibleId, cycleStartDay }: {
  doctors: Array<{ doctor_user_id: number; doctor_name: string | null }>;
  unitId: number;
  financialResponsibleId: number | null;
  cycleStartDay?: number | null;
}) {
  const [doctorUserId, setDoctorUserId] = useState<number | null>(null);
  const [editingLegendId, setEditingLegendId] = useState<number | null>(null);
  const [price, setPrice] = useState("");
  const [startsAt, setStartsAt] = useState(isoDate(new Date()));
  const utils = trpc.useUtils();
  const selectedDoctor = doctors.find((doctor) => doctor.doctor_user_id === doctorUserId) ?? null;
  const canLoad = !!selectedDoctor;
  const financialResponsibleIdForRequest = financialResponsibleId ?? 0;
  const { data, isLoading } = trpc.financeSimple.listDoctorLegendPrices.useQuery(
    {
      financialResponsibleId: financialResponsibleIdForRequest,
      unitId,
      doctorUserId: selectedDoctor?.doctor_user_id ?? 0,
    },
    { enabled: canLoad },
  );
  const save = trpc.financeSimple.setDoctorLegendPrice.useMutation({
    onSuccess: () => {
      toast.success("Preço por legenda atualizado");
      utils.financeSimple.listDoctorLegendPrices.invalidate();
      setEditingLegendId(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const findCurrentPrice = (legendId: number) => {
    const now = new Date();
    return data?.prices.find((item: any) => {
      const start = new Date(item.starts_at);
      const end = item.ends_at ? new Date(item.ends_at) : null;
      return item.exam_legend_id === legendId && start <= now && (!end || end >= now);
    }) ?? null;
  };

  return (
    <div className="bg-[var(--fin-panel)] border border-[var(--fin-line)] rounded-xl overflow-hidden">
      <div className="flex flex-col gap-3 px-5 py-4 border-b border-[var(--fin-line)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <FileText className="h-4 w-4 text-[var(--fin-accent-soft)] mt-0.5 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-[var(--fin-text)]">Preços por Legenda Canônica</h2>
            <p className="text-xs text-[var(--fin-muted-dim)] mt-0.5">O valor é aplicado por evento financeiro da legenda, isolado por médico e unidade.</p>
          </div>
        </div>
        <select
          value={doctorUserId ?? ""}
          onChange={(event) => { setDoctorUserId(event.target.value ? Number(event.target.value) : null); setEditingLegendId(null); }}
          className="h-8 min-w-52 rounded-md border border-[var(--fin-line-strong)] bg-[var(--fin-panel-2)] px-2 text-xs text-[var(--fin-text)]"
        >
          <option value="">Selecione um médico</option>
          {doctors.map((doctor) => <option key={doctor.doctor_user_id} value={doctor.doctor_user_id}>{doctor.doctor_name ?? `Médico #${doctor.doctor_user_id}`}</option>)}
        </select>
      </div>

      {!doctors.length ? (
        <p className="px-5 py-6 text-center text-sm text-[var(--fin-muted)]">Vincule um médico à unidade antes de configurar preços por legenda.</p>
      ) : !selectedDoctor ? (
        <p className="px-5 py-6 text-center text-sm text-[var(--fin-muted)]">Selecione um médico para consultar e configurar os valores por legenda.</p>
      ) : isLoading ? (
        <div className="space-y-2 p-4">{[1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded bg-[var(--fin-panel-2)]" />)}</div>
      ) : !data?.legends.length ? (
        <p className="px-5 py-6 text-center text-sm text-[var(--fin-muted)]">Não há legendas canônicas ativas. O administrador geral deve cadastrá-las no Catálogo de Exames.</p>
      ) : (
        <div className="divide-y divide-[var(--fin-line-soft)]">
          {data.legends.map((legend: any) => {
            const currentPrice = findCurrentPrice(legend.id);
            const editing = editingLegendId === legend.id;
            const hasPrice = currentPrice && Number(currentPrice.price_per_event) >= 0;
            return (
              <div key={legend.id} className="px-5 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--fin-text)]">{legend.exam_name}</p>
                    <p className="text-xs text-[var(--fin-muted-dim)]">{legend.modality} · {legend.financial_event_count} {legend.financial_event_count === 1 ? "evento" : "eventos"} ao concluir todas as assinaturas</p>
                  </div>
                  {editing ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className="h-8 w-24 border-[var(--fin-line-strong)] bg-[var(--fin-panel-2)] text-xs text-[var(--fin-text)]" placeholder="0.00" />
                      <Input type="date" value={startsAt} min={hasPrice ? nextCycleStartDate(cycleStartDay) : isoDate(new Date())} onChange={(event) => setStartsAt(event.target.value)} className="h-8 w-36 border-[var(--fin-line-strong)] bg-[var(--fin-panel-2)] text-xs text-[var(--fin-text)]" />
                      <Button size="sm" className="h-8 bg-[var(--fin-accent)] px-3 text-xs hover:bg-[var(--fin-accent-hover)]" disabled={save.isPending} onClick={() => save.mutate({ financialResponsibleId: financialResponsibleIdForRequest, unitId, doctorUserId: selectedDoctor.doctor_user_id, examLegendId: legend.id, pricePerEvent: String(Number(price) || 0), startsAt: new Date(`${startsAt}T12:00:00`).toISOString() })}>{save.isPending ? "..." : "Salvar"}</Button>
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-[var(--fin-muted-dim)]" onClick={() => setEditingLegendId(null)}>Cancelar</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`text-sm font-medium ${hasPrice ? "text-[var(--fin-success)]" : "text-[var(--fin-warn)]"}`}>{hasPrice ? `${fmtBRL(Number(currentPrice.price_per_event))}/evento` : "Pendente"}</p>
                        <p className="text-[11px] text-[var(--fin-muted)]">{hasPrice ? `Desde ${new Date(currentPrice.starts_at).toLocaleDateString("pt-BR")}` : "Sem valor definido"}</p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-8 px-2.5 text-xs text-[var(--fin-accent-soft)] hover:text-[var(--fin-accent)]" onClick={() => { setPrice(currentPrice ? String(currentPrice.price_per_event) : ""); setStartsAt(hasPrice ? nextCycleStartDate(cycleStartDay) : isoDate(new Date())); setEditingLegendId(legend.id); }}>Editar</Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Bloco E: Painel de Responsável Financeiro ──────────────────────────────
function ResponsavelPanel({ unitId, onChanged }: { unitId: number; onChanged: () => void }) {
  const utils = trpc.useUtils();
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showUsersPanel, setShowUsersPanel] = useState(false);
  const [selectedRespId, setSelectedRespId] = useState<number | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCnpj, setNewCnpj] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [linkUserId, setLinkUserId] = useState<number | null>(null);
  // Seção 3.4: confirmação reforçada antes de revogar acesso — nunca dispara
  // a mutation direto no clique do X, sempre passa por este passo intermediário.
  const [pendingRemoveUserId, setPendingRemoveUserId] = useState<number | null>(null);

  const { data: readiness, refetch: refetchReadiness } = trpc.financeSimple.unitFinancialReadiness.useQuery({ unit_id: unitId });
  const { data: allResponsibles } = trpc.financeSimple.listResponsibles.useQuery(undefined, { enabled: showLinkForm || showNewForm });
  const responsibleId = readiness?.responsible_id ?? null;
  const { data: respUsers } = trpc.financeSimple.listUsersForResponsible.useQuery(
    { financialResponsibleId: responsibleId ?? 0 },
    { enabled: showUsersPanel && !!responsibleId }
  );
  const { data: eligibleUsers } = trpc.financeSimple.listEligibleUsersForResponsible.useQuery(
    { financialResponsibleId: responsibleId ?? 0 },
    { enabled: showUsersPanel && !!responsibleId }
  );

  const invalidateAll = () => {
    utils.financeSimple.unitFinancialReadiness.invalidate({ unit_id: unitId });
    onChanged();
  };

  const linkUnit = trpc.financeSimple.linkUnit.useMutation({
    onSuccess: () => { toast.success(readiness?.has_responsible ? "Responsável financeiro da unidade substituído." : "Responsável vinculado!"); setShowLinkForm(false); setConfirmReplace(false); setSelectedRespId(null); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });

  const createAndLink = trpc.financeSimple.createResponsible.useMutation({
    onSuccess: async (result: any) => {
      await linkUnit.mutateAsync({
        financialResponsibleId: result.id,
        unitId,
        startsAt: new Date().toISOString(),
      });
      toast.success("Responsável criado e vinculado!");
      setShowNewForm(false);
      setNewName(""); setNewCnpj(""); setNewEmail("");
    },
    onError: (e) => toast.error(e.message),
  });

  const linkUser = trpc.financeSimple.linkUser.useMutation({
    onSuccess: () => {
      toast.success("Acesso concedido ao usuário.");
      setLinkUserId(null);
      utils.financeSimple.listUsersForResponsible.invalidate({ financialResponsibleId: responsibleId ?? 0 });
      utils.financeSimple.listEligibleUsersForResponsible.invalidate({ financialResponsibleId: responsibleId ?? 0 });
      invalidateAll();
    },
    onError: (e) => toast.error(e.message),
  });

  const unlinkUser = trpc.financeSimple.unlinkUser.useMutation({
    onSuccess: () => {
      toast.success("Acesso revogado. Nenhum dado financeiro foi alterado.");
      setPendingRemoveUserId(null);
      utils.financeSimple.listUsersForResponsible.invalidate({ financialResponsibleId: responsibleId ?? 0 });
      utils.financeSimple.listEligibleUsersForResponsible.invalidate({ financialResponsibleId: responsibleId ?? 0 });
      invalidateAll();
    },
    onError: (e) => toast.error(e.message),
  });

  const hasResponsible = readiness?.has_responsible;
  const responsibleName = readiness?.responsible_name;
  const userCount = readiness?.responsible_user_count ?? 0;
  const hasInvalidLink = readiness?.responsible_has_invalid_link ?? false;

  return (
    <div className="bg-[var(--fin-panel)] border border-[var(--fin-line)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--fin-line)]">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-[var(--fin-accent-soft)]" />
          <h2 className="text-sm font-semibold text-[var(--fin-text)]">Responsável financeiro da unidade</h2>
        </div>
        <div className="flex gap-2">
          {hasResponsible && responsibleId && (
            <Button size="sm" variant="outline"
              className="h-7 px-3 text-xs border-[var(--fin-line-strong)] text-[var(--fin-muted)] hover:text-[var(--fin-text)]"
              onClick={() => { setShowUsersPanel(!showUsersPanel); setShowLinkForm(false); setShowNewForm(false); }}
            >
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              Usuários com acesso financeiro
            </Button>
          )}
          <Button size="sm" variant="outline"
            className="h-7 px-3 text-xs border-[var(--fin-accent-border)] text-[var(--fin-accent-soft)] hover:bg-[var(--fin-accent-wash)]"
            onClick={() => { setShowLinkForm(!showLinkForm); setShowNewForm(false); setShowUsersPanel(false); setConfirmReplace(false); }}
          >
            <Link2 className="h-3.5 w-3.5 mr-1.5" />
            {hasResponsible ? "Substituir responsável" : "Vincular"}
          </Button>
          {!hasResponsible && (
            <Button size="sm" variant="outline"
              className="h-7 px-3 text-xs border-[var(--fin-success-wash)] text-[var(--fin-success)] hover:bg-[var(--fin-success-wash)]"
              onClick={() => { setShowNewForm(!showNewForm); setShowLinkForm(false); setShowUsersPanel(false); }}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Novo
            </Button>
          )}
        </div>
      </div>

      {/* Quadro de estado da unidade — requisitos seção 5. Sempre visível, antes
          de qualquer botão de ação, pra nunca sugerir "criar novo" como reflexo
          quando já existe um responsável ativo. */}
      <div className="px-5 py-3">
        {hasResponsible ? (
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-[var(--fin-success)] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm text-[var(--fin-text)] font-medium">{responsibleName}</p>
              <p className="text-xs text-[var(--fin-muted-dim)]">
                Vigente desde {fmtDatePt(readiness?.responsible_starts_at)} · {userCount} usuário{userCount === 1 ? "" : "s"} com acesso financeiro
              </p>
              {userCount === 0 && (
                <p className="text-xs text-[var(--fin-warn)]">Nenhum usuário consegue acessar este painel ainda — use "Usuários com acesso financeiro" acima pra conceder acesso.</p>
              )}
              {hasInvalidLink && (
                <p className="text-xs text-[var(--fin-danger)]">Há um vínculo de usuário inválido (conta removida do sistema) — revise em "Usuários com acesso financeiro".</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[var(--fin-danger)] shrink-0" />
            <p className="text-sm text-[var(--fin-danger)]">Sem responsável financeiro — vincule um já existente ou crie um novo abaixo.</p>
          </div>
        )}
      </div>

      {/* Formulário: vincular / substituir responsável */}
      {showLinkForm && (
        <div className="px-5 pb-4 border-t border-[var(--fin-line)] pt-3 space-y-3">
          {hasResponsible && (
            <div className="flex items-start gap-2 bg-[var(--fin-warn-wash)] border border-[var(--fin-warn-border)] rounded-lg px-3 py-2.5">
              <AlertCircle className="h-3.5 w-3.5 text-[var(--fin-warn)] shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--fin-warn)]">
                Substituir responsável financeiro da unidade é uma ação excepcional: encerra a vigência de <strong>{responsibleName}</strong> nesta unidade e inicia a do novo responsável. Isso não apaga o vínculo anterior, os usuários de acesso já concedidos a ele, nem nenhum evento, preço ou ciclo financeiro já registrado.
              </p>
            </div>
          )}
          <p className="text-xs text-[var(--fin-muted-dim)] font-medium">Selecionar responsável existente:</p>
          <select
            value={selectedRespId ?? ""}
            onChange={(e) => setSelectedRespId(e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-[var(--fin-panel-2)] border border-[var(--fin-line-strong)] text-[var(--fin-text)] rounded-lg px-3 py-2 text-sm"
          >
            <option value="">— Selecione —</option>
            {allResponsibles?.map((r: any) => (
              <option key={r.id} value={r.id}>{r.legal_name} {r.cpf_cnpj ? `(${r.cpf_cnpj})` : ""}</option>
            ))}
          </select>
          {hasResponsible && (
            <label className="flex items-center gap-2 text-xs text-[var(--fin-muted)]">
              <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} className="rounded border-[var(--fin-line-strong)]" />
              Entendo que isso substitui o responsável financeiro ativo desta unidade.
            </label>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={!selectedRespId || linkUnit.isPending || (hasResponsible && !confirmReplace)}
              className="bg-[var(--fin-accent)] hover:bg-[var(--fin-accent-hover)] text-[var(--fin-text)]"
              onClick={() => selectedRespId && linkUnit.mutate({ financialResponsibleId: selectedRespId, unitId, startsAt: new Date().toISOString() })}
            >
              {linkUnit.isPending ? "Confirmando..." : hasResponsible ? "Confirmar substituição" : "Confirmar vínculo"}
            </Button>
            <Button size="sm" variant="outline" className="border-[var(--fin-line-strong)] text-[var(--fin-muted-dim)]" onClick={() => { setShowLinkForm(false); setConfirmReplace(false); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {hasResponsible && (
            <button
              type="button"
              className="text-xs text-[var(--fin-accent-soft)] hover:opacity-80 underline underline-offset-2"
              onClick={() => { setShowNewForm(true); setShowLinkForm(false); }}
            >
              Ou criar um novo responsável financeiro
            </button>
          )}
        </div>
      )}

      {/* Formulário: criar novo responsável — só em destaque quando a unidade
          realmente não tem nenhum responsável ativo (requisitos seção 3.1) */}
      {showNewForm && (
        <div className="px-5 pb-4 border-t border-[var(--fin-line)] pt-3 space-y-3">
          <p className="text-xs text-[var(--fin-muted-dim)] font-medium">Criar e vincular novo responsável:</p>
          <Input placeholder="Nome / Razão Social *" value={newName} onChange={(e) => setNewName(e.target.value)}
            className="bg-[var(--fin-panel-2)] border-[var(--fin-line-strong)] text-[var(--fin-text)] text-sm" />
          <Input placeholder="CNPJ / CPF" value={newCnpj} onChange={(e) => setNewCnpj(e.target.value)}
            className="bg-[var(--fin-panel-2)] border-[var(--fin-line-strong)] text-[var(--fin-text)] text-sm" />
          <Input placeholder="E-mail" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
            className="bg-[var(--fin-panel-2)] border-[var(--fin-line-strong)] text-[var(--fin-text)] text-sm" />
          <div className="flex gap-2">
            <Button size="sm" disabled={!newName.trim() || createAndLink.isPending || linkUnit.isPending}
              className="bg-[var(--fin-success)] hover:opacity-90 text-[var(--fin-text)]"
              onClick={() => createAndLink.mutate({
                person_type: newCnpj.replace(/\D/g, "").length > 11 ? "PJ" : "PF",
                legal_name: newName.trim(),
                cpf_cnpj: newCnpj.trim() || undefined,
                email: newEmail.trim() || undefined,
              })}
            >
              {createAndLink.isPending || linkUnit.isPending ? "Criando..." : "Criar e vincular"}
            </Button>
            <Button size="sm" variant="outline" className="border-[var(--fin-line-strong)] text-[var(--fin-muted-dim)]" onClick={() => setShowNewForm(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Painel: usuários com acesso financeiro (requisitos seções 3.2, 3.3, 3.4) */}
      {showUsersPanel && responsibleId && (
        <div className="px-5 pb-4 border-t border-[var(--fin-line)] pt-3 space-y-2">
          <p className="text-xs text-[var(--fin-muted-dim)] font-medium">Contas de login autorizadas a operar o painel deste responsável:</p>
          {respUsers?.length === 0 && (
            <p className="text-xs text-[var(--fin-muted)]">Nenhum usuário com acesso ainda.</p>
          )}
          {respUsers?.map((u: any) => {
            const isPendingRemove = pendingRemoveUserId === u.user_id;
            const isLastUser = respUsers.length === 1;
            return (
              <div key={u.user_id} className="bg-[var(--fin-panel-soft)] rounded-lg px-3 py-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  {u.is_orphan ? (
                    <div>
                      <p className="text-sm text-[var(--fin-danger)] font-medium">Usuário removido ou vínculo inválido</p>
                      <p className="text-xs text-[var(--fin-muted-dim)]">ID interno do vínculo: {u.user_id} · concedido em {fmtDatePt(u.createdAt)}</p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm text-[var(--fin-text)]">{u.name || u.username}</p>
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${u.is_active ? "bg-[var(--fin-success-wash)] text-[var(--fin-success)]" : "bg-[var(--fin-line-strong)] text-[var(--fin-muted)]"}`}>
                          {u.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--fin-muted-dim)]">{u.email || "sem e-mail"} · acesso concedido em {fmtDatePt(u.createdAt)}</p>
                    </div>
                  )}
                  {!isPendingRemove && (
                    <Button size="sm" variant="outline"
                      className="h-6 px-2 text-xs border-[var(--fin-danger-border)] text-[var(--fin-danger)] hover:bg-[var(--fin-danger-wash)]"
                      title="Revogar acesso"
                      onClick={() => setPendingRemoveUserId(u.user_id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {isPendingRemove && (
                  <div className="rounded-lg border border-[var(--fin-danger-border)] bg-[var(--fin-danger-wash)] px-3 py-2 space-y-2">
                    <p className="text-xs text-[var(--fin-danger)]">
                      {isLastUser
                        ? "Este é o único usuário com acesso a este responsável financeiro. Revogar deixará o painel temporariamente sem nenhum operador com acesso."
                        : "Revogar acesso remove apenas o login deste usuário do painel financeiro. Nenhum evento, valor, ciclo, pagamento, preço ou histórico da unidade é apagado."}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={unlinkUser.isPending}
                        className="h-6 px-2 text-xs bg-[var(--fin-danger)] hover:opacity-90 text-[var(--fin-text)]"
                        onClick={() => unlinkUser.mutate({ financialResponsibleId: responsibleId, userId: u.user_id, confirmLastUser: isLastUser })}
                      >
                        {unlinkUser.isPending ? "Revogando..." : "Confirmar revogação"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 px-2 text-xs border-[var(--fin-line-strong)] text-[var(--fin-muted-dim)]" onClick={() => setPendingRemoveUserId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className="pt-2 space-y-2">
            <p className="text-xs text-[var(--fin-muted-dim)] font-medium">Adicionar usuário de acesso:</p>
            <div className="flex gap-2">
              <select
                value={linkUserId ?? ""}
                onChange={(e) => setLinkUserId(e.target.value ? Number(e.target.value) : null)}
                className="flex-1 bg-[var(--fin-panel-2)] border border-[var(--fin-line-strong)] text-[var(--fin-text)] rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="">— Selecionar conta —</option>
                {eligibleUsers?.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.name || u.username} ({u.email})</option>
                ))}
              </select>
              <Button size="sm" disabled={!linkUserId || linkUser.isPending}
                className="bg-[var(--fin-accent)] hover:bg-[var(--fin-accent-hover)] text-[var(--fin-text)] shrink-0"
                onClick={() => linkUserId && linkUser.mutate({ financialResponsibleId: responsibleId, userId: linkUserId })}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {eligibleUsers?.length === 0 && (
              <p className="text-xs text-[var(--fin-muted)]">Nenhuma conta com perfil "Responsável Financeiro" disponível pra adicionar — crie ou ajuste o perfil de um usuário em Administração antes.</p>
            )}
            {linkUserId && (
              <p className="text-xs text-[var(--fin-muted-dim)]">Esta ação concede ao usuário selecionado acesso aos dados financeiros das unidades atualmente vinculadas a este responsável financeiro.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
// ─── Bloco C: Checklist de aptidão ───────────────────────────────────────────
function ReadinessChecklist({ unitId }: { unitId: number }) {
  const { data, isLoading } = trpc.financeSimple.unitFinancialReadiness.useQuery({ unit_id: unitId });

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-8 bg-[var(--fin-panel-2)] rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const items = [
    {
      label: "Unidade ativa",
      ok: data.is_active,
      detail: data.is_active ? "Ativa" : "Inativa — ative a unidade no Admin",
    },
    {
      label: "Responsável financeiro vinculado",
      ok: data.has_responsible,
      detail: data.has_responsible
        ? data.responsible_name ?? "Vinculado"
        : "Sem responsável — use o painel \"Responsável Financeiro\" acima",
    },
    {
      label: "Usuário vinculado ao responsável",
      ok: data.has_responsible_user,
      detail: data.has_responsible_user
        ? "Usuário vinculado"
        : "Sem usuário — use o botão \"Usuários\" no painel acima",
    },
    {
      label: "Ciclo de pagamento configurado",
      ok: data.has_cycle,
      detail: data.has_cycle
        ? `Dia ${data.cycle_start_day} ao dia ${data.cycle_end_day}`
        : "Sem ciclo — configure acima",
    },
    {
      label: "Preço de sistema configurado",
      ok: data.has_specific_system_price || data.has_default_system_price,
      detail: data.system_price
        ? `R$ ${data.system_price.toFixed(2)}/laudo`
        : "Sem preço de sistema — configure acima",
    },
    {
      label: "Preço configurado para todos os médicos",
      ok: data.doctor_price_ok ?? (data.has_default_doctor_price || data.doctors_with_price > 0),
      detail: data.has_default_doctor_price
        ? "Usando preço padrão da unidade (fallback)"
        : (data.doctors_without_price ?? 0) > 0
          ? `${data.doctors_without_price} médico(s) sem preço configurado de ${data.total_doctors ?? data.doctors_with_price} total`
          : data.doctors_with_price > 0
            ? `${data.doctors_with_price} médico(s) com preço específico`
            : "Sem preço de médico — configure na tabela acima",
    },
    {
      label: "Eventos com precificação pendente",
      ok: data.pending_pricing_count === 0,
      detail: data.pending_pricing_count === 0
        ? "Todos os laudos precificados"
        : `${data.pending_pricing_count} laudo(s) com precificação pendente — use Reprocessar abaixo`,
    },
    // E9: laudos assinados sem evento financeiro
    {
      label: "Laudos sem evento financeiro",
      ok: (data.missing_events_count ?? 0) === 0,
      detail: (data.missing_events_count ?? 0) === 0
        ? "Todos os laudos possuem evento financeiro"
        : `${data.missing_events_count} laudo(s) assinado(s) sem evento financeiro — clique em Reprocessar abaixo`,
    },
  ];

  const allOk = items.every(i => i.ok);

  return (
    <div className="space-y-1">
      {allOk && (
        <div className="mb-3 flex items-center gap-2 bg-[var(--fin-success-wash)] border border-[var(--fin-success-wash)] rounded-lg px-4 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-[var(--fin-success)] shrink-0" />
          <p className="text-[var(--fin-success)] text-sm font-medium">Unidade pronta para operação financeira</p>
        </div>
      )}
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-2.5 rounded-lg hover:bg-[var(--fin-panel-soft)] transition-colors">
          {item.ok ? (
            <CheckCircle2 className="h-4 w-4 text-[var(--fin-success)] shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 text-[var(--fin-danger)] shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className={`text-sm font-medium ${item.ok ? "text-[var(--fin-text)]" : "text-[var(--fin-danger)]"}`}>{item.label}</p>
            <p className={`text-xs mt-0.5 ${item.ok ? "text-[var(--fin-muted-dim)]" : "text-[var(--fin-danger)]"}`}>{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export function FinanceConfiguracao() {
  const { data: currentUser } = trpc.auth.me.useQuery();
  const isAdminMaster = currentUser?.role === 'admin_master';
  const { data: units, isLoading: unitsLoading } = trpc.financeSimple.unitSummary.useQuery({});
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showCycleModal, setShowCycleModal] = useState(false);
  const utils = trpc.useUtils();

  const selectedUnit = units?.find(u => u.unit_id === selectedUnitId);

  // P2: usar listDoctorsForUnit (inclui médicos vinculados sem preço)
  const { data: doctors, isLoading: doctorsLoading } = trpc.financeSimple.listDoctorsForUnit.useQuery(
    { unit_id: selectedUnitId! },
    { enabled: selectedUnitId !== null }
  );

  const { data: readiness } = trpc.financeSimple.unitFinancialReadiness.useQuery(
    { unit_id: selectedUnitId! },
    { enabled: selectedUnitId !== null }
  );

  const reprocess = trpc.financeSimple.reprocessBillingEvents.useMutation({
    onSuccess: (result: any) => {
      toast.success(
        `Reprocessamento concluído: ${result?.created ?? 0} evento(s) criado(s)` +
        (result?.failed ? `, ${result.failed} falha(s)` : '')
      );
      utils.financeSimple.unitFinancialReadiness.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setEnabled = trpc.financeSimple.setFinancialEnabled.useMutation({
    onSuccess: () => {
      utils.financeSimple.unitFinancialReadiness.invalidate({ unit_id: selectedUnitId! });
      toast.success("Status financeiro atualizado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const reprice = trpc.financeSimple.repriceMissingEvents.useMutation({
    onSuccess: (result: any) => {
      toast.success(`Reprecificação concluída: ${result?.updated ?? 0} evento(s) atualizados`);
      utils.financeSimple.unitFinancialReadiness.invalidate({ unit_id: selectedUnitId! });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <FinanceShell>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-[var(--fin-text)] flex items-center gap-2">
            <Settings className="h-5 w-5 text-[var(--fin-accent-soft)]" />
            Configuração Financeira
          </h1>
          <p className="text-[var(--fin-muted-dim)] text-sm mt-1">Configure responsáveis, ciclos, preços e verifique a aptidão de cada unidade.</p>
        </div>

        {/* Seletor de unidade */}
        <div className="bg-[var(--fin-panel)] border border-[var(--fin-line)] rounded-xl p-4">
          <label className="text-xs text-[var(--fin-muted-dim)] uppercase tracking-wide block mb-2">Selecionar Unidade</label>
          {unitsLoading ? (
            <div className="h-10 bg-[var(--fin-panel-2)] rounded animate-pulse" />
          ) : (
            <div className="relative">
              <select
                value={selectedUnitId ?? ""}
                onChange={(e) => setSelectedUnitId(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-[var(--fin-panel-2)] border border-[var(--fin-line-strong)] text-[var(--fin-text)] rounded-lg px-3 py-2 text-sm appearance-none pr-8 focus:outline-none focus:ring-1 focus:ring-[var(--fin-accent)]"
              >
                <option value="">— Selecione uma unidade —</option>
                {units?.map(u => (
                  <option key={u.unit_id} value={u.unit_id}>{u.unit_name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-[var(--fin-muted-dim)] pointer-events-none" />
            </div>
          )}
        </div>

        {selectedUnitId && selectedUnit && (
          <>
            {/* ── Bloco A: Dados financeiros da unidade ── */}
            <div className="bg-[var(--fin-panel)] border border-[var(--fin-line)] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--fin-line)]">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-[var(--fin-accent-soft)]" />
                  <h2 className="text-sm font-semibold text-[var(--fin-text)]">Dados Financeiros — {selectedUnit.unit_name}</h2>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 text-xs border-[var(--fin-line-strong)] text-[var(--fin-muted)] hover:text-[var(--fin-text)]"
                    onClick={() => setShowPriceModal(true)}
                  >
                    <Settings className="h-3.5 w-3.5 mr-1.5" />
                    Preços Padrão
                  </Button>
                  {isAdminMaster && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs border-[var(--fin-line-strong)] text-[var(--fin-muted)] hover:text-[var(--fin-text)]"
                      onClick={() => setShowCycleModal(true)}
                    >
                      <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                      Ciclo
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--fin-panel-2)]">
                {[
                  { label: "Responsável", value: readiness?.responsible_name ?? "Sem responsável", warn: !readiness?.has_responsible },
                  { label: "Ciclo", value: readiness?.has_cycle ? `Dia ${readiness.cycle_start_day}–${readiness.cycle_end_day}` : "Não configurado", warn: !readiness?.has_cycle },
                  { label: "Preço Sistema", value: readiness?.system_price ? `R$ ${readiness.system_price.toFixed(2)}` : "Não configurado", warn: !readiness?.has_specific_system_price && !readiness?.has_default_system_price },
                  { label: "Médicos c/ preço", value: readiness ? `${readiness.doctors_with_price}` : "—", warn: !readiness?.has_default_doctor_price && (readiness?.doctors_with_price ?? 0) === 0 },
                ].map((item, i) => (
                  <div key={i} className="bg-[var(--fin-panel)] px-4 py-3">
                    <p className="text-xs text-[var(--fin-muted)] uppercase tracking-wide">{item.label}</p>
                    <p className={`text-sm font-medium mt-0.5 ${item.warn ? "text-[var(--fin-danger)]" : "text-[var(--fin-text)]"}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Bloco E: Responsável Financeiro ── */}
            {isAdminMaster && (
              <ResponsavelPanel
                unitId={selectedUnitId}
                onChanged={() => {
                  utils.financeSimple.unitFinancialReadiness.invalidate({ unit_id: selectedUnitId });
                  utils.financeSimple.unitSummary.invalidate();
                }}
              />
            )}

            {/* ── Bloco B: Médicos com preço ── */}
            <div className="bg-[var(--fin-panel)] border border-[var(--fin-line)] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--fin-line)]">
                <Users className="h-4 w-4 text-[var(--fin-warn)]" />
                <h2 className="text-sm font-semibold text-[var(--fin-text)]">Médicos — Preço por Laudo</h2>
                {readiness && (readiness.doctors_with_price ?? 0) === 0 && !readiness.has_default_doctor_price && (
                  <span className="ml-auto text-xs bg-[var(--fin-danger-wash)] text-[var(--fin-danger)] border border-[var(--fin-danger-border)] px-2 py-0.5 rounded-full">
                    Nenhum médico configurado
                  </span>
                )}
              </div>
              {doctorsLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-10 bg-[var(--fin-panel-2)] rounded animate-pulse" />)}
                </div>
              ) : !doctors?.length ? (
                <div className="p-6 text-center text-[var(--fin-muted)] text-sm">
                  Nenhum médico vinculado a esta unidade com laudos assinados.
                </div>
              ) : (
                <div className="divide-y divide-[var(--fin-line-soft)]">
                  {doctors.map((d: any) => (
                    <DoctorPriceRow
                      key={d.doctor_user_id}
                      doctor={d}
                      unitId={selectedUnitId}
                      financialResponsibleId={readiness?.responsible_id ?? null}
                      cycleStartDay={readiness?.cycle_start_day ?? null}
                      onSaved={() => utils.financeSimple.listDoctorsForUnit.invalidate({ unit_id: selectedUnitId! })}
                    />
                  ))}
                </div>
              )}
            </div>

            <DoctorLegendPricesSection
              doctors={doctors ?? []}
              unitId={selectedUnitId}
              financialResponsibleId={readiness?.responsible_id ?? null}
              cycleStartDay={readiness?.cycle_start_day ?? null}
            />

            {/* ── Bloco C: Checklist de aptidão ── */}
            <div className="bg-[var(--fin-panel)] border border-[var(--fin-line)] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--fin-line)]">
                <CheckCircle2 className="h-4 w-4 text-[var(--fin-success)]" />
                <h2 className="text-sm font-semibold text-[var(--fin-text)]">Checklist de Implantação</h2>
              </div>
              <div className="py-2">
                <ReadinessChecklist unitId={selectedUnitId} />
              </div>
            </div>

            {/* ── Blocos estruturais: exclusivos do administrador raiz ── */}
            {isAdminMaster && <>
            <div className="bg-[var(--fin-panel)] border border-[var(--fin-line)] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--fin-line)]">
                <CheckCircle2 className="h-4 w-4 text-[var(--fin-accent-soft)]" />
                <h2 className="text-sm font-semibold text-[var(--fin-text)]">Ativação Financeira</h2>
              </div>
              <div className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-[var(--fin-text)]">Financeiro da unidade</p>
                  <p className="text-xs text-[var(--fin-muted-dim)] mt-0.5">
                    {readiness?.financial_enabled
                      ? "Ativo — eventos financeiros serão gerados normalmente"
                      : "Inativo — configure todos os itens do checklist antes de ativar"}
                  </p>
                </div>
                <button
                  disabled={(!readiness?.is_ready && !readiness?.financial_enabled) || setEnabled.isPending}
                  onClick={() => setEnabled.mutate({
                    unit_id: selectedUnitId!,
                    enabled: !readiness?.financial_enabled
                  })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    readiness?.financial_enabled
                      ? "bg-[var(--fin-success)] hover:opacity-90 text-[var(--fin-text)]"
                      : "bg-[var(--fin-panel-2)] hover:bg-[var(--fin-panel-2)] text-[var(--fin-muted)]"
                  }`}
                >
                  {setEnabled.isPending ? "..." : readiness?.financial_enabled ? "Ativo ✓" : "Ativar"}
                </button>
              </div>
            </div>

            {/* ── Bloco D: Ações de reprocessamento ── */}
            <div className="bg-[var(--fin-panel)] border border-[var(--fin-line)] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--fin-line)]">
                <RefreshCw className="h-4 w-4 text-[var(--fin-accent-soft)]" />
                <h2 className="text-sm font-semibold text-[var(--fin-text)]">Ações de Diagnóstico</h2>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[var(--fin-text)]">Reprocessar eventos faltantes</p>
                    <p className="text-xs text-[var(--fin-muted-dim)] mt-0.5">
                      Cria eventos financeiros para laudos assinados que ainda não possuem registro.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[var(--fin-accent-border)] text-[var(--fin-accent-soft)] hover:bg-[var(--fin-accent-wash)] hover:border-[var(--fin-accent)] shrink-0"
                    disabled={reprocess.isPending}
                    onClick={() => reprocess.mutate({ unit_id: selectedUnitId, dry_run: false })}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${reprocess.isPending ? "animate-spin" : ""}`} />
                    {reprocess.isPending ? "Processando..." : "Reprocessar"}
                  </Button>
                </div>

                {/* Botão Reprecificar — só aparece quando há eventos com precificação pendente */}
                {readiness && readiness.pending_pricing_count > 0 && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[var(--fin-text)]">Reprecificar eventos sem preço</p>
                      <p className="text-xs text-[var(--fin-muted-dim)] mt-0.5">
                        Aplica os preços configurados aos laudos com precificação pendente.{" "}
                        <span className="text-[var(--fin-danger)] font-medium">{readiness.pending_pricing_count} pendente(s)</span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-[var(--fin-warn-border)] text-[var(--fin-warn)] hover:bg-[var(--fin-warn-wash)] shrink-0"
                      disabled={reprice.isPending}
                      onClick={() => reprice.mutate({ unit_id: selectedUnitId!, dry_run: false })}
                    >
                      {reprice.isPending ? "Processando..." : "Reprecificar"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
            </>}
          </>
        )}

        {!selectedUnitId && !unitsLoading && (
          <div className="text-center py-16 text-[var(--fin-muted)]">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Selecione uma unidade acima para ver e editar sua configuração financeira.</p>
          </div>
        )}
      </div>

      {/* Modais */}
      {showPriceModal && selectedUnit && (
        <PriceConfigModal
          unitId={selectedUnitId!}
          unitName={selectedUnit.unit_name}
          onClose={() => setShowPriceModal(false)}
        />
      )}
      {showCycleModal && selectedUnit && (
        <CycleConfigModal
          unitId={selectedUnitId!}
          unitName={selectedUnit.unit_name}
          onClose={() => setShowCycleModal(false)}
        />
      )}
    </FinanceShell>
  );
}
