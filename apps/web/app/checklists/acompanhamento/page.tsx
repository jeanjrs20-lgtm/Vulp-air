"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { ChecklistSectionNav } from "@/components/checklist-section-nav";
import { RequireAuth } from "@/components/require-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { toMediaFileUrl } from "@/lib/public-api";

const STATUS_META: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Rascunho", className: "bg-slate-100 text-slate-700" },
  IN_PROGRESS: { label: "Em execucao", className: "bg-sky-100 text-sky-700" },
  SUBMITTED: { label: "Submetido", className: "bg-amber-100 text-amber-700" },
  UNDER_REVIEW: { label: "Em conferencia", className: "bg-indigo-100 text-indigo-700" },
  APPROVED: { label: "Aprovado", className: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Reprovado", className: "bg-rose-100 text-rose-700" },
  REOPENED: { label: "Reaberto", className: "bg-orange-100 text-orange-700" }
};
const EDITABLE_STATUSES = new Set(["DRAFT", "IN_PROGRESS", "REOPENED"]);

const toDateTimeLabel = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("pt-BR");
};

const toAnswerValue = (answer: any) => {
  if (!answer) {
    return "-";
  }

  const reasons =
    Array.isArray(answer.valueJson)
      ? answer.valueJson.filter((entry: unknown) => typeof entry === "string" && entry.trim().length > 0)
      : [];

  if (answer.textValue) {
    return answer.textValue;
  }

  if (typeof answer.numberValue === "number") {
    return String(answer.numberValue);
  }

  if (typeof answer.booleanValue === "boolean") {
    if (answer.booleanValue) {
      return "OK";
    }
    return reasons.length ? `NOK (${reasons.join(", ")})` : "NOK";
  }

  if (answer.optionValue) {
    return answer.optionValue;
  }

  if (answer.valueJson != null) {
    if (Array.isArray(answer.valueJson)) {
      return answer.valueJson.join(", ");
    }
    return JSON.stringify(answer.valueJson);
  }

  return "-";
};

