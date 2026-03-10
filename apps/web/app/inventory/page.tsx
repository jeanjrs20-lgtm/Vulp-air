"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, ListTree, PackageSearch } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  costPrice?: number | null;
  salePrice?: number | null;
  active: boolean;
};

type ProductResponse = {
  items: Product[];
  stats: {
    total: number;
    lowStock: number;
  };
};

type Movement = {
  id: string;
  type: "INBOUND" | "OUTBOUND" | "ADJUSTMENT" | "RESERVED" | "CONSUMED";
  quantity: number;
  unitCost?: number | null;
  createdAt: string;
  referenceType?: string | null;
  referenceId?: string | null;
  product: {
    id: string;
    sku: string;
    name: string;
    unit: string;
  };
};

type ProductHistoryResponse = {
  product: Product & {
    createdAt: string;
    updatedAt: string;
    description?: string | null;
    maxStock?: number | null;
  };
  summary: {
    totalMovements: number;
    inboundQty: number;
    outboundQty: number;
    consumedQty: number;
    reservedQty: number;
    adjustmentEntries: number;
    timelineEntries: number;
    serviceApplications: number;
    currentStock: number;
    minStock: number;
    maxStock?: number | null;
  };
  timeline: Array<{
    id: string;
    at: string;
    title: string;
    description: string;
    type: string;
    tags: string[];
    actor?: {
      id: string;
      name: string;
      role: string;
    } | null;
    reference?: {
      type: string;
      id?: string | null;
      code?: string | null;
      status?: string | null;
      customer?: string | null;
      site?: string | null;
    } | null;
  }>;
};

const toMoney = (value?: number | null) =>
  value == null ? "-" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const toDateTime = (value: string) => new Date(value).toLocaleString("pt-BR");

const MOVEMENT_LABEL: Record<Movement["type"], string> = {
  INBOUND: "Entrada",
  OUTBOUND: "Saida",
  ADJUSTMENT: "Ajuste",
  RESERVED: "Reserva",
  CONSUMED: "Consumo"
};

const timelineTypeClass = (type: string) => {
  if (type === "INBOUND") return "bg-emerald-100 text-emerald-700";
  if (type === "OUTBOUND") return "bg-rose-100 text-rose-700";
  if (type === "CONSUMED") return "bg-amber-100 text-amber-700";
  if (type === "RESERVED") return "bg-sky-100 text-sky-700";
  if (type === "SERVICE_MATERIAL") return "bg-indigo-100 text-indigo-700";
  return "bg-slate-100 text-slate-700";
};

