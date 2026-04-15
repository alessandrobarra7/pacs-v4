/**
 * FinanceShell — wrapper para todas as páginas do módulo financeiro.
 * Usa o mesmo AppHeader do PACS principal com sub-navegação financeira.
 */
import { useLocation } from "wouter";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/_core/hooks/useAuth";
import { canAccessAdmin } from "../../../shared/permissions";
import { DollarSign, Settings } from "lucide-react";

interface FinanceShellProps {
  children: React.ReactNode;
  /** Qual item da sub-navegação está ativo */
  activeSection: "dashboard" | "overview" | "contas-receber" | "medicos" | "unidades" | "responsaveis" | "admin" | "meu-financeiro";
}

/** Navegação principal do header (igual ao PacsQueryPage) */
function MainNav() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const role = (user?.role ?? "") as string;
  const isAdmin = role === "admin_master";
  const isMedico = role === "medico";
  const isUnitAdmin = role === "unit_admin" || role === "responsavel_financeiro";

  return (
    <>
      <button
        onClick={() => navigate("/pacs-query")}
        className="px-4 py-1.5 rounded text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
      >
        Estudos
      </button>
      {canAccessAdmin(role as any) && (
        <button
          onClick={() => navigate("/admin")}
          className="px-4 py-1.5 rounded text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          Administração
        </button>
      )}
      {isAdmin && (
        <button
          onClick={() => navigate("/financeiro")}
          className="px-4 py-1.5 rounded text-sm font-semibold bg-amber-700 text-white flex items-center gap-1.5"
        >
          <DollarSign className="h-3.5 w-3.5" />
          Financeiro
        </button>
      )}
      {isUnitAdmin && (
        <button
          onClick={() => navigate("/financeiro/unidades")}
          className="px-4 py-1.5 rounded text-sm font-semibold bg-amber-700 text-white flex items-center gap-1.5"
        >
          <DollarSign className="h-3.5 w-3.5" />
          Financeiro
        </button>
      )}
      {isMedico && (
        <button
          onClick={() => navigate("/financeiro/meu-financeiro")}
          className="px-4 py-1.5 rounded text-sm font-semibold bg-amber-700 text-white flex items-center gap-1.5"
        >
          <DollarSign className="h-3.5 w-3.5" />
          Meu Financeiro
        </button>
      )}
    </>
  );
}

/** Sub-navegação financeira abaixo do header */
function FinanceSubNav({ active }: { active: string }) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const role = (user?.role ?? "") as string;
  const isAdmin = role === "admin_master";
  const isMedico = role === "medico";
  const isUnitAdmin = role === "unit_admin" || role === "responsavel_financeiro";

  const adminItems = [
    { key: "dashboard", label: "Dashboard", path: "/financeiro" },
    { key: "overview", label: "Receita por Unidade", path: "/financeiro/overview" },
    { key: "medicos", label: "Médicos", path: "/financeiro/medicos" },
    { key: "unidades", label: "Unidades", path: "/financeiro/unidades" },
    { key: "responsaveis", label: "Responsáveis", path: "/financeiro/responsaveis" },
    { key: "contas-receber", label: "Contas a Receber", path: "/financeiro/contas-receber" },
    { key: "admin", label: "Admin Financeiro", path: "/financeiro/admin" },
  ];

  const medicoItems = [
    { key: "meu-financeiro", label: "Meu Financeiro", path: "/financeiro/meu-financeiro" },
  ];

  // C1: unit_admin e responsavel_financeiro não têm acesso ao /financeiro/admin (403)
  // Redirecionar para as páginas que eles podem acessar
  const unitAdminItems = [
    { key: "unidades", label: "Unidades", path: "/financeiro/unidades" },
    { key: "medicos", label: "Médicos", path: "/financeiro/medicos" },
  ];

  const items = isAdmin ? adminItems : isMedico ? medicoItems : isUnitAdmin ? unitAdminItems : [];

  if (items.length === 0) return null;

  return (
    <div
      className="flex items-center gap-1 px-6 py-2 shrink-0"
      style={{ background: "rgba(10,28,38,0.85)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => navigate(item.path)}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            active === item.key
              ? "bg-cyan-700/70 text-white"
              : "text-white/60 hover:text-white hover:bg-white/10"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function FinanceShell({ children, activeSection }: FinanceShellProps) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a1a24" }}>
      <AppHeader nav={<MainNav />} />
      <FinanceSubNav active={activeSection} />
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}
