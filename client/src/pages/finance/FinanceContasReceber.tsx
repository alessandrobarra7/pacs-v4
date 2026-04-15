/**
 * FinanceContasReceber — P2: Contas a Receber do Sistema
 *
 * Exibe todos os ciclos de cobrança do sistema com:
 * - Status do ciclo (Aberto / Fechado)
 * - Status de pagamento (Pendente / Pago)
 * - Ações: fechar ciclo, marcar como pago, desfazer pagamento, adicionar observação
 * - Filtros por status de ciclo e status de pagamento
 *
 * Roles com acesso: admin_master
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { FinanceShell } from "@/components/FinanceShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  MessageSquare,
  RefreshCw,
  DollarSign,
  Clock,
  AlertCircle,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("pt-BR");
}

function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("pt-BR");
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Cycle = {
  id: number;
  unit_id: number;
  unit_name: string;
  responsible_name: string | null;
  financial_responsible_id: number | null;
  cycle_type: string;
  status: "open" | "closed";
  paid_status: "pending" | "paid";
  paid_at: Date | string | null;
  paid_by_name: string | null;
  paid_note: string | null;
  closedAt: Date | string | null;
  total_system_amount?: string | null;
  total_doctor_amount?: string | null;
  report_count?: number | null;
  createdAt: Date | string;
};

// ─── Dialog de observação ─────────────────────────────────────────────────────
function NoteDialog({
  open,
  cycleId,
  currentNote,
  onClose,
  onSaved,
}: {
  open: boolean;
  cycleId: number;
  currentNote: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState(currentNote ?? "");
  const addNote = trpc.billing.addCycleNote.useMutation({
    onSuccess: () => { toast.success("Observação salva!"); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Observação do Ciclo</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Label className="text-xs text-muted-foreground">Observação (máx. 500 caracteres)</Label>
          <textarea
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            rows={4}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex: Pagamento via PIX, comprovante enviado por e-mail..."
          />
          <p className="text-xs text-muted-foreground text-right mt-1">{note.length}/500</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!note.trim() || addNote.isPending}
            onClick={() => addNote.mutate({ cycleId, note: note.trim() })}
          >
            {addNote.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog de confirmação de pagamento ──────────────────────────────────────
function MarkPaidDialog({
  open,
  cycleId,
  unitName,
  onClose,
  onSaved,
}: {
  open: boolean;
  cycleId: number;
  unitName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState("");
  const markPaid = trpc.billing.markCyclePaid.useMutation({
    onSuccess: () => { toast.success("Ciclo marcado como pago!"); onSaved(); onClose(); setNote(""); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar Pagamento</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-muted-foreground">
            Marcar o ciclo da unidade <strong>{unitName}</strong> como pago?
          </p>
          <div>
            <Label className="text-xs text-muted-foreground">Observação (opcional)</Label>
            <Input
              className="mt-1 h-9"
              placeholder="Ex: PIX, transferência, número do comprovante..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={markPaid.isPending}
            onClick={() => markPaid.mutate({ cycleId, note: note.trim() || undefined })}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {markPaid.isPending ? "Confirmando..." : "Confirmar Pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Linha da tabela ──────────────────────────────────────────────────────────
function CycleRow({ cycle, onRefresh }: { cycle: Cycle; onRefresh: () => void }) {
  const [showNote, setShowNote] = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState(false);

  const closeCycle = trpc.billing.closeCycle.useMutation({
    onSuccess: () => { toast.success("Ciclo fechado!"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const unmarkPaid = trpc.billing.unmarkCyclePaid.useMutation({
    onSuccess: () => { toast.success("Pagamento desfeito."); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  // Nota: closeCycle original usa cycle_id (snake_case)

  const systemTotal = parseFloat(cycle.total_system_amount ?? "0");
  const doctorTotal = parseFloat(cycle.total_doctor_amount ?? "0");
  const margin = systemTotal - doctorTotal;

  return (
    <>
      <tr className="border-b border-border/40 hover:bg-muted/20 transition-colors">
        {/* Unidade + Responsável */}
        <td className="px-4 py-3">
          <p className="font-medium text-sm">{cycle.unit_name}</p>
          {cycle.responsible_name && (
            <p className="text-xs text-muted-foreground">{cycle.responsible_name}</p>
          )}
        </td>

        {/* Status do ciclo */}
        <td className="px-4 py-3 text-center">
          {cycle.status === "open" ? (
            <Badge variant="outline" className="text-amber-500 border-amber-500 text-xs">
              <Clock className="h-3 w-3 mr-1" />
              Aberto
            </Badge>
          ) : (
            <Badge variant="outline" className="text-slate-400 border-slate-400 text-xs">
              <Lock className="h-3 w-3 mr-1" />
              Fechado
            </Badge>
          )}
        </td>

        {/* Status de pagamento */}
        <td className="px-4 py-3 text-center">
          {cycle.paid_status === "paid" ? (
            <div className="flex flex-col items-center gap-0.5">
              <Badge variant="outline" className="text-emerald-500 border-emerald-500 text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Pago
              </Badge>
              {cycle.paid_at && (
                <span className="text-xs text-muted-foreground">{fmtDate(cycle.paid_at)}</span>
              )}
            </div>
          ) : (
            <Badge variant="outline" className="text-red-400 border-red-400 text-xs">
              <AlertCircle className="h-3 w-3 mr-1" />
              Pendente
            </Badge>
          )}
        </td>

        {/* Valores */}
        <td className="px-4 py-3 text-right hidden md:table-cell">
          <p className="text-sm font-semibold">{fmtBRL(systemTotal)}</p>
          <p className="text-xs text-muted-foreground">{cycle.report_count ?? 0} laudos</p>
        </td>
        <td className="px-4 py-3 text-right hidden lg:table-cell">
          <p className="text-sm text-red-400">{fmtBRL(doctorTotal)}</p>
        </td>
        <td className="px-4 py-3 text-right hidden lg:table-cell">
          <p className={`text-sm font-semibold ${margin >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {fmtBRL(margin)}
          </p>
        </td>

        {/* Observação */}
        <td className="px-4 py-3 hidden xl:table-cell">
          {cycle.paid_note ? (
            <p className="text-xs text-muted-foreground max-w-[200px] truncate" title={cycle.paid_note}>
              {cycle.paid_note}
            </p>
          ) : (
            <span className="text-xs text-muted-foreground/40">—</span>
          )}
        </td>

        {/* Ações */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 justify-end flex-wrap">
            {/* Fechar ciclo (só se aberto) */}
            {cycle.status === "open" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={closeCycle.isPending}
                onClick={() => closeCycle.mutate({ cycle_id: cycle.id })}
                title="Fechar ciclo"
              >
                <Lock className="h-3 w-3 mr-1" />
                Fechar
              </Button>
            )}

            {/* Marcar como pago */}
            {cycle.paid_status === "pending" ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs text-emerald-600 border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                onClick={() => setShowMarkPaid(true)}
                title="Marcar como pago"
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Pago
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs text-muted-foreground"
                disabled={unmarkPaid.isPending}
                onClick={() => unmarkPaid.mutate({ cycleId: cycle.id })}
                title="Desfazer pagamento"
              >
                <XCircle className="h-3 w-3 mr-1" />
                Desfazer
              </Button>
            )}

            {/* Observação */}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowNote(true)}
              title="Adicionar observação"
            >
              <MessageSquare className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>

      {/* Dialogs */}
      <NoteDialog
        open={showNote}
        cycleId={cycle.id}
        currentNote={cycle.paid_note}
        onClose={() => setShowNote(false)}
        onSaved={onRefresh}
      />
      <MarkPaidDialog
        open={showMarkPaid}
        cycleId={cycle.id}
        unitName={cycle.unit_name}
        onClose={() => setShowMarkPaid(false)}
        onSaved={onRefresh}
      />
    </>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function FinanceContasReceber() {
  const [cycleStatus, setCycleStatus] = useState<"all" | "open" | "closed">("all");
  const [paidStatus, setPaidStatus] = useState<"all" | "pending" | "paid">("all");

  const { data, isLoading, refetch } = trpc.billing.listSystemReceivables.useQuery({
    cycleStatus,
    paidStatus,
  });

  const cycles = ((data ?? []) as unknown[]) as Cycle[];

  // Totalizadores
  const totalSystem = cycles.reduce((s, c) => s + parseFloat(c.total_system_amount ?? "0"), 0);
  const totalDoctor = cycles.reduce((s, c) => s + parseFloat(c.total_doctor_amount ?? "0"), 0);
  const totalPending = cycles.filter(c => c.paid_status === "pending").reduce((s, c) => s + parseFloat(c.total_system_amount ?? "0"), 0);
  const totalPaid = cycles.filter(c => c.paid_status === "paid").reduce((s, c) => s + parseFloat(c.total_system_amount ?? "0"), 0);

  return (
    <FinanceShell activeSection="contas-receber">
      <div className="space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Contas a Receber</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Ciclos de cobrança do sistema — controle de pagamentos por unidade
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <p className="text-xs text-muted-foreground">Total Ciclos</p>
            <p className="text-2xl font-bold mt-1">{cycles.length}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <p className="text-xs text-muted-foreground">Receita Total</p>
            <p className="text-2xl font-bold mt-1 text-cyan-400">{fmtBRL(totalSystem)}</p>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-xs text-muted-foreground">A Receber (Pendente)</p>
            <p className="text-2xl font-bold mt-1 text-red-400">{fmtBRL(totalPending)}</p>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="text-xs text-muted-foreground">Já Recebido</p>
            <p className="text-2xl font-bold mt-1 text-emerald-400">{fmtBRL(totalPaid)}</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[160px]">
            <Label className="text-xs text-muted-foreground">Status do Ciclo</Label>
            <Select value={cycleStatus} onValueChange={(v) => setCycleStatus(v as typeof cycleStatus)}>
              <SelectTrigger className="h-9 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Abertos</SelectItem>
                <SelectItem value="closed">Fechados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[160px]">
            <Label className="text-xs text-muted-foreground">Status de Pagamento</Label>
            <Select value={paidStatus} onValueChange={(v) => setPaidStatus(v as typeof paidStatus)}>
              <SelectTrigger className="h-9 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="paid">Pagos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabela */}
        <div className="rounded-xl border border-border/60 overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-12 bg-muted/30 rounded animate-pulse" />
              ))}
            </div>
          ) : cycles.length === 0 ? (
            <div className="py-16 text-center">
              <DollarSign className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">Nenhum ciclo encontrado com os filtros selecionados.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/20">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Unidade / Responsável</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Ciclo</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Pagamento</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Receita</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Custo Médico</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Margem</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden xl:table-cell">Observação</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.map(cycle => (
                    <CycleRow key={cycle.id} cycle={cycle} onRefresh={refetch} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </FinanceShell>
  );
}
