/**
 * FinanceShell — Layout wrapper do módulo financeiro simplificado
 * Sidebar com navegação por role
 * Desenvolvimento StudioBarra7
 */
import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  LayoutDashboard,
  DollarSign,
  ChevronLeft,
  Building2,
  Menu,
  X,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import "./finance-theme.css";

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
  {
    icon: Settings,
    label: "Configuração",
    path: "/financeiro/configuracao",
    roles: ["admin_master", "responsavel_financeiro"],
  },
];

export function FinanceShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user || !ALLOWED_ROLES.includes(user.role as string)) {
    return (
      <div className="finance-theme min-h-screen flex items-center justify-center">
        <p className="text-[var(--fin-muted)]">Acesso restrito.</p>
      </div>
    );
  }

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role as string));

  const Sidebar = (
    <aside className="w-56 shrink-0 flex flex-col bg-[var(--fin-side)] border-r border-[var(--fin-line)] min-h-screen">
      {/* Logo / voltar */}
      <div className="px-4 py-4 border-b border-[var(--fin-line)]">
        <Link href="/">
          <a className="flex items-center gap-2 text-[var(--fin-muted)] hover:text-[var(--fin-text)] transition-colors text-sm">
            <ChevronLeft className="h-4 w-4" />
            <span>Voltar ao PACS</span>
          </a>
        </Link>
        <p className="fin-head text-[var(--fin-text)] font-semibold mt-3 text-base">Financeiro</p>
        <p className="text-[var(--fin-muted-dim)] text-xs">StudioBarra7</p>
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
                    ? "bg-[var(--fin-accent-wash)] text-[var(--fin-accent-soft)] font-medium"
                    : "text-[var(--fin-muted)] hover:text-[var(--fin-text)] hover:bg-[var(--fin-panel-2)]"
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
      <div className="px-4 py-4 border-t border-[var(--fin-line)]">
        <p className="text-[var(--fin-text)] text-sm font-medium truncate">{user.name ?? user.username}</p>
        <p className="text-[var(--fin-muted-dim)] text-xs capitalize">{user.role?.replace("_", " ")}</p>
      </div>
    </aside>
  );

  return (
    <div className="finance-theme flex min-h-screen">
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
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[var(--fin-line)] bg-[var(--fin-side)]">
          <p className="fin-head text-[var(--fin-text)] font-semibold">Financeiro</p>
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
        </div>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
