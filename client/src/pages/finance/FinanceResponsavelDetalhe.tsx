import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import {
  ArrowLeft, UserCheck, Building2, Users, DollarSign, TrendingUp,
  AlertCircle, FileText, Calendar, ChevronLeft, ChevronRight,
  PlusCircle, Trash2, Check, X, Banknote, Receipt,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { FinanceShell } from '@/components/FinanceShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function fmt(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? 'R$ 0,00' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(v: Date | string | null | undefined) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('pt-BR');
}

type Tab = 'resumo' | 'unidades' | 'medicos' | 'extrato' | 'fechamentos' | 'receitas' | 'gastos';

export default function FinanceResponsavelDetalhe() {
  const { id } = useParams<{ id: string }>();
  const responsibleId = parseInt(id ?? '0', 10);
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>('resumo');
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const PAGE_SIZE = 20;

  const { data, isLoading, error } = trpc.billing.getResponsibleFullDashboard.useQuery(
    { responsibleId, page, pageSize: PAGE_SIZE, from: from || undefined, to: to || undefined },
    { enabled: !!responsibleId }
  );

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'resumo', label: 'Resumo', icon: TrendingUp },
    { key: 'unidades', label: 'Por Unidade', icon: Building2 },
    { key: 'medicos', label: 'Por Médico', icon: Users },
    { key: 'extrato', label: 'Extrato', icon: FileText },
    { key: 'fechamentos', label: 'Fechamentos', icon: Calendar },
    { key: 'receitas', label: 'Receitas', icon: Banknote },
    { key: 'gastos', label: 'Gastos', icon: Receipt },
  ];

  // Receitas
  const [revenueForm, setRevenueForm] = useState({ description: '', amount: '', competence: '', notes: '' });
  const [addingRevenue, setAddingRevenue] = useState(false);

  // Gastos personalizados
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', category: 'other', competence: '', notes: '' });
  const [addingExpense, setAddingExpense] = useState(false);

  const { data: revenues, refetch: refetchRevenues } = trpc.finance.listContractRevenues.useQuery(
    { financialResponsibleId: responsibleId },
    { enabled: !!responsibleId && activeTab === 'receitas' }
  );

  const { data: expenses, refetch: refetchExpenses } = trpc.finance.listCustomExpenses.useQuery(
    { financialResponsibleId: responsibleId },
    { enabled: !!responsibleId && activeTab === 'gastos' }
  );

  const createRevenue = trpc.finance.createContractRevenue.useMutation({
    onSuccess: () => { refetchRevenues(); setAddingRevenue(false); setRevenueForm({ description: '', amount: '', competence: '', notes: '' }); },
  });

  const deleteRevenue = trpc.finance.deleteContractRevenue.useMutation({
    onSuccess: () => refetchRevenues(),
  });

  const createExpense = trpc.finance.createCustomExpense.useMutation({
    onSuccess: () => { refetchExpenses(); setAddingExpense(false); setExpenseForm({ description: '', amount: '', category: 'other', competence: '', notes: '' }); },
  });

  const deleteExpense = trpc.finance.deleteCustomExpense.useMutation({
    onSuccess: () => refetchExpenses(),
  });

  const EXPENSE_CATEGORIES = [
    { v: 'infrastructure', l: 'Infraestrutura' },
    { v: 'personnel', l: 'Pessoal' },
    { v: 'software', l: 'Software' },
    { v: 'equipment', l: 'Equipamento' },
    { v: 'other', l: 'Outros' },
  ];

  return (
    <FinanceShell activeSection="responsaveis">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <button
          onClick={() => navigate('/financeiro/responsaveis')}
          className="flex items-center gap-2 text-sm text-white/60 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft size={16} />
          Voltar para Responsáveis
        </button>

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error || !data ? (
          <div className="text-center text-white/50 py-20">
            <AlertCircle size={32} className="mx-auto mb-2 opacity-30" />
            <p>Responsável não encontrado</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                  <UserCheck size={24} className="text-blue-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-xl font-bold text-white">
                      {data.responsible.trade_name ?? data.responsible.legal_name}
                    </h1>
                    <Badge variant={data.responsible.isActive ? 'default' : 'secondary'} className="text-xs">
                      {data.responsible.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                      {data.responsible.person_type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-1 text-sm text-white/40">
                    {data.responsible.cpf_cnpj && <span>{data.responsible.cpf_cnpj}</span>}
                    {data.responsible.email && <span>{data.responsible.email}</span>}
                    {data.responsible.phone && <span>{data.responsible.phone}</span>}
                  </div>
                </div>
              </div>

              {/* Cards de dívida */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                  <p className="text-xs text-red-400 font-medium uppercase tracking-wide mb-1">Deve ao Sistema</p>
                  <p className="text-xl font-bold text-red-400">{fmt(data.cards.totalSystem)}</p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                  <p className="text-xs text-amber-400 font-medium uppercase tracking-wide mb-1">Deve aos Médicos</p>
                  <p className="text-xl font-bold text-amber-400">{fmt(data.cards.totalDoctors)}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <p className="text-xs text-white/40 font-medium uppercase tracking-wide mb-1">Total Geral</p>
                  <p className="text-xl font-bold text-white">{fmt(data.cards.totalGeral)}</p>
                </div>
                <div className="bg-teal-500/10 border border-teal-500/20 rounded-lg p-4">
                  <p className="text-xs text-teal-400 font-medium uppercase tracking-wide mb-1">Unidades</p>
                  <p className="text-xl font-bold text-teal-400">{data.byUnit.length}</p>
                </div>
              </div>
            </div>

            {/* Abas */}
            <div className="flex gap-1 mb-5 bg-white/5 rounded-lg p-1 w-fit overflow-x-auto">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                      activeTab === tab.key ? 'bg-teal-500 text-white shadow' : 'text-white/50 hover:text-white hover:bg-white/5'
                    }`}>
                    <Icon size={14} />{tab.label}
                  </button>
                );
              })}
            </div>

            {/* ─── ABA RESUMO ─── */}
            {activeTab === 'resumo' && (
              <div className="space-y-4">
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-white/70 mb-4">Distribuição por Unidade</h2>
                  {data.byUnit.length === 0 ? (
                    <p className="text-white/30 text-sm text-center py-6">Nenhum dado no ciclo corrente</p>
                  ) : (
                    <div className="space-y-3">
                      {data.byUnit.map((u) => {
                        const total = parseFloat(u.total);
                        const geral = parseFloat(data.cards.totalGeral) || 1;
                        const pct = Math.round((total / geral) * 100);
                        return (
                          <div key={u.unit_id}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-white">{u.unit_name}</span>
                              <div className="flex items-center gap-3 text-sm">
                                <span className="text-white/40">{u.reports_count} laudos</span>
                                <span className="font-semibold text-white">{fmt(u.total)}</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex justify-between text-xs text-white/30 mt-0.5">
                              <span>Sistema: {fmt(u.system_amount)}</span>
                              <span>Médicos: {fmt(u.doctor_amount)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── ABA POR UNIDADE ─── */}
            {activeTab === 'unidades' && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10">
                  <h2 className="text-sm font-semibold text-white/80">Dívida por Unidade</h2>
                </div>
                {data.byUnit.length === 0 ? (
                  <div className="p-8 text-center text-white/30"><Building2 size={28} className="mx-auto mb-2 opacity-30" /><p>Nenhuma unidade com dívida</p></div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase">Unidade</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-white/40 uppercase">Laudos</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-white/40 uppercase">Sistema</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-white/40 uppercase">Médicos</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-white/40 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byUnit.map((u) => (
                        <tr key={u.unit_id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-5 py-3 text-sm text-white">{u.unit_name}</td>
                          <td className="px-5 py-3 text-right text-sm text-white/50">{u.reports_count}</td>
                          <td className="px-5 py-3 text-right text-sm text-red-400">{fmt(u.system_amount)}</td>
                          <td className="px-5 py-3 text-right text-sm text-amber-400">{fmt(u.doctor_amount)}</td>
                          <td className="px-5 py-3 text-right text-sm font-bold text-white">{fmt(u.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/20 bg-white/5">
                        <td colSpan={4} className="px-5 py-3 text-sm font-bold text-white/60">Total</td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-white">{fmt(data.cards.totalGeral)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}

            {/* ─── ABA POR MÉDICO ─── */}
            {activeTab === 'medicos' && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10">
                  <h2 className="text-sm font-semibold text-white/80">Dívida por Médico</h2>
                </div>
                {data.byDoctor.length === 0 ? (
                  <div className="p-8 text-center text-white/30"><Users size={28} className="mx-auto mb-2 opacity-30" /><p>Nenhuma dívida com médicos</p></div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase">Médico</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase">Unidades</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-white/40 uppercase">Laudos</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-white/40 uppercase">A Pagar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byDoctor.map((d) => (
                        <tr key={d.doctor_user_id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-teal-500/20 flex items-center justify-center text-xs font-bold text-teal-400">
                                {(d.doctor_name ?? 'M').charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm text-white">{d.doctor_name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-sm text-white/40">{d.units.join(', ')}</td>
                          <td className="px-5 py-3 text-right text-sm text-white/50">{d.reports_count}</td>
                          <td className="px-5 py-3 text-right text-sm font-bold text-amber-400">{fmt(d.amount_due)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/20 bg-white/5">
                        <td colSpan={3} className="px-5 py-3 text-sm font-bold text-white/60">Total a pagar</td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-amber-400">{fmt(data.cards.totalDoctors)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}

            {/* ─── ABA EXTRATO ─── */}
            {activeTab === 'extrato' && (
              <div className="space-y-3">
                {/* Filtros */}
                <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                  <span className="text-xs text-white/40 shrink-0">Período:</span>
                  <Input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}
                    className="h-7 text-xs bg-white/5 border-white/10 text-white w-36" />
                  <span className="text-xs text-white/30">até</span>
                  <Input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}
                    className="h-7 text-xs bg-white/5 border-white/10 text-white w-36" />
                  {(from || to) && (
                    <button onClick={() => { setFrom(''); setTo(''); setPage(1); }}
                      className="text-xs text-white/40 hover:text-white transition-colors">Limpar</button>
                  )}
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                  {data.extract.length === 0 ? (
                    <div className="p-8 text-center text-white/30"><FileText size={28} className="mx-auto mb-2 opacity-30" /><p>Nenhum registro no período</p></div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Data</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Paciente</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Médico</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-white/40 uppercase">Unidade</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-white/40 uppercase">Sistema</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-white/40 uppercase">Médico</th>
                          <th className="text-center px-4 py-3 text-xs font-medium text-white/40 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.extract.map((e) => (
                          <tr key={e.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="px-4 py-2.5 text-white/50 text-xs">{fmtDate(e.createdAt)}</td>
                            <td className="px-4 py-2.5 text-white text-xs max-w-[120px] truncate">{e.patient_name ?? '—'}</td>
                            <td className="px-4 py-2.5 text-white/70 text-xs">{e.doctor_name ?? '—'}</td>
                            <td className="px-4 py-2.5 text-white/50 text-xs">{e.unit_name ?? '—'}</td>
                            <td className="px-4 py-2.5 text-right text-red-400 text-xs">{fmt(e.system_amount_due ?? e.system_price_applied)}</td>
                            <td className="px-4 py-2.5 text-right text-amber-400 text-xs">{fmt(e.doctor_amount_due ?? e.doctor_price_applied)}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                e.pricing_status === 'ok' ? 'bg-emerald-500/20 text-emerald-400' :
                                (e.pricing_status === 'pending_system_price' || e.pricing_status === 'pending_doctor_price') ? 'bg-amber-500/20 text-amber-400' :
                                'bg-white/10 text-white/30'
                              }`}>
                                {e.pricing_status === 'ok' ? 'OK' : (e.pricing_status === 'pending_system_price' || e.pricing_status === 'pending_doctor_price') ? 'Parcial' : 'Pendente'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Paginação */}
                {data.extract.length > 0 && (
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs text-white/30">Página {page} — {data.extract.length} registros</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}
                        className="h-7 px-2 border-white/10 text-white/50 hover:text-white bg-transparent">
                        <ChevronLeft size={14} />
                      </Button>
                      <Button variant="outline" size="sm" disabled={data.extract.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}
                        className="h-7 px-2 border-white/10 text-white/50 hover:text-white bg-transparent">
                        <ChevronRight size={14} />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── ABA FECHAMENTOS ─── */}
            {activeTab === 'fechamentos' && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10">
                  <h2 className="text-sm font-semibold text-white/80">Ciclos Fechados</h2>
                </div>
                {data.closedCycles.length === 0 ? (
                  <div className="p-8 text-center text-white/30"><Calendar size={28} className="mx-auto mb-2 opacity-30" /><p>Nenhum ciclo fechado</p></div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase">Unidade</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase">Tipo</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase">Período</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-white/40 uppercase">Laudos</th>
                        <th className="text-right px-5 py-3 text-xs font-medium text-white/40 uppercase">Total</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase">Fechado em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.closedCycles.map((c) => (
                        <tr key={c.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-5 py-3 text-sm text-white">{c.unit_name}</td>
                          <td className="px-5 py-3">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                              {c.cycle_type === 'doctor' ? 'Médico' : 'Sistema'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs text-white/40">
                            {fmtDate(c.starts_at)} — {fmtDate(c.ends_at)}
                          </td>
                          <td className="px-5 py-3 text-right text-sm text-white/50">{c.total_reports ?? '—'}</td>
                          <td className="px-5 py-3 text-right text-sm font-semibold text-white">{fmt(c.total_amount)}</td>
                          <td className="px-5 py-3 text-xs text-white/30">{fmtDate(c.closedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {/* ─── ABA RECEITAS ─── */}
            {activeTab === 'receitas' && (
              <div className="space-y-4">
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-white/80">Receitas do Contrato</h2>
                    <button onClick={() => setAddingRevenue(v => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors">
                      <PlusCircle size={12} />Nova Receita
                    </button>
                  </div>
                  {addingRevenue && (
                    <div className="bg-white/5 rounded-lg p-4 mb-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-white/40 mb-1 block">Descrição</label>
                          <input value={revenueForm.description} onChange={e => setRevenueForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Ex: Mensalidade contrato" className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-sm text-white" />
                        </div>
                        <div>
                          <label className="text-xs text-white/40 mb-1 block">Valor (R$)</label>
                          <input value={revenueForm.amount} onChange={e => setRevenueForm(f => ({ ...f, amount: e.target.value }))}
                            placeholder="Ex: 5000.00" className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-sm text-white" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-white/40 mb-1 block">Competência (YYYY-MM)</label>
                          <input value={revenueForm.competence} onChange={e => setRevenueForm(f => ({ ...f, competence: e.target.value }))}
                            placeholder="Ex: 2025-01" className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-sm text-white" />
                        </div>
                        <div>
                          <label className="text-xs text-white/40 mb-1 block">Observações</label>
                          <input value={revenueForm.notes} onChange={e => setRevenueForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Opcional" className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-sm text-white" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => createRevenue.mutate({ financialResponsibleId: responsibleId, description: revenueForm.description || undefined, amount: revenueForm.amount, startsAt: revenueForm.competence ? `${revenueForm.competence}-01` : new Date().toISOString(), notes: revenueForm.notes || undefined })}
                          disabled={createRevenue.isPending || !revenueForm.description || !revenueForm.amount}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50">
                          <Check size={12} />Salvar
                        </button>
                        <button onClick={() => setAddingRevenue(false)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-white/10 text-white/60 rounded hover:bg-white/20">
                          <X size={12} />Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  {!revenues || revenues.length === 0 ? (
                    <div className="text-center py-8 text-white/30">
                      <Banknote size={32} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhuma receita registrada</p>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left px-4 py-2 text-xs text-white/40 uppercase">Descrição</th>
                          <th className="text-left px-4 py-2 text-xs text-white/40 uppercase">Competência</th>
                          <th className="text-right px-4 py-2 text-xs text-white/40 uppercase">Valor</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {revenues.map((r: any) => (
                          <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                            <td className="px-4 py-3 text-sm text-white">{r.description}</td>
                            <td className="px-4 py-3 text-sm text-white/40">{r.starts_at ? new Date(r.starts_at).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' }) : '—'}</td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-400">{fmt(r.amount)}</td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => deleteRevenue.mutate({ id: r.id, financialResponsibleId: responsibleId })} disabled={deleteRevenue.isPending}
                                className="p-1.5 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-white/20 bg-white/5">
                          <td colSpan={2} className="px-4 py-2 text-xs font-bold text-white/50">Total Receitas</td>
                          <td className="px-4 py-2 text-right text-sm font-bold text-emerald-400">
                            {fmt(revenues.reduce((s: number, r: any) => s + parseFloat(r.amount ?? '0'), 0))}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* ─── ABA GASTOS PERSONALIZADOS ─── */}
            {activeTab === 'gastos' && (
              <div className="space-y-4">
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-white/80">Gastos Personalizados</h2>
                    <button onClick={() => setAddingExpense(v => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors">
                      <PlusCircle size={12} />Novo Gasto
                    </button>
                  </div>
                  {addingExpense && (
                    <div className="bg-white/5 rounded-lg p-4 mb-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-white/40 mb-1 block">Descrição</label>
                          <input value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Ex: Aluguel equipamento" className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-sm text-white" />
                        </div>
                        <div>
                          <label className="text-xs text-white/40 mb-1 block">Categoria</label>
                          <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))}
                            className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-sm text-white">
                            {EXPENSE_CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-white/40 mb-1 block">Valor (R$)</label>
                          <input value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                            placeholder="Ex: 1200.00" className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-sm text-white" />
                        </div>
                        <div>
                          <label className="text-xs text-white/40 mb-1 block">Competência (YYYY-MM)</label>
                          <input value={expenseForm.competence} onChange={e => setExpenseForm(f => ({ ...f, competence: e.target.value }))}
                            placeholder="Ex: 2025-01" className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-sm text-white" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { const [yr, mo] = (expenseForm.competence || `${new Date().getFullYear()}-${new Date().getMonth()+1}`).split('-'); createExpense.mutate({ financialResponsibleId: responsibleId, description: expenseForm.description || undefined, category: expenseForm.category, amount: expenseForm.amount, competenceMonth: parseInt(mo) || new Date().getMonth()+1, competenceYear: parseInt(yr) || new Date().getFullYear(), notes: expenseForm.notes || undefined }); }}
                          disabled={createExpense.isPending || !expenseForm.description || !expenseForm.amount}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50">
                          <Check size={12} />Salvar
                        </button>
                        <button onClick={() => setAddingExpense(false)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-white/10 text-white/60 rounded hover:bg-white/20">
                          <X size={12} />Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  {!expenses || expenses.length === 0 ? (
                    <div className="text-center py-8 text-white/30">
                      <Receipt size={32} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhum gasto personalizado registrado</p>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left px-4 py-2 text-xs text-white/40 uppercase">Descrição</th>
                          <th className="text-left px-4 py-2 text-xs text-white/40 uppercase">Categoria</th>
                          <th className="text-left px-4 py-2 text-xs text-white/40 uppercase">Competência</th>
                          <th className="text-right px-4 py-2 text-xs text-white/40 uppercase">Valor</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((e: any) => (
                          <tr key={e.id} className="border-b border-white/5 hover:bg-white/5">
                            <td className="px-4 py-3 text-sm text-white">{e.description}</td>
                            <td className="px-4 py-3 text-sm text-white/40">{EXPENSE_CATEGORIES.find(c => c.v === e.category)?.l ?? e.category}</td>
                            <td className="px-4 py-3 text-sm text-white/40">{e.competence ?? '—'}</td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-red-400">{fmt(e.amount)}</td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => deleteExpense.mutate({ id: e.id, financialResponsibleId: responsibleId })} disabled={deleteExpense.isPending}
                                className="p-1.5 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-white/20 bg-white/5">
                          <td colSpan={3} className="px-4 py-2 text-xs font-bold text-white/50">Total Gastos</td>
                          <td className="px-4 py-2 text-right text-sm font-bold text-red-400">
                            {fmt(expenses.reduce((s: number, e: any) => s + parseFloat(e.amount ?? '0'), 0))}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </FinanceShell>
  );
}
