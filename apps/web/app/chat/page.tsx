"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type ChatThreadStatus = "OPEN" | "CLOSED" | "ARCHIVED";
type ChatThreadChannel = "INTERNAL" | "WHATSAPP" | "PORTAL" | "EMAIL" | "PHONE";

type ChatOptionsPayload = {
  statuses: ChatThreadStatus[];
  channels: ChatThreadChannel[];
  customers: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string; role: string; email: string }>;
  serviceOrders: Array<{ id: string; code: string; title: string; status: string; customerId?: string | null }>;
  quotes: Array<{ id: string; code: string; status: string; customerId?: string | null }>;
  deskTickets: Array<{ id: string; code: string; title: string; status: string; customerId?: string | null }>;
};

type ChatThreadListItem = {
  id: string;
  code: string;
  subject: string;
  status: ChatThreadStatus;
  channel: ChatThreadChannel;
  createdAt: string;
  lastMessageAt?: string | null;
  customer?: { id: string; name: string } | null;
  assignedTo?: { id: string; name: string; role: string } | null;
  serviceOrder?: { id: string; code: string; title: string; status: string } | null;
  quote?: { id: string; code: string; status: string; total?: number } | null;
  deskTicket?: { id: string; code: string; title: string; status: string } | null;
  messages: Array<{
    id: string;
    senderType: "USER" | "CUSTOMER" | "SYSTEM";
    senderName?: string | null;
    message: string;
    createdAt: string;
  }>;
};

type ChatMessage = {
  id: string;
  senderType: "USER" | "CUSTOMER" | "SYSTEM";
  senderName?: string | null;
  message: string;
  createdAt: string;
  senderUser?: { id: string; name: string; role: string } | null;
  senderCustomer?: { id: string; name: string } | null;
};

const STATUS_META: Record<ChatThreadStatus, { label: string; className: string }> = {
  OPEN: { label: "Aberta", className: "bg-emerald-100 text-emerald-700" },
  CLOSED: { label: "Fechada", className: "bg-slate-200 text-slate-700" },
  ARCHIVED: { label: "Arquivada", className: "bg-slate-300 text-slate-700" }
};

const CHANNEL_LABEL: Record<ChatThreadChannel, string> = {
  INTERNAL: "Interno",
  WHATSAPP: "WhatsApp",
  PORTAL: "Portal",
  EMAIL: "Email",
  PHONE: "Telefone"
};

const toDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "-");

