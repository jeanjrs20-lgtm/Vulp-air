"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Filter,
  MapPin,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
  Users2
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { authStorage } from "@/lib/auth-storage";

type CustomerStatus = "ACTIVE" | "INACTIVE";

type CustomerSite = {
  id: string;
  name: string;
  address: string;
  city?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusMeters?: number | null;
};

type CustomerListItem = {
  id: string;
  name: string;
  legalName?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  status: CustomerStatus;
  customerGroup?: string | null;
  segment?: string | null;
  contactName?: string | null;
  billingEmail?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  sites: Array<{
    id: string;
    name: string;
    city?: string | null;
    state?: string | null;
  }>;
  openTickets: number;
  overdueInvoices: number;
  openServiceOrders: number;
};

type CustomerDetail = Omit<CustomerListItem, "sites"> & {
  serviceOrders: Array<{
    id: string;
    code: string;
    title: string;
    status: string;
    serviceDate?: string | null;
  }>;
  deskTickets: Array<{
    id: string;
    code: string;
    title: string;
    status: string;
    priority: string;
    createdAt: string;
  }>;
  sites: CustomerSite[];
  metrics: {
    totalInvoices: number;
    totalBilled: number;
    totalOutstanding: number;
    totalQuotes: number;
    totalQuoted: number;
  };
};

type CustomerSummary = {
  total: number;
  active: number;
  inactive: number;
  withOpenTickets: number;
  withOverdueInvoices: number;
};

type CustomerOptions = {
  statuses: CustomerStatus[];
  groups: string[];
  segments: string[];
  states: string[];
  cities: string[];
};

const STATUS_META: Record<CustomerStatus, { label: string; className: string }> = {
  ACTIVE: {
    label: "Ativo",
    className: "bg-emerald-100 text-emerald-700"
  },
  INACTIVE: {
    label: "Inativo",
    className: "bg-slate-200 text-slate-700"
  }
};

const MANAGER_ROLES = new Set(["SUPERADMIN", "ADMIN", "SUPERVISOR"]);

const toMoney = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

const toDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "-");

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const user = authStorage.getUser();
  const managerView = MANAGER_ROLES.has(user?.role ?? "");

  const [searchName, setSearchName] = useState("");
  const [searchDocument, setSearchDocument] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | CustomerStatus>("ALL");
  const [groupFilter, setGroupFilter] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLegalName, setNewLegalName] = useState("");
  const [newDocument, setNewDocument] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newStatus, setNewStatus] = useState<CustomerStatus>("ACTIVE");
  const [newGroup, setNewGroup] = useState("");
  const [newSegment, setNewSegment] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newBillingEmail, setNewBillingEmail] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteAddress, setNewSiteAddress] = useState("");
  const [newSiteCity, setNewSiteCity] = useState("");
  const [newSiteState, setNewSiteState] = useState("");
  const [newSiteRadius, setNewSiteRadius] = useState("200");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["customers-summary"],
    queryFn: () => api.get<CustomerSummary>("/customers/summary")
  });

  const optionsQuery = useQuery({
    queryKey: ["customers-options"],
    queryFn: () => api.get<CustomerOptions>("/customers/options")
  });

  const customersQuery = useQuery({
    queryKey: [
      "customers-list",
      searchName,
      searchDocument,
      statusFilter,
      groupFilter,
      segmentFilter,
      stateFilter,
      cityFilter
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchName.trim()) params.set("searchName", searchName.trim());
      if (searchDocument.trim()) params.set("searchDocument", searchDocument.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (groupFilter) params.set("customerGroup", groupFilter);
      if (segmentFilter) params.set("segment", segmentFilter);
      if (stateFilter) params.set("state", stateFilter);
      if (cityFilter) params.set("city", cityFilter);
      return api.get<CustomerListItem[]>(`/customers${params.toString() ? `?${params.toString()}` : ""}`);
    }
  });

  const selectedCustomerQuery = useQuery({
    queryKey: ["customers-detail", selectedCustomerId],
    queryFn: () => api.get<CustomerDetail>(`/customers/${selectedCustomerId}`),
    enabled: Boolean(selectedCustomerId)
  });

  const clearCreateForm = () => {
    setNewName("");
    setNewLegalName("");
    setNewDocument("");
    setNewEmail("");
    setNewPhone("");
    setNewStatus("ACTIVE");
    setNewGroup("");
    setNewSegment("");
    setNewContactName("");
    setNewBillingEmail("");
    setNewNotes("");
    setNewSiteName("");
    setNewSiteAddress("");
    setNewSiteCity("");
    setNewSiteState("");
    setNewSiteRadius("200");
  };

  const refreshCustomers = () => {
    queryClient.invalidateQueries({ queryKey: ["customers-list"] });
    queryClient.invalidateQueries({ queryKey: ["customers-summary"] });
    queryClient.invalidateQueries({ queryKey: ["customers-options"] });
    queryClient.invalidateQueries({ queryKey: ["customers-detail"] });
  };

  const createCustomerMutation = useMutation({
    mutationFn: () =>
      api.post("/customers", {
        name: newName.trim(),
        legalName: newLegalName.trim() || undefined,
        document: newDocument.trim() || undefined,
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
        status: newStatus,
        customerGroup: newGroup.trim() || undefined,
        segment: newSegment.trim() || undefined,
        contactName: newContactName.trim() || undefined,
        billingEmail: newBillingEmail.trim() || undefined,
        notes: newNotes.trim() || undefined,
        sites:
          newSiteName.trim() && newSiteAddress.trim()
            ? [
                {
                  name: newSiteName.trim(),
                  address: newSiteAddress.trim(),
                  city: newSiteCity.trim() || undefined,
                  state: newSiteState.trim() || undefined,
                  geofenceRadiusMeters: Number(newSiteRadius) || 200
                }
              ]
            : undefined
      }),
    onSuccess: () => {
      setOpenCreate(false);
      setErrorMsg(null);
      clearCreateForm();
      refreshCustomers();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const updateCustomerMutation = useMutation({
    mutationFn: () =>
      api.patch(`/customers/${selectedCustomerId}`, {
        name: newName.trim(),
        legalName: newLegalName.trim() || null,
        document: newDocument.trim() || null,
        email: newEmail.trim() || null,
        phone: newPhone.trim() || null,
        status: newStatus,
        customerGroup: newGroup.trim() || null,
        segment: newSegment.trim() || null,
        contactName: newContactName.trim() || null,
        billingEmail: newBillingEmail.trim() || null,
        notes: newNotes.trim() || null
      }),
    onSuccess: () => {
      setOpenEdit(false);
      setErrorMsg(null);
      refreshCustomers();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const customers = customersQuery.data ?? [];
  const selectedCustomer = selectedCustomerQuery.data ?? null;
  const options = optionsQuery.data;
  const summary = summaryQuery.data;

  const loadEditForm = () => {
    if (!selectedCustomer) {
      return;
    }

    setNewName(selectedCustomer.name);
    setNewLegalName(selectedCustomer.legalName ?? "");
    setNewDocument(selectedCustomer.document ?? "");
    setNewEmail(selectedCustomer.email ?? "");
    setNewPhone(selectedCustomer.phone ?? "");
    setNewStatus(selectedCustomer.status);
    setNewGroup(selectedCustomer.customerGroup ?? "");
    setNewSegment(selectedCustomer.segment ?? "");
    setNewContactName(selectedCustomer.contactName ?? "");
    setNewBillingEmail(selectedCustomer.billingEmail ?? "");
    setNewNotes(selectedCustomer.notes ?? "");
  };

  const activeFilters = useMemo(
    () =>
      Number(Boolean(searchName.trim())) +
      Number(Boolean(searchDocument.trim())) +
      Number(statusFilter !== "ALL") +
      Number(Boolean(groupFilter)) +
      Number(Boolean(segmentFilter)) +
      Number(Boolean(stateFilter)) +
      Number(Boolean(cityFilter)),
    [searchName, searchDocument, statusFilter, groupFilter, segmentFilter, stateFilter, cityFilter]
  );

  return (
    <RequireAuth>
      <AppShell>
        <section className="mb-5 rounded-3xl border border-brand-primary/20 bg-white p-4 shadow-[0_12px_30px_rgba(7,56,77,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-brand-highlight/70 px-3 py-1 text-xs font-black uppercase tracking-wide text-brand-primary">
                <Users2 className="h-3.5 w-3.5" />
                Cadastros
              </p>
              <h1 className="mt-2 text-2xl font-black text-brand-primary">Cadastro robusto de clientes</h1>
              <p className="text-sm text-slate-600">
                Controle dados fiscais, contatos, grupos, segmentos e unidades em um unico fluxo.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={refreshCustomers} type="button" variant="outline">
                <RefreshCcw className="mr-1 h-4 w-4" />
                Atualizar
              </Button>
              <Dialog open={openCreate} onOpenChange={setOpenCreate}>
                <DialogTrigger asChild>
                  <Button disabled={!managerView} onClick={() => setErrorMsg(null)}>
                    <Plus className="mr-1 h-4 w-4" />
                    Novo cliente
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-auto">
                  <DialogHeader>
                    <DialogTitle>Novo cliente</DialogTitle>
                  </DialogHeader>
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      createCustomerMutation.mutate();
                    }}
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input placeholder="Nome fantasia*" required value={newName} onChange={(event) => setNewName(event.target.value)} />
                      <Input placeholder="Razao social" value={newLegalName} onChange={(event) => setNewLegalName(event.target.value)} />
                      <Input placeholder="CNPJ / CPF" value={newDocument} onChange={(event) => setNewDocument(event.target.value)} />
                      <Input placeholder="E-mail principal" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
                      <Input placeholder="Telefone" value={newPhone} onChange={(event) => setNewPhone(event.target.value)} />
                      <Input placeholder="Contato principal" value={newContactName} onChange={(event) => setNewContactName(event.target.value)} />
                      <Input placeholder="Grupo" value={newGroup} onChange={(event) => setNewGroup(event.target.value)} />
                      <Input placeholder="Segmento" value={newSegment} onChange={(event) => setNewSegment(event.target.value)} />
                    </div>

                    <Input placeholder="E-mail financeiro" value={newBillingEmail} onChange={(event) => setNewBillingEmail(event.target.value)} />
                    <textarea className="w-full rounded-xl border px-3 py-2" placeholder="Observacoes" rows={3} value={newNotes} onChange={(event) => setNewNotes(event.target.value)} />

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Unidade inicial (opcional)</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input placeholder="Nome da unidade" value={newSiteName} onChange={(event) => setNewSiteName(event.target.value)} />
                        <Input placeholder="Endereco" value={newSiteAddress} onChange={(event) => setNewSiteAddress(event.target.value)} />
                        <Input placeholder="Cidade" value={newSiteCity} onChange={(event) => setNewSiteCity(event.target.value)} />
                        <Input placeholder="UF" maxLength={2} value={newSiteState} onChange={(event) => setNewSiteState(event.target.value.toUpperCase())} />
                        <Input placeholder="Raio geofence (m)" value={newSiteRadius} onChange={(event) => setNewSiteRadius(event.target.value)} />
                      </div>
                    </div>

                    {errorMsg ? <p className="text-sm text-red-600">{errorMsg}</p> : null}
                    <Button className="w-full" disabled={createCustomerMutation.isPending} type="submit">
                      {createCustomerMutation.isPending ? "Salvando..." : "Salvar cliente"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </section>

        <section className="mb-4 grid gap-3 md:grid-cols-5">
          <article className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Clientes</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{summary?.total ?? 0}</p>
          </article>
          <article className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Ativos</p>
            <p className="mt-2 text-2xl font-black text-emerald-700">{summary?.active ?? 0}</p>
          </article>
          <article className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Inativos</p>
            <p className="mt-2 text-2xl font-black text-slate-700">{summary?.inactive ?? 0}</p>
          </article>
          <article className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Com ticket aberto</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{summary?.withOpenTickets ?? 0}</p>
          </article>
          <article className="card border-rose-200 bg-rose-50 p-3">
            <p className="text-xs font-semibold uppercase text-rose-700">Com inadimplencia</p>
            <p className="mt-2 text-2xl font-black text-rose-700">{summary?.withOverdueInvoices ?? 0}</p>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="card overflow-auto">
            <table className="min-w-[980px] text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-3 py-3">Nome</th>
                  <th className="px-3 py-3">Documento</th>
                  <th className="px-3 py-3">Grupo</th>
                  <th className="px-3 py-3">Segmento</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Unidades</th>
                  <th className="px-3 py-3">Tickets abertos</th>
                  <th className="px-3 py-3">Inadimplencia</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr
                    className={`cursor-pointer border-b hover:bg-slate-50 ${
                      selectedCustomerId === customer.id ? "bg-brand-primary/5" : ""
                    }`}
                    key={customer.id}
                    onClick={() => setSelectedCustomerId(customer.id)}
                  >
                    <td className="px-3 py-3">
                      <p className="font-semibold text-brand-primary">{customer.name}</p>
                      <p className="text-xs text-slate-500">{customer.legalName ?? "Sem razao social"}</p>
                    </td>
                    <td className="px-3 py-3">{customer.document ?? "-"}</td>
                    <td className="px-3 py-3">{customer.customerGroup ?? "-"}</td>
                    <td className="px-3 py-3">{customer.segment ?? "-"}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_META[customer.status].className}`}>
                        {STATUS_META[customer.status].label}
                      </span>
                    </td>
                    <td className="px-3 py-3">{customer.sites.length}</td>
                    <td className="px-3 py-3">{customer.openTickets}</td>
                    <td className="px-3 py-3">{customer.overdueInvoices}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!customersQuery.isLoading && customers.length === 0 ? (
              <p className="p-4 text-sm text-slate-600">Nenhum cliente encontrado para os filtros.</p>
            ) : null}
          </div>

          <aside className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-black text-brand-primary">Filtros</h2>
              <span className="rounded-full bg-brand-primary/10 px-2 py-1 text-xs font-semibold text-brand-primary">
                {activeFilters} ativos
              </span>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-600">
                <Search className="mr-1 inline h-4 w-4" />
                Nome
                <Input className="mt-1" placeholder="Buscar por nome" value={searchName} onChange={(event) => setSearchName(event.target.value)} />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                Documento
                <Input className="mt-1" placeholder="CNPJ ou CPF" value={searchDocument} onChange={(event) => setSearchDocument(event.target.value)} />
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                Grupo
                <select className="mt-1 w-full rounded-xl border px-3 py-2" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
                  <option value="">Todos</option>
                  {(options?.groups ?? []).map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                Segmento
                <select className="mt-1 w-full rounded-xl border px-3 py-2" value={segmentFilter} onChange={(event) => setSegmentFilter(event.target.value)}>
                  <option value="">Todos</option>
                  {(options?.segments ?? []).map((segment) => (
                    <option key={segment} value={segment}>
                      {segment}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                Status
                <select className="mt-1 w-full rounded-xl border px-3 py-2" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "ALL" | CustomerStatus)}>
                  <option value="ALL">Todos</option>
                  {(options?.statuses ?? []).map((status) => (
                    <option key={status} value={status}>
                      {STATUS_META[status].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                Estado
                <select className="mt-1 w-full rounded-xl border px-3 py-2" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
                  <option value="">Todos</option>
                  {(options?.states ?? []).map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                Cidade
                <select className="mt-1 w-full rounded-xl border px-3 py-2" value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
                  <option value="">Todas</option>
                  {(options?.cities ?? []).map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                className="w-full"
                onClick={() => {
                  setSearchName("");
                  setSearchDocument("");
                  setStatusFilter("ALL");
                  setGroupFilter("");
                  setSegmentFilter("");
                  setStateFilter("");
                  setCityFilter("");
                }}
                type="button"
                variant="outline"
              >
                <Filter className="mr-1 h-4 w-4" />
                Limpar filtros
              </Button>
            </div>
          </aside>
        </section>

        {selectedCustomer ? (
          <section className="mt-4 card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Cliente selecionado</p>
                <h2 className="text-2xl font-black text-brand-primary">{selectedCustomer.name}</h2>
                <p className="text-sm text-slate-600">
                  {selectedCustomer.document ?? "Sem documento"} - Atualizado em {toDateTime(selectedCustomer.updatedAt)}
                </p>
              </div>
              {managerView ? (
                <Dialog open={openEdit} onOpenChange={setOpenEdit}>
                  <DialogTrigger asChild>
                    <Button onClick={loadEditForm} type="button" variant="outline">
                      <Pencil className="mr-1 h-4 w-4" />
                      Editar cliente
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-auto">
                    <DialogHeader>
                      <DialogTitle>Editar cliente</DialogTitle>
                    </DialogHeader>
                    <form
                      className="space-y-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        updateCustomerMutation.mutate();
                      }}
                    >
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input placeholder="Nome fantasia*" required value={newName} onChange={(event) => setNewName(event.target.value)} />
                        <Input placeholder="Razao social" value={newLegalName} onChange={(event) => setNewLegalName(event.target.value)} />
                        <Input placeholder="CNPJ / CPF" value={newDocument} onChange={(event) => setNewDocument(event.target.value)} />
                        <Input placeholder="E-mail principal" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
                        <Input placeholder="Telefone" value={newPhone} onChange={(event) => setNewPhone(event.target.value)} />
                        <Input placeholder="Contato principal" value={newContactName} onChange={(event) => setNewContactName(event.target.value)} />
                        <Input placeholder="Grupo" value={newGroup} onChange={(event) => setNewGroup(event.target.value)} />
                        <Input placeholder="Segmento" value={newSegment} onChange={(event) => setNewSegment(event.target.value)} />
                      </div>
                      <Input placeholder="E-mail financeiro" value={newBillingEmail} onChange={(event) => setNewBillingEmail(event.target.value)} />
                      <select className="w-full rounded-xl border px-3 py-2" value={newStatus} onChange={(event) => setNewStatus(event.target.value as CustomerStatus)}>
                        <option value="ACTIVE">Ativo</option>
                        <option value="INACTIVE">Inativo</option>
                      </select>
                      <textarea className="w-full rounded-xl border px-3 py-2" placeholder="Observacoes" rows={3} value={newNotes} onChange={(event) => setNewNotes(event.target.value)} />
                      {errorMsg ? <p className="text-sm text-red-600">{errorMsg}</p> : null}
                      <Button className="w-full" disabled={updateCustomerMutation.isPending} type="submit">
                        {updateCustomerMutation.isPending ? "Salvando..." : "Salvar alteracoes"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              ) : null}
            </div>

            <div className="mb-3 grid gap-3 md:grid-cols-5">
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-slate-500">Faturamento total</p>
                <p className="mt-1 text-xl font-black text-brand-primary">{toMoney(selectedCustomer.metrics.totalBilled)}</p>
              </article>
              <article className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-xs font-semibold uppercase text-rose-700">Saldo em aberto</p>
                <p className="mt-1 text-xl font-black text-rose-700">{toMoney(selectedCustomer.metrics.totalOutstanding)}</p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-slate-500">Orcamentos</p>
                <p className="mt-1 text-xl font-black text-brand-primary">{selectedCustomer.metrics.totalQuotes}</p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-slate-500">OS recentes</p>
                <p className="mt-1 text-xl font-black text-brand-primary">{selectedCustomer.serviceOrders.length}</p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-slate-500">Tickets recentes</p>
                <p className="mt-1 text-xl font-black text-brand-primary">{selectedCustomer.deskTickets.length}</p>
              </article>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-sm font-bold text-brand-primary">
                  <Building2 className="mr-1 inline h-4 w-4" />
                  Unidades
                </p>
                <div className="space-y-2">
                  {selectedCustomer.sites.map((site) => (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2" key={site.id}>
                      <p className="font-semibold text-slate-800">{site.name}</p>
                      <p className="text-xs text-slate-600">{site.address}</p>
                      <p className="text-xs text-slate-500">
                        {site.city ?? "-"} / {site.state ?? "-"} - raio {site.geofenceRadiusMeters ?? 200}m
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-sm font-bold text-brand-primary">
                  <MapPin className="mr-1 inline h-4 w-4" />
                  OS e tickets recentes
                </p>
                <div className="space-y-2">
                  {selectedCustomer.serviceOrders.slice(0, 6).map((item) => (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2" key={item.id}>
                      <p className="text-sm font-semibold text-slate-800">{item.code} - {item.title}</p>
                      <p className="text-xs text-slate-500">Status: {item.status}</p>
                    </div>
                  ))}
                  {selectedCustomer.deskTickets.slice(0, 4).map((item) => (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2" key={item.id}>
                      <p className="text-sm font-semibold text-slate-800">{item.code} - {item.title}</p>
                      <p className="text-xs text-slate-500">Status: {item.status} - Prioridade: {item.priority}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5 text-sm text-slate-600">
            <ShieldAlert className="mr-1 inline h-4 w-4" />
            Selecione um cliente na tabela para visualizar detalhes completos.
          </section>
        )}
      </AppShell>
    </RequireAuth>
  );
}
