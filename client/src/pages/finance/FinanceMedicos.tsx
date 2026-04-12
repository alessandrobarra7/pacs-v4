import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { FinanceShell } from "@/components/FinanceShell";
import { trpc } from "@/lib/trpc";
import { Users, Activity, Building2, Search, ChevronRight } from "lucide-react";

function fmtBRL(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type DoctorUser = {
  id: number; name: string | null; username: string;
  email: string | null; role: string; isActive: boolean;
};
type DoctorPrice = {
  id: number; financial_responsible_id: number; unit_id: number;
  doctor_user_id: number; price_per_report: string;
  starts_at: Date | string; ends_at: Date | string | null;
};

export default function FinanceMedicos() {
  const [search, setSearch] = useState("");
  const [, navigate] = useLocation();

  const { data: usersData, isLoading: loadingUsers } = trpc.admin.listUsers.useQuery();
  const { data: pricesData, isLoading: loadingPrices } = trpc.billing.listAllDoctorPrices.useQuery();

  const users = (usersData ?? []) as DoctorUser[];
  const prices = (pricesData ?? []) as DoctorPrice[];

  const doctors = users.filter((u) => u.role === "medico");
  const activeDoctors = doctors.filter((d) => d.isActive).length;
  const activeLinks = prices.filter((p) => !p.ends_at).length;

  const pricesByDoctor = useMemo(() => {
    const map = new Map<number, DoctorPrice[]>();
    for (const p of prices) {
      const arr = map.get(p.doctor_user_id) ?? [];
      arr.push(p);
      map.set(p.doctor_user_id, arr);
    }
    return map;
  }, [prices]);

  const filtered = doctors.filter((d) => {
    const q = search.toLowerCase();
    return (d.name ?? "").toLowerCase().includes(q) ||
      d.username.toLowerCase().includes(q) ||
      (d.email ?? "").toLowerCase().includes(q);
  });

  const isLoading = loadingUsers || loadingPrices;

  return (
    <FinanceShell activeSection="medicos">
      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Título */}
        <div>
          <h1 className="text-2xl font-bold text-white">Médicos</h1>
          <p className="text-slate-400 text-sm mt-0.5">Cadastro de médicos e vínculos com unidades</p>
        </div>

        {/* Cards de métricas */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Médicos", value: doctors.length, icon: Users, color: "text-cyan-400", border: "border-cyan-400/20" },
            { label: "Ativos", value: activeDoctors, icon: Activity, color: "text-emerald-400", border: "border-emerald-400/20" },
            { label: "Vínculos Ativos", value: activeLinks, icon: Building2, color: "text-amber-400", border: "border-amber-400/20" },
          ].map((card) => (
            <div key={card.label} className={`rounded-xl border ${card.border} bg-slate-800/50 p-4`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-xs uppercase tracking-wide">{card.label}</span>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
              {isLoading ? (
                <div className="h-7 w-12 bg-slate-700 rounded animate-pulse" />
              ) : (
                <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              )}
            </div>
          ))}
        </div>

        {/* Tabela */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
          {/* Busca */}
          <div className="p-4 border-b border-slate-700/50">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome ou e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>

          {/* Cabeçalho */}
          <div className="grid grid-cols-12 px-4 py-2.5 text-xs font-medium text-slate-400 uppercase tracking-wide border-b border-slate-700/30 bg-slate-900/30">
            <div className="col-span-4">Médico</div>
            <div className="col-span-2 hidden sm:block">E-mail</div>
            <div className="col-span-2 text-center">Unidades</div>
            <div className="col-span-2">Faixa de Preço</div>
            <div className="col-span-1 text-center">Status</div>
            <div className="col-span-1"></div>
          </div>

          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 bg-slate-700/30 rounded animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="h-8 w-8 mx-auto text-slate-600 mb-2" />
              <p className="text-slate-500 text-sm">Nenhum médico encontrado.</p>
            </div>
          ) : (
            filtered.map((doctor) => {
              const doctorPrices = pricesByDoctor.get(doctor.id) ?? [];
              const activePrices = doctorPrices.filter((p) => !p.ends_at);
              const priceValues = activePrices.map((p) => parseFloat(p.price_per_report));
              const minPrice = priceValues.length > 0 ? Math.min(...priceValues) : null;
              const maxPrice = priceValues.length > 0 ? Math.max(...priceValues) : null;
              const initials = (doctor.name ?? doctor.username).split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

              return (
                <button
                  key={doctor.id}
                  onClick={() => navigate(`/financeiro/medicos/${doctor.id}`)}
                  className="w-full grid grid-cols-12 px-4 py-3.5 border-b border-slate-700/20 hover:bg-slate-700/30 transition-colors text-left items-center group"
                >
                  <div className="col-span-4 flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-cyan-700/40 flex items-center justify-center shrink-0 text-cyan-300 text-xs font-bold">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{doctor.name ?? doctor.username}</p>
                      <p className="text-xs text-slate-500 truncate">{doctor.username}</p>
                    </div>
                  </div>
                  <div className="col-span-2 hidden sm:block">
                    <span className="text-xs text-slate-400">{doctor.email ?? "—"}</span>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className="text-sm text-slate-300">{activePrices.length}</span>
                    <span className="text-xs text-slate-500 ml-1">{activePrices.length === 1 ? "ativa" : "ativas"}</span>
                  </div>
                  <div className="col-span-2">
                    {minPrice === null ? (
                      <span className="text-slate-500 text-xs">—</span>
                    ) : minPrice === maxPrice ? (
                      <span className="text-sm font-medium text-emerald-400">{fmtBRL(minPrice)}</span>
                    ) : (
                      <span className="text-sm font-medium text-emerald-400">{fmtBRL(minPrice)} – {fmtBRL(maxPrice)}</span>
                    )}
                  </div>
                  <div className="col-span-1 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                      doctor.isActive ? "bg-emerald-400/10 text-emerald-400" : "bg-slate-600/40 text-slate-400"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${doctor.isActive ? "bg-emerald-400" : "bg-slate-500"}`} />
                      {doctor.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </FinanceShell>
  );
}
