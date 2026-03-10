"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ShieldCheck, Wrench } from "lucide-react";
import { BrandLockup } from "@/components/brand-lockup";
import { Button } from "@/components/ui/button";
import { authStorage } from "@/lib/auth-storage";
import { cn } from "@/lib/utils";

type NavLink = {
  href: string;
  label: string;
  matchPrefix: string;
  exact?: boolean;
};

type NavGroup = {
  label: string;
  links: NavLink[];
};

const managerStandaloneLinks: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", matchPrefix: "/dashboard" },
  { href: "/projects", label: "Projetos", matchPrefix: "/projects" },
  { href: "/service-orders", label: "Ordens", matchPrefix: "/service-orders" }
];

const managerGroupedLinks: NavGroup[] = [
  {
    label: "Operacao",
    links: [
      { href: "/operacao", label: "Visao geral da operacao", matchPrefix: "/operacao" },
      { href: "/routing", label: "Roteirizacao", matchPrefix: "/routing" },
      { href: "/team-location", label: "Localizacao", matchPrefix: "/team-location" },
      { href: "/service-orders/schedule", label: "Agenda tecnica", matchPrefix: "/service-orders/schedule" },
      { href: "/checklists/templates", label: "Checklists", matchPrefix: "/checklists" },
      { href: "/inventory", label: "Estoque", matchPrefix: "/inventory" }
    ]
  },
  {
    label: "Atendimento",
    links: [
      { href: "/atendimento", label: "Visao geral de atendimento", matchPrefix: "/atendimento" },
      { href: "/crm", label: "CRM", matchPrefix: "/crm" },
      { href: "/customers", label: "Clientes", matchPrefix: "/customers" },
      { href: "/quotes", label: "Orcamentos", matchPrefix: "/quotes" },
      { href: "/desk", label: "Desk", matchPrefix: "/desk" },
      { href: "/customer-portal", label: "Central do Cliente", matchPrefix: "/customer-portal" },
      { href: "/chat", label: "Chat", matchPrefix: "/chat" },
      { href: "/feedback", label: "Satisfacao", matchPrefix: "/feedback" }
    ]
  },
  {
    label: "Financeiro",
    links: [
      { href: "/financeiro", label: "Visao geral financeira", matchPrefix: "/financeiro" },
      { href: "/expenses", label: "Km e Despesas", matchPrefix: "/expenses" },
      { href: "/reports", label: "Relatorios", matchPrefix: "/reports" }
    ]
  },
  {
    label: "Administracao",
    links: [
      { href: "/administracao", label: "Visao geral administrativa", matchPrefix: "/administracao" },
      { href: "/pops", label: "POP / FAQ", matchPrefix: "/pops" },
      { href: "/media", label: "Midia", matchPrefix: "/media" },
      { href: "/settings", label: "Configuracoes", matchPrefix: "/settings" }
    ]
  }
];

const technicianStandaloneLinks: NavLink[] = [
  {
    href: "/service-orders/schedule",
    label: "Minha Agenda",
    matchPrefix: "/service-orders/schedule"
  },
  {
    href: "/service-orders",
    label: "Minhas OS",
    matchPrefix: "/service-orders",
    exact: true
  }
];

const technicianGroupedLinks: NavGroup[] = [
  {
    label: "Execucao",
    links: [
      { href: "/team-location", label: "Localizacao", matchPrefix: "/team-location" },
      { href: "/checklists/acompanhamento", label: "Checklists", matchPrefix: "/checklists" }
    ]
  },
  {
    label: "Comunicacao",
    links: [{ href: "/chat", label: "Chat", matchPrefix: "/chat" }]
  },
  {
    label: "Apoio",
    links: [
      { href: "/expenses", label: "Km e Despesas", matchPrefix: "/expenses" },
      { href: "/pops", label: "POP / FAQ", matchPrefix: "/pops" },
      { href: "/media", label: "Midia", matchPrefix: "/media" }
    ]
  }
];

const linkClass =
  "inline-flex h-10 items-center whitespace-nowrap rounded-2xl px-3.5 text-xs font-semibold text-brand-primary transition duration-200 md:text-sm";

