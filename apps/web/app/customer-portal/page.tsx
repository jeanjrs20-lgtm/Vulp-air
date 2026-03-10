"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { KeyRound, Link2, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type ServiceOrderOptionsPayload = {
  customers: Array<{ id: string; name: string }>;
};

type PortalAccess = {
  id: string;
  label?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
  customer: { id: string; name: string };
  createdBy?: { id: string; name: string; role: string } | null;
  isRevoked: boolean;
  isExpired: boolean;
};

type PortalAccessCreatePayload = {
  access: PortalAccess;
  token: string;
  portalUrl: string;
};

const toDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "-";

export default function CustomerPortalPage() {
  const queryClient = useQueryClient();

  const [customerId, setCustomerId] = useState("");
  const [label, setLabel] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [latestLink, setLatestLink] = useState<PortalAccessCreatePayload | null>(null);

  const optionsQuery = useQuery({
    queryKey: ["customer-portal-options"],
    queryFn: () => api.get<ServiceOrderOptionsPayload>("/service-orders/options")
  });

  const accessQuery = useQuery({
    queryKey: ["customer-portal-access"],
    queryFn: () => api.get<PortalAccess[]>("/customer-portal/access")
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<PortalAccessCreatePayload>("/customer-portal/access", {
        customerId,
        label: label.trim() || undefined,
        expiresInDays: expiresInDays.trim() ? Number(expiresInDays) : undefined
      }),
    onSuccess: (payload) => {
      setLatestLink(payload);
      setLabel("");
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ["customer-portal-access"] });
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/customer-portal/access/${id}/revoke`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customer-portal-access"] }),
    onError: (error) => setErrorMsg(error.message)
  });

  const customers = useMemo(() => optionsQuery.data?.customers ?? [], [optionsQuery.data?.customers]);
  const accesses = accessQuery.data ?? [];

  return (
    <RequireAuth>
      <AppShell>
        <section className="mb-5 rounded-3xl border border-brand-primary/15 bg-white p-4 shadow-[0_10px_25px_rgba(7,56,77,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-brand-highlight/70 px-3 py-1 text-xs font-black uppercase tracking-wide text-brand-primary">
                <MonitorSmartphone className="h-3.5 w-3.5" />
                Central do Cliente
              </p>
              <h1 className="mt-2 text-2xl font-black text-brand-primary">Portal externo por cliente</h1>
              <p className="text-sm text-slate-600">
                Gere links seguros para consulta de tickets, agendamentos, execucao da OS e faturamento.
              </p>
            </div>
            <div className="rounded-2xl border border-brand-primary/15 bg-white px-3 py-2 text-xs text-slate-600">
              <ShieldCheck className="mr-1 inline h-4 w-4 text-brand-primary" />
              Link com token revogavel
            </div>
          </div>
        </section>

        <section className="card mb-4 p-4">
          <h2 className="mb-3 text-sm font-bold text-brand-primary">Gerar novo acesso</h2>
          <form
            className="grid gap-3 md:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              setErrorMsg(null);
              createMutation.mutate();
            }}
          >
            <select
              className="rounded-xl border px-3 py-2"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              required
            >
              <option value="">Selecione o cliente</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            <Input placeholder="Identificador (ex: portal mensal)" value={label} onChange={(event) => setLabel(event.target.value)} />
            <Input
              placeholder="Expira em dias"
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(event.target.value)}
            />
            <Button type="submit" disabled={createMutation.isPending}>
              <KeyRound className="mr-1 h-4 w-4" />
              {createMutation.isPending ? "Gerando..." : "Gerar link"}
            </Button>
          </form>
          {errorMsg ? <p className="mt-2 text-sm text-red-600">{errorMsg}</p> : null}
        </section>

        {latestLink ? (
          <section className="card mb-4 border-brand-primary/20 bg-brand-primary/[0.03] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-primary">Link gerado agora</p>
            <p className="mt-1 text-sm text-slate-700">{latestLink.access.customer.name}</p>
            <div className="mt-3 rounded-xl border bg-white p-3">
              <p className="break-all text-sm text-slate-700">{latestLink.portalUrl}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(latestLink.portalUrl);
                  }}
                >
                  <Link2 className="mr-1 h-4 w-4" />
                  Copiar link
                </Button>
                <Link
                  className="inline-flex items-center justify-center rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                  href={latestLink.portalUrl}
                  target="_blank"
                >
                  Abrir portal
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          {accesses.map((access) => (
            <article className="card p-4" key={access.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-bold text-brand-primary">{access.customer.name}</p>
                  <p className="text-sm text-slate-600">
                    {access.label?.trim() || "Sem identificador"} • Criado em {toDateTime(access.createdAt)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Ultimo uso: {toDateTime(access.lastUsedAt)} • Expira em: {toDateTime(access.expiresAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      access.isRevoked
                        ? "bg-rose-100 text-rose-700"
                        : access.isExpired
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {access.isRevoked ? "Revogado" : access.isExpired ? "Expirado" : "Ativo"}
                  </span>
                  {!access.isRevoked ? (
                    <Button
                      variant="danger"
                      onClick={() => revokeMutation.mutate(access.id)}
                      disabled={revokeMutation.isPending}
                    >
                      Revogar
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
          {!accessQuery.isLoading && accesses.length === 0 ? (
            <div className="card p-4 text-sm text-slate-600">Nenhum link de portal gerado.</div>
          ) : null}
        </section>
      </AppShell>
    </RequireAuth>
  );
}
