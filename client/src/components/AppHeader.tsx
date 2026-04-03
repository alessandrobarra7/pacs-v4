import { useLocation } from "wouter";
import { LogOut, Settings } from "lucide-react";
import { trpc } from "@/lib/trpc";

const LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310419663028509564/cTdrattvNQ95XCgX9zeyNM/lauds_logo_branco_final_c960f283.png";

const HEADER_BG_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310419663028509564/cTdrattvNQ95XCgX9zeyNM/pacs-header-bg-EmQ3eizgZnzDZaH8fi95eC.webp";

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
      className="px-5 flex items-center justify-between shrink-0 relative overflow-hidden"
      style={{ height: 130 }}
    >
      {/* ── Imagem de fundo ── */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${HEADER_BG_URL})` }}
      />
      {/* ── Gradiente teal escuro por cima da imagem ── */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(90deg, rgba(10,28,38,0.92) 0%, rgba(10,40,55,0.82) 50%, rgba(10,28,38,0.88) 100%)",
        }}
      />
      {/* ── Linha de acento inferior ── */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{ height: 3, background: "linear-gradient(90deg, #0e7490, #0891b2, #06b6d4, #0891b2, #0e7490)" }}
      />

      {/* ── Conteúdo (relativo para ficar sobre o fundo) ── */}
      <div className="relative z-10 flex items-center justify-between w-full">
        {/* ── Logo clicável ── */}
        <button
          onClick={() => navigate("/pacs-query")}
          className="flex items-center gap-3 hover:opacity-90 transition-opacity focus:outline-none"
          title="Ir para listagem de exames"
        >
          <img
            src={LOGO_URL}
            alt="Lauds"
            className="object-contain drop-shadow-lg"
            style={{ height: 100 }}
          />
          <div className="hidden sm:flex flex-col">
            <span className="text-white font-semibold text-base tracking-wide leading-tight drop-shadow">
              Gestão de Laudos Radiológicos
            </span>
            <span className="text-cyan-300/80 text-xs tracking-widest uppercase mt-0.5">
              Sistema PACS
            </span>
          </div>
        </button>

        {/* Separador + seletor de unidade */}
        {unitSlot && (
          <div className="flex items-center gap-2">
            <div className="w-px h-6 bg-white/20 mx-1" />
            {unitSlot}
          </div>
        )}

        {/* ── Navegação central ── */}
        {nav && <nav className="flex items-center gap-1">{nav}</nav>}

        {/* ── Direita: slot extra + usuário + logout ── */}
        <div className="flex items-center gap-2">
          {rightSlot}
          <span className="text-white/80 text-sm drop-shadow">{user?.name || "Usuário"}</span>
          <button
            onClick={() => logoutMutation.mutate()}
            className="p-1.5 rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
