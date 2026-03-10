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

type ExpenseStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
type ExpenseType = "FUEL" | "TOLL" | "PARKING" | "MEAL" | "LODGING" | "OTHER";

type Expense = {
  id: string;
  type: ExpenseType;
  amount: number;
  currency: string;
  distanceKm?: number | null;
  expenseDate: string;
  description?: string | null;
  status: ExpenseStatus;
  serviceOrder?: { id: string; code: string; title: string } | null;
  technician: { id: string; name: string; email: string };
  approvedBy?: { id: string; name: string } | null;
};

type KmSummary = {
  totals: {
    totalAmount: number;
    totalKm: number;
    entries: number;
  };
  byType: Array<{
    type: ExpenseType;
    totalAmount: number;
    totalKm: number;
    entries: number;
  }>;
};

const MANAGER_ROLES = new Set(["SUPERADMIN", "ADMIN", "SUPERVISOR"]);

const STATUS_META: Record<ExpenseStatus, { label: string; className: string }> = {
  DRAFT: { label: "Rascunho", className: "bg-slate-100 text-slate-700" },
  SUBMITTED: { label: "Submetida", className: "bg-sky-100 text-sky-700" },
  APPROVED: { label: "Aprovada", className: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Rejeitada", className: "bg-rose-100 text-rose-700" }
};

const toMoney = (amount: number, currency = "BRL") =>
  amount.toLocaleString("pt-BR", { style: "currency", currency });

const toDate = (value: string) => new Date(value).toLocaleDateString("pt-BR");

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const user = authStorage.getUser();
  const managerView = MANAGER_ROLES.has(user?.role ?? "");

  const [statusFilter, setStatusFilter] = useState<"ALL" | ExpenseStatus>("ALL");
  const [serviceOrderId, setServiceOrderId] = useState("");
  const [type, setType] = useState<ExpenseType>("FUEL");
  const [amount, setAmount] = useState("0");
  const [distanceKm, setDistanceKm] = useState("");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const expensesQuery = useQuery({
    queryKey: ["expenses", statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      return api.get<Expense[]>(`/expenses${params.toString() ? `?${params.toString()}` : ""}`);
    }
  });

  const summaryQuery = useQuery({
    queryKey: ["expenses-summary"],
    queryFn: () => api.get<KmSummary>("/expenses/km-summary")
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["expenses-summary"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<Expense>("/expenses", {
        serviceOrderId: serviceOrderId.trim() || undefined,
        type,
        amount: Number(amount.replace(",", ".")),
        distanceKm: distanceKm.trim() ? Number(distanceKm.replace(",", ".")) : undefined,
        description: description.trim() || undefined,
        expenseDate: expenseDate ? new Date(`${expenseDate}T12:00:00`).toISOString() : undefined
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setServiceOrderId("");
      setType("FUEL");
      setAmount("0");
      setDistanceKm("");
      setDescription("");
      setExpenseDate("");
      setErrorMsg(null);
      refresh();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) => api.post(`/expenses/${id}/submit`, {}),
    onSuccess: refresh,
    onError: (error) => setErrorMsg(error.message)
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      api.post(`/expenses/${id}/approve`, { approved }),
    onSuccess: refresh,
    onError: (error) => setErrorMsg(error.message)
  });

  const expenses = expensesQuery.data ?? [];
  const summary = summaryQuery.data;

  const totals = useMemo(
    () =>
      expenses.reduce(
        (acc, expense) => {
          acc.amount += expense.amount;
          acc.km += expense.distanceKm ?? 0;
          return acc;
        },
        { amount: 0, km: 0 }
      ),
    [expenses]
  );

  return (
    <RequireAuth>
      <AppShell>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-brand-primary">Km rodado e despesas</h1>
            <p className="text-sm text-slate-600">
              Lancamento operacional, submissao e aprovacao de despesas ligadas ao campo.
            </p>
          </div>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>Nova despesa</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar despesa</DialogTitle>
              </DialogHeader>

              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  setErrorMsg(null);
                  createMutation.mutate();
                }}
              >
                <Input
                  placeholder="ID da ordem de servico (opcional)"
                  value={serviceOrderId}
                  onChange={(event) => setServiceOrderId(event.target.value)}
                />
                <select className="w-full rounded-xl border px-3 py-2" value={type} onChange={(event) => setType(event.target.value as ExpenseType)}>
                  <option value="FUEL">Combustivel</option>
                  <option value="TOLL">Pedagio</option>
                  <option value="PARKING">Estacionamento</option>
                  <option value="MEAL">Alimentacao</option>
                  <option value="LODGING">Hospedagem</option>
                  <option value="OTHER">Outro</option>
                </select>
                <Input placeholder="Valor" value={amount} onChange={(event) => setAmount(event.target.value)} required />
                <Input placeholder="Km (opcional)" value={distanceKm} onChange={(event) => setDistanceKm(event.target.value)} />
                <Input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} />
                <textarea
                  className="w-full rounded-xl border px-3 py-2"
                  rows={3}
                  placeholder="Descricao"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />

                {errorMsg ? <p className="text-sm text-red-600">{errorMsg}</p> : null}
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <section className="mb-4 grid gap-3 md:grid-cols-4">
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Despesas listadas</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{expenses.length}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Valor listado</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{toMoney(totals.amount)}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Km listado</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{totals.km.toFixed(2)}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Filtro status</p>
            <select
              className="mt-2 w-full rounded-xl border px-3 py-2"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "ALL" | ExpenseStatus)}
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

        {summary ? (
          <section className="mb-4 card p-4">
            <h2 className="mb-2 text-sm font-bold text-brand-primary">Resumo consolidado</h2>
            <p className="text-sm">
              Total aprovado/submetido: <strong>{toMoney(summary.totals.totalAmount)}</strong> | Km: <strong>{summary.totals.totalKm.toFixed(2)}</strong>
            </p>
          </section>
        ) : null}

        {errorMsg ? <p className="mb-4 text-sm text-red-600">{errorMsg}</p> : null}

        <section className="space-y-3">
          {expenses.map((expense) => (
            <article className="card p-4" key={expense.id}>
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-brand-primary">{expense.type} - {toMoney(expense.amount, expense.currency)}</p>
                  <p className="text-sm text-slate-600">Tecnico: {expense.technician.name}</p>
                  <p className="text-xs text-slate-500">OS: {expense.serviceOrder?.code ?? "-"}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_META[expense.status].className}`}>
                  {STATUS_META[expense.status].label}
                </span>
              </div>

              <div className="grid gap-2 text-sm md:grid-cols-3">
                <p><strong>Data:</strong> {toDate(expense.expenseDate)}</p>
                <p><strong>Km:</strong> {expense.distanceKm?.toFixed(2) ?? "-"}</p>
                <p><strong>Aprovador:</strong> {expense.approvedBy?.name ?? "-"}</p>
              </div>

              <p className="mt-2 text-sm text-slate-700">{expense.description?.trim() || "Sem descricao"}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {expense.status === "DRAFT" || expense.status === "REJECTED" ? (
                  <Button variant="outline" onClick={() => submitMutation.mutate(expense.id)}>
                    Submeter
                  </Button>
                ) : null}
                {managerView && expense.status === "SUBMITTED" ? (
                  <Button onClick={() => approveMutation.mutate({ id: expense.id, approved: true })}>Aprovar</Button>
                ) : null}
                {managerView && expense.status === "SUBMITTED" ? (
                  <Button variant="danger" onClick={() => approveMutation.mutate({ id: expense.id, approved: false })}>
                    Rejeitar
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
          {!expensesQuery.isLoading && expenses.length === 0 ? (
            <div className="card p-4 text-sm text-slate-600">Nenhuma despesa registrada.</div>
          ) : null}
        </section>
      </AppShell>
    </RequireAuth>
  );
}
