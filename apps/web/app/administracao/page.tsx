"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  FileText,
  Image,
  RefreshCcw,
  Settings2,
  ShieldCheck,
  Users
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

type PopDocument = {
  id: string;
  title: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  category: string;
};

type MediaAsset = {
  id: string;
  type: "PHOTO" | "PDF" | "THUMBNAIL" | "SIGNATURE" | "OTHER";
  title: string;
};

type AppSettings = {
  id: string;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpFrom?: string | null;
  logoAssetId?: string | null;
  categories?: string[] | null;
  tags?: string[] | null;
};

type UserRow = {
  id: string;
  role: "SUPERADMIN" | "ADMIN" | "SUPERVISOR" | "TECNICO" | "LEITOR";
};

const COLORS = ["#0d5f80", "#14b8a6", "#a855f7", "#f59e0b", "#ef4444", "#64748b", "#22c55e"];

const pieValueLabel = ({ value }: { value?: number }) =>
  typeof value === "number" && value > 0 ? `${value}` : "";

const yAxisWithHeadroom = (dataMax: number) => {
  const safeMax = Number.isFinite(dataMax) ? dataMax : 0;
  if (safeMax <= 0) {
    return 1;
  }
  return Math.ceil(safeMax + Math.max(1, safeMax * 0.2));
};

