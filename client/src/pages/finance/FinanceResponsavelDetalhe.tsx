import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft, UserCheck, Building2, Users, DollarSign, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { FinanceShell } from '@/components/FinanceShell';

function fmt(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? 'R$ 0,00' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function FinanceResponsavelDetalhe() {
  const { id } = useParams<{ id: string }>();
  const responsibleId = parseInt(id ?? '0', 10);
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<'resumo' | 'unidades' | 'medicos' | 'usuarios'>('resumo');

  const { data, isLoading, error } = trpc.billing.getResponsibleDetail.useQuery(
    { responsibleId },
    { enabled: !!responsibleId }
  );

  const tabs = [
    { key: 'resumo' as const, label: 'Resumo', icon: TrendingUp },
    { key: 'unidades' as const, label: 'Unidades', icon: Building2 },
    { key: 'medicos' as const, label: 'Dívida Médicos', icon: Users },
    { key: 'usuarios' as const, label: 'Usuários', icon: UserCheck },
  ];

  return (
    <FinanceShell activeSection="responsaveis">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Botão Voltar */}
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
            {/* Header do responsável */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <UserCheck size={24} className="text-blue-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-xl font-bold text-white">
                      {data.responsible.trade_name ?? data.responsible.legal_name}
                    </h1>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      data.responsible.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {data.responsible.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                      {data.responsible.person_type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-2 text-sm text-white/40">
                    {data.responsible.cpf_cnpj && <span>{data.responsible.cpf_cnpj}</span>}
                    {data.responsible.email && <span>{data.responsible.email}</span>}
                    {data.responsible.phone && <span>{data.responsible.phone}</span>}
                  </div>
                </div>
              </div>

              {/* Cards de resumo financeiro */}
              <div className="grid grid-cols-4 gap-4 mt-6">
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Dívida ao Sistema</p>
                  <p className="text-xl font-bold text-red-400">{fmt(data.totalSystem)}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Dívida aos Médicos</p>
                  <p className="text-xl font-bold text-amber-400">{fmt(data.totalDoctors)}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Total Geral</p>
                  <p className="text-xl font-bold text-white">{fmt(data.totalGeral)}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Unidades Cobertas</p>
                  <p className="text-xl font-bold text-teal-400">{data.units.length}</p>
                </div>
              </div>
            </div>

            {/* Abas */}
            <div className="flex gap-1 mb-6 bg-white/5 rounded-lg p-1 w-fit">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      activeTab === tab.key
                        ? 'bg-teal-500 text-white shadow'
                        : 'text-white/50 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon size={14} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Aba Resumo — por unidade */}
            {activeTab === 'resumo' && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10">
                  <h2 className="text-sm font-semibold text-white/80">Resumo por Unidade</h2>
                </div>
                {data.byUnit.length === 0 ? (
                  <div className="p-8 text-center text-white/40">
                    <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                    <p>Nenhum dado financeiro registrado</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Unidade</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-white/40 uppercase">Laudos</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-white/40 uppercase">Dívida Sistema</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-white/40 uppercase">Dívida Médicos</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-white/40 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byUnit.map((row: any) => {
                        const total = parseFloat(row.system_amount_due) + parseFloat(row.doctor_amount_due);
                        return (
                          <tr key={row.unit_id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <Building2 size={14} className="text-teal-400" />
                                <span className="text-sm text-white">{row.unit_name || `Unidade ${row.unit_id}`}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right text-sm text-white/70">{row.reports_count}</td>
                            <td className="px-6 py-4 text-right text-sm font-medium text-red-400">{fmt(row.system_amount_due)}</td>
                            <td className="px-6 py-4 text-right text-sm font-medium text-amber-400">{fmt(row.doctor_amount_due)}</td>
                            <td className="px-6 py-4 text-right text-sm font-bold text-white">{fmt(total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/20 bg-white/5">
                        <td className="px-6 py-4 text-sm font-bold text-white/60">Total</td>
                        <td className="px-6 py-4 text-right text-sm font-bold text-white">
                          {data.byUnit.reduce((s: number, r: any) => s + r.reports_count, 0)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-bold text-red-400">{fmt(data.totalSystem)}</td>
                        <td className="px-6 py-4 text-right text-sm font-bold text-amber-400">{fmt(data.totalDoctors)}</td>
                        <td className="px-6 py-4 text-right text-sm font-bold text-teal-400">{fmt(data.totalGeral)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}

            {/* Aba Unidades */}
            {activeTab === 'unidades' && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10">
                  <h2 className="text-sm font-semibold text-white/80">Unidades Cobertas</h2>
                </div>
                {data.units.length === 0 ? (
                  <div className="p-8 text-center text-white/40">Nenhuma unidade vinculada</div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Unidade</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Início</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Fim</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.units.map((u: any) => (
                        <tr key={u.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Building2 size={14} className="text-teal-400" />
                              <span className="text-sm text-white">{u.unit_name ?? `Unidade ${u.unit_id}`}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-white/60">
                            {u.starts_at ? new Date(u.starts_at).toLocaleDateString('pt-BR') : '—'}
                          </td>
                          <td className="px-6 py-4 text-sm text-white/60">
                            {u.ends_at ? new Date(u.ends_at).toLocaleDateString('pt-BR') : 'Atual'}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              !u.ends_at ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'
                            }`}>
                              {!u.ends_at ? 'Ativo' : 'Encerrado'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Aba Médicos — dívida por médico */}
            {activeTab === 'medicos' && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10">
                  <h2 className="text-sm font-semibold text-white/80">Dívida por Médico</h2>
                </div>
                {data.byDoctor.length === 0 ? (
                  <div className="p-8 text-center text-white/40">
                    <Users size={32} className="mx-auto mb-2 opacity-30" />
                    <p>Nenhuma dívida com médicos registrada</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Médico</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Unidade</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-white/40 uppercase">Laudos</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-white/40 uppercase">A Pagar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byDoctor.map((row: any, i: number) => (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 rounded-full bg-teal-500/20 flex items-center justify-center text-xs font-bold text-teal-400">
                                {(row.doctor_name ?? 'M').charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm text-white">{row.doctor_name || `Médico ${row.doctor_user_id}`}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-white/60">{row.unit_name || `Unidade ${row.unit_id}`}</td>
                          <td className="px-6 py-4 text-right text-sm text-white/70">{row.reports_count}</td>
                          <td className="px-6 py-4 text-right text-sm font-bold text-amber-400">{fmt(row.amount_due)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/20 bg-white/5">
                        <td colSpan={3} className="px-6 py-4 text-sm font-bold text-white/60">Total a pagar aos médicos</td>
                        <td className="px-6 py-4 text-right text-sm font-bold text-amber-400">{fmt(data.totalDoctors)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}

            {/* Aba Usuários */}
            {activeTab === 'usuarios' && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10">
                  <h2 className="text-sm font-semibold text-white/80">Usuários Vinculados</h2>
                </div>
                {data.users.length === 0 ? (
                  <div className="p-8 text-center text-white/40">Nenhum usuário vinculado</div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Usuário</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Perfil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.users.map((u: any) => (
                        <tr key={u.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-400">
                                {(u.name ?? 'U').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm text-white">{u.name ?? '—'}</p>
                                <p className="text-xs text-white/40">{u.username ?? '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                              {u.role ?? '—'}
                            </span>
                          </td>
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
