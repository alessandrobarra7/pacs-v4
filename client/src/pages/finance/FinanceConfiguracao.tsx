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
  Users, RefreshCw, ChevronDown, Building2, Link2, UserPlus, X, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FinanceShell } from "./FinanceShell";
import { fmtBRL, PriceConfigModal, CycleConfigModal } from "./FinanceModals";
import { ModalityPricesSection } from "@/components/DoctorPriceManager";

/// ─── Bloco B: Linha de médico com preço configurável inline ──────────────
function DoctorPriceRow({ doctor, unitId, financialResponsibleId, onSaved }: {
  doctor: { doctor_user_id: number; doctor_name: string; price_per_report: number | null };
  unitId: number;
  financialResponsibleId: number | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(doctor.price_per_report ?? ""));
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
    <div className="flex items-center justify-between px-4 py-3 hover:bg-slate-800/30 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
          <span className="text-amber-400 text-xs font-bold">
            {(doctor.doctor_name ?? "?").charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm text-white truncate">{doctor.doctor_name}</p>
          {!editing && (
            <p className="text-xs text-slate-400">
              {hasPrice ? fmtBRL(Number(doctor.price_per_report)) + "/laudo" : "Sem preço configurado"}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        {!hasPrice && !editing && (
          <span className="text-xs bg-rose-500/15 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full">
            Sem preço
          </span>
        )}
        {hasPrice && !editing && (
          <span className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
            Configurado
          </span>
        )}
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              type="number" min="0" step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-7 w-24 bg-slate-800 border-slate-600 text-white text-xs"
              placeholder="0.00"
              autoFocus
            />
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs bg-cyan-600 hover:bg-cyan-500"
              disabled={save.isPending}
              onClick={() => save.mutate({ unitId: unitId, doctorUserId: doctor.doctor_user_id, pricePerReport: String(parseFloat(price) || 0), startsAt: new Date().toISOString() })}
            >
              {save.isPending ? "..." : "Salvar"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-400" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button
            size="sm" variant="ghost"
            className="h-7 px-2.5 text-xs text-slate-400 hover:text-cyan-400"
            onClick={() => { setPrice(String(doctor.price_per_report ?? "")); setEditing(true); }}
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

// ─── Bloco E: Painel de Responsável Financeiro ──────────────────────────────
function ResponsavelPanel({ unitId, onChanged }: { unitId: number; onChanged: () => void }) {
  const utils = trpc.useUtils();
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showUsersPanel, setShowUsersPanel] = useState(false);
  const [selectedRespId, setSelectedRespId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newCnpj, setNewCnpj] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [linkUserId, setLinkUserId] = useState<number | null>(null);

  const { data: readiness, refetch: refetchReadiness } = trpc.financeSimple.unitFinancialReadiness.useQuery({ unit_id: unitId });
  const { data: allResponsibles } = trpc.financeSimple.listResponsibles.useQuery(undefined, { enabled: showLinkForm || showNewForm });
  const { data: allUsers } = trpc.admin.listUsers.useQuery(undefined, { enabled: showUsersPanel });
  const { data: respUsers } = trpc.financeSimple.listUsersForResponsible.useQuery(
    { financialResponsibleId: readiness?.responsible_id ?? 0 },
    { enabled: showUsersPanel && !!readiness?.responsible_id }
  );

  const invalidateAll = () => {
    utils.financeSimple.unitFinancialReadiness.invalidate({ unit_id: unitId });
    onChanged();
  };

  const linkUnit = trpc.financeSimple.linkUnit.useMutation({
    onSuccess: () => { toast.success("Responsável vinculado!"); setShowLinkForm(false); invalidateAll(); },
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
    onSuccess: () => { toast.success("Usuário vinculado!"); utils.financeSimple.listUsersForResponsible.invalidate(); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });

  const unlinkUser = trpc.financeSimple.unlinkUser.useMutation({
    onSuccess: () => { toast.success("Usuário desvinculado."); utils.financeSimple.listUsersForResponsible.invalidate(); invalidateAll(); },
    onError: (e) => toast.error(e.message),
  });

  const hasResponsible = readiness?.has_responsible;
  const responsibleName = readiness?.responsible_name;
  const responsibleId = readiness?.responsible_id ?? null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-white">Responsável Financeiro</h2>
        </div>
        <div className="flex gap-2">
          {hasResponsible && responsibleId && (
            <Button size="sm" variant="outline"
              className="h-7 px-3 text-xs border-slate-600 text-slate-300 hover:text-white"
              onClick={() => { setShowUsersPanel(!showUsersPanel); setShowLinkForm(false); setShowNewForm(false); }}
            >
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              Usuários
            </Button>
          )}
          <Button size="sm" variant="outline"
            className="h-7 px-3 text-xs border-violet-600/50 text-violet-400 hover:bg-violet-500/10"
            onClick={() => { setShowLinkForm(!showLinkForm); setShowNewForm(false); setShowUsersPanel(false); }}
          >
            <Link2 className="h-3.5 w-3.5 mr-1.5" />
            {hasResponsible ? "Trocar" : "Vincular"}
          </Button>
          <Button size="sm" variant="outline"
            className="h-7 px-3 text-xs border-emerald-600/50 text-emerald-400 hover:bg-emerald-500/10"
            onClick={() => { setShowNewForm(!showNewForm); setShowLinkForm(false); setShowUsersPanel(false); }}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Novo
          </Button>
        </div>
      </div>

      {/* Status atual */}
      <div className="px-5 py-3">
        {hasResponsible ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm text-white font-medium">{responsibleName}</p>
              <p className="text-xs text-slate-400">
                {readiness?.has_responsible_user ? "Usuário vinculado" : "Sem usuário vinculado — use o botão Usuários acima"}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <p className="text-sm text-rose-300">Sem responsável financeiro — vincule ou crie um abaixo</p>
          </div>
        )}
      </div>

      {/* Formulário: vincular existente */}
      {showLinkForm && (
        <div className="px-5 pb-4 border-t border-slate-800 pt-3 space-y-3">
          <p className="text-xs text-slate-400 font-medium">Selecionar responsável existente:</p>
          <select
            value={selectedRespId ?? ""}
            onChange={(e) => setSelectedRespId(e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
          >
            <option value="">— Selecione —</option>
            {allResponsibles?.map((r: any) => (
              <option key={r.id} value={r.id}>{r.legal_name} {r.cpf_cnpj ? `(${r.cpf_cnpj})` : ""}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button size="sm" disabled={!selectedRespId || linkUnit.isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => selectedRespId && linkUnit.mutate({ financialResponsibleId: selectedRespId, unitId, startsAt: new Date().toISOString() })}
            >
              {linkUnit.isPending ? "Vinculando..." : "Confirmar vínculo"}
            </Button>
            <Button size="sm" variant="outline" className="border-slate-600 text-slate-400" onClick={() => setShowLinkForm(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Formulário: criar novo responsável */}
      {showNewForm && (
        <div className="px-5 pb-4 border-t border-slate-800 pt-3 space-y-3">
          <p className="text-xs text-slate-400 font-medium">Criar e vincular novo responsável:</p>
          <Input placeholder="Nome / Razão Social *" value={newName} onChange={(e) => setNewName(e.target.value)}
            className="bg-slate-800 border-slate-600 text-white text-sm" />
          <Input placeholder="CNPJ / CPF" value={newCnpj} onChange={(e) => setNewCnpj(e.target.value)}
            className="bg-slate-800 border-slate-600 text-white text-sm" />
          <Input placeholder="E-mail" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
            className="bg-slate-800 border-slate-600 text-white text-sm" />
          <div className="flex gap-2">
            <Button size="sm" disabled={!newName.trim() || createAndLink.isPending || linkUnit.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => createAndLink.mutate({
                person_type: newCnpj.replace(/\D/g, "").length > 11 ? "PJ" : "PF",
                legal_name: newName.trim(),
                cpf_cnpj: newCnpj.trim() || undefined,
                email: newEmail.trim() || undefined,
              })}
            >
              {createAndLink.isPending || linkUnit.isPending ? "Criando..." : "Criar e vincular"}
            </Button>
            <Button size="sm" variant="outline" className="border-slate-600 text-slate-400" onClick={() => setShowNewForm(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Painel: gerenciar usuários vinculados */}
      {showUsersPanel && responsibleId && (
        <div className="px-5 pb-4 border-t border-slate-800 pt-3 space-y-3">
          <p className="text-xs text-slate-400 font-medium">Usuários com acesso ao painel deste responsável:</p>
          {respUsers?.length === 0 && (
            <p className="text-xs text-slate-500">Nenhum usuário vinculado ainda.</p>
          )}
          {respUsers?.map((u: any) => (
            <div key={u.user_id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm text-white">{u.name || u.username}</p>
                <p className="text-xs text-slate-400">{u.email}</p>
              </div>
              <Button size="sm" variant="outline"
                className="h-6 px-2 text-xs border-rose-600/50 text-rose-400 hover:bg-rose-500/10"
                onClick={() => unlinkUser.mutate({ financialResponsibleId: responsibleId, userId: u.user_id })}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <select
              value={linkUserId ?? ""}
              onChange={(e) => setLinkUserId(e.target.value ? Number(e.target.value) : null)}
              className="flex-1 bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">— Adicionar usuário —</option>
              {allUsers?.filter((u: any) => !respUsers?.find((ru: any) => ru.user_id === u.id)).map((u: any) => (
                <option key={u.id} value={u.id}>{u.name || u.username} ({u.email})</option>
              ))}
            </select>
            <Button size="sm" disabled={!linkUserId || linkUser.isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
              onClick={() => linkUserId && linkUser.mutate({ financialResponsibleId: responsibleId, userId: linkUserId })}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
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
          <div key={i} className="h-8 bg-slate-800 rounded animate-pulse" />
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
        <div className="mb-3 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <p className="text-emerald-300 text-sm font-medium">Unidade pronta para operação financeira</p>
        </div>
      )}
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-800/20 transition-colors">
          {item.ok ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className={`text-sm font-medium ${item.ok ? "text-white" : "text-rose-300"}`}>{item.label}</p>
            <p className={`text-xs mt-0.5 ${item.ok ? "text-slate-400" : "text-rose-400/80"}`}>{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export function FinanceConfiguracao() {
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
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings className="h-5 w-5 text-cyan-400" />
            Configuração Financeira
          </h1>
          <p className="text-slate-400 text-sm mt-1">Configure responsáveis, ciclos, preços e verifique a aptidão de cada unidade.</p>
        </div>

        {/* Seletor de unidade */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <label className="text-xs text-slate-400 uppercase tracking-wide block mb-2">Selecionar Unidade</label>
          {unitsLoading ? (
            <div className="h-10 bg-slate-800 rounded animate-pulse" />
          ) : (
            <div className="relative">
              <select
                value={selectedUnitId ?? ""}
                onChange={(e) => setSelectedUnitId(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm appearance-none pr-8 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                <option value="">— Selecione uma unidade —</option>
                {units?.map(u => (
                  <option key={u.unit_id} value={u.unit_id}>{u.unit_name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          )}
        </div>

        {selectedUnitId && selectedUnit && (
          <>
            {/* ── Bloco A: Dados financeiros da unidade ── */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-cyan-400" />
                  <h2 className="text-sm font-semibold text-white">Dados Financeiros — {selectedUnit.unit_name}</h2>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 text-xs border-slate-600 text-slate-300 hover:text-white"
                    onClick={() => setShowPriceModal(true)}
                  >
                    <Settings className="h-3.5 w-3.5 mr-1.5" />
                    Preços Padrão
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 text-xs border-slate-600 text-slate-300 hover:text-white"
                    onClick={() => setShowCycleModal(true)}
                  >
                    <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                    Ciclo
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-800">
                {[
                  { label: "Responsável", value: readiness?.responsible_name ?? "Sem responsável", warn: !readiness?.has_responsible },
                  { label: "Ciclo", value: readiness?.has_cycle ? `Dia ${readiness.cycle_start_day}–${readiness.cycle_end_day}` : "Não configurado", warn: !readiness?.has_cycle },
                  { label: "Preço Sistema", value: readiness?.system_price ? `R$ ${readiness.system_price.toFixed(2)}` : "Não configurado", warn: !readiness?.has_specific_system_price && !readiness?.has_default_system_price },
                  { label: "Médicos c/ preço", value: readiness ? `${readiness.doctors_with_price}` : "—", warn: !readiness?.has_default_doctor_price && (readiness?.doctors_with_price ?? 0) === 0 },
                ].map((item, i) => (
                  <div key={i} className="bg-slate-900 px-4 py-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">{item.label}</p>
                    <p className={`text-sm font-medium mt-0.5 ${item.warn ? "text-rose-400" : "text-white"}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Bloco E: Responsável Financeiro ── */}
            <ResponsavelPanel
              unitId={selectedUnitId}
              onChanged={() => {
                utils.financeSimple.unitFinancialReadiness.invalidate({ unit_id: selectedUnitId });
                utils.financeSimple.unitSummary.invalidate();
              }}
            />

            {/* ── Bloco B: Médicos com preço ── */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800">
                <Users className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-white">Médicos — Preço por Laudo</h2>
                {readiness && (readiness.doctors_with_price ?? 0) === 0 && !readiness.has_default_doctor_price && (
                  <span className="ml-auto text-xs bg-rose-500/15 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full">
                    Nenhum médico configurado
                  </span>
                )}
              </div>
              {doctorsLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-800 rounded animate-pulse" />)}
                </div>
              ) : !doctors?.length ? (
                <div className="p-6 text-center text-slate-500 text-sm">
                  Nenhum médico vinculado a esta unidade com laudos assinados.
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60">
                  {doctors.map((d: any) => (
                    <DoctorPriceRow
                      key={d.doctor_user_id}
                      doctor={d}
                      unitId={selectedUnitId}
                      financialResponsibleId={readiness?.responsible_id ?? null}
                      onSaved={() => utils.financeSimple.listDoctorsForUnit.invalidate({ unit_id: selectedUnitId! })}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Bloco C: Checklist de aptidão ── */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">Checklist de Implantação</h2>
              </div>
              <div className="py-2">
                <ReadinessChecklist unitId={selectedUnitId} />
              </div>
            </div>

            {/* ── Bloco F: Toggle de ativação financeira ── */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800">
                <CheckCircle2 className="h-4 w-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-white">Ativação Financeira</h2>
              </div>
              <div className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-white">Financeiro da unidade</p>
                  <p className="text-xs text-slate-400 mt-0.5">
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
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : "bg-slate-700 hover:bg-slate-600 text-slate-300"
                  }`}
                >
                  {setEnabled.isPending ? "..." : readiness?.financial_enabled ? "Ativo ✓" : "Ativar"}
                </button>
              </div>
            </div>

            {/* ── Bloco D: Ações de reprocessamento ── */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800">
                <RefreshCw className="h-4 w-4 text-violet-400" />
                <h2 className="text-sm font-semibold text-white">Ações de Diagnóstico</h2>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">Reprocessar eventos faltantes</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Cria eventos financeiros para laudos assinados que ainda não possuem registro.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-violet-600/50 text-violet-400 hover:bg-violet-500/10 hover:border-violet-500 shrink-0"
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
                      <p className="text-sm text-white">Reprecificar eventos sem preço</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Aplica os preços configurados aos laudos com precificação pendente.{" "}
                        <span className="text-rose-400 font-medium">{readiness.pending_pricing_count} pendente(s)</span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-600/50 text-amber-400 hover:bg-amber-500/10 shrink-0"
                      disabled={reprice.isPending}
                      onClick={() => reprice.mutate({ unit_id: selectedUnitId!, dry_run: false })}
                    >
                      {reprice.isPending ? "Processando..." : "Reprecificar"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {!selectedUnitId && !unitsLoading && (
          <div className="text-center py-16 text-slate-500">
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
