import { Building2, Users, Stethoscope, DollarSign, Eye, Settings, Shield, PlusCircle, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface UnitSummaryPanelProps {
  unit: {
    id: number;
    name: string;
    slug?: string;
    isActive: boolean;
    address?: string | null;
    logo_url?: string | null;
  };
  totals: {
    totalUsers: number;
    responsibleCount: number;
    doctorCount: number;
    operatorCount: number;
    viewerCount: number;
    unitAdminCount: number;
  };
  onNewUser?: (unitId: number) => void;
  onEditUnit?: (unitId: number) => void;
}

const STAT_CARDS = [
  { key: "responsibleCount", label: "Resp. Financeiro", icon: DollarSign, color: "text-amber-600", bg: "bg-amber-50" },
  { key: "doctorCount", label: "Médicos", icon: Stethoscope, color: "text-blue-600", bg: "bg-blue-50" },
  { key: "operatorCount", label: "Operadores", icon: Settings, color: "text-gray-600", bg: "bg-gray-100" },
  { key: "viewerCount", label: "Visualizadores", icon: Eye, color: "text-purple-600", bg: "bg-purple-50" },
  { key: "unitAdminCount", label: "Adm. Unidade", icon: Shield, color: "text-orange-600", bg: "bg-orange-50" },
] as const;

export function UnitSummaryPanel({ unit, totals, onNewUser, onEditUnit }: UnitSummaryPanelProps) {
  return (
    <div className="flex flex-col gap-5 p-5 h-full overflow-y-auto">
      {/* Header da unidade */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
          {unit.logo_url
            ? <img src={unit.logo_url} alt={unit.name} className="w-10 h-10 object-contain rounded" />
            : <Building2 className="h-6 w-6 text-blue-600" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{unit.name}</h2>
            <Badge variant={unit.isActive ? "default" : "secondary"} className="text-xs">
              {unit.isActive ? "Ativo" : "Inativo"}
            </Badge>
          </div>
          {unit.address && (
            <p className="text-sm text-gray-500 mt-0.5 truncate">{unit.address}</p>
          )}
          {unit.slug && (
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{unit.slug}</p>
          )}
        </div>
      </div>

      {/* Total de usuários */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
        <Users className="h-5 w-5 text-gray-500" />
        <span className="text-sm text-gray-600">Total de usuários vinculados:</span>
        <span className="text-sm font-semibold text-gray-900">{totals.totalUsers}</span>
      </div>

      {/* Cards de estatísticas por papel */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Composição por papel</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STAT_CARDS.map(({ key, label, icon: Icon, color, bg }) => (
            <div key={key} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg ${bg} border border-transparent`}>
              <Icon className={`h-4 w-4 ${color} flex-shrink-0`} />
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{totals[key]}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alertas */}
      {totals.responsibleCount === 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <DollarSign className="h-4 w-4 flex-shrink-0" />
          Esta unidade não possui responsável financeiro vinculado.
        </div>
      )}
      {totals.doctorCount === 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          <Stethoscope className="h-4 w-4 flex-shrink-0" />
          Esta unidade não possui médicos vinculados.
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-gray-100">
        {onNewUser && (
          <Button size="sm" onClick={() => onNewUser(unit.id)} className="gap-1.5">
            <UserPlus className="h-4 w-4" />
            Vincular usuário
          </Button>
        )}
        {onEditUnit && (
          <Button size="sm" variant="outline" onClick={() => onEditUnit(unit.id)} className="gap-1.5">
            <PlusCircle className="h-4 w-4" />
            Editar unidade
          </Button>
        )}
      </div>
    </div>
  );
}
