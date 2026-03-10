"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type QuoteStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "EXPIRED";

type QuoteOptionPayload = {
  customers: Array<{ id: string; name: string }>;
  serviceOrders: Array<{ id: string; code: string; title: string; customer?: { id: string; name: string } | null }>;
};

type QuoteItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type Quote = {
  id: string;
  code: string;
  status: QuoteStatus;
  subtotal: number;
  discount: number;
  total: number;
  validUntil?: string | null;
  notes?: string | null;
  createdAt: string;
  customer?: { id: string; name: string } | null;
  serviceOrder?: { id: string; code: string; title: string } | null;
  items: QuoteItem[];
};

type DraftItem = {
  description: string;
  quantity: string;
  unitPrice: string;
};

const STATUS_META: Record<QuoteStatus, { label: string; className: string }> = {
  DRAFT: { label: "Rascunho", className: "bg-slate-100 text-slate-700" },
  SENT: { label: "Enviado", className: "bg-sky-100 text-sky-700" },
  APPROVED: { label: "Aprovado", className: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Reprovado", className: "bg-rose-100 text-rose-700" },
  EXPIRED: { label: "Expirado", className: "bg-orange-100 text-orange-700" }
};

const toMoney = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const toDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("pt-BR") : "-";

const parseNumber = (value: string) => {
  const normalized = Number(value.replace(",", "."));
  return Number.isFinite(normalized) ? normalized : 0;
};

export default function QuotesPage() {
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [serviceOrderId, setServiceOrderId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([{ description: "", quantity: "1", unitPrice: "0" }]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"ALL" | QuoteStatus>("ALL");

  const optionsQuery = useQuery({
    queryKey: ["quote-options"],
    queryFn: () => api.get<QuoteOptionPayload>("/quotes/options")
  });

  const quotesQuery = useQuery({
    queryKey: ["quotes", statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      return api.get<Quote[]>(`/quotes${params.toString() ? `?${params.toString()}` : ""}`);
    }
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["quotes"] });
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const payloadItems = items
        .map((item) => ({
          description: item.description.trim(),
          quantity: parseNumber(item.quantity),
          unitPrice: parseNumber(item.unitPrice)
        }))
        .filter((item) => item.description && item.quantity > 0);

      if (!payloadItems.length) {
        throw new Error("Inclua pelo menos um item valido");
      }

      return api.post<Quote>("/quotes", {
        serviceOrderId: serviceOrderId || undefined,
        customerId: customerId || undefined,
        validUntil: validUntil ? new Date(`${validUntil}T23:59:59`).toISOString() : undefined,
        notes: notes.trim() || undefined,
        discount: parseNumber(discount),
        items: payloadItems
      });
    },
    onSuccess: () => {
      setCreateOpen(false);
      setServiceOrderId("");
      setCustomerId("");
      setValidUntil("");
      setDiscount("0");
      setNotes("");
      setItems([{ description: "", quantity: "1", unitPrice: "0" }]);
      setErrorMsg(null);
      refresh();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: QuoteStatus }) =>
      api.post<Quote>(`/quotes/${id}/status`, { status }),
    onSuccess: refresh,
    onError: (error) => setErrorMsg(error.message)
  });

  const quotes = quotesQuery.data ?? [];
  const options = optionsQuery.data;

  const totalPipeline = useMemo(
    () => quotes.reduce((acc, quote) => acc + quote.total, 0),
    [quotes]
  );

  return (
    <RequireAuth>
      <AppShell>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-brand-primary">Orcamentos</h1>
            <p className="text-sm text-slate-600">
              Propostas vinculadas a clientes e ordens de servico com controle de aprovacao.
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>Novo orcamento</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>Criar orcamento</DialogTitle>
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
                    <label className="mb-1 block text-sm font-semibold">Ordem de servico</label>
                    <select
                      className="w-full rounded-xl border px-3 py-2"
                      value={serviceOrderId}
                      onChange={(event) => {
                        const value = event.target.value;
                        setServiceOrderId(value);
                        if (value) {
                          const order = (options?.serviceOrders ?? []).find((item) => item.id === value);
                          setCustomerId(order?.customer?.id ?? "");
                        }
                      }}
                    >
                      <option value="">Sem OS</option>
                      {(options?.serviceOrders ?? []).map((order) => (
                        <option key={order.id} value={order.id}>
                          {order.code} - {order.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-semibold">Cliente</label>
                    <select
                      className="w-full rounded-xl border px-3 py-2"
                      value={customerId}
                      onChange={(event) => setCustomerId(event.target.value)}
                    >
                      <option value="">Selecione</option>
                      {(options?.customers ?? []).map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-semibold">Validade</label>
                    <Input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Desconto (R$)</label>
                    <Input value={discount} onChange={(event) => setDiscount(event.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold">Observacoes</label>
                  <textarea
                    className="w-full rounded-xl border px-3 py-2"
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">Itens</p>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => setItems((current) => [...current, { description: "", quantity: "1", unitPrice: "0" }])}
                    >
                      + Item
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {items.map((item, index) => (
                      <div className="grid gap-2 md:grid-cols-12" key={`item-${index}`}>
                        <Input
                          className="md:col-span-6"
                          placeholder="Descricao"
                          value={item.description}
                          onChange={(event) => {
                            const next = [...items];
                            next[index].description = event.target.value;
                            setItems(next);
                          }}
                        />
                        <Input
                          className="md:col-span-2"
                          placeholder="Qtd"
                          value={item.quantity}
                          onChange={(event) => {
                            const next = [...items];
                            next[index].quantity = event.target.value;
                            setItems(next);
                          }}
                        />
                        <Input
                          className="md:col-span-3"
                          placeholder="Unitario"
                          value={item.unitPrice}
                          onChange={(event) => {
                            const next = [...items];
                            next[index].unitPrice = event.target.value;
                            setItems(next);
                          }}
                        />
                        <Button
                          className="md:col-span-1"
                          variant="danger"
                          type="button"
                          onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                          disabled={items.length === 1}
                        >
                          X
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {errorMsg ? <p className="text-sm text-red-600">{errorMsg}</p> : null}
                <Button className="w-full" type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Criando..." : "Criar orcamento"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <section className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Orcamentos listados</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{quotes.length}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Valor total</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{toMoney(totalPipeline)}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Filtro status</p>
            <select
              className="mt-2 w-full rounded-xl border px-3 py-2"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "ALL" | QuoteStatus)}
            >
              <option value="ALL">Todos</option>
              {Object.entries(STATUS_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="space-y-3">
          {quotes.map((quote) => (
            <article className="card p-4" key={quote.id}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-brand-primary">{quote.code}</p>
                  <p className="text-sm text-slate-700">{quote.customer?.name ?? "Sem cliente"}</p>
                  <p className="text-xs text-slate-500">OS: {quote.serviceOrder?.code ?? "-"}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_META[quote.status].className}`}>
                  {STATUS_META[quote.status].label}
                </span>
              </div>

              <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-4">
                <p><strong>Subtotal:</strong> {toMoney(quote.subtotal)}</p>
                <p><strong>Desconto:</strong> {toMoney(quote.discount)}</p>
                <p><strong>Total:</strong> {toMoney(quote.total)}</p>
                <p><strong>Validade:</strong> {toDate(quote.validUntil)}</p>
              </div>

              <div className="mt-3 rounded-xl border border-slate-200 p-3">
                <p className="mb-1 text-sm font-semibold text-brand-primary">Itens</p>
                <ul className="space-y-1 text-sm">
                  {quote.items.map((item) => (
                    <li key={item.id}>
                      {item.description} - {item.quantity} x {toMoney(item.unitPrice)} = {toMoney(item.total)}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => statusMutation.mutate({ id: quote.id, status: "SENT" })}>
                  Enviar
                </Button>
                <Button onClick={() => statusMutation.mutate({ id: quote.id, status: "APPROVED" })}>
                  Aprovar
                </Button>
                <Button variant="danger" onClick={() => statusMutation.mutate({ id: quote.id, status: "REJECTED" })}>
                  Reprovar
                </Button>
                <Button variant="ghost" onClick={() => statusMutation.mutate({ id: quote.id, status: "EXPIRED" })}>
                  Expirar
                </Button>
              </div>
            </article>
          ))}
          {!quotesQuery.isLoading && quotes.length === 0 ? (
            <div className="card p-4 text-sm text-slate-600">Nenhum orcamento encontrado.</div>
          ) : null}
        </section>
      </AppShell>
    </RequireAuth>
  );
}
