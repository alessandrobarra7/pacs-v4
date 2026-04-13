import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import {
  ArrowLeft, UserCheck, Building2, Users, DollarSign, TrendingUp,
  AlertCircle, FileText, Calendar, ChevronLeft, ChevronRight,
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

type Tab = 'resumo' | 'unidades' | 'medicos' | 'extrato' | 'fechamentos';

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
          </>
        )}
      </div>
    </FinanceShell>
  );
}
