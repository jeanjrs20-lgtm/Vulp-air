"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type Feedback = {
  id: string;
  scoreNps?: number | null;
  scoreCsat?: number | null;
  comment?: string | null;
  channel: "APP" | "WHATSAPP" | "EMAIL" | "PHONE";
  submittedAt: string;
  customer?: { id: string; name: string } | null;
  serviceOrder: {
    id: string;
    code: string;
    title: string;
    assignedTechnician?: { id: string; name: string } | null;
  };
};

type FeedbackSummary = {
  totals: {
    feedbacks: number;
    avgNps: number;
    avgCsat: number;
    npsScore: number;
    promoters: number;
    passives: number;
    detractors: number;
  };
  distribution: Array<{
    scoreNps: number | null;
    total: number;
  }>;
};

type ServiceOrderOption = {
  id: string;
  code: string;
  title: string;
  customer?: { id: string; name: string } | null;
};

const toDateTime = (value: string) => new Date(value).toLocaleString("pt-BR");

export default function FeedbackPage() {
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [serviceOrderId, setServiceOrderId] = useState("");
  const [nps, setNps] = useState("");
  const [csat, setCsat] = useState("");
  const [comment, setComment] = useState("");
  const [channel, setChannel] = useState<"APP" | "WHATSAPP" | "EMAIL" | "PHONE">("APP");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const feedbackQuery = useQuery({
    queryKey: ["feedback-list"],
    queryFn: () => api.get<Feedback[]>("/feedback")
  });

  const summaryQuery = useQuery({
    queryKey: ["feedback-summary"],
    queryFn: () => api.get<FeedbackSummary>("/feedback/summary")
  });

  const serviceOrdersQuery = useQuery({
    queryKey: ["feedback-service-orders"],
    queryFn: () => api.get<ServiceOrderOption[]>("/service-orders?status=COMPLETED")
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<Feedback>("/feedback", {
        serviceOrderId,
        scoreNps: nps.trim() ? Number(nps) : undefined,
        scoreCsat: csat.trim() ? Number(csat) : undefined,
        comment: comment.trim() || undefined,
        channel
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setServiceOrderId("");
      setNps("");
      setCsat("");
      setComment("");
      setChannel("APP");
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ["feedback-list"] });
      queryClient.invalidateQueries({ queryKey: ["feedback-summary"] });
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const feedbacks = feedbackQuery.data ?? [];
  const summary = summaryQuery.data;
  const serviceOrders = serviceOrdersQuery.data ?? [];

  return (
    <RequireAuth>
      <AppShell>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-brand-primary">Satisfacao dos clientes</h1>
            <p className="text-sm text-slate-600">
              NPS/CSAT por ordem concluida com rastreio de feedback por tecnico e cliente.
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>Novo feedback</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar feedback</DialogTitle>
              </DialogHeader>

              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  setErrorMsg(null);
                  createMutation.mutate();
                }}
              >
                <div>
                  <label className="mb-1 block text-sm font-semibold">Ordem de servico concluida</label>
                  <select
                    className="w-full rounded-xl border px-3 py-2"
                    value={serviceOrderId}
                    onChange={(event) => setServiceOrderId(event.target.value)}
                    required
                  >
                    <option value="">Selecione</option>
                    {serviceOrders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.code} - {order.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Input placeholder="NPS (0-10)" value={nps} onChange={(event) => setNps(event.target.value)} />
                  <Input placeholder="CSAT (1-5)" value={csat} onChange={(event) => setCsat(event.target.value)} />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold">Canal</label>
                  <select
                    className="w-full rounded-xl border px-3 py-2"
                    value={channel}
                    onChange={(event) => setChannel(event.target.value as "APP" | "WHATSAPP" | "EMAIL" | "PHONE")}
                  >
                    <option value="APP">App</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="EMAIL">Email</option>
                    <option value="PHONE">Telefone</option>
                  </select>
                </div>

                <textarea
                  className="w-full rounded-xl border px-3 py-2"
                  rows={4}
                  placeholder="Comentario"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />

                {errorMsg ? <p className="text-sm text-red-600">{errorMsg}</p> : null}
                <Button className="w-full" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Salvando..." : "Salvar feedback"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <section className="mb-4 grid gap-3 md:grid-cols-4">
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Feedbacks</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{summary?.totals.feedbacks ?? 0}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">NPS medio</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{summary?.totals.avgNps.toFixed(2) ?? "0.00"}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">CSAT medio</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{summary?.totals.avgCsat.toFixed(2) ?? "0.00"}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">NPS score</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{summary?.totals.npsScore.toFixed(2) ?? "0.00"}</p>
          </div>
        </section>

        {errorMsg ? <p className="mb-4 text-sm text-red-600">{errorMsg}</p> : null}

        <section className="space-y-3">
          {feedbacks.map((feedback) => (
            <article className="card p-4" key={feedback.id}>
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-brand-primary">{feedback.serviceOrder.code} - {feedback.serviceOrder.title}</p>
                  <p className="text-sm text-slate-600">Cliente: {feedback.customer?.name ?? "-"}</p>
                  <p className="text-xs text-slate-500">Tecnico: {feedback.serviceOrder.assignedTechnician?.name ?? "-"}</p>
                </div>
                <p className="text-xs text-slate-500">{toDateTime(feedback.submittedAt)}</p>
              </div>

              <div className="grid gap-2 text-sm md:grid-cols-3">
                <p><strong>NPS:</strong> {feedback.scoreNps ?? "-"}</p>
                <p><strong>CSAT:</strong> {feedback.scoreCsat ?? "-"}</p>
                <p><strong>Canal:</strong> {feedback.channel}</p>
              </div>
              <p className="mt-2 text-sm text-slate-700">{feedback.comment?.trim() || "Sem comentario"}</p>
            </article>
          ))}

          {!feedbackQuery.isLoading && feedbacks.length === 0 ? (
            <div className="card p-4 text-sm text-slate-600">Nenhum feedback registrado.</div>
          ) : null}
        </section>
      </AppShell>
    </RequireAuth>
  );
}
