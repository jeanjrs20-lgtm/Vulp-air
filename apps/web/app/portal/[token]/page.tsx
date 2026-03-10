"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardList,
  CreditCard,
  MessageCircle,
  MessageSquareText,
  Send,
  Star
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type OverviewPayload = {
  customer: {
    id: string;
    name: string;
  };
  ticketSummary: {
    open: number;
    resolved: number;
    closed: number;
    cancelled: number;
  };
  serviceOrderSummary: {
    scheduled: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  };
  quoteSummary: {
    draft: number;
    sent: number;
    approved: number;
    rejected: number;
    expired: number;
  };
  financeSummary: {
    draft: number;
    issued: number;
    partiallyPaid: number;
    paid: number;
    overdue: number;
    canceled: number;
    totalAmount: number;
    balanceAmount: number;
  };
  chatSummary: {
    open: number;
    closed: number;
    archived: number;
  };
  satisfaction: {
    feedbacks: number;
    avgNps: number;
    avgCsat: number;
  };
};

type PortalTicket = {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  status: "OPEN" | "TRIAGE" | "IN_PROGRESS" | "ON_HOLD" | "RESOLVED" | "CLOSED" | "CANCELLED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
};

type PortalServiceOrder = {
  id: string;
  code: string;
  title: string;
  status: string;
  serviceDate?: string | null;
  scheduledStartAt?: string | null;
  siteLocation?: {
    id: string;
    name: string;
    city?: string | null;
  } | null;
  assignedTechnician?: { id: string; name: string } | null;
};

type PortalQuote = {
  id: string;
  code: string;
  status: string;
  total: number;
  validUntil?: string | null;
};

type PortalInvoice = {
  id: string;
  code: string;
  status: "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELED";
  issueDate?: string | null;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  description?: string | null;
  currency: string;
};

type PortalChatThread = {
  id: string;
  code: string;
  subject: string;
  status: "OPEN" | "CLOSED" | "ARCHIVED";
  channel: "INTERNAL" | "WHATSAPP" | "PORTAL" | "EMAIL" | "PHONE";
  createdAt: string;
  lastMessageAt?: string | null;
  messages: Array<{
    id: string;
    senderType: "USER" | "CUSTOMER" | "SYSTEM";
    senderName?: string | null;
    message: string;
    createdAt: string;
  }>;
};

type PortalChatMessage = {
  id: string;
  senderType: "USER" | "CUSTOMER" | "SYSTEM";
  senderName?: string | null;
  message: string;
  createdAt: string;
};

const INVOICE_STATUS_META: Record<
  PortalInvoice["status"],
  { label: string; className: string }
> = {
  DRAFT: { label: "Rascunho", className: "bg-slate-100 text-slate-700" },
  ISSUED: { label: "Emitida", className: "bg-sky-100 text-sky-700" },
  PARTIALLY_PAID: { label: "Parcial", className: "bg-amber-100 text-amber-700" },
  PAID: { label: "Paga", className: "bg-emerald-100 text-emerald-700" },
  OVERDUE: { label: "Vencida", className: "bg-rose-100 text-rose-700" },
  CANCELED: { label: "Cancelada", className: "bg-slate-200 text-slate-700" }
};

const THREAD_STATUS_META: Record<
  PortalChatThread["status"],
  { label: string; className: string }
> = {
  OPEN: { label: "Aberta", className: "bg-emerald-100 text-emerald-700" },
  CLOSED: { label: "Fechada", className: "bg-slate-200 text-slate-700" },
  ARCHIVED: { label: "Arquivada", className: "bg-slate-300 text-slate-700" }
};

const toDate = (value?: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "-");
const toMoney = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

