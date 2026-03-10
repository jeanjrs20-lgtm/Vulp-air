"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type ReportPayload = {
  filters: {
    dateFrom?: string | null;
    dateTo?: string | null;
    technicianId?: string | null;
  };
  serviceOrders: {
    total: number;
    byStatus: {
      open: number;
      scheduled: number;
      dispatched: number;
      inProgress: number;
      onHold: number;
      completed: number;
      cancelled: number;
    };
  };
  quotes: {
    total: number;
    approved: number;
    rejected: number;
    sent: number;
    draft: number;
    expired: number;
    totalValue: number;
    conversionRate: number;
  };
  expensesAndKm: {
    entries: number;
    totalAmount: number;
    totalKm: number;
    byType: Array<{
      type: string;
      entries: number;
      totalAmount: number;
      totalKm: number;
    }>;
  };
  satisfaction: {
    feedbacks: number;
    avgNps: number;
    avgCsat: number;
    npsScore: number;
    promoters: number;
    passives: number;
    detractors: number;
  };
  inventory: {
    products: number;
    lowStockCount: number;
    estimatedStockValue: number;
    lowStockItems: Array<{
      id: string;
      sku: string;
      name: string;
      currentStock: number;
      minStock: number;
    }>;
    movementByType: Array<{
      type: string;
      entries: number;
      quantity: number;
    }>;
  };
  finance: {
    totalInvoices: number;
    overdue: number;
    byStatus: {
      draft: number;
      issued: number;
      partiallyPaid: number;
      paid: number;
      overdue: number;
      canceled: number;
    };
    amounts: {
      total: number;
      paid: number;
      open: number;
      received: number;
    };
    payments: {
      entries: number;
    };
  };
  chat: {
    totalThreads: number;
    byStatus: {
      open: number;
      closed: number;
      archived: number;
    };
    byChannel: {
      internal: number;
      whatsapp: number;
      portal: number;
      email: number;
      phone: number;
    };
    messages: number;
  };
  productivityByTechnician: Array<{
    technicianId: string;
    technicianName: string;
    team?: string | null;
    totalOrders: number;
    completedOrders: number;
    inProgressOrders: number;
    completionRate: number;
    avgExecutionMinutes: number;
    totalKm: number;
    totalExpensesAmount: number;
    feedbackCount: number;
    avgNps: number;
    avgCsat: number;
  }>;
};

const toDateInput = (value: Date) => {
  const offset = value.getTimezoneOffset();
  const adjusted = new Date(value.getTime() - offset * 60_000);
  return adjusted.toISOString().slice(0, 10);
};

