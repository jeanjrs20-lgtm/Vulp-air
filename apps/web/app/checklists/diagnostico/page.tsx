"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { ChecklistSectionNav } from "@/components/checklist-section-nav";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

type DiagnosticBlueprint = {
  key: string;
  name: string;
  description: string;
  serviceType: string;
  sections: Array<{
    title: string;
    items: Array<{
      label: string;
      itemType: string;
      required: boolean;
      options?: string[];
    }>;
  }>;
};

type TemplateRecord = {
  id: string;
  name: string;
  serviceType: string;
  versions: Array<{
    id: string;
    version: number;
    sections: Array<{
      id: string;
      title: string;
      items: Array<{ id: string; label: string; itemType: string }>;
    }>;
  }>;
};

type BootstrapResult = {
  created: number;
  updated: number;
  unchanged: number;
  total: number;
};

export default function DiagnosticChecklistsPage() {
  const queryClient = useQueryClient();

  const blueprintsQuery = useQuery({
    queryKey: ["diagnostic-blueprints"],
    queryFn: () => api.get<DiagnosticBlueprint[]>("/checklists/templates/diagnostic-blueprints")
  });

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.get<TemplateRecord[]>("/checklists/templates")
  });

  const bootstrapMutation = useMutation({
    mutationFn: () => api.post<BootstrapResult>("/checklists/templates/bootstrap-diagnostic", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnostic-blueprints"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    }
  });

  const templatesByName = useMemo(() => {
    const map = new Map<string, TemplateRecord>();
    for (const template of templatesQuery.data ?? []) {
      map.set(template.name, template);
    }
    return map;
  }, [templatesQuery.data]);

  const summary = bootstrapMutation.data;

  return (
    <RequireAuth>
      <AppShell>
        <ChecklistSectionNav />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-brand-primary">Checklist de Diagnostico</h1>
            <p className="text-sm text-slate-600">
              Aqui voce valida o padrao de diagnostico por equipamento e garante os templates obrigatorios.
            </p>
          </div>
          <Button
            disabled={bootstrapMutation.isPending}
            onClick={() => bootstrapMutation.mutate()}
            type="button"
          >
            {bootstrapMutation.isPending ? "Atualizando modelos..." : "Garantir modelos de diagnostico"}
          </Button>
        </div>

        {summary ? (
          <div className="card mb-4 p-3 text-sm text-slate-700">
            Resultado: {summary.created} criados, {summary.updated} atualizados, {summary.unchanged} sem alteracao.
          </div>
        ) : null}

        {bootstrapMutation.isError ? (
          <div className="card mb-4 p-3 text-sm text-red-700">
            Nao foi possivel atualizar os modelos de diagnostico.
          </div>
        ) : null}

        <div className="space-y-4">
          {(blueprintsQuery.data ?? []).map((blueprint) => {
            const existing = templatesByName.get(blueprint.name);
            const latestVersion = existing?.versions[0];
            const statusLabel = existing ? `Disponivel (v${latestVersion?.version ?? "?"})` : "Nao criado";

            return (
              <article className="card p-4" key={blueprint.key}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-brand-primary">{blueprint.name}</h2>
                    <p className="text-sm text-slate-600">{blueprint.description}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      existing ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {statusLabel}
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {blueprint.sections.map((section) => (
                    <section className="rounded-xl border border-slate-200 p-3" key={section.title}>
                      <h3 className="mb-2 text-sm font-bold text-brand-primary">{section.title}</h3>
                      <ul className="space-y-1 text-sm text-slate-700">
                        {section.items.map((item) => (
                          <li key={item.label}>
                            {item.label} ({item.itemType})
                            {item.itemType === "MULTIPLE_CHOICE" && item.options ? (
                              <div className="mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                                {item.options.join(" | ")}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </AppShell>
    </RequireAuth>
  );
}