function isActive(pathname: string, link: NavLink) {
  if (link.exact) {
    return pathname === link.matchPrefix;
  }

  return pathname.startsWith(link.matchPrefix);
}

function StandaloneNav({
  pathname,
  links
}: {
  pathname: string;
  links: NavLink[];
}) {
  return (
    <nav className="flex shrink-0 flex-wrap items-center gap-2">
      {links.map((link) => (
        <Link
          key={link.href}
          className={cn(
            linkClass,
            isActive(pathname, link)
              ? "bg-brand-highlight shadow-[0_10px_24px_rgba(220,235,21,0.35)]"
              : "bg-white/60 hover:bg-white/90"
          )}
          href={link.href}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

function GroupedNav({
  pathname,
  groups
}: {
  pathname: string;
  groups: NavGroup[];
}) {
  return (
    <nav className="flex shrink-0 flex-wrap items-center gap-2">
      {groups.map((group) => {
        const groupActive = group.links.some((link) => isActive(pathname, link));

        return (
          <details className="relative" key={group.label}>
            <summary
              className={cn(
                linkClass,
                "list-none cursor-pointer select-none bg-white/60 hover:bg-white/90",
                groupActive && "bg-brand-highlight shadow-[0_10px_24px_rgba(220,235,21,0.35)]"
              )}
            >
              <span>{group.label}</span>
              <ChevronDown aria-hidden className="ml-1 h-3.5 w-3.5 shrink-0 opacity-70" />
            </summary>

            <div className="mt-2 grid min-w-[240px] gap-1 rounded-[24px] border border-brand-primary/10 bg-white/95 p-2 shadow-[0_24px_60px_rgba(7,56,77,0.18)] backdrop-blur md:absolute md:left-0 md:z-50 md:w-72">
              {group.links.map((link) => (
                <Link
                  key={link.href}
                  className={cn(
                    "rounded-2xl px-3 py-2 text-xs font-semibold text-brand-primary transition md:text-sm",
                    isActive(pathname, link) ? "bg-brand-highlight" : "hover:bg-brand-background-soft"
                  )}
                  href={link.href}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </details>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState("");

  useEffect(() => {
    setRole(authStorage.getUser()?.role ?? "");
  }, []);

  const isTechnician = role === "TECNICO";

  const navConfig = useMemo(
    () =>
      isTechnician
        ? {
            standalone: technicianStandaloneLinks,
            grouped: technicianGroupedLinks
          }
        : {
            standalone: managerStandaloneLinks,
            grouped: managerGroupedLinks
          },
    [isTechnician]
  );

  const handleLogout = () => {
    authStorage.logout();
    router.replace("/login");
  };

  const roleBadge = isTechnician
    ? {
        icon: Wrench,
        label: "Modo tecnico",
        detail: "Execucao em campo"
      }
    : {
        icon: ShieldCheck,
        label: "Modo gestao",
        detail: "Visao integrada VULP"
      };

  const RoleIcon = roleBadge.icon;

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-50 px-3 pt-3">
        <div className="mx-auto w-full max-w-[1600px]">
          <div className="app-surface card rounded-[28px] px-3 py-3 md:px-4">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                className="shrink-0 rounded-[22px] border border-white/70 bg-white/90 px-3 py-2 shadow-[0_16px_32px_rgba(7,56,77,0.08)]"
                href={isTechnician ? "/service-orders" : "/dashboard"}
              >
                <BrandLockup compact />
              </Link>

              <div className="flex min-w-0 flex-1 flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <StandaloneNav links={navConfig.standalone} pathname={pathname} />
                  <div className="hidden h-8 w-px rounded-full bg-brand-primary/10 xl:block" />
                  <GroupedNav groups={navConfig.grouped} pathname={pathname} />
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-brand-primary/10 bg-white/70 px-3 py-2 text-brand-primary">
                    <RoleIcon className="h-4 w-4" />
                    <div className="leading-tight">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em]">{roleBadge.label}</p>
                      <p className="text-[11px] text-slate-500">{roleBadge.detail}</p>
                    </div>
                  </div>

                  <Button className="shrink-0" variant="outline" onClick={handleLogout}>
                    Sair
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-4 pb-10 pt-5 md:px-5">{children}</main>
    </div>
  );
}