export default function InventoryPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [openAllStock, setOpenAllStock] = useState(false);
  const [stockSearch, setStockSearch] = useState("");
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("UN");
  const [initialStock, setInitialStock] = useState("0");
  const [minStock, setMinStock] = useState("0");

  const [movementProductId, setMovementProductId] = useState("");
  const [movementType, setMovementType] = useState<Movement["type"]>("INBOUND");
  const [movementQty, setMovementQty] = useState("1");
  const [movementCost, setMovementCost] = useState("");
  const [movementReferenceType, setMovementReferenceType] = useState("");
  const [movementReferenceId, setMovementReferenceId] = useState("");
  const [movementNotes, setMovementNotes] = useState("");

  const [consumeServiceOrderId, setConsumeServiceOrderId] = useState("");
  const [consumeProductId, setConsumeProductId] = useState("");
  const [consumeQty, setConsumeQty] = useState("1");

  const productsQuery = useQuery({
    queryKey: ["inventory-products", search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      return api.get<ProductResponse>(`/inventory/products${params.toString() ? `?${params.toString()}` : ""}`);
    }
  });

  const allProductsQuery = useQuery({
    queryKey: ["inventory-products-all", openAllStock],
    queryFn: () => api.get<ProductResponse>("/inventory/products"),
    enabled: openAllStock
  });

  const productHistoryQuery = useQuery({
    queryKey: ["inventory-product-history", historyProduct?.id],
    queryFn: () => api.get<ProductHistoryResponse>(`/inventory/products/${historyProduct?.id}/history`),
    enabled: Boolean(historyProduct?.id)
  });

  const movementsQuery = useQuery({
    queryKey: ["inventory-movements"],
    queryFn: () => api.get<Movement[]>("/inventory/movements?limit=120")
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["inventory-products"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-products-all"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
    if (historyProduct?.id) {
      queryClient.invalidateQueries({ queryKey: ["inventory-product-history", historyProduct.id] });
    }
  };

  const createProductMutation = useMutation({
    mutationFn: () =>
      api.post<Product>("/inventory/products", {
        sku,
        name,
        unit,
        currentStock: Number(initialStock.replace(",", ".")) || 0,
        minStock: Number(minStock.replace(",", ".")) || 0
      }),
    onSuccess: () => {
      setSku("");
      setName("");
      setUnit("UN");
      setInitialStock("0");
      setMinStock("0");
      setErrorMsg(null);
      refresh();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const movementMutation = useMutation({
    mutationFn: () =>
      api.post("/inventory/movements", {
        productId: movementProductId,
        type: movementType,
        quantity: Number(movementQty.replace(",", ".")) || 0,
        unitCost: movementCost ? Number(movementCost.replace(",", ".")) : undefined,
        referenceType: movementReferenceType.trim() || undefined,
        referenceId: movementReferenceId.trim() || undefined,
        notes: movementNotes.trim() || undefined
      }),
    onSuccess: () => {
      setMovementQty("1");
      setMovementCost("");
      setMovementReferenceType("");
      setMovementReferenceId("");
      setMovementNotes("");
      setErrorMsg(null);
      refresh();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const consumeMutation = useMutation({
    mutationFn: () =>
      api.post(`/inventory/service-orders/${consumeServiceOrderId}/materials`, {
        productId: consumeProductId,
        quantity: Number(consumeQty.replace(",", ".")) || 0
      }),
    onSuccess: () => {
      setConsumeQty("1");
      setErrorMsg(null);
      refresh();
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const products = productsQuery.data?.items ?? [];
  const stats = productsQuery.data?.stats;
  const movements = movementsQuery.data ?? [];
  const allProducts = allProductsQuery.data?.items ?? [];
  const history = productHistoryQuery.data;

  const filteredAllProducts = useMemo(() => {
    const term = stockSearch.trim().toLowerCase();
    if (!term) {
      return allProducts;
    }

    return allProducts.filter(
      (product) =>
        product.sku.toLowerCase().includes(term) || product.name.toLowerCase().includes(term)
    );
  }, [allProducts, stockSearch]);

  return (
    <RequireAuth>
      <AppShell>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-brand-primary">Estoque de produto</h1>
            <p className="text-sm text-slate-600">
              Cadastro de itens, movimentacoes e consumo de material diretamente nas ordens de servico.
            </p>
          </div>
          <Dialog open={openAllStock} onOpenChange={setOpenAllStock}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline">
                <ListTree className="mr-1 h-4 w-4" />
                Ver todo estoque
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>Todos os itens em estoque</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <Input
                    placeholder="Buscar por SKU ou nome"
                    value={stockSearch}
                    onChange={(event) => setStockSearch(event.target.value)}
                  />
                  <span className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
                    {filteredAllProducts.length} item(ns)
                  </span>
                </div>

                <div className="max-h-[52vh] overflow-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50 text-left">
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Produto</th>
                        <th className="px-3 py-2">Atual</th>
                        <th className="px-3 py-2">Minimo</th>
                        <th className="px-3 py-2">Acao</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAllProducts.map((product) => (
                        <tr className="border-b" key={`all-${product.id}`}>
                          <td className="px-3 py-2 font-semibold text-brand-primary">{product.sku}</td>
                          <td className="px-3 py-2">{product.name}</td>
                          <td
                            className={`px-3 py-2 ${
                              product.currentStock <= product.minStock
                                ? "font-bold text-rose-700"
                                : ""
                            }`}
                          >
                            {product.currentStock} {product.unit}
                          </td>
                          <td className="px-3 py-2">
                            {product.minStock} {product.unit}
                          </td>
                          <td className="px-3 py-2">
                            <Button onClick={() => setHistoryProduct(product)} type="button" variant="outline">
                              <PackageSearch className="mr-1 h-3.5 w-3.5" />
                              Abrir item
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!allProductsQuery.isLoading && filteredAllProducts.length === 0 ? (
                    <p className="p-3 text-sm text-slate-600">Nenhum item encontrado.</p>
                  ) : null}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <section className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Produtos</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{stats?.total ?? 0}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Estoque baixo</p>
            <p className="mt-2 text-2xl font-black text-brand-primary">{stats?.lowStock ?? 0}</p>
          </div>
          <div className="card p-3">
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Buscar</label>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="SKU ou nome" />
          </div>
        </section>

        <section className="mb-4 grid gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-bold text-brand-primary">Novo produto</h2>
            <form
              className="grid gap-2 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                setErrorMsg(null);
                createProductMutation.mutate();
              }}
            >
              <Input placeholder="SKU" value={sku} onChange={(event) => setSku(event.target.value)} required />
              <Input placeholder="Nome" value={name} onChange={(event) => setName(event.target.value)} required />
              <Input placeholder="Unidade" value={unit} onChange={(event) => setUnit(event.target.value)} required />
              <Input placeholder="Estoque inicial" value={initialStock} onChange={(event) => setInitialStock(event.target.value)} />
              <Input placeholder="Estoque minimo" value={minStock} onChange={(event) => setMinStock(event.target.value)} />
              <Button type="submit" disabled={createProductMutation.isPending}>
                {createProductMutation.isPending ? "Salvando..." : "Cadastrar"}
              </Button>
            </form>
          </div>

          <div className="card p-4">
            <h2 className="mb-3 text-sm font-bold text-brand-primary">Movimentar estoque</h2>
            <div className="grid gap-2 md:grid-cols-2">
              <select
                className="w-full rounded-xl border px-3 py-2 md:col-span-2"
                value={movementProductId}
                onChange={(event) => setMovementProductId(event.target.value)}
              >
                <option value="">Selecione produto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} - {product.name}
                  </option>
                ))}
              </select>
              <select
                className="w-full rounded-xl border px-3 py-2"
                value={movementType}
                onChange={(event) => setMovementType(event.target.value as Movement["type"])}
              >
                <option value="INBOUND">Entrada</option>
                <option value="OUTBOUND">Saida</option>
                <option value="ADJUSTMENT">Ajuste</option>
                <option value="RESERVED">Reserva</option>
                <option value="CONSUMED">Consumido</option>
              </select>
              <Input placeholder="Quantidade" value={movementQty} onChange={(event) => setMovementQty(event.target.value)} />
              <Input placeholder="Custo unitario (opcional)" value={movementCost} onChange={(event) => setMovementCost(event.target.value)} />
              <Input
                placeholder="Tipo referencia (ex.: SERVICE_ORDER, TRANSFER, SALE)"
                value={movementReferenceType}
                onChange={(event) => setMovementReferenceType(event.target.value)}
              />
              <Input
                placeholder="ID/codigo referencia (opcional)"
                value={movementReferenceId}
                onChange={(event) => setMovementReferenceId(event.target.value)}
              />
              <Input
                className="md:col-span-2"
                placeholder="Observacao (ex.: transferido para cliente X)"
                value={movementNotes}
                onChange={(event) => setMovementNotes(event.target.value)}
              />
              <Button
                onClick={() => movementMutation.mutate()}
                className="md:col-span-2"
                disabled={!movementProductId || movementMutation.isPending}
              >
                {movementMutation.isPending ? "Movimentando..." : "Aplicar"}
              </Button>
            </div>
          </div>
        </section>

        <section className="mb-4 card p-4">
          <h2 className="mb-3 text-sm font-bold text-brand-primary">Consumir material em OS</h2>
          <div className="grid gap-2 md:grid-cols-4">
            <Input
              placeholder="ID da OS"
              value={consumeServiceOrderId}
              onChange={(event) => setConsumeServiceOrderId(event.target.value)}
            />
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={consumeProductId}
              onChange={(event) => setConsumeProductId(event.target.value)}
            >
              <option value="">Produto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} - {product.name}
                </option>
              ))}
            </select>
            <Input placeholder="Quantidade" value={consumeQty} onChange={(event) => setConsumeQty(event.target.value)} />
            <Button
              onClick={() => consumeMutation.mutate()}
              disabled={!consumeServiceOrderId || !consumeProductId || consumeMutation.isPending}
            >
              {consumeMutation.isPending ? "Aplicando..." : "Consumir"}
            </Button>
          </div>
        </section>

        {errorMsg ? <p className="mb-4 text-sm text-red-600">{errorMsg}</p> : null}

        <section className="mb-4 card overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Produto</th>
                <th className="px-3 py-2">Un</th>
                <th className="px-3 py-2">Atual</th>
                <th className="px-3 py-2">Minimo</th>
                <th className="px-3 py-2">Custo</th>
                <th className="px-3 py-2">Historico</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr className="border-b" key={product.id}>
                  <td className="px-3 py-2">{product.sku}</td>
                  <td className="px-3 py-2">{product.name}</td>
                  <td className="px-3 py-2">{product.unit}</td>
                  <td className={`px-3 py-2 ${product.currentStock <= product.minStock ? "font-bold text-red-600" : ""}`}>
                    {product.currentStock}
                  </td>
                  <td className="px-3 py-2">{product.minStock}</td>
                  <td className="px-3 py-2">{toMoney(product.costPrice)}</td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setHistoryProduct(product)}
                    >
                      <History className="mr-1 h-3.5 w-3.5" />
                      Ver trilha
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-bold text-brand-primary">Ultimas movimentacoes</h2>
          <div className="space-y-2">
            {movements.map((movement) => (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" key={movement.id}>
                <p className="font-semibold text-brand-primary">{movement.product.sku} - {movement.product.name}</p>
                <p>
                  Tipo: {MOVEMENT_LABEL[movement.type]} | Quantidade: {movement.quantity} {movement.product.unit}
                </p>
                <p>Custo: {toMoney(movement.unitCost)}</p>
                {movement.referenceType || movement.referenceId ? (
                  <p className="text-xs text-slate-600">
                    Ref: {movement.referenceType ?? "-"} {movement.referenceId ? `| ${movement.referenceId}` : ""}
                  </p>
                ) : null}
                <p className="text-xs text-slate-500">{toDateTime(movement.createdAt)}</p>
              </div>
            ))}
            {!movementsQuery.isLoading && movements.length === 0 ? (
              <p className="text-sm text-slate-600">Nenhuma movimentacao registrada.</p>
            ) : null}
          </div>
        </section>

        <Dialog
          open={Boolean(historyProduct)}
          onOpenChange={(value) => {
            if (!value) {
              setHistoryProduct(null);
            }
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>
                Trilha do produto {history?.product.sku ?? historyProduct?.sku} -{" "}
                {history?.product.name ?? historyProduct?.name}
              </DialogTitle>
            </DialogHeader>

            {productHistoryQuery.isLoading ? (
              <p className="text-sm text-slate-600">Carregando historico do item...</p>
            ) : null}

            {productHistoryQuery.isError ? (
              <p className="text-sm text-rose-600">
                Nao foi possivel carregar o historico do produto.
              </p>
            ) : null}

            {history ? (
              <div className="space-y-3">
                <section className="grid gap-2 md:grid-cols-3">
                  <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Estoque atual</p>
                    <p
                      className={`mt-1 text-2xl font-black ${
                        history.product.currentStock <= history.product.minStock
                          ? "text-rose-700"
                          : "text-brand-primary"
                      }`}
                    >
                      {history.product.currentStock} {history.product.unit}
                    </p>
                  </article>
                  <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Movimentacoes</p>
                    <p className="mt-1 text-2xl font-black text-brand-primary">
                      {history.summary.totalMovements}
                    </p>
                    <p className="text-xs text-slate-500">
                      Entrada {history.summary.inboundQty} | Saida {history.summary.outboundQty}
                    </p>
                  </article>
                  <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Aplicacoes em OS</p>
                    <p className="mt-1 text-2xl font-black text-brand-primary">
                      {history.summary.serviceApplications}
                    </p>
                    <p className="text-xs text-slate-500">
                      Consumo {history.summary.consumedQty} | Reserva {history.summary.reservedQty}
                    </p>
                  </article>
                </section>

                <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <h3 className="mb-2 text-sm font-black text-brand-primary">
                    Roadmap do produto (da compra ao encerramento)
                  </h3>
                  <div className="max-h-[52vh] space-y-2 overflow-auto rounded-lg border border-slate-200 bg-white p-2">
                    {history.timeline.map((item) => (
                      <article className="rounded-xl border border-slate-200 p-3" key={item.id}>
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-brand-primary">{item.title}</p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${timelineTypeClass(
                                item.type
                              )}`}
                            >
                              {item.type}
                            </span>
                          </div>
                          <span className="text-xs text-slate-500">{toDateTime(item.at)}</span>
                        </div>

                        <p className="whitespace-pre-wrap text-sm text-slate-700">{item.description}</p>

                        {item.actor ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Responsavel: {item.actor.name} ({item.actor.role})
                          </p>
                        ) : null}

                        {item.reference ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Referencia: {item.reference.type}
                            {item.reference.code ? ` | ${item.reference.code}` : ""}
                            {item.reference.customer ? ` | Cliente: ${item.reference.customer}` : ""}
                            {item.reference.site ? ` | Unidade: ${item.reference.site}` : ""}
                            {item.reference.status ? ` | Status: ${item.reference.status}` : ""}
                          </p>
                        ) : null}

                        <div className="mt-2 flex flex-wrap gap-1">
                          {item.tags.map((tag) => (
                            <span
                              className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-semibold text-brand-primary"
                              key={`${item.id}-${tag}`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </article>
                    ))}

                    {history.timeline.length === 0 ? (
                      <p className="text-sm text-slate-500">Sem historico para este produto.</p>
                    ) : null}
                  </div>
                </section>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </AppShell>
    </RequireAuth>
  );
}
