import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft, Building2, Users, DollarSign, History, AlertCircle, CheckCircle2, Clock, Calendar, Award, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'medicos' | 'precos' | 'ciclos' | 'escala' | 'remuneracao'>('medicos');

  // Escala
  const [editingScale, setEditingScale] = useState<number | null>(null);
  const [scaleForm, setScaleForm] = useState({ doctor_id: 0, days: [] as string[], shift: 'manha' as string, max_reports: '' });

  // Remuneração
  const [editingComp, setEditingComp] = useState<number | null>(null);
  const [compForm, setCompForm] = useState({ doctor_id: 0, rule_type: 'fixed_per_report' as string, value: '', description: '' });

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

  const { data: scales, refetch: refetchScales } = trpc.finance.listDoctorScales.useQuery(
    { unitId },
    { enabled: !!unitId && activeTab === 'escala' }
  );

  const { data: compensations, refetch: refetchComps } = trpc.finance.listCompensationRules.useQuery(
    { unitId },
    { enabled: !!unitId && activeTab === 'remuneracao' }
  );

  const saveScale = trpc.finance.upsertDoctorScale.useMutation({
    onSuccess: () => { refetchScales(); setEditingScale(null); },
  });

  const deleteScale = trpc.finance.deleteDoctorScale.useMutation({
    onSuccess: () => refetchScales(),
  });

  const saveComp = trpc.finance.createCompensationRule.useMutation({
    onSuccess: () => { refetchComps(); setEditingComp(null); },
  });

  const deleteComp = trpc.finance.deleteCompensationRule.useMutation({
    onSuccess: () => refetchComps(),
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
    { key: 'escala' as const, label: 'Escala', icon: Calendar },
    { key: 'remuneracao' as const, label: 'Remuneração', icon: Award },
    { key: 'ciclos' as const, label: 'Ciclos', icon: History },
  ];

  const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const SHIFTS = [{ v: 'manha', l: 'Manhã' }, { v: 'tarde', l: 'Tarde' }, { v: 'noite', l: 'Noite' }, { v: 'integral', l: 'Integral' }];
  const RULE_TYPES = [{ v: 'fixed_per_report', l: 'Fixo por laudo' }, { v: 'percentage', l: 'Percentual' }, { v: 'flat_monthly', l: 'Fixo mensal' }];

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

            {/* Aba Escala */}
            {activeTab === 'escala' && (
              <div className="space-y-4">
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-white/80">Escala Semanal dos Médicos</h2>
                    <button onClick={() => { setEditingScale(-1); setScaleForm({ doctor_id: doctors?.[0]?.id ?? 0, days: [], shift: 'manha', max_reports: '' }); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-teal-500/20 text-teal-400 rounded-lg hover:bg-teal-500/30 transition-colors">
                      <Plus size={12} />Nova Escala
                    </button>
                  </div>
                  {editingScale === -1 && (
                    <div className="bg-white/5 rounded-lg p-4 mb-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-white/40 mb-1 block">Médico</label>
                          <select value={scaleForm.doctor_id} onChange={e => setScaleForm(f => ({ ...f, doctor_id: Number(e.target.value) }))}
                            className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-sm text-white">
                            {(doctors ?? []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-white/40 mb-1 block">Turno</label>
                          <select value={scaleForm.shift} onChange={e => setScaleForm(f => ({ ...f, shift: e.target.value }))}
                            className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-sm text-white">
                            {SHIFTS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-white/40 mb-1 block">Dias da semana</label>
                        <div className="flex gap-1">
                          {DAYS.map((d, i) => (
                            <button key={i} type="button"
                              onClick={() => setScaleForm(f => ({ ...f, days: f.days.includes(String(i)) ? f.days.filter(x => x !== String(i)) : [...f.days, String(i)] }))}
                              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                scaleForm.days.includes(String(i)) ? 'bg-teal-500 text-white' : 'bg-white/10 text-white/50 hover:bg-white/20'
                              }`}>{d}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-white/40 mb-1 block">Máx. laudos/dia (opcional)</label>
                        <input value={scaleForm.max_reports} onChange={e => setScaleForm(f => ({ ...f, max_reports: e.target.value }))}
                          placeholder="Ex: 20" className="w-32 rounded bg-white/10 border border-white/20 px-2 py-1.5 text-sm text-white" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveScale.mutate({ unitId, doctorUserId: scaleForm.doctor_id, daysOfWeek: scaleForm.days.map(Number), notes: scaleForm.shift + (scaleForm.max_reports ? ` max:${scaleForm.max_reports}` : ''), startsAt: new Date().toISOString() })}
                          disabled={saveScale.isPending || scaleForm.days.length === 0}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-teal-500 text-white rounded hover:bg-teal-600 disabled:opacity-50">
                          <Check size={12} />Salvar
                        </button>
                        <button onClick={() => setEditingScale(null)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-white/10 text-white/60 rounded hover:bg-white/20">
                          <X size={12} />Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  {!scales || scales.length === 0 ? (
                    <div className="text-center py-8 text-white/30">
                      <Calendar size={32} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhuma escala configurada</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {scales.map((s: any) => (
                        <div key={s.id} className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-white">{s.doctor_name ?? '—'}</p>
                            <p className="text-xs text-white/40">{SHIFTS.find(x => x.v === s.shift)?.l ?? s.shift} · {(s.week_days ?? []).map((d: number) => DAYS[d]).join(', ')}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            {s.max_reports_per_day && <span className="text-xs text-white/40">Máx {s.max_reports_per_day}/dia</span>}
                            <button onClick={() => deleteScale.mutate({ id: s.id })} disabled={deleteScale.isPending}
                              className="p-1.5 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Aba Remuneração */}
            {activeTab === 'remuneracao' && (
              <div className="space-y-4">
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-white/80">Regras de Remuneração Médica</h2>
                    <button onClick={() => { setEditingComp(-1); setCompForm({ doctor_id: doctors?.[0]?.id ?? 0, rule_type: 'fixed_per_report', value: '', description: '' }); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-teal-500/20 text-teal-400 rounded-lg hover:bg-teal-500/30 transition-colors">
                      <Plus size={12} />Nova Regra
                    </button>
                  </div>
                  {editingComp === -1 && (
                    <div className="bg-white/5 rounded-lg p-4 mb-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-white/40 mb-1 block">Médico</label>
                          <select value={compForm.doctor_id} onChange={e => setCompForm(f => ({ ...f, doctor_id: Number(e.target.value) }))}
                            className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-sm text-white">
                            {(doctors ?? []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-white/40 mb-1 block">Tipo de Regra</label>
                          <select value={compForm.rule_type} onChange={e => setCompForm(f => ({ ...f, rule_type: e.target.value }))}
                            className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-sm text-white">
                            {RULE_TYPES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-white/40 mb-1 block">{compForm.rule_type === 'percentage' ? 'Percentual (%)' : 'Valor (R$)'}</label>
                          <input value={compForm.value} onChange={e => setCompForm(f => ({ ...f, value: e.target.value }))}
                            placeholder={compForm.rule_type === 'percentage' ? 'Ex: 15' : 'Ex: 6.50'}
                            className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-sm text-white" />
                        </div>
                        <div>
                          <label className="text-xs text-white/40 mb-1 block">Descrição (opcional)</label>
                          <input value={compForm.description} onChange={e => setCompForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Ex: Plantão noturno"
                            className="w-full rounded bg-white/10 border border-white/20 px-2 py-1.5 text-sm text-white" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveComp.mutate({ unitId, doctorUserId: compForm.doctor_id, compensationType: compForm.rule_type === 'fixed_per_report' ? 'per_report' : compForm.rule_type === 'percentage' ? 'per_report' : 'other', amount: compForm.value, startsAt: new Date().toISOString(), notes: compForm.description || undefined })}
                          disabled={saveComp.isPending || !compForm.value}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-teal-500 text-white rounded hover:bg-teal-600 disabled:opacity-50">
                          <Check size={12} />Salvar
                        </button>
                        <button onClick={() => setEditingComp(null)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-white/10 text-white/60 rounded hover:bg-white/20">
                          <X size={12} />Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  {!compensations || compensations.length === 0 ? (
                    <div className="text-center py-8 text-white/30">
                      <Award size={32} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhuma regra de remuneração configurada</p>
                      <p className="text-xs mt-1 text-white/20">As regras complementam o preço por laudo configurado na aba Preços</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {compensations.map((c: any) => (
                        <div key={c.id} className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-white">{c.doctor_name ?? '—'}</p>
                            <p className="text-xs text-white/40">{RULE_TYPES.find(r => r.v === c.rule_type)?.l ?? c.rule_type}{c.description ? ` · ${c.description}` : ''}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-emerald-400">
                              {c.rule_type === 'percentage' ? `${c.value}%` : `R$ ${parseFloat(c.value).toFixed(2)}`}
                            </span>
                            <button onClick={() => deleteComp.mutate({ id: c.id })} disabled={deleteComp.isPending}
                              className="p-1.5 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
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
