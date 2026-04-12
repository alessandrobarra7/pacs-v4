/**
 * FinanceLayout — Layout dedicado ao módulo financeiro
 * Sidebar escura com navegação própria, separada do layout principal do PACS.
 * Roles com acesso: admin_master, medico, unit_admin, responsavel_financeiro
 * Roles SEM acesso: operador, viewer
 */
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  LayoutDashboard,
  Users,
  Building2,
  UserCheck,
  DollarSign,
  Settings,
  ChevronLeft,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const ALLOWED_ROLES = ["admin_master", "medico", "unit_admin", "responsavel_financeiro"];

type NavItem = {
  icon: React.ElementType;
  label: string;
  path: string;
  roles: string[];
};

const NAV_ITEMS: NavItem[] = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    path: "/financeiro",
    roles: ["admin_master"],
  },
  {
    icon: Users,
    label: "Médicos",
    path: "/financeiro/medicos",
    roles: ["admin_master"],
  },
  {
    icon: Building2,
    label: "Unidades",
    path: "/financeiro/unidades",
    roles: ["admin_master"],
  },
  {
    icon: UserCheck,
    label: "Responsáveis",
    path: "/financeiro/responsaveis",
    roles: ["admin_master"],
  },
  {
    icon: DollarSign,
    label: "Meu Financeiro",
    path: "/financeiro/meu",
    roles: ["medico"],
  },
  {
    icon: Settings,
    label: "Admin Financeiro",
    path: "/financeiro/admin",
    roles: ["admin_master"],
  },
];

export function FinanceLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user || !ALLOWED_ROLES.includes(user.role as string)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <DollarSign className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">Acesso restrito</p>
          <p className="text-sm text-muted-foreground mt-1">
            Você não tem permissão para acessar o módulo financeiro.
          </p>
          <Link href="/">
            <Button variant="outline" className="mt-4">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Voltar ao sistema
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const visibleItems = NAV_ITEMS.filter((item) =>
    item.roles.includes(user.role as string)
  );

  const initials = (user.name ?? user.username ?? "U")
    .split(" ")
    .slice(0, 2)
    .map((w: string) => w[0])
    .join("")
    .toUpperCase();

  const isActive = (path: string) => {
    if (path === "/financeiro") return location === "/financeiro";
    return location.startsWith(path);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo / Título */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
            <DollarSign className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">PACS Portal</p>
            <p className="text-white/50 text-xs">Sistema Radiológico</p>
          </div>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link key={item.path} href={item.path}>
              <a
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
                onClick={() => setMobileOpen(false)}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </a>
            </Link>
          );
        })}
      </nav>

      {/* Voltar ao PACS */}
      <div className="px-3 pb-3 border-t border-white/10 pt-3">
        <Link href="/">
          <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/50 hover:bg-white/10 hover:text-white transition-all cursor-pointer">
            <ChevronLeft className="h-4 w-4 shrink-0" />
            Voltar ao PACS
          </a>
        </Link>
      </div>

      {/* Usuário */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-blue-600 text-white text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-white text-xs font-medium truncate">
              {user.name ?? user.username}
            </p>
            <p className="text-white/40 text-xs truncate capitalize">
              {user.role === "admin_master" ? "Admin Master" : user.role}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#f6f8fb] dark:bg-background overflow-hidden">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-[200px] shrink-0 flex-col bg-[#1a2332] h-full">
        <SidebarContent />
      </aside>

      {/* Sidebar mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-[200px] bg-[#1a2332] flex flex-col">
            <div className="flex justify-end p-3">
              <Button
                variant="ghost"
                size="icon"
                className="text-white/70 hover:text-white hover:bg-white/10"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Conteúdo principal */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header mobile */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-[#1a2332] text-white shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="text-white/70 hover:text-white hover:bg-white/10"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <p className="font-semibold text-sm">Módulo Financeiro</p>
          <div className="w-9" />
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
