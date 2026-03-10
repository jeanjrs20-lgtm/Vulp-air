"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { authStorage } from "@/lib/auth-storage";

type OrderStatus = "OPEN" | "SCHEDULED" | "DISPATCHED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CANCELLED";

type ScheduleItem = {
  id: string;
  code: string;
  title: string;
  status: OrderStatus;
  serviceDate?: string | null;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  assignedTechnician?: { id: string; name: string } | null;
  customer?: { id: string; name: string } | null;
};

type ScheduleResponse = {
  range: { dateFrom: string; dateTo: string };
  items: ScheduleItem[];
};

type OptionsPayload = {
  technicians: Array<{ id: string; name: string; email: string }>;
};

const MANAGER_ROLES = new Set(["SUPERADMIN", "ADMIN", "SUPERVISOR"]);

const toDateInputValue = (date: Date) => {
  const offset = date.getTimezoneOffset();
  const adjusted = new Date(date.getTime() - offset * 60_000);
  return adjusted.toISOString().slice(0, 10);
};

const toDateTimeLocalValue = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const adjusted = new Date(date.getTime() - offset * 60_000);
  return adjusted.toISOString().slice(0, 16);
};

const toDateLabel = (value?: string | null) => {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
};

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const toDayKey = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return toDateInputValue(startOfDay(date));
};

