"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { authStorage } from "@/lib/auth-storage";

type RoutePlanStatus = "PLANNED" | "OPTIMIZED" | "PUBLISHED" | "EXECUTED";

type RouteOptionPayload = {
  technicians: Array<{ id: string; name: string; email: string; team?: string | null }>;
  serviceOrders: Array<{
    id: string;
    code: string;
    title: string;
    status: string;
    priority: string;
    assignedTechnicianId?: string | null;
    customer?: { id: string; name: string } | null;
    siteLocation?: { id: string; name: string; address: string } | null;
    scheduledStartAt?: string | null;
    serviceDate?: string | null;
  }>;
};

type RoutePlan = {
  id: string;
  name: string;
  planDate: string;
  status: RoutePlanStatus;
  notes?: string | null;
  assignedTechnician?: { id: string; name: string } | null;
  stops: Array<{
    id: string;
    sequence: number;
    status: string;
    etaStart?: string | null;
    etaEnd?: string | null;
    serviceOrder: {
      id: string;
      code: string;
      title: string;
      status: string;
      customer?: { id: string; name: string } | null;
      siteLocation?: { id: string; name: string; address: string } | null;
    };
  }>;
};

const MANAGER_ROLES = new Set(["SUPERADMIN", "ADMIN", "SUPERVISOR"]);

const STATUS_META: Record<RoutePlanStatus, string> = {
  PLANNED: "Planejado",
  OPTIMIZED: "Otimizado",
  PUBLISHED: "Publicado",
  EXECUTED: "Executado"
};

const toDateInput = (value: Date) => {
  const offset = value.getTimezoneOffset();
  const adjusted = new Date(value.getTime() - offset * 60_000);
  return adjusted.toISOString().slice(0, 10);
};

const toDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "-";

const sortedByDate = (items: RoutePlan[]) =>
  [...items].sort(
    (left, right) => new Date(left.planDate).getTime() - new Date(right.planDate).getTime()
  );

