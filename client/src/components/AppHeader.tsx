import { useLocation } from "wouter";
import { LogOut, Menu, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useCallback, useState } from "react";

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
  /** Texto simplificado da unidade exibido no cabeçalho móvel */
  mobileUnitLabel?: string;
}

export function AppHeader({ nav, rightSlot, unitSlot, mobileUnitLabel }: AppHeaderProps) {
  const [, navigate] = useLocation();
  const { data: user } = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const logoutMutation = trpc.auth.logout.useMutation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // ignora erro de rede — o cookie já foi limpo no servidor
    } finally {
      // Limpar cache do tRPC (auth.me) ANTES de navegar
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      // Limpar cache local de resultados PACS
      Object.keys(localStorage)
        .filter((k) => k.startsWith("pacs_query_results"))
        .forEach((k) => localStorage.removeItem(k));
      // Usar window.location para forçar reload completo da SPA
      // Isso garante que nenhum estado React residual permaneça
      window.location.href = "/login";
    }
  }, [logoutMutation, utils]);

  return (
    <header
      className="px-4 md:px-5 flex items-center justify-between shrink-0 relative overflow-visible"
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
      <div className="relative z-10 flex items-center justify-between w-full h-full">
        {/* ── Logo clicável ── */}
        <button
          onClick={() => navigate("/pacs-query")}
          className="flex items-center gap-3 hover:opacity-90 transition-opacity focus:outline-none"
          title="Ir para listagem de exames"
        >
          <img
            src={LOGO_URL}
            alt="Lauds"
            className="h-16 w-16 md:h-[100px] md:w-auto object-contain drop-shadow-lg"
          />
          <div className="hidden md:flex flex-col">
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
          <div className="hidden md:flex items-center gap-2">
            <div className="w-px h-6 bg-white/20 mx-1" />
            {unitSlot}
          </div>
        )}

        {/* ── Navegação central ── */}
        {nav && <nav className="hidden md:flex items-center gap-1">{nav}</nav>}

        {/* ── Direita: slot extra + usuário + logout ── */}
        <div className="hidden md:flex items-center gap-2">
          {rightSlot}
          <span className="text-white/80 text-sm drop-shadow">{user?.name || "Usuário"}</span>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* ── Identificação móvel, posicionada na base do cabeçalho ── */}
        <div className="md:hidden absolute bottom-6 left-0 right-0 flex items-center justify-between px-1">
          <span className="max-w-[52%] truncate text-sm font-semibold text-white/65 drop-shadow">
            {user?.name || "Usuário"}
          </span>
          <span className="max-w-[42%] truncate text-right text-sm font-semibold text-white/65 drop-shadow">
            {mobileUnitLabel || "Unidade Local"}
          </span>
        </div>

        {/* ── Menu móvel: navegação desktop fica recolhida em um painel ── */}
        {nav && (
          <button
            type="button"
            aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="md:hidden absolute right-0 top-1/2 -translate-y-[70%] inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-black/10 text-white shadow-lg backdrop-blur-sm"
          >
            {mobileMenuOpen ? <X className="h-7 w-7" /> : <Menu className="h-7 w-7" />}
          </button>
        )}
        {mobileMenuOpen && nav && (
          <div className="md:hidden absolute right-0 top-[calc(100%-1rem)] z-50 min-w-52 rounded-xl border border-white/20 bg-[#082331]/95 p-2 shadow-2xl backdrop-blur-md">
            <nav className="flex flex-col gap-1" onClick={() => setMobileMenuOpen(false)}>
              {nav}
            </nav>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