export default function AdministracaoDashboardPage() {
  const router = useRouter();

  const popsQuery = useQuery({
    queryKey: ["administracao-dashboard-pops"],
    queryFn: () => api.get<PopDocument[]>("/pops")
  });

  const mediaQuery = useQuery({
    queryKey: ["administracao-dashboard-media"],
    queryFn: () => api.get<MediaAsset[]>("/media")
  });

  const settingsQuery = useQuery({
    queryKey: ["administracao-dashboard-settings"],
    queryFn: () => api.get<AppSettings>("/settings")
  });

  const usersQuery = useQuery({
    queryKey: ["administracao-dashboard-users"],
    queryFn: () => api.get<UserRow[]>("/users")
  });

  const pops = popsQuery.data ?? [];
  const mediaAssets = mediaQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const settings = settingsQuery.data;

  const popStatusChart = useMemo(() => {
    const map = {
      DRAFT: 0,
      ACTIVE: 0,
      ARCHIVED: 0
    };
    for (const item of pops) {
      map[item.status] += 1;
    }
    return [
      { name: "Rascunho", total: map.DRAFT },
      { name: "Ativo", total: map.ACTIVE },
      { name: "Arquivado", total: map.ARCHIVED }
    ];
  }, [pops]);

  const mediaTypeChart = useMemo(() => {
    const map: Record<MediaAsset["type"], number> = {
      PHOTO: 0,
      PDF: 0,
      THUMBNAIL: 0,
      SIGNATURE: 0,
      OTHER: 0
    };
    for (const item of mediaAssets) {
      map[item.type] += 1;
    }
    return [
      { name: "Fotos", value: map.PHOTO },
      { name: "PDF", value: map.PDF },
      { name: "Thumb", value: map.THUMBNAIL },
      { name: "Assinaturas", value: map.SIGNATURE },
      { name: "Outros", value: map.OTHER }
    ];
  }, [mediaAssets]);

  const usersByRoleChart = useMemo(() => {
    const map: Record<UserRow["role"], number> = {
      SUPERADMIN: 0,
      ADMIN: 0,
      SUPERVISOR: 0,
      TECNICO: 0,
      LEITOR: 0
    };
    for (const user of users) {
      map[user.role] += 1;
    }
    return [
      { role: "Superadmin", total: map.SUPERADMIN },
      { role: "Admin", total: map.ADMIN },
      { role: "Supervisor", total: map.SUPERVISOR },
      { role: "Tecnico", total: map.TECNICO },
      { role: "Leitor", total: map.LEITOR }
    ];
  }, [users]);

  const refreshAll = async () => {
    await Promise.all([popsQuery.refetch(), mediaQuery.refetch(), settingsQuery.refetch(), usersQuery.refetch()]);
  };

  return (
    <RequireAuth>
      <AppShell>
        <section className="mb-5 rounded-3xl border border-brand-primary/20 bg-white p-5 shadow-[0_12px_30px_rgba(7,56,77,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-brand-highlight/70 px-3 py-1 text-xs font-black uppercase tracking-wide text-brand-primary">
                <ShieldCheck className="h-3.5 w-3.5" />
                Dashboard administrativo
              </p>
              <h1 className="mt-2 text-2xl font-black text-brand-primary md:text-3xl">Governanca, conteudo e configuracoes</h1>
              <p className="text-sm text-slate-600">
                Controle central de POPs, midia, usuarios e parametros da plataforma.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => router.push("/settings")} type="button">
                Configuracoes
              </Button>
              <Button onClick={refreshAll} type="button" variant="outline">
                <RefreshCcw className={`mr-1 h-4 w-4 ${popsQuery.isRefetching || mediaQuery.isRefetching ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
          </div>
        </section>

        <section className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <article className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">POPs</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{pops.length}</p>
          </article>
          <article className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">POPs ativos</p>
            <p className="mt-2 text-2xl font-black text-emerald-700">{popStatusChart[1]?.total ?? 0}</p>
          </article>
          <article className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Arquivos de midia</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{mediaAssets.length}</p>
          </article>
          <article className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Usuarios</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{users.length}</p>
          </article>
          <article className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Tecnicos</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{usersByRoleChart.find((item) => item.role === "Tecnico")?.total ?? 0}</p>
          </article>
          <article className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Categorias de taxonomia</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{settings?.categories?.length ?? 0}</p>
          </article>
        </section>

        <section className="mb-5 grid gap-3 xl:grid-cols-3">
          <article className="card p-4">
            <h2 className="mb-3 text-sm font-bold uppercase text-brand-primary">Status dos POPs</h2>
            <div className="h-72">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={popStatusChart} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} domain={[0, yAxisWithHeadroom]} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#0d5f80" radius={[8, 8, 0, 0]}>
                    <LabelList dataKey="total" fill="#07384D" fontSize={12} fontWeight={700} position="top" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="card p-4">
            <h2 className="mb-3 text-sm font-bold uppercase text-brand-primary">Tipos de midia</h2>
            <div className="h-72">
              <ResponsiveContainer height="100%" width="100%">
                <PieChart>
                  <Pie
                    data={mediaTypeChart}
                    dataKey="value"
                    innerRadius={62}
                    label={pieValueLabel}
                    labelLine={false}
                    nameKey="name"
                    outerRadius={95}
                  >
                    {mediaTypeChart.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
              {mediaTypeChart.map((entry, index) => {
                const color = COLORS[index % COLORS.length];
                return (
                  <span className="inline-flex items-center gap-1" key={entry.name} style={{ color }}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    {entry.name}
                  </span>
                );
              })}
            </div>
          </article>

          <article className="card p-4">
            <h2 className="mb-3 text-sm font-bold uppercase text-brand-primary">Usuarios por perfil</h2>
            <div className="h-72">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={usersByRoleChart} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="role" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} domain={[0, yAxisWithHeadroom]} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#14b8a6" radius={[8, 8, 0, 0]}>
                    <LabelList dataKey="total" fill="#07384D" fontSize={12} fontWeight={700} position="top" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <article className="card p-4">
            <h2 className="mb-3 text-sm font-bold uppercase text-brand-primary">Checklist administrativo da plataforma</h2>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase text-slate-500">SMTP configurado</p>
                <p className="text-lg font-black text-brand-primary">{settings?.smtpHost ? "Sim" : "Nao"}</p>
                <p className="text-xs text-slate-600">{settings?.smtpFrom ?? "Sem remetente definido"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase text-slate-500">Logo corporativo</p>
                <p className="text-lg font-black text-brand-primary">{settings?.logoAssetId ? "Ativo" : "Padrao"}</p>
                <p className="text-xs text-slate-600">Tokens e identidade visual da plataforma.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase text-slate-500">Tags cadastradas</p>
                <p className="text-lg font-black text-brand-primary">{settings?.tags?.length ?? 0}</p>
                <p className="text-xs text-slate-600">Tags usadas para buscas e organizacao.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase text-slate-500">POPs revisao pendente</p>
                <p className="text-lg font-black text-amber-700">{popStatusChart[0]?.total ?? 0}</p>
                <p className="text-xs text-slate-600">Documentos em rascunho aguardando publicacao.</p>
              </div>
            </div>
          </article>

          <aside className="card p-4">
            <h2 className="mb-3 text-sm font-bold uppercase text-brand-primary">Atalhos administrativos</h2>
            <div className="space-y-2">
              <Button className="w-full justify-start" onClick={() => router.push("/pops")} type="button" variant="outline">
                <FileText className="mr-2 h-4 w-4" />
                POP / FAQ
              </Button>
              <Button className="w-full justify-start" onClick={() => router.push("/media")} type="button" variant="outline">
                <Image className="mr-2 h-4 w-4" />
                Midia e anexos
              </Button>
              <Button className="w-full justify-start" onClick={() => router.push("/settings")} type="button" variant="outline">
                <Settings2 className="mr-2 h-4 w-4" />
                Configuracoes gerais
              </Button>
              <Button className="w-full justify-start" onClick={() => router.push("/reports")} type="button" variant="outline">
                <ShieldCheck className="mr-2 h-4 w-4" />
                Relatorios
              </Button>
              <Button className="w-full justify-start" onClick={() => router.push("/customers")} type="button" variant="outline">
                <Users className="mr-2 h-4 w-4" />
                Clientes e cadastros
              </Button>
            </div>
          </aside>
        </section>
      </AppShell>
    </RequireAuth>
  );
}
