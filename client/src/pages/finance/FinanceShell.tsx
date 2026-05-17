/**
 * FinanceShell — Layout wrapper do módulo financeiro simplificado
 * Sidebar com navegação por role
 * Desenvolvimento StudioBarra7
 */
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  LayoutDashboard,
  DollarSign,
  ChevronLeft,
  Building2,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const ALLOWED_ROLES = ["admin_master", "medico", "unit_admin", "responsavel_financeiro"];

type NavItem = { icon: React.ElementType; label: string; path: string; roles: string[] };

const NAV_ITEMS: NavItem[] = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    path: "/financeiro",
    roles: ["admin_master", "unit_admin"],
  },
  {
    icon: Building2,
    label: "Pagamentos",
    path: "/financeiro/pagamentos",
    roles: ["admin_master", "unit_admin"],
  },
  {
    icon: DollarSign,
    label: "Meu Financeiro",
    path: "/financeiro/meu-financeiro",
    roles: ["medico"],
  },
  {
    icon: Building2,
    label: "Minhas Unidades",
    path: "/financeiro/responsavel",
    roles: ["responsavel_financeiro"],
  },
];

export function FinanceShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user || !ALLOWED_ROLES.includes(user.role as string)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Acesso restrito.</p>
      </div>
    );
  }

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role as string));

  const Sidebar = (
    <aside className="w-56 shrink-0 flex flex-col bg-slate-900 border-r border-slate-800 min-h-screen">
      {/* Logo / voltar */}
      <div className="px-4 py-4 border-b border-slate-800">
        <Link href="/">
          <a className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm">
            <ChevronLeft className="h-4 w-4" />
            <span>Voltar ao PACS</span>
          </a>
        </Link>
        <p className="text-white font-semibold mt-3 text-base">Financeiro</p>
        <p className="text-slate-500 text-xs">StudioBarra7</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const active = location === item.path || location.startsWith(item.path + "?") || (item.path !== "/financeiro" && location.startsWith(item.path));
          return (
            <Link key={item.path} href={item.path}>
              <a
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-cyan-500/20 text-cyan-400 font-medium"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </a>
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className="px-4 py-4 border-t border-slate-800">
        <p className="text-slate-300 text-sm font-medium truncate">{user.name ?? user.username}</p>
        <p className="text-slate-500 text-xs capitalize">{user.role?.replace("_", " ")}</p>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-slate-950 text-white">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">{Sidebar}</div>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10">{Sidebar}</div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900">
          <p className="text-white font-semibold">Financeiro</p>
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
        </div>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