export default function RoutingPage() {
  const queryClient = useQueryClient();
  const user = authStorage.getUser();
  const managerView = MANAGER_ROLES.has(user?.role ?? "");

  const [planDate, setPlanDate] = useState(toDateInput(new Date()));
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedStops, setSelectedStops] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [newTechnicianId, setNewTechnicianId] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const optionsQuery = useQuery({
    queryKey: ["routing-options"],
    queryFn: () => api.get<RouteOptionPayload>("/routing/options")
  });

  const plansQuery = useQuery({
    queryKey: ["routing-plans", planDate, selectedTechnicianId],
    queryFn: () => {
      const from = new Date(`${planDate}T00:00:00`);
      const to = new Date(`${planDate}T23:59:59`);
      const params = new URLSearchParams({
        dateFrom: from.toISOString(),
        dateTo: to.toISOString()
      });

      if (selectedTechnicianId) {
        params.set("assignedTechnicianId", selectedTechnicianId);
      }

      return api.get<RoutePlan[]>(`/routing/plans?${params.toString()}`);
    }
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["routing-plans"] });
    queryClient.invalidateQueries({ queryKey: ["routing-options"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<RoutePlan>("/routing/plans", {
        name,
        planDate: new Date(`${planDate}T08:00:00`).toISOString(),
        assignedTechnicianId: newTechnicianId || undefined,
        notes: notes.trim() || undefined,
        stopServiceOrderIds: selectedStops
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setName("");
      setNotes("");
      setSelectedStops([]);
      setNewTechnicianId("");
      setErrorMsg(null);
      refresh();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const optimizeMutation = useMutation({
    mutationFn: (id: string) => api.post<RoutePlan>(`/routing/plans/${id}/optimize`, {}),
    onSuccess: refresh,
    onError: (error) => setErrorMsg(error.message)
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => api.post<RoutePlan>(`/routing/plans/${id}/publish`, {}),
    onSuccess: refresh,
    onError: (error) => setErrorMsg(error.message)
  });

  const options = optionsQuery.data;
  const plans = sortedByDate(plansQuery.data ?? []);

  const selectableOrders = useMemo(() => options?.serviceOrders ?? [], [options?.serviceOrders]);

  return (
    <RequireAuth>
      <AppShell>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-brand-primary">Roteirizacao de tarefas</h1>
            <p className="text-sm text-slate-600">
              Planeje, otimize e publique rotas com paradas vinculadas as ordens de servico.
            </p>
          </div>
          {managerView ? (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>Novo roteiro</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Criar roteiro</DialogTitle>
                </DialogHeader>

                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setErrorMsg(null);
                    createMutation.mutate();
                  }}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-semibold">Nome</label>
                      <Input value={name} onChange={(event) => setName(event.target.value)} required />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold">Data do plano</label>
                      <Input type="date" value={planDate} onChange={(event) => setPlanDate(event.target.value)} />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-semibold">Tecnico</label>
                    <select
                      className="w-full rounded-xl border px-3 py-2"
                      value={newTechnicianId}
                      onChange={(event) => setNewTechnicianId(event.target.value)}
                    >
                      <option value="">Sem tecnico fixo</option>
                      {(options?.technicians ?? []).map((technician) => (
                        <option key={technician.id} value={technician.id}>
                          {technician.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-semibold">Notas</label>
                    <textarea
                      className="w-full rounded-xl border px-3 py-2"
                      rows={3}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </div>

                  <div>
                    <p className="mb-1 text-sm font-semibold">Paradas (OS)</p>
                    <div className="max-h-60 space-y-2 overflow-auto rounded-xl border p-2">
                      {selectableOrders.map((order) => (
                        <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-2" key={order.id}>
                          <input
                            type="checkbox"
                            checked={selectedStops.includes(order.id)}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setSelectedStops((current) => [...current, order.id]);
                              } else {
                                setSelectedStops((current) => current.filter((value) => value !== order.id));
                              }
                            }}
                          />
                          <span className="text-xs">
                            <strong>{order.code}</strong> - {order.title}
                            <br />
                            {order.customer?.name ?? "Sem cliente"} | {order.siteLocation?.name ?? "Sem unidade"}
                          </span>
                        </label>
                      ))}
                      {selectableOrders.length === 0 ? (
                        <p className="p-2 text-xs text-slate-500">Nenhuma OS elegivel para roteirizacao.</p>
                      ) : null}
                    </div>
                  </div>

                  {errorMsg ? <p className="text-sm text-red-600">{errorMsg}</p> : null}
                  <Button className="w-full" type="submit" disabled={createMutation.isPending || !name.trim()}>
                    {createMutation.isPending ? "Criando..." : "Criar roteiro"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>

        <section className="card mb-4 grid gap-3 p-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-slate-600">Data</label>
            <Input type="date" value={planDate} onChange={(event) => setPlanDate(event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-slate-600">Tecnico</label>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={selectedTechnicianId}
              onChange={(event) => setSelectedTechnicianId(event.target.value)}
            >
              <option value="">Todos</option>
              {(options?.technicians ?? []).map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button className="w-full" variant="outline" onClick={refresh}>
              Atualizar
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          {plans.map((plan) => (
            <article className="card p-4" key={plan.id}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-brand-primary">{plan.name}</p>
                  <p className="text-sm text-slate-600">
                    {new Date(plan.planDate).toLocaleDateString("pt-BR")} | {plan.assignedTechnician?.name ?? "Sem tecnico"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                    {STATUS_META[plan.status]}
                  </span>
                  {managerView ? (
                    <Button
                      variant="outline"
                      onClick={() => optimizeMutation.mutate(plan.id)}
                      disabled={optimizeMutation.isPending}
                    >
                      Otimizar
                    </Button>
                  ) : null}
                  {managerView ? (
                    <Button
                      onClick={() => publishMutation.mutate(plan.id)}
                      disabled={publishMutation.isPending}
                    >
                      Publicar
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {plan.stops.map((stop) => (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" key={stop.id}>
                    <p className="font-bold text-brand-primary">#{stop.sequence} {stop.serviceOrder.code}</p>
                    <p>{stop.serviceOrder.title}</p>
                    <p className="text-xs text-slate-600">{stop.serviceOrder.customer?.name ?? "Sem cliente"}</p>
                    <p className="text-xs text-slate-600">{stop.serviceOrder.siteLocation?.name ?? "Sem unidade"}</p>
                    <p className="mt-1 text-xs text-slate-500">ETA: {toDateTime(stop.etaStart)} - {toDateTime(stop.etaEnd)}</p>
                    <p className="text-xs text-slate-500">Status parada: {stop.status}</p>
                  </div>
                ))}
                {plan.stops.length === 0 ? (
                  <p className="text-sm text-slate-500">Sem paradas neste roteiro.</p>
                ) : null}
              </div>
            </article>
          ))}
          {!plansQuery.isLoading && plans.length === 0 ? (
            <div className="card p-4 text-sm text-slate-600">Nenhum roteiro encontrado para o filtro.</div>
          ) : null}
        </section>
      </AppShell>
    </RequireAuth>
  );
}