export default function ServiceOrdersSchedulePage() {
  const queryClient = useQueryClient();
  const user = authStorage.getUser();
  const managerView = MANAGER_ROLES.has(user?.role ?? "");

  const [weekStart, setWeekStart] = useState(toDateInputValue(startOfDay(new Date())));
  const [technicianId, setTechnicianId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [scheduledStartAt, setScheduledStartAt] = useState("");
  const [scheduledEndAt, setScheduledEndAt] = useState("");
  const [assignedTechId, setAssignedTechId] = useState("");

  const optionsQuery = useQuery({
    queryKey: ["service-order-options-schedule"],
    queryFn: () => api.get<OptionsPayload>("/service-orders/options")
  });

  const scheduleQuery = useQuery({
    queryKey: ["service-orders-schedule", weekStart, technicianId, managerView],
    queryFn: () => {
      const from = startOfDay(new Date(`${weekStart}T00:00:00`));
      const to = addDays(from, 6);
      const params = new URLSearchParams({
        dateFrom: from.toISOString(),
        dateTo: to.toISOString()
      });

      if (managerView && technicianId) {
        params.set("technicianId", technicianId);
      }

      return api.get<ScheduleResponse>(`/service-orders/schedule?${params.toString()}`);
    }
  });

  const items = scheduleQuery.data?.items ?? [];
  const options = optionsQuery.data;

  const days = useMemo(() => {
    const base = startOfDay(new Date(`${weekStart}T00:00:00`));
    return Array.from({ length: 7 }).map((_, index) => {
      const day = addDays(base, index);
      return {
        key: toDateInputValue(day),
        label: day.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
      };
    });
  }, [weekStart]);

  const grouped = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const day of days) {
      map.set(day.key, []);
    }

    for (const item of items) {
      const key = toDayKey(item.scheduledStartAt) ?? toDayKey(item.serviceDate);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(item);
    }

    for (const day of days) {
      map.set(
        day.key,
        (map.get(day.key) ?? []).sort((a, b) => {
          const left = new Date(a.scheduledStartAt ?? a.serviceDate ?? 0).getTime();
          const right = new Date(b.scheduledStartAt ?? b.serviceDate ?? 0).getTime();
          return left - right;
        })
      );
    }

    return map;
  }, [days, items]);

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Ordem nao selecionada");
      return api.patch(`/service-orders/${selectedId}/schedule`, {
        assignedTechnicianId: assignedTechId || undefined,
        scheduledStartAt: scheduledStartAt || undefined,
        scheduledEndAt: scheduledEndAt || undefined
      });
    },
    onSuccess: () => {
      setErrorMsg(null);
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["service-orders-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["service-orders"] });
    },
    onError: (error) => setErrorMsg(error.message)
  });

  return (
    <RequireAuth>
      <AppShell>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-brand-primary">Agenda Semanal</h1>
            <p className="text-sm text-slate-600">Visao operacional por dia para despacho e programacao.</p>
          </div>
          <Link
            className="inline-flex items-center justify-center rounded-xl border border-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary transition hover:bg-brand-primary/10"
            href="/service-orders"
          >
            Voltar para OS
          </Link>
        </div>

        <section className="card mb-4 grid gap-3 p-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-slate-600">Semana (inicio)</label>
            <Input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} />
          </div>
          {managerView ? (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-600">Tecnico</label>
              <select
                className="w-full rounded-xl border px-3 py-2"
                value={technicianId}
                onChange={(event) => setTechnicianId(event.target.value)}
              >
                <option value="">Todos</option>
                {(options?.technicians ?? []).map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </section>

        <section className="grid gap-3 lg:grid-cols-7">
          {days.map((day) => (
            <article className="card p-3" key={day.key}>
              <h2 className="mb-2 text-sm font-bold text-brand-primary">{day.label}</h2>
              <div className="space-y-2">
                {(grouped.get(day.key) ?? []).map((item) => (
                  <button
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-left text-xs transition hover:border-brand-primary"
                    key={item.id}
                    onClick={() => {
                      setErrorMsg(null);
                      setSelectedId(item.id);
                      setScheduledStartAt(toDateTimeLocalValue(item.scheduledStartAt));
                      setScheduledEndAt(toDateTimeLocalValue(item.scheduledEndAt));
                      setAssignedTechId(item.assignedTechnician?.id ?? "");
                    }}
                    type="button"
                  >
                    <p className="font-semibold text-brand-primary">{item.code}</p>
                    <p className="text-slate-700">{item.title}</p>
                    <p className="text-slate-500">{item.assignedTechnician?.name ?? "Sem tecnico"}</p>
                    <p className="text-slate-500">{toDateLabel(item.scheduledStartAt ?? item.serviceDate)}</p>
                  </button>
                ))}
                {(grouped.get(day.key) ?? []).length === 0 ? (
                  <p className="text-xs text-slate-500">Sem ordens neste dia.</p>
                ) : null}
              </div>
            </article>
          ))}
        </section>

        <Dialog open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajustar agenda</DialogTitle>
            </DialogHeader>
            {selectedItem ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-slate-50 p-3 text-sm">
                  <p><strong>{selectedItem.code}</strong> - {selectedItem.title}</p>
                  <p className="text-slate-600">{selectedItem.customer?.name ?? "Sem cliente"}</p>
                </div>

                {managerView ? (
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase">Tecnico</label>
                    <select
                      className="w-full rounded-xl border px-3 py-2"
                      value={assignedTechId}
                      onChange={(event) => setAssignedTechId(event.target.value)}
                    >
                      <option value="">Sem tecnico</option>
                      {(options?.technicians ?? []).map((tech) => (
                        <option key={tech.id} value={tech.id}>
                          {tech.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase">Inicio programado</label>
                  <Input type="datetime-local" value={scheduledStartAt} onChange={(event) => setScheduledStartAt(event.target.value)} />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase">Fim programado</label>
                  <Input type="datetime-local" value={scheduledEndAt} onChange={(event) => setScheduledEndAt(event.target.value)} />
                </div>

                {errorMsg ? <p className="text-sm text-red-600">{errorMsg}</p> : null}

                <Button onClick={() => scheduleMutation.mutate()} className="w-full" disabled={scheduleMutation.isPending}>
                  {scheduleMutation.isPending ? "Salvando..." : "Salvar agenda"}
                </Button>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </AppShell>
    </RequireAuth>
  );
}