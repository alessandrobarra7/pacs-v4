import { useLocation } from "wouter";
import { LogOut, Settings } from "lucide-react";
import { trpc } from "@/lib/trpc";

const LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310419663028509564/cTdrattvNQ95XCgX9zeyNM/lauds_logo_branco_final_c960f283.png";

interface AppHeaderProps {
  /** Slot de navegação central (botões de abas, etc.) */
  nav?: React.ReactNode;
  /** Slot extra à direita, antes do usuário/logout */
  rightSlot?: React.ReactNode;
  /** Seletor de unidade (admin_master) */
  unitSlot?: React.ReactNode;
}

export function AppHeader({ nav, rightSlot, unitSlot }: AppHeaderProps) {
  const [, navigate] = useLocation();
  const { data: user } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("pacs_query_results"))
        .forEach((k) => localStorage.removeItem(k));
      navigate("/login");
    },
  });

  return (
    <header
      className="px-5 flex items-center justify-between shrink-0"
      style={{ background: "#2c2420", height: 88 }}
    >
      {/* ── Logo clicável ── */}
      <button
        onClick={() => navigate("/pacs-query")}
        className="flex items-center gap-3 hover:opacity-90 transition-opacity focus:outline-none"
        title="Ir para listagem de exames"
      >
        <img
          src={LOGO_URL}
          alt="Lauds"
          className="object-contain"
          style={{ height: 84 }}
        />
        <span className="text-white/80 text-sm font-medium tracking-wide hidden sm:inline">
          Gestão de Laudos Radiológicos
        </span>
      </button>

      {/* Separador + seletor de unidade */}
      {unitSlot && (
        <>
          <div className="w-px h-6 bg-white/20 mx-1" />
          {unitSlot}
        </>
      )}

      {/* ── Navegação central ── */}
      {nav && <nav className="flex items-center gap-1">{nav}</nav>}

      {/* ── Direita: slot extra + usuário + logout ── */}
      <div className="flex items-center gap-2">
        {rightSlot}
        <span className="text-white/80 text-sm">{user?.name || "Usuário"}</span>
        <button
          onClick={() => logoutMutation.mutate()}
          className="p-1.5 rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          title="Sair"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
