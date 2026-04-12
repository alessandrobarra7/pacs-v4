import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft, Building2, Users, DollarSign, History, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { FinanceShell } from '@/components/FinanceShell';

function fmt(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? 'R$ 0,00' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

export default function FinanceUnidadeDetalhe() {
  const { id } = useParams<{ id: string }>();
  const unitId = parseInt(id ?? '0', 10);
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<'medicos' | 'precos' | 'ciclos'>('medicos');

  const { data: unit, isLoading: loadingUnit } = trpc.units.getById.useQuery(
    { id: unitId },
    { enabled: !!unitId }
  );

  const { data: doctors, isLoading: loadingDoctors } = trpc.units.listDoctors.useQuery(
    { unitId },
    { enabled: !!unitId }
  );

  const { data: allPrices, isLoading: loadingPrices } = trpc.billing.listAllDoctorPrices.useQuery(undefined, {
    enabled: !!unitId,
  });

  const { data: systemPrices } = trpc.billing.listSystemPrices.useQuery(
    { financialResponsibleId: 0, unitId },
    { enabled: false } // usaremos listAllSystemPrices
  );

  const { data: allSystemPrices } = trpc.billing.listAllSystemPrices.useQuery(undefined, {
    enabled: !!unitId,
  });

  const { data: cycles, isLoading: loadingCycles } = trpc.billing.listUnitCycles.useQuery(
    { unit_id: unitId },
    { enabled: !!unitId }
  );

  const unitDoctorPrices = (allPrices ?? []).filter(p => p.unit_id === unitId);
  const unitSystemPrices = (allSystemPrices ?? []).filter(p => p.unit_id === unitId);

  const isLoading = loadingUnit || loadingDoctors;

  const tabs = [
    { key: 'medicos' as const, label: 'Médicos', icon: Users },
    { key: 'precos' as const, label: 'Preços', icon: DollarSign },
    { key: 'ciclos' as const, label: 'Ciclos', icon: History },
  ];

  return (
    <FinanceShell activeSection="unidades">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Botão Voltar */}
        <button
          onClick={() => navigate('/financeiro/unidades')}
          className="flex items-center gap-2 text-sm text-white/60 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft size={16} />
          Voltar para Unidades
        </button>

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !unit ? (
          <div className="text-center text-white/50 py-20">Unidade não encontrada</div>
        ) : (
          <>
            {/* Header da unidade */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                  <Building2 size={24} className="text-teal-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-xl font-bold text-white">{unit.name}</h1>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      unit.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {unit.isActive ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  {unit.address && (
                    <p className="text-sm text-white/50">{unit.address}</p>
                  )}
                  <div className="flex gap-4 mt-3 text-sm text-white/40">
                    <span>PACS: {unit.pacs_ip}:{unit.pacs_port}</span>
                    <span>AE: {unit.pacs_ae_title}</span>
                  </div>
                </div>
              </div>

              {/* Cards de resumo */}
              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Médicos Vinculados</p>
                  <p className="text-2xl font-bold text-white">{doctors?.length ?? 0}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Custo/Laudo (Sistema)</p>
                  <p className="text-2xl font-bold text-teal-400">
                    {unitSystemPrices.length > 0 ? fmt(unitSystemPrices[0]?.price_per_report) : '—'}
                  </p>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Ciclos Registrados</p>
                  <p className="text-2xl font-bold text-white">{cycles?.length ?? 0}</p>
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

            {/* Aba Médicos */}
            {activeTab === 'medicos' && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10">
                  <h2 className="text-sm font-semibold text-white/80">Médicos Vinculados</h2>
                </div>
                {loadingDoctors ? (
                  <div className="p-8 text-center text-white/40">Carregando...</div>
                ) : !doctors || doctors.length === 0 ? (
                  <div className="p-8 text-center text-white/40">
                    <Users size={32} className="mx-auto mb-2 opacity-30" />
                    <p>Nenhum médico vinculado</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Médico</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">CRM</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Preço/Laudo</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doctors.map(doc => {
                        const price = unitDoctorPrices.find(p => p.doctor_user_id === doc.id && !p.ends_at);
                        return (
                          <tr key={doc.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-teal-500/20 flex items-center justify-center text-xs font-bold text-teal-400">
                                  {(doc.name ?? 'M').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-white">{doc.name ?? '—'}</p>
                                  <p className="text-xs text-white/40">{doc.username ?? '—'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-white/60">{doc.crm ?? '—'}</td>
                            <td className="px-6 py-4">
                              {price ? (
                                <span className="text-sm font-semibold text-emerald-400">{fmt(price.price_per_report)}</span>
                              ) : (
                                <span className="flex items-center gap-1 text-xs text-amber-400">
                                  <AlertCircle size={12} />
                                  Sem preço
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                doc.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'
                              }`}>
                                {doc.isActive ? 'Ativo' : 'Inativo'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Aba Preços */}
            {activeTab === 'precos' && (
              <div className="space-y-4">
                {/* Preço do sistema */}
                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/10">
                    <h2 className="text-sm font-semibold text-white/80">Custo do Sistema por Laudo</h2>
                  </div>
                  {unitSystemPrices.length === 0 ? (
                    <div className="p-6 text-center text-white/40 text-sm">Nenhum preço de sistema configurado</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Valor/Laudo</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Vigência</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unitSystemPrices.map(p => (
                          <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                            <td className="px-6 py-4 text-sm font-semibold text-teal-400">{fmt(p.price_per_report)}</td>
                            <td className="px-6 py-4 text-sm text-white/60">
                              {fmtDate(p.starts_at)} — {p.ends_at ? fmtDate(p.ends_at) : 'Atual'}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                !p.ends_at ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'
                              }`}>
                                {!p.ends_at ? 'Ativo' : 'Encerrado'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Preços por médico */}
                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/10">
                    <h2 className="text-sm font-semibold text-white/80">Preços por Médico</h2>
                  </div>
                  {unitDoctorPrices.length === 0 ? (
                    <div className="p-6 text-center text-white/40 text-sm">Nenhum preço de médico configurado</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Médico</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Valor/Laudo</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Vigência</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unitDoctorPrices.map(p => (
                          <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                            <td className="px-6 py-4 text-sm text-white">{p.doctor_name ?? '—'}</td>
                            <td className="px-6 py-4 text-sm font-semibold text-emerald-400">{fmt(p.price_per_report)}</td>
                            <td className="px-6 py-4 text-sm text-white/60">
                              {fmtDate(p.starts_at)} — {p.ends_at ? fmtDate(p.ends_at) : 'Atual'}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                !p.ends_at ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'
                              }`}>
                                {!p.ends_at ? 'Ativo' : 'Encerrado'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* Aba Ciclos */}
            {activeTab === 'ciclos' && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10">
                  <h2 className="text-sm font-semibold text-white/80">Histórico de Ciclos Financeiros</h2>
                </div>
                {loadingCycles ? (
                  <div className="p-8 text-center text-white/40">Carregando...</div>
                ) : !cycles || cycles.length === 0 ? (
                  <div className="p-8 text-center text-white/40">
                    <History size={32} className="mx-auto mb-2 opacity-30" />
                    <p>Nenhum ciclo registrado</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Período</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Tipo</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Laudos</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Total</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cycles.map((c: any) => (
                        <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="px-6 py-4 text-sm text-white">
                            {fmtDate(c.starts_at)} — {fmtDate(c.ends_at)}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              c.cycle_type === 'doctor' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                            }`}>
                              {c.cycle_type === 'doctor' ? 'Médico' : 'Sistema'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-white/70">{c.total_reports ?? 0}</td>
                          <td className="px-6 py-4 text-sm font-semibold text-teal-400">{fmt(c.total_amount)}</td>
                          <td className="px-6 py-4">
                            <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium w-fit ${
                              c.status === 'closed'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-amber-500/20 text-amber-400'
                            }`}>
                              {c.status === 'closed' ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                              {c.status === 'closed' ? 'Fechado' : 'Aberto'}
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
