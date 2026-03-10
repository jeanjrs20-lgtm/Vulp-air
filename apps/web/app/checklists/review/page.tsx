"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { ChecklistSectionNav } from "@/components/checklist-section-nav";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SignaturePad } from "@/components/signature-pad";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { toMediaFileUrl } from "@/lib/public-api";

const answerToText = (answer: any) => {
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

  if (Array.isArray(answer.valueJson)) {
    return answer.valueJson.join(", ");
  }

  if (answer.valueJson != null) {
    return JSON.stringify(answer.valueJson);
  }

  return "-";
};

export default function ReviewQueuePage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [supervisorSignature, setSupervisorSignature] = useState<string | null>(null);

  const queueQuery = useQuery({
    queryKey: ["review-queue"],
    queryFn: () => api.get<any[]>("/checklists/executions/review-queue")
  });

  const detailQuery = useQuery({
    queryKey: ["execution-detail", selectedId],
    queryFn: () => api.get<any>(`/checklists/executions/${selectedId}`),
    enabled: Boolean(selectedId)
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["review-queue"] });
    queryClient.invalidateQueries({ queryKey: ["execution-detail", selectedId] });
  };

  const approveMutation = useMutation({
    mutationFn: () =>
      api.post(`/checklists/executions/${selectedId}/review/approve`, {
        supervisorSignature
      }),
    onSuccess: refresh
  });

  const rejectMutation = useMutation({
    mutationFn: (type: "reject" | "reopen") =>
      api.post(`/checklists/executions/${selectedId}/review/${type}`, {
        comments: [{ comment }]
      }),
    onSuccess: refresh
  });

  const emitPdfMutation = useMutation({
    mutationFn: () => api.post<any>(`/checklists/executions/${selectedId}/emit-pdf`, {}),
    onSuccess: refresh
  });

  return (
    <RequireAuth>
      <AppShell>
        <ChecklistSectionNav />
        <h1 className="mb-4 text-2xl font-black text-brand-primary">Fila para ConferÃªncia</h1>
        <div className="space-y-3">
          {(queueQuery.data ?? []).map((execution: any) => (
            <button
              className="card w-full p-4 text-left transition hover:border-brand-primary"
              key={execution.id}
              onClick={() => setSelectedId(execution.id)}
              type="button"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-lg font-bold text-brand-primary">{execution.code}</p>
                  <p className="text-sm text-slate-600">
                    {execution.customer?.name ?? "Sem cliente"} - {execution.assignedTechnician?.name ?? "-"}
                  </p>
                </div>
                <span className="rounded-full bg-brand-highlight px-3 py-1 text-xs font-bold text-brand-primary">
                  {execution.status}
                </span>
              </div>
            </button>
          ))}
        </div>

        <Dialog onOpenChange={(open) => !open && setSelectedId(null)} open={Boolean(selectedId)}>
          <DialogContent className="max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>RevisÃ£o de Checklist</DialogTitle>
            </DialogHeader>

            {detailQuery.data ? (
              <div className="space-y-4">
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <strong>CÃ³digo:</strong> {detailQuery.data.code}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <strong>Status:</strong> {detailQuery.data.status}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <strong>Cliente:</strong> {detailQuery.data.customer?.name ?? "-"}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <strong>TÃ©cnico:</strong> {detailQuery.data.assignedTechnician?.name ?? "-"}
                  </div>
                </div>

                {(detailQuery.data.templateVersion?.sections ?? []).map((section: any) => (
                  <section className="rounded-xl border border-slate-200 p-3" key={section.id}>
                    <h3 className="mb-2 text-sm font-bold text-brand-primary">{section.title}</h3>
                    <ul className="space-y-2 text-sm">
                      {section.items.map((item: any) => {
                        const answer = (detailQuery.data.answers ?? []).find(
                          (entry: any) => entry.checklistItemId === item.id
                        );

                        return (
                          <li className="rounded-lg bg-slate-50 p-2" key={item.id}>
                            <div className="font-semibold">{item.label}</div>
                            <div className="text-xs text-slate-600">Resposta: {answerToText(answer)}</div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}

                <div>
                  <label className="mb-1 block text-sm font-semibold">Assinatura do supervisor</label>
                  <SignaturePad onChange={setSupervisorSignature} />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold">ComentÃ¡rio para reprovaÃ§Ã£o/reabertura</label>
                  <Textarea onChange={(event) => setComment(event.target.value)} rows={3} value={comment} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => approveMutation.mutate()}>Aprovar</Button>
                  <Button onClick={() => rejectMutation.mutate("reject")} variant="danger">
                    Reprovar
                  </Button>
                  <Button onClick={() => rejectMutation.mutate("reopen")} variant="outline">
                    Reabrir
                  </Button>
                  <Button onClick={() => emitPdfMutation.mutate()} variant="outline">
                    Emitir PDF
                  </Button>
                </div>

                {detailQuery.data.pdfAsset ? (
                  <a
                    className="text-sm font-semibold text-brand-primary underline"
                    href={toMediaFileUrl(detailQuery.data.pdfAsset.storageKey)}
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