export default function CustomerPortalPublicPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const queryClient = useQueryClient();

  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketPriority, setTicketPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM");

  const [paymentInvoiceId, setPaymentInvoiceId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "BANK_SLIP" | "CASH" | "TRANSFER" | "OTHER"
  >("PIX");
  const [paymentReference, setPaymentReference] = useState("");

  const [chatSubject, setChatSubject] = useState("");
  const [chatMessage, setChatMessage] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [replyMessage, setReplyMessage] = useState("");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const overviewQuery = useQuery({
    queryKey: ["portal-overview", token],
    queryFn: () => api.get<OverviewPayload>(`/customer-portal/public/${token}/overview`),
    enabled: Boolean(token)
  });

  const ticketsQuery = useQuery({
    queryKey: ["portal-tickets", token],
    queryFn: () => api.get<PortalTicket[]>(`/customer-portal/public/${token}/tickets?limit=30`),
    enabled: Boolean(token)
  });

  const serviceOrdersQuery = useQuery({
    queryKey: ["portal-service-orders", token],
    queryFn: () => api.get<PortalServiceOrder[]>(`/customer-portal/public/${token}/service-orders?limit=30`),
    enabled: Boolean(token)
  });

  const quotesQuery = useQuery({
    queryKey: ["portal-quotes", token],
    queryFn: () => api.get<PortalQuote[]>(`/customer-portal/public/${token}/quotes?limit=30`),
    enabled: Boolean(token)
  });

  const invoicesQuery = useQuery({
    queryKey: ["portal-invoices", token],
    queryFn: () => api.get<PortalInvoice[]>(`/customer-portal/public/${token}/invoices?limit=30`),
    enabled: Boolean(token)
  });

  const threadsQuery = useQuery({
    queryKey: ["portal-chat-threads", token],
    queryFn: () => api.get<PortalChatThread[]>(`/customer-portal/public/${token}/chat/threads?limit=30`),
    enabled: Boolean(token)
  });

  const selectedThreadMessagesQuery = useQuery({
    queryKey: ["portal-chat-thread-messages", token, selectedThreadId],
    queryFn: () =>
      api.get<PortalChatMessage[]>(`/customer-portal/public/${token}/chat/threads/${selectedThreadId}/messages?limit=300`),
    enabled: Boolean(token && selectedThreadId)
  });

  const createTicketMutation = useMutation({
    mutationFn: () =>
      api.post<PortalTicket>(`/customer-portal/public/${token}/tickets`, {
        title: ticketTitle.trim(),
        description: ticketDescription.trim() || undefined,
        priority: ticketPriority
      }),
    onSuccess: () => {
      setTicketTitle("");
      setTicketDescription("");
      setTicketPriority("MEDIUM");
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ["portal-overview", token] });
      queryClient.invalidateQueries({ queryKey: ["portal-tickets", token] });
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: () => {
      if (!paymentInvoiceId) {
        throw new Error("Selecione uma fatura");
      }

      const amount = Number(paymentAmount.replace(",", "."));
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Informe um valor de pagamento valido");
      }

      return api.post(`/customer-portal/public/${token}/invoices/${paymentInvoiceId}/confirm-payment`, {
        amount,
        method: paymentMethod,
        reference: paymentReference.trim() || undefined
      });
    },
    onSuccess: () => {
      setPaymentInvoiceId("");
      setPaymentAmount("");
      setPaymentMethod("PIX");
      setPaymentReference("");
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ["portal-overview", token] });
      queryClient.invalidateQueries({ queryKey: ["portal-invoices", token] });
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const createThreadMutation = useMutation({
    mutationFn: () =>
      api.post<PortalChatThread>(`/customer-portal/public/${token}/chat/threads`, {
        subject: chatSubject.trim(),
        message: chatMessage.trim()
      }),
    onSuccess: (thread) => {
      setChatSubject("");
      setChatMessage("");
      setErrorMsg(null);
      setSelectedThreadId(thread.id);
      queryClient.invalidateQueries({ queryKey: ["portal-overview", token] });
      queryClient.invalidateQueries({ queryKey: ["portal-chat-threads", token] });
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const sendReplyMutation = useMutation({
    mutationFn: () => {
      if (!selectedThreadId) {
        throw new Error("Selecione uma conversa");
      }
      return api.post<PortalChatMessage>(
        `/customer-portal/public/${token}/chat/threads/${selectedThreadId}/messages`,
        {
          message: replyMessage.trim()
        }
      );
    },
    onSuccess: () => {
      setReplyMessage("");
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ["portal-chat-threads", token] });
      queryClient.invalidateQueries({
        queryKey: ["portal-chat-thread-messages", token, selectedThreadId]
      });
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const overview = overviewQuery.data;
  const tickets = ticketsQuery.data ?? [];
  const serviceOrders = serviceOrdersQuery.data ?? [];
  const quotes = quotesQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const threads = threadsQuery.data ?? [];
  const selectedThreadMessages = selectedThreadMessagesQuery.data ?? [];

  const activeServiceOrders = useMemo(
    () =>
      serviceOrders.filter((item) =>
        ["OPEN", "SCHEDULED", "DISPATCHED", "IN_PROGRESS", "ON_HOLD"].includes(item.status)
      ),
    [serviceOrders]
  );

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );

  const isLoading =
    overviewQuery.isLoading ||
    ticketsQuery.isLoading ||
    serviceOrdersQuery.isLoading ||
    quotesQuery.isLoading ||
    invoicesQuery.isLoading ||
    threadsQuery.isLoading;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#e9f4f7_0%,#f8fbfc_60%,#ffffff_100%)]">
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-brand-primary/20 bg-brand-primary p-5 text-white shadow-[0_18px_32px_rgba(7,56,77,0.28)]">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-highlight">Portal do cliente</p>
          <h1 className="mt-2 text-2xl font-black">{overview?.customer.name ?? "Carregando cliente..."}</h1>
          <p className="mt-1 text-sm text-white/85">
            Atendimento, agendamento, execucao da OS, faturamento e satisfacao em um unico ambiente.
          </p>

          <div className="mt-6 space-y-2">
            <article className="rounded-2xl bg-white/12 p-3">
              <p className="text-xs font-semibold uppercase text-white/80">Atendimento</p>
              <p className="mt-1 text-2xl font-black">{overview?.ticketSummary.open ?? 0}</p>
              <p className="text-xs text-white/80">Tickets ativos</p>
            </article>
            <article className="rounded-2xl bg-white/12 p-3">
              <p className="text-xs font-semibold uppercase text-white/80">Agendamento</p>
              <p className="mt-1 text-2xl font-black">{overview?.serviceOrderSummary.scheduled ?? 0}</p>
              <p className="text-xs text-white/80">OS agendadas</p>
            </article>
            <article className="rounded-2xl bg-white/12 p-3">
              <p className="text-xs font-semibold uppercase text-white/80">Execucao da OS</p>
              <p className="mt-1 text-2xl font-black">{overview?.serviceOrderSummary.inProgress ?? 0}</p>
              <p className="text-xs text-white/80">OS em andamento</p>
            </article>
            <article className="rounded-2xl bg-white/12 p-3">
              <p className="text-xs font-semibold uppercase text-white/80">Cobranca</p>
              <p className="mt-1 text-2xl font-black">{overview?.financeSummary.overdue ?? 0}</p>
              <p className="text-xs text-white/80">Faturas vencidas</p>
            </article>
            <article className="rounded-2xl bg-white/12 p-3">
              <p className="text-xs font-semibold uppercase text-white/80">Chat</p>
              <p className="mt-1 text-2xl font-black">{overview?.chatSummary.open ?? 0}</p>
              <p className="text-xs text-white/80">Conversas abertas</p>
            </article>
            <article className="rounded-2xl bg-white/12 p-3">
              <p className="text-xs font-semibold uppercase text-white/80">Satisfacao</p>
              <p className="mt-1 text-2xl font-black">{(overview?.satisfaction.avgNps ?? 0).toFixed(1)}</p>
              <p className="text-xs text-white/80">NPS medio</p>
            </article>
          </div>
        </aside>

        <section className="space-y-4">
          <header className="rounded-3xl border border-brand-primary/15 bg-white p-4 shadow-[0_12px_28px_rgba(7,56,77,0.12)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="inline-flex items-center gap-2 rounded-full bg-brand-highlight/60 px-3 py-1 text-xs font-black uppercase tracking-wide text-brand-primary">
                <ClipboardList className="h-3.5 w-3.5" />
                Jornada do cliente
              </p>
              <p className="text-xs font-semibold text-slate-500">Link seguro por token</p>
            </div>
            <h2 className="mt-2 text-xl font-black text-brand-primary">Acompanhamento de ponta a ponta</h2>
            <p className="text-sm text-slate-600">
              Consulte tickets, acompanhe a agenda da equipe, faturas e converse com o time operacional.
            </p>
          </header>

          <section className="rounded-3xl border border-brand-primary/15 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-brand-primary" />
              <h3 className="text-sm font-black uppercase tracking-wide text-brand-primary">Atendimento</h3>
            </div>
            <form
              className="mb-4 grid gap-2 md:grid-cols-[1.4fr_1fr_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                setErrorMsg(null);
                createTicketMutation.mutate();
              }}
            >
              <Input
                placeholder="Novo ticket: titulo"
                value={ticketTitle}
                onChange={(event) => setTicketTitle(event.target.value)}
                required
              />
              <select
                className="rounded-xl border px-3 py-2"
                value={ticketPriority}
                onChange={(event) =>
                  setTicketPriority(event.target.value as "LOW" | "MEDIUM" | "HIGH" | "URGENT")
                }
              >
                <option value="LOW">Prioridade baixa</option>
                <option value="MEDIUM">Prioridade media</option>
                <option value="HIGH">Prioridade alta</option>
                <option value="URGENT">Prioridade urgente</option>
              </select>
              <Button type="submit" disabled={createTicketMutation.isPending}>
                Abrir solicitacao
              </Button>
              <textarea
                className="md:col-span-3 w-full rounded-xl border px-3 py-2"
                rows={3}
                placeholder="Descricao do ticket"
                value={ticketDescription}
                onChange={(event) => setTicketDescription(event.target.value)}
              />
            </form>

            {errorMsg ? <p className="mb-2 text-sm text-red-600">{errorMsg}</p> : null}

            <div className="space-y-2">
              {tickets.map((ticket) => (
                <article className="rounded-2xl border border-slate-200 p-3" key={ticket.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {ticket.code} - {ticket.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        Status: {ticket.status} • Prioridade: {ticket.priority} • Aberto em {toDate(ticket.createdAt)}
                      </p>
                    </div>
                    {ticket.resolvedAt ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Resolvido
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
              {!isLoading && tickets.length === 0 ? (
                <p className="text-sm text-slate-600">Nenhum ticket aberto neste portal.</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl border border-brand-primary/15 bg-white p-4">
            <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-brand-primary">
              Agendamento + Execucao da OS
            </h3>
            <div className="space-y-2">
              {activeServiceOrders.map((order) => (
                <article className="rounded-2xl border border-slate-200 p-3" key={order.id}>
                  <p className="text-sm font-bold text-slate-800">
                    {order.code} - {order.title}
                  </p>
                  <p className="text-xs text-slate-500">
                    Status: {order.status} • Inicio: {toDate(order.scheduledStartAt ?? order.serviceDate)} • Tecnico:{" "}
                    {order.assignedTechnician?.name ?? "A definir"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Unidade: {order.siteLocation?.name ?? "-"}
                    {order.siteLocation?.city ? ` (${order.siteLocation.city})` : ""}
                  </p>
                </article>
              ))}
              {!isLoading && activeServiceOrders.length === 0 ? (
                <p className="text-sm text-slate-600">Sem agendamentos ativos no momento.</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl border border-brand-primary/15 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-brand-primary" />
              <h3 className="text-sm font-black uppercase tracking-wide text-brand-primary">
                Faturamento e recebimento
              </h3>
            </div>
            <div className="mb-4 space-y-2">
              {invoices.map((invoice) => (
                <article className="rounded-2xl border border-slate-200 p-3" key={invoice.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{invoice.code}</p>
                      <p className="text-xs text-slate-500">
                        Vencimento: {toDate(invoice.dueDate)} • Total: {toMoney(invoice.totalAmount)} • Saldo:{" "}
                        {toMoney(invoice.balanceAmount)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold ${INVOICE_STATUS_META[invoice.status].className}`}
                    >
                      {INVOICE_STATUS_META[invoice.status].label}
                    </span>
                  </div>
                  {invoice.status !== "PAID" && invoice.status !== "CANCELED" ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setPaymentInvoiceId(invoice.id);
                          setPaymentAmount(String(invoice.balanceAmount.toFixed(2)));
                        }}
                      >
                        Confirmar pagamento
                      </Button>
                    </div>
                  ) : null}
                </article>
              ))}
              {!isLoading && invoices.length === 0 ? (
                <p className="text-sm text-slate-600">Nenhuma fatura disponivel.</p>
              ) : null}
            </div>

            {paymentInvoiceId ? (
              <form
                className="rounded-2xl border border-brand-primary/20 bg-brand-primary/[0.03] p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  confirmPaymentMutation.mutate();
                }}
              >
                <p className="mb-2 text-sm font-semibold text-brand-primary">Confirmacao de pagamento</p>
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr]">
                  <Input
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    placeholder="Valor"
                  />
                  <select
                    className="rounded-xl border px-3 py-2"
                    value={paymentMethod}
                    onChange={(event) =>
                      setPaymentMethod(
                        event.target.value as
                          | "PIX"
                          | "CREDIT_CARD"
                          | "DEBIT_CARD"
                          | "BANK_SLIP"
                          | "CASH"
                          | "TRANSFER"
                          | "OTHER"
                      )
                    }
                  >
                    <option value="PIX">PIX</option>
                    <option value="CREDIT_CARD">Cartao credito</option>
                    <option value="DEBIT_CARD">Cartao debito</option>
                    <option value="BANK_SLIP">Boleto</option>
                    <option value="CASH">Dinheiro</option>
                    <option value="TRANSFER">Transferencia</option>
                    <option value="OTHER">Outro</option>
                  </select>
                  <Input
                    value={paymentReference}
                    onChange={(event) => setPaymentReference(event.target.value)}
                    placeholder="Referencia"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="submit" disabled={confirmPaymentMutation.isPending}>
                    {confirmPaymentMutation.isPending ? "Enviando..." : "Enviar confirmacao"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setPaymentInvoiceId("")}>
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : null}

            <div className="mt-4 space-y-2">
              {quotes.map((quote) => (
                <article className="rounded-2xl border border-slate-200 p-3" key={quote.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{quote.code}</p>
                      <p className="text-xs text-slate-500">
                        Status: {quote.status} • Validade: {toDate(quote.validUntil)}
                      </p>
                    </div>
                    <p className="text-sm font-black text-brand-primary">{toMoney(quote.total)}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-brand-primary/15 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-brand-primary" />
              <h3 className="text-sm font-black uppercase tracking-wide text-brand-primary">Chat</h3>
            </div>

            <form
              className="mb-4 grid gap-2 md:grid-cols-[1fr_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                createThreadMutation.mutate();
              }}
            >
              <Input
                placeholder="Assunto da conversa"
                value={chatSubject}
                onChange={(event) => setChatSubject(event.target.value)}
              />
              <Button type="submit" disabled={createThreadMutation.isPending || !chatSubject.trim() || !chatMessage.trim()}>
                Abrir conversa
              </Button>
              <textarea
                className="md:col-span-2 w-full rounded-xl border px-3 py-2"
                rows={3}
                placeholder="Mensagem"
                value={chatMessage}
                onChange={(event) => setChatMessage(event.target.value)}
              />
            </form>

            <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
              <div className="space-y-2">
                {threads.map((thread) => (
                  <button
                    className={`w-full rounded-xl border p-3 text-left ${
                      selectedThreadId === thread.id
                        ? "border-brand-primary bg-brand-primary/[0.04]"
                        : "border-slate-200 bg-white"
                    }`}
                    key={thread.id}
                    onClick={() => setSelectedThreadId(thread.id)}
                    type="button"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-800">{thread.subject}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          THREAD_STATUS_META[thread.status].className
                        }`}
                      >
                        {THREAD_STATUS_META[thread.status].label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{thread.code} • {toDate(thread.lastMessageAt ?? thread.createdAt)}</p>
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                {selectedThread ? (
                  <>
                    <p className="mb-2 text-sm font-bold text-brand-primary">
                      {selectedThread.code} - {selectedThread.subject}
                    </p>
                    <div className="mb-3 max-h-[240px] space-y-2 overflow-y-auto">
                      {selectedThreadMessages.map((message) => (
                        <div
                          className={`rounded-lg border p-2 ${
                            message.senderType === "CUSTOMER"
                              ? "border-brand-primary/20 bg-brand-primary/[0.04]"
                              : "border-slate-200 bg-slate-50"
                          }`}
                          key={message.id}
                        >
                          <p className="text-[11px] font-semibold text-slate-500">
                            {message.senderName ?? message.senderType} • {toDate(message.createdAt)}
                          </p>
                          <p className="text-sm text-slate-800 whitespace-pre-wrap">{message.message}</p>
                        </div>
                      ))}
                    </div>
                    <form
                      className="flex gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        sendReplyMutation.mutate();
                      }}
                    >
                      <Input
                        value={replyMessage}
                        onChange={(event) => setReplyMessage(event.target.value)}
                        placeholder="Responder conversa"
                      />
                      <Button type="submit" disabled={sendReplyMutation.isPending || !replyMessage.trim()}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </form>
                  </>
                ) : (
                  <p className="text-sm text-slate-600">Selecione uma conversa para ver as mensagens.</p>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-brand-primary/15 bg-white p-4">
            <div className="mb-2 flex items-center gap-2">
              <Star className="h-4 w-4 text-brand-primary" />
              <h3 className="text-sm font-black uppercase tracking-wide text-brand-primary">Satisfacao do cliente</h3>
            </div>
            <p className="text-sm text-slate-700">
              Feedbacks recebidos: <strong>{overview?.satisfaction.feedbacks ?? 0}</strong> • NPS medio: <strong>{(overview?.satisfaction.avgNps ?? 0).toFixed(2)}</strong> • CSAT medio: <strong>{(overview?.satisfaction.avgCsat ?? 0).toFixed(2)}</strong>
            </p>
          </section>
        </section>
      </div>
    </main>
  );
}
