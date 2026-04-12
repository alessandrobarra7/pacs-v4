import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, User, Building2, DollarSign, FileText,
  TrendingUp, Calendar, CheckCircle, Clock, ChevronDown, ChevronUp
} from "lucide-react";

const fmt = (v: string | number | null | undefined) =>
  `R$ ${parseFloat(String(v ?? "0")).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
};

function CycleEventRow({ doctorUserId, cycleId, unitName }: { doctorUserId: number; cycleId: number; unitName: string }) {
  const [open, setOpen] = useState(false);
  const { data: events, isLoading } = trpc.billing.getDoctorCycleEventsForAdmin.useQuery(
    { doctorUserId, doctorCycleId: cycleId },
    { enabled: open }
  );

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium"
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-500" />
          {unitName}
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="p-3">
          {isLoading ? (
            <p className="text-sm text-gray-500 text-center py-2">Carregando...</p>
          ) : !events?.length ? (
            <p className="text-sm text-gray-400 text-center py-2">Nenhum laudo neste ciclo</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 font-medium">Paciente</th>
                  <th className="pb-2 font-medium">Data</th>
                  <th className="pb-2 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} className="border-b last:border-0">
                    <td className="py-2 text-gray-700">{ev.patient_name ?? "—"}</td>
                    <td className="py-2 text-gray-500">{fmtDate(ev.createdAt)}</td>
                    <td className="py-2 text-right font-medium text-green-600">{fmt(ev.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function FinanceMedicoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const doctorUserId = parseInt(id ?? "0");

  const { data: detail, isLoading: loadingDetail } = trpc.billing.getDoctorDetail.useQuery(
    { doctorUserId },
    { enabled: !!doctorUserId }
  );
  const { data: financial, isLoading: loadingFinancial } = trpc.billing.getDoctorFinancialDetail.useQuery(
    { doctorUserId },
    { enabled: !!doctorUserId }
  );

  if (loadingDetail || loadingFinancial) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-8 text-center text-gray-500">
        Médico não encontrado.
        <Button variant="link" onClick={() => navigate("/financeiro/medicos")}>Voltar</Button>
      </div>
    );
  }

  const { doctor, unitLinks, prices } = detail;
  const totalAberto = parseFloat(financial?.totalOpen ?? "0");
  const totalLaudos = (financial?.currentCycles ?? []).reduce(
    (s, r) => s + (r.summary.reports_count ?? 0), 0
  );
  const totalConfirmado = (financial?.currentCycles ?? [])
    .filter(r => r.summary.received_at)
    .reduce((s, r) => s + parseFloat(r.summary.amount_due ?? "0"), 0);

  // Agrupar ciclos abertos por unidade
  const openByUnit = (financial?.currentCycles ?? []).reduce<
    Record<number, { cycleId: number; unitName: string; amount: string; reports: number; received: boolean }>
  >((acc, r) => {
    const uid = r.summary.unit_id;
    if (!acc[uid]) {
      acc[uid] = {
        cycleId: r.summary.doctor_cycle_id,
        unitName: r.unit_name,
        amount: r.summary.amount_due ?? "0",
        reports: r.summary.reports_count ?? 0,
        received: !!r.summary.received_at,
      };
    }
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/financeiro/medicos")}
          className="flex items-center gap-2 text-gray-600"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{doctor.name}</h1>
          <p className="text-sm text-gray-500">{doctor.email ?? "Sem e-mail"}</p>
        </div>
        <Badge
          className={`ml-auto ${doctor.role === "medico" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}
        >
          {doctor.role}
        </Badge>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Saldo Aberto</p>
                <p className="text-xl font-bold text-green-600">{fmt(totalAberto)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Confirmado</p>
                <p className="text-xl font-bold text-blue-600">{fmt(totalConfirmado)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <FileText className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Laudos (ciclo)</p>
                <p className="text-xl font-bold text-gray-900">{totalLaudos}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Building2 className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Unidades Ativas</p>
                <p className="text-xl font-bold text-gray-900">{unitLinks.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Abas */}
      <Tabs defaultValue="ciclo-atual">
        <TabsList className="bg-gray-100">
          <TabsTrigger value="ciclo-atual">
            <TrendingUp className="w-4 h-4 mr-1" /> Ciclo Atual
          </TabsTrigger>
          <TabsTrigger value="precos">
            <DollarSign className="w-4 h-4 mr-1" /> Preços
          </TabsTrigger>
          <TabsTrigger value="unidades">
            <Building2 className="w-4 h-4 mr-1" /> Unidades
          </TabsTrigger>
          <TabsTrigger value="historico">
            <Calendar className="w-4 h-4 mr-1" /> Histórico
          </TabsTrigger>
        </TabsList>

        {/* Aba: Ciclo Atual */}
        <TabsContent value="ciclo-atual" className="mt-4 space-y-3">
          {Object.keys(openByUnit).length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-gray-400">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum ciclo aberto no momento</p>
              </CardContent>
            </Card>
          ) : (
            Object.values(openByUnit).map((u) => (
              <Card key={u.cycleId}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-blue-500" />
                      {u.unitName}
                    </CardTitle>
                    <Badge className={u.received ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}>
                      {u.received ? "Recebido" : "Pendente"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Laudos</p>
                      <p className="font-semibold text-gray-900">{u.reports}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Saldo</p>
                      <p className="font-semibold text-green-600">{fmt(u.amount)}</p>
                    </div>
                  </div>
                  {/* Laudos expandíveis */}
                  <CycleEventRow
                    doctorUserId={doctorUserId}
                    cycleId={u.cycleId}
                    unitName={u.unitName}
                  />
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Aba: Preços */}
        <TabsContent value="precos" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preços por Unidade</CardTitle>
            </CardHeader>
            <CardContent>
              {prices.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum preço configurado</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 font-medium">Unidade</th>
                      <th className="pb-2 font-medium text-right">Valor/Laudo</th>
                      <th className="pb-2 font-medium text-right">Vigência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prices.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-3 text-gray-700">{p.unit_name ?? `Unidade ${p.unit_id}`}</td>
                        <td className="py-3 text-right font-semibold text-green-600">{fmt(p.price_per_report)}</td>
                        <td className="py-3 text-right text-gray-500">
                          {fmtDate(p.starts_at)} — {p.ends_at ? fmtDate(p.ends_at) : "Atual"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba: Unidades */}
        <TabsContent value="unidades" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Unidades Vinculadas</CardTitle>
            </CardHeader>
            <CardContent>
              {unitLinks.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhuma unidade vinculada</p>
              ) : (
                <div className="space-y-2">
                  {unitLinks.map((u) => (
                    <div key={u.unit_id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Building2 className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">{u.unit_name ?? `Unidade ${u.unit_id}`}</p>
                        <p className="text-xs text-gray-500">ID: {u.unit_id}</p>
                      </div>
                      {/* Preço desta unidade */}
                      {(() => {
                        const p = prices.find(pr => pr.unit_id === u.unit_id);
                        return p ? (
                          <span className="ml-auto text-sm font-semibold text-green-600">{fmt(p.price_per_report)}/laudo</span>
                        ) : (
                          <span className="ml-auto text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">Sem preço</span>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba: Histórico */}
        <TabsContent value="historico" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ciclos Fechados</CardTitle>
            </CardHeader>
            <CardContent>
              {!financial?.history?.length ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum ciclo fechado</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2 font-medium">Unidade</th>
                      <th className="pb-2 font-medium">Período</th>
                      <th className="pb-2 font-medium text-right">Laudos</th>
                      <th className="pb-2 font-medium text-right">Valor</th>
                      <th className="pb-2 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financial.history.map((r) => (
                      <tr key={`${r.summary.doctor_cycle_id}-${r.summary.unit_id}`} className="border-b last:border-0">
                        <td className="py-3 text-gray-700">{r.unit_name}</td>
                        <td className="py-3 text-gray-500">
                          {fmtDate(r.cycle.starts_at)} — {fmtDate(r.cycle.ends_at)}
                        </td>
                        <td className="py-3 text-right text-gray-700">{r.summary.reports_count}</td>
                        <td className="py-3 text-right font-semibold text-gray-800">{fmt(r.summary.amount_due)}</td>
                        <td className="py-3 text-right">
                          <Badge className={r.summary.received_at ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                            {r.summary.received_at ? "Recebido" : "Fechado"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