export default function ChecklistTrackingPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const executionsQuery = useQuery({
    queryKey: ["executions-tracking"],
    queryFn: () => api.get<any[]>("/checklists/executions/my")
  });

  const executions = executionsQuery.data ?? [];

  const counters = useMemo(() => {
    const initial = Object.keys(STATUS_META).reduce<Record<string, number>>((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {});

    for (const execution of executions) {
      initial[execution.status] = (initial[execution.status] ?? 0) + 1;
    }

    return initial;
  }, [executions]);

  const filteredExecutions = useMemo(() => {
    const term = search.trim().toLowerCase();

    return executions.filter((execution) => {
      if (statusFilter !== "ALL" && execution.status !== statusFilter) {
        return false;
      }

      if (!term) {
        return true;
      }

      const haystack = [
        execution.code,
        execution.templateVersion?.template?.name,
        execution.customer?.name,
        execution.assignedTechnician?.name
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [executions, search, statusFilter]);

  const selectedExecution = useMemo(
    () => executions.find((execution) => execution.id === selectedId) ?? null,
    [executions, selectedId]
  );

  return (
    <RequireAuth>
      <AppShell>
        <ChecklistSectionNav />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-brand-primary">Acompanhamento de Checklists</h1>
            <p className="text-sm text-slate-600">Visualize atribuicoes, execucao e revisao em um unico lugar.</p>
          </div>
          <Link
            className="inline-flex items-center justify-center rounded-xl border border-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary transition hover:bg-brand-primary/10"
            href="/checklists/templates"
          >
            Nova atribuicao
          </Link>
        </div>

        <div className="card mb-4 grid gap-3 p-4 md:grid-cols-[1fr_220px]">
          <div>
            <label className="mb-1 block text-sm font-semibold text-brand-primary">Buscar por codigo, template, cliente ou tecnico</label>
            <Input onChange={(event) => setSearch(event.target.value)} placeholder="Ex: CHK-20260228-1234" value={search} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-brand-primary">Status</label>
            <select
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-brand-primary transition focus:ring-2"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="ALL">Todos</option>
              {Object.entries(STATUS_META).map(([status, meta]) => (
                <option key={status} value={status}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {Object.entries(STATUS_META).map(([status, meta]) => (
            <div className="card p-3" key={status}>
              <p className="text-xs font-semibold uppercase text-slate-500">{meta.label}</p>
              <p className="mt-2 text-2xl font-black text-brand-primary">{counters[status] ?? 0}</p>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          {executionsQuery.isLoading ? (
            <div className="card p-4 text-sm text-slate-600">Carregando checklists...</div>
          ) : null}

          {executionsQuery.isError ? (
            <div className="card p-4 text-sm text-red-600">Nao foi possivel carregar os checklists.</div>
          ) : null}

          {!executionsQuery.isLoading && !executionsQuery.isError && filteredExecutions.length === 0 ? (
            <div className="card p-4 text-sm text-slate-600">Nenhum checklist encontrado para os filtros aplicados.</div>
          ) : null}

          {filteredExecutions.map((execution: any) => {
            const meta = STATUS_META[execution.status] ?? {
              label: execution.status,
              className: "bg-slate-100 text-slate-700"
            };

            return (
              <article className="card w-full p-4 transition hover:border-brand-primary" key={execution.id}>
                <button className="w-full text-left" onClick={() => setSelectedId(execution.id)} type="button">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-brand-primary">{execution.code}</p>
                      <p className="text-sm text-slate-600">
                        {execution.templateVersion?.template?.name ?? "Template sem nome"} -{" "}
                        {execution.templateVersion?.template?.serviceType ?? "-"}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${meta.className}`}>
                      {meta.label}
                    </span>
                  </div>

                  <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                    <p>
                      <strong>Tecnico:</strong> {execution.assignedTechnician?.name ?? "-"}
                    </p>
                    <p>
                      <strong>Cliente:</strong> {execution.customer?.name ?? "-"}
                    </p>
                    <p>
                      <strong>Atualizado:</strong> {toDateTimeLabel(execution.updatedAt)}
                    </p>
                    <p>
                      <strong>Etapa:</strong> {execution.step ?? "-"}
                    </p>
                  </div>
                </button>

                <div className="mt-3">
                  <Link
                    className="inline-flex rounded-lg border border-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary transition hover:bg-brand-primary/10"
                    href={`/checklists/executar/${execution.id}`}
                  >
                    {EDITABLE_STATUSES.has(execution.status) ? "Preencher checklist" : "Abrir checklist"}
                  </Link>
                </div>
              </article>
            );
          })}
        </section>

        <Dialog onOpenChange={(open) => !open && setSelectedId(null)} open={Boolean(selectedId)}>
          <DialogContent className="max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Detalhes do Checklist</DialogTitle>
            </DialogHeader>

            {selectedExecution ? (
              <div className="space-y-4">
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <strong>Codigo:</strong> {selectedExecution.code}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <strong>Status:</strong> {STATUS_META[selectedExecution.status]?.label ?? selectedExecution.status}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <strong>Template:</strong> {selectedExecution.templateVersion?.template?.name ?? "-"}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <strong>Tecnico:</strong> {selectedExecution.assignedTechnician?.name ?? "-"}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <strong>Cliente:</strong> {selectedExecution.customer?.name ?? "-"}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <strong>Unidade:</strong> {selectedExecution.siteLocation?.name ?? "-"}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <strong>Data servico:</strong> {toDateTimeLabel(selectedExecution.serviceDate)}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <strong>Ultima atualizacao:</strong> {toDateTimeLabel(selectedExecution.updatedAt)}
                  </div>
                </div>

                {(selectedExecution.templateVersion?.sections ?? []).map((section: any) => (
                  <section className="rounded-xl border border-slate-200 p-3" key={section.id}>
                    <h3 className="mb-2 text-sm font-bold text-brand-primary">{section.title}</h3>
                    <ul className="space-y-2 text-sm">
                      {section.items.map((item: any) => {
                        const answer = (selectedExecution.answers ?? []).find(
                          (entry: any) => entry.checklistItemId === item.id
                        );

                        return (
                          <li className="rounded-lg bg-slate-50 p-2" key={item.id}>
                            <div className="font-semibold">{item.label}</div>
                            <div className="text-xs text-slate-600">Resposta: {toAnswerValue(answer)}</div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}

                {(selectedExecution.reviewComments ?? []).length > 0 ? (
                  <section className="rounded-xl border border-slate-200 p-3">
                    <h3 className="mb-2 text-sm font-bold text-brand-primary">Comentarios da revisao</h3>
                    <ul className="space-y-2 text-sm text-slate-700">
                      {selectedExecution.reviewComments.map((comment: any) => (
                        <li className="rounded-lg bg-slate-50 px-3 py-2" key={comment.id}>
                          {comment.comment}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {selectedExecution.pdfAsset ? (
                  <a
                    className="text-sm font-semibold text-brand-primary underline"
                    href={toMediaFileUrl(selectedExecution.pdfAsset.storageKey)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Abrir PDF atual
                  </a>
                ) : null}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </AppShell>
    </RequireAuth>
  );
}