const toMoney = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState(toDateInput(new Date(new Date().setDate(new Date().getDate() - 30))));
  const [dateTo, setDateTo] = useState(toDateInput(new Date()));
  const [technicianId, setTechnicianId] = useState("");
  const printRef = useRef<HTMLDivElement | null>(null);

  const query = useQuery({
    queryKey: ["reports-overview", dateFrom, dateTo, technicianId],
    queryFn: () => {
      const params = new URLSearchParams({
        dateFrom: new Date(`${dateFrom}T00:00:00`).toISOString(),
        dateTo: new Date(`${dateTo}T23:59:59`).toISOString()
      });
      if (technicianId.trim()) params.set("technicianId", technicianId.trim());
      return api.get<ReportPayload>(`/reports/overview?${params.toString()}`);
    }
  });

  const payload = query.data;
  const hasFilter =
    Boolean(dateFrom) || Boolean(dateTo) || Boolean(technicianId.trim());

  const handlePrint = () => {
    if (!printRef.current || !payload) {
      return;
    }

    const win = window.open("", "_blank", "width=1280,height=900");
    if (!win) {
      return;
    }

    const generatedAt = new Date().toLocaleString("pt-BR");
    const html = `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Relatorio VULP AIR</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 24px;
              font-family: "Segoe UI", Arial, sans-serif;
              color: #0f172a;
              background: #ffffff;
            }
            h1 { margin: 0 0 8px 0; color: #07384d; font-size: 24px; }
            h2 { margin: 0 0 8px 0; color: #07384d; font-size: 15px; }
            .meta { margin-bottom: 16px; font-size: 12px; color: #475569; }
            .filters { margin-bottom: 16px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 12px; }
            .grid { display: grid; gap: 12px; }
            .grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
            .grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 12px; }
            .card {
              border: 1px solid #cbd5e1;
              border-radius: 10px;
              padding: 12px;
              break-inside: avoid;
            }
            .kpi-label { font-size: 11px; text-transform: uppercase; color: #475569; font-weight: 700; }
            .kpi-value { font-size: 24px; font-weight: 800; color: #07384d; margin-top: 6px; }
            ul { margin: 0; padding-left: 16px; font-size: 12px; line-height: 1.45; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; }
            thead { background: #f8fafc; }
            .section { margin-top: 12px; }
          </style>
        </head>
        <body>
          <h1>Relatorios completos - VULP AIR</h1>
          <p class="meta">Gerado em ${generatedAt}</p>
          <div class="filters">
            <strong>Filtros aplicados:</strong>
            Periodo ${dateFrom || "-"} ate ${dateTo || "-"}
            | Tecnico: ${technicianId.trim() || "Todos"}
          </div>
          ${printRef.current.innerHTML}
        </body>
      </html>
    `;

    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.onload = () => {
      win.print();
      win.close();
    };
  };

  return (
    <RequireAuth>
      <AppShell>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-brand-primary">Relatorios completos</h1>
            <p className="text-sm text-slate-600">
              Visao consolidada de ordens, produtividade, orcamentos, estoque, satisfacao e despesas.
            </p>
          </div>
          <Button
            disabled={!payload}
            onClick={handlePrint}
            type="button"
            variant="outline"
          >
            <Printer className="mr-2 h-4 w-4" />
            Imprimir relatorio
          </Button>
        </div>

        <section className="card mb-4 grid gap-3 p-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-slate-600">Data inicio</label>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-slate-600">Data fim</label>
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-slate-600">Tecnico (ID)</label>
            <Input value={technicianId} onChange={(event) => setTechnicianId(event.target.value)} placeholder="Opcional" />
          </div>
        </section>

        <div ref={printRef}>
          <section className="card mb-4 p-4">
            <h2 className="mb-2 text-sm font-bold text-brand-primary">Filtros aplicados no relatorio</h2>
            <ul className="space-y-1 text-sm">
              <li>Data inicio: {dateFrom || "-"}</li>
              <li>Data fim: {dateTo || "-"}</li>
              <li>Tecnico: {technicianId.trim() || "Todos"}</li>
              <li>Escopo: os filtros acima sao aplicados em todos os blocos do relatorio.</li>
            </ul>
            {!hasFilter ? (
              <p className="mt-2 text-xs text-slate-500">
                Nenhum filtro especifico informado. Relatorio exibindo visao geral.
              </p>
            ) : null}
          </section>

          <section className="mb-4 grid gap-3 md:grid-cols-4">
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">OS totais</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{payload?.serviceOrders.total ?? 0}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Orcamentos</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{payload?.quotes.total ?? 0}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Despesas</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{toMoney(payload?.expensesAndKm.totalAmount ?? 0)}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Km rodado</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{(payload?.expensesAndKm.totalKm ?? 0).toFixed(2)}</p>
          </div>
          </section>

          <section className="mb-4 grid gap-4 lg:grid-cols-2">
          <article className="card p-4">
            <h2 className="mb-2 text-sm font-bold text-brand-primary">Ordens de servico</h2>
            <ul className="space-y-1 text-sm">
              <li>Abertas: {payload?.serviceOrders.byStatus.open ?? 0}</li>
              <li>Agendadas: {payload?.serviceOrders.byStatus.scheduled ?? 0}</li>
              <li>Despachadas: {payload?.serviceOrders.byStatus.dispatched ?? 0}</li>
              <li>Em execucao: {payload?.serviceOrders.byStatus.inProgress ?? 0}</li>
              <li>Concluidas: {payload?.serviceOrders.byStatus.completed ?? 0}</li>
              <li>Canceladas: {payload?.serviceOrders.byStatus.cancelled ?? 0}</li>
            </ul>
          </article>

          <article className="card p-4">
            <h2 className="mb-2 text-sm font-bold text-brand-primary">Orcamentos</h2>
            <ul className="space-y-1 text-sm">
              <li>Total: {payload?.quotes.total ?? 0}</li>
              <li>Aprovados: {payload?.quotes.approved ?? 0}</li>
              <li>Rejeitados: {payload?.quotes.rejected ?? 0}</li>
              <li>Valor total: {toMoney(payload?.quotes.totalValue ?? 0)}</li>
              <li>Taxa de conversao: {(payload?.quotes.conversionRate ?? 0).toFixed(2)}%</li>
            </ul>
          </article>
          </section>

          <section className="mb-4 grid gap-4 lg:grid-cols-2">
          <article className="card p-4">
            <h2 className="mb-2 text-sm font-bold text-brand-primary">Satisfacao</h2>
            <ul className="space-y-1 text-sm">
              <li>Feedbacks: {payload?.satisfaction.feedbacks ?? 0}</li>
              <li>NPS medio: {(payload?.satisfaction.avgNps ?? 0).toFixed(2)}</li>
              <li>CSAT medio: {(payload?.satisfaction.avgCsat ?? 0).toFixed(2)}</li>
              <li>NPS score: {(payload?.satisfaction.npsScore ?? 0).toFixed(2)}</li>
              <li>Promotores: {payload?.satisfaction.promoters ?? 0}</li>
              <li>Detratores: {payload?.satisfaction.detractors ?? 0}</li>
            </ul>
          </article>

          <article className="card p-4">
            <h2 className="mb-2 text-sm font-bold text-brand-primary">Estoque</h2>
            <ul className="space-y-1 text-sm">
              <li>Produtos cadastrados: {payload?.inventory.products ?? 0}</li>
              <li>Estoque baixo: {payload?.inventory.lowStockCount ?? 0}</li>
              <li>Valor estimado: {toMoney(payload?.inventory.estimatedStockValue ?? 0)}</li>
            </ul>
            <div className="mt-3 space-y-1 text-xs">
              {(payload?.inventory.lowStockItems ?? []).slice(0, 5).map((item) => (
                <p key={item.id}>
                  {item.sku} - {item.name}: {item.currentStock} / min {item.minStock}
                </p>
              ))}
            </div>
          </article>
          </section>

          <section className="mb-4 grid gap-4 lg:grid-cols-2">
          <article className="card p-4">
            <h2 className="mb-2 text-sm font-bold text-brand-primary">Financeiro e cobranca</h2>
            <ul className="space-y-1 text-sm">
              <li>Faturas: {payload?.finance.totalInvoices ?? 0}</li>
              <li>Faturas vencidas: {payload?.finance.overdue ?? 0}</li>
              <li>Total faturado: {toMoney(payload?.finance.amounts.total ?? 0)}</li>
              <li>Saldo aberto: {toMoney(payload?.finance.amounts.open ?? 0)}</li>
              <li>Recebido: {toMoney(payload?.finance.amounts.received ?? 0)}</li>
            </ul>
          </article>

          <article className="card p-4">
            <h2 className="mb-2 text-sm font-bold text-brand-primary">Chat e atendimento</h2>
            <ul className="space-y-1 text-sm">
              <li>Conversas: {payload?.chat.totalThreads ?? 0}</li>
              <li>Abertas: {payload?.chat.byStatus.open ?? 0}</li>
              <li>Fechadas: {payload?.chat.byStatus.closed ?? 0}</li>
              <li>Mensagens: {payload?.chat.messages ?? 0}</li>
              <li>Portal: {payload?.chat.byChannel.portal ?? 0}</li>
              <li>WhatsApp: {payload?.chat.byChannel.whatsapp ?? 0}</li>
            </ul>
          </article>
          </section>

          <section className="card p-4">
          <h2 className="mb-3 text-sm font-bold text-brand-primary">Produtividade da equipe</h2>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-3 py-2">Tecnico</th>
                  <th className="px-3 py-2">OS</th>
                  <th className="px-3 py-2">Concluidas</th>
                  <th className="px-3 py-2">Taxa</th>
                  <th className="px-3 py-2">Tempo medio (min)</th>
                  <th className="px-3 py-2">Km</th>
                  <th className="px-3 py-2">Despesas</th>
                  <th className="px-3 py-2">NPS</th>
                </tr>
              </thead>
              <tbody>
                {(payload?.productivityByTechnician ?? []).map((row) => (
                  <tr className="border-b" key={row.technicianId}>
                    <td className="px-3 py-2">{row.technicianName}</td>
                    <td className="px-3 py-2">{row.totalOrders}</td>
                    <td className="px-3 py-2">{row.completedOrders}</td>
                    <td className="px-3 py-2">{row.completionRate.toFixed(2)}%</td>
                    <td className="px-3 py-2">{row.avgExecutionMinutes.toFixed(2)}</td>
                    <td className="px-3 py-2">{row.totalKm.toFixed(2)}</td>
                    <td className="px-3 py-2">{toMoney(row.totalExpensesAmount)}</td>
                    <td className="px-3 py-2">{row.avgNps.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </section>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