export default function ChatPage() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<ChatThreadStatus | "ALL">("ALL");
  const [channelFilter, setChannelFilter] = useState<ChatThreadChannel | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");

  const [openCreate, setOpenCreate] = useState(false);
  const [subject, setSubject] = useState("");
  const [channel, setChannel] = useState<ChatThreadChannel>("INTERNAL");
  const [customerId, setCustomerId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [serviceOrderId, setServiceOrderId] = useState("");
  const [quoteId, setQuoteId] = useState("");
  const [deskTicketId, setDeskTicketId] = useState("");
  const [initialMessage, setInitialMessage] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const optionsQuery = useQuery({
    queryKey: ["chat-options"],
    queryFn: () => api.get<ChatOptionsPayload>("/chat/options")
  });

  const threadsQuery = useQuery({
    queryKey: ["chat-threads", statusFilter, channelFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (channelFilter !== "ALL") params.set("channel", channelFilter);
      if (search.trim()) params.set("search", search.trim());
      return api.get<ChatThreadListItem[]>(`/chat/threads${params.toString() ? `?${params.toString()}` : ""}`);
    }
  });

  const selectedThreadQuery = useQuery({
    queryKey: ["chat-thread-messages", selectedThreadId],
    queryFn: () => api.get<ChatMessage[]>(`/chat/threads/${selectedThreadId}/messages?limit=300`),
    enabled: Boolean(selectedThreadId)
  });

  const createThreadMutation = useMutation({
    mutationFn: () =>
      api.post<ChatThreadListItem>("/chat/threads", {
        subject: subject.trim(),
        channel,
        customerId: customerId || undefined,
        assignedToId: assignedToId || undefined,
        serviceOrderId: serviceOrderId || undefined,
        quoteId: quoteId || undefined,
        deskTicketId: deskTicketId || undefined,
        initialMessage: initialMessage.trim() || undefined
      }),
    onSuccess: (thread) => {
      setOpenCreate(false);
      setSubject("");
      setChannel("INTERNAL");
      setCustomerId("");
      setAssignedToId("");
      setServiceOrderId("");
      setQuoteId("");
      setDeskTicketId("");
      setInitialMessage("");
      setErrorMsg(null);
      setSelectedThreadId(thread.id);
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const postMessageMutation = useMutation({
    mutationFn: () => {
      if (!selectedThreadId) {
        throw new Error("Selecione uma conversa");
      }
      return api.post(`/chat/threads/${selectedThreadId}/messages`, {
        message: newMessage.trim()
      });
    },
    onSuccess: () => {
      setNewMessage("");
      setErrorMsg(null);
      queryClient.invalidateQueries({ queryKey: ["chat-thread-messages", selectedThreadId] });
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ threadId, status }: { threadId: string; status: ChatThreadStatus }) =>
      api.post(`/chat/threads/${threadId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      queryClient.invalidateQueries({ queryKey: ["chat-thread-messages", selectedThreadId] });
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const threads = threadsQuery.data ?? [];
  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );
  const messages = selectedThreadQuery.data ?? [];
  const options = optionsQuery.data;

  const filteredServiceOrders = useMemo(() => {
    if (!customerId) return options?.serviceOrders ?? [];
    return (options?.serviceOrders ?? []).filter((item) => item.customerId === customerId);
  }, [customerId, options?.serviceOrders]);

  const filteredQuotes = useMemo(() => {
    if (!customerId) return options?.quotes ?? [];
    return (options?.quotes ?? []).filter((item) => item.customerId === customerId);
  }, [customerId, options?.quotes]);

  const filteredTickets = useMemo(() => {
    if (!customerId) return options?.deskTickets ?? [];
    return (options?.deskTickets ?? []).filter((item) => item.customerId === customerId);
  }, [customerId, options?.deskTickets]);

  return (
    <RequireAuth>
      <AppShell>
        <section className="mb-5 rounded-3xl border border-brand-primary/15 bg-white p-4 shadow-[0_10px_25px_rgba(7,56,77,0.12)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-brand-highlight/70 px-3 py-1 text-xs font-black uppercase tracking-wide text-brand-primary">
                <MessageCircle className="h-3.5 w-3.5" />
                Chat operacional
              </p>
              <h1 className="mt-2 text-2xl font-black text-brand-primary">Conversas integradas</h1>
              <p className="text-sm text-slate-600">
                Chat conectado com ticket, ordem de servico e orcamento em um fluxo unico.
              </p>
            </div>
            <Dialog open={openCreate} onOpenChange={setOpenCreate}>
              <DialogTrigger asChild>
                <Button>Nova conversa</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Criar conversa</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setErrorMsg(null);
                    createThreadMutation.mutate();
                  }}
                >
                  <Input placeholder="Assunto" value={subject} onChange={(event) => setSubject(event.target.value)} required />
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      className="rounded-xl border px-3 py-2"
                      value={channel}
                      onChange={(event) => setChannel(event.target.value as ChatThreadChannel)}
                    >
                      {(options?.channels ?? []).map((item) => (
                        <option key={item} value={item}>
                          {CHANNEL_LABEL[item]}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-xl border px-3 py-2"
                      value={customerId}
                      onChange={(event) => setCustomerId(event.target.value)}
                    >
                      <option value="">Sem cliente</option>
                      {(options?.customers ?? []).map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-xl border px-3 py-2"
                      value={assignedToId}
                      onChange={(event) => setAssignedToId(event.target.value)}
                    >
                      <option value="">Sem responsavel</option>
                      {(options?.users ?? []).map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} ({user.role})
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-xl border px-3 py-2"
                      value={serviceOrderId}
                      onChange={(event) => setServiceOrderId(event.target.value)}
                    >
                      <option value="">Sem OS</option>
                      {filteredServiceOrders.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} - {item.title}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-xl border px-3 py-2"
                      value={quoteId}
                      onChange={(event) => setQuoteId(event.target.value)}
                    >
                      <option value="">Sem orcamento</option>
                      {filteredQuotes.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} ({item.status})
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-xl border px-3 py-2"
                      value={deskTicketId}
                      onChange={(event) => setDeskTicketId(event.target.value)}
                    >
                      <option value="">Sem ticket</option>
                      {filteredTickets.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} - {item.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    className="w-full rounded-xl border px-3 py-2"
                    rows={4}
                    placeholder="Mensagem inicial (opcional)"
                    value={initialMessage}
                    onChange={(event) => setInitialMessage(event.target.value)}
                  />
                  {errorMsg ? <p className="text-sm text-red-600">{errorMsg}</p> : null}
                  <Button className="w-full" type="submit" disabled={createThreadMutation.isPending}>
                    {createThreadMutation.isPending ? "Criando..." : "Criar conversa"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </section>

        <section className="mb-4 card p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Input placeholder="Buscar por codigo/assunto/cliente" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select
              className="rounded-xl border px-3 py-2"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ChatThreadStatus | "ALL")}
            >
              <option value="ALL">Todos os status</option>
              {(options?.statuses ?? []).map((status) => (
                <option key={status} value={status}>
                  {STATUS_META[status].label}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border px-3 py-2"
              value={channelFilter}
              onChange={(event) => setChannelFilter(event.target.value as ChatThreadChannel | "ALL")}
            >
              <option value="ALL">Todos os canais</option>
              {(options?.channels ?? []).map((item) => (
                <option key={item} value={item}>
                  {CHANNEL_LABEL[item]}
                </option>
              ))}
            </select>
          </div>
        </section>

        {errorMsg ? <p className="mb-3 text-sm text-red-600">{errorMsg}</p> : null}

        <section className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="space-y-3">
            {threads.map((thread) => (
              <button
                className={`w-full rounded-2xl border p-3 text-left transition ${
                  selectedThreadId === thread.id
                    ? "border-brand-primary bg-brand-primary/[0.04]"
                    : "border-slate-200 bg-white hover:border-brand-primary/40"
                }`}
                key={thread.id}
                onClick={() => setSelectedThreadId(thread.id)}
                type="button"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-brand-primary">
                      {thread.code} - {thread.subject}
                    </p>
                    <p className="text-xs text-slate-500">{thread.customer?.name ?? "Sem cliente"}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_META[thread.status].className}`}>
                    {STATUS_META[thread.status].label}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {CHANNEL_LABEL[thread.channel]} • Ultima mensagem em {toDateTime(thread.lastMessageAt ?? thread.createdAt)}
                </p>
                {thread.messages[0] ? (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">{thread.messages[0].message}</p>
                ) : null}
              </button>
            ))}
            {!threadsQuery.isLoading && threads.length === 0 ? (
              <div className="card p-4 text-sm text-slate-600">Nenhuma conversa encontrada.</div>
            ) : null}
          </aside>

          <article className="card min-h-[480px] p-4">
            {selectedThread ? (
              <>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b pb-3">
                  <div>
                    <h2 className="text-lg font-bold text-brand-primary">
                      {selectedThread.code} - {selectedThread.subject}
                    </h2>
                    <p className="text-sm text-slate-600">
                      Cliente: {selectedThread.customer?.name ?? "-"} • Canal: {CHANNEL_LABEL[selectedThread.channel]}
                    </p>
                    <p className="text-xs text-slate-500">
                      Responsavel: {selectedThread.assignedTo?.name ?? "-"} •
                      Referencias: OS {selectedThread.serviceOrder?.code ?? "-"} / Ticket {selectedThread.deskTicket?.code ?? "-"} / Orc {selectedThread.quote?.code ?? "-"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-xl border px-3 py-2 text-sm"
                      value={selectedThread.status}
                      onChange={(event) =>
                        setStatusMutation.mutate({
                          threadId: selectedThread.id,
                          status: event.target.value as ChatThreadStatus
                        })
                      }
                    >
                      {(options?.statuses ?? []).map((status) => (
                        <option key={`${selectedThread.id}-${status}`} value={status}>
                          {STATUS_META[status].label}
                        </option>
                      ))}
                    </select>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      <UsersRound className="h-3.5 w-3.5" />
                      {messages.length} mensagens
                    </span>
                  </div>
                </div>

                <div className="mb-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                  {messages.map((message) => (
                    <div
                      className={`rounded-xl border p-3 ${
                        message.senderType === "CUSTOMER"
                          ? "border-brand-primary/20 bg-brand-primary/[0.04]"
                          : "border-slate-200 bg-slate-50"
                      }`}
                      key={message.id}
                    >
                      <p className="mb-1 text-xs font-semibold text-slate-600">
                        {message.senderName ??
                          message.senderUser?.name ??
                          message.senderCustomer?.name ??
                          message.senderType}
                        {" • "}
                        {toDateTime(message.createdAt)}
                      </p>
                      <p className="text-sm text-slate-800 whitespace-pre-wrap">{message.message}</p>
                    </div>
                  ))}
                  {!selectedThreadQuery.isLoading && messages.length === 0 ? (
                    <p className="text-sm text-slate-600">Sem mensagens ainda.</p>
                  ) : null}
                </div>

                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    postMessageMutation.mutate();
                  }}
                >
                  <Input
                    className="min-w-[240px] flex-1"
                    value={newMessage}
                    onChange={(event) => setNewMessage(event.target.value)}
                    placeholder="Digite a resposta..."
                  />
                  <Button type="submit" disabled={postMessageMutation.isPending || !newMessage.trim()}>
                    <Send className="mr-1 h-4 w-4" />
                    {postMessageMutation.isPending ? "Enviando..." : "Enviar"}
                  </Button>
                </form>
              </>
            ) : (
              <div className="flex h-full min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                Selecione uma conversa para visualizar mensagens.
              </div>
            )}
          </article>
        </section>
      </AppShell>
    </RequireAuth>
  );
}
