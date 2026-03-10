"use client";

import { type ReactNode, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PreviewContent, PreviewPopover, PreviewTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { authStorage } from "@/lib/auth-storage";
import { getApiBaseUrl, toApiAssetUrl } from "@/lib/public-api";

const parseLines = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const buildSample = () => ({
  title: "POP - Atendimento Corretivo de Ar Condicionado Split",
  category: "Manutencao",
  area: "Operacoes HVAC",
  code: "POP-HVAC-001",
  revision: "00",
  objective: "Padronizar diagnostico e execucao de atendimento corretivo.",
  scope: "Aplica-se aos tecnicos e supervisores de manutencao de campo.",
  responsibilities: "Tecnico executa e registra. Supervisor valida e aprova o encerramento.",
  materials: "Multimetro\nManifold\nTermometro infravermelho\nKit de limpeza",
  epis: "Luva\nOculos de seguranca\nCalcado de seguranca",
  procedureSteps:
    "Validar ordem de servico\nIdentificar sintomas com responsavel local\nExecutar testes eletricos e mecanicos\nRegistrar causa provavel\nDefinir acao corretiva",
  safetyRequirements: "Desenergizar antes de intervir\nUsar EPI durante toda atividade",
  qualityCriteria: "Campos obrigatorios preenchidos\nEvidencias anexadas\nDiagnostico coerente",
  records: "Checklist digital\nFotos antes/depois\nAssinatura tecnica",
  references: "NR-10\nManual do fabricante",
  preparedBy: "Equipe Tecnica VULP AIR",
  reviewedBy: "Supervisor de Campo",
  approvedBy: "Gerente de Operacoes",
  effectiveDate: new Date().toISOString().slice(0, 10),
  status: "DRAFT",
  tags: "hvac,corretiva,padrao"
});

function FormField({
  label,
  help,
  required,
  children
}: {
  label: string;
  help?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-brand-primary">{label}</span>
        {required ? (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">
            obrigatorio
          </span>
        ) : null}
      </div>
      {help ? <p className="text-xs text-slate-500">{help}</p> : null}
      {children}
    </label>
  );
}

export default function PopsPage() {
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [previewCache, setPreviewCache] = useState<Record<string, any>>({});
  const [form, setForm] = useState(buildSample);

  const docsQuery = useQuery({
    queryKey: ["pops-list"],
    queryFn: () => api.get<any[]>("/pops")
  });

  const resultsQuery = useQuery({
    queryKey: ["pops-search", search],
    queryFn: () => api.get<any[]>(`/pops/search?q=${encodeURIComponent(search)}`),
    enabled: search.trim().length > 1
  });

  const readQuery = useQuery({
    queryKey: ["pops-read-report"],
    queryFn: () => api.get<any[]>("/pops/reports/read"),
    retry: false
  });

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const token = authStorage.getToken();
      const response = await fetch(`${getApiBaseUrl()}/pops/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error?.message ?? "Falha no upload");
      }
      return payload.data;
    },
    onSuccess: () => {
      setUploadOpen(false);
      queryClient.invalidateQueries({ queryKey: ["pops-list"] });
    }
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/pops/create-standard", {
        title: form.title,
        category: form.category,
        area: form.area,
        code: form.code || undefined,
        revision: form.revision,
        objective: form.objective,
        scope: form.scope,
        responsibilities: form.responsibilities,
        materials: parseLines(form.materials),
        epis: parseLines(form.epis),
        procedureSteps: parseLines(form.procedureSteps),
        safetyRequirements: parseLines(form.safetyRequirements),
        qualityCriteria: parseLines(form.qualityCriteria),
        records: parseLines(form.records),
        references: parseLines(form.references),
        preparedBy: form.preparedBy,
        reviewedBy: form.reviewedBy || undefined,
        approvedBy: form.approvedBy,
        effectiveDate: form.effectiveDate,
        status: form.status,
        tags: parseLines(form.tags)
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setForm(buildSample());
      queryClient.invalidateQueries({ queryKey: ["pops-list"] });
    }
  });

  const ackMutation = useMutation({
    mutationFn: (popId: string) => api.post(`/pops/${popId}/ack`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pops-list"] })
  });

  const docsById = useMemo(() => {
    const map = new Map<string, any>();
    for (const doc of docsQuery.data ?? []) {
      map.set(doc.id, doc);
    }
    return map;
  }, [docsQuery.data]);

  const results = useMemo(() => {
    const list = search.trim().length > 1
      ? (resultsQuery.data ?? []).map((item: any) => ({ ...item, fallback: docsById.get(item.popId) }))
      : (docsQuery.data ?? []).map((doc: any) => ({
          popId: doc.id,
          title: doc.title,
          score: 1,
          snippets: [`${doc.category} | v${doc.version} | ${doc.status}`],
          fallback: doc
        }));

    return list.filter((item: any) => {
      if (statusFilter === "ALL") {
        return true;
      }
      return (item.fallback?.status ?? "") === statusFilter;
    });
  }, [docsById, docsQuery.data, resultsQuery.data, search, statusFilter]);

  const stats = useMemo(() => {
    const docs = docsQuery.data ?? [];
    const reads = readQuery.data ?? [];
    return {
      total: docs.length,
      active: docs.filter((doc: any) => doc.status === "ACTIVE").length,
      draft: docs.filter((doc: any) => doc.status === "DRAFT").length,
      archived: docs.filter((doc: any) => doc.status === "ARCHIVED").length,
      acknowledged: reads.filter((entry: any) => Boolean(entry.acknowledgedAt)).length
    };
  }, [docsQuery.data, readQuery.data]);

  const resolvePreview = async (popId: string) => {
    if (previewCache[popId]) {
      return;
    }

    const detail = await api.get<any>(`/pops/${popId}`);
    setPreviewCache((prev) => ({ ...prev, [popId]: detail }));
  };

  return (
    <RequireAuth>
      <AppShell>
        <section className="card mb-4 overflow-hidden">
          <div className="bg-gradient-to-r from-[#07384D] via-[#0A516F] to-[#0C728A] px-6 py-5 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-3xl font-black">POP / FAQ Inteligente</h1>
                <p className="mt-1 text-sm text-cyan-100">Busca hibrida, controle de leitura e criacao de POP padronizado.</p>
              </div>
              <div className="flex gap-2">
                <Dialog onOpenChange={setCreateOpen} open={createOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">Criar POP (Padrao BR)</Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-auto">
                    <DialogHeader>
                      <DialogTitle>Criar POP no padrao corporativo brasileiro</DialogTitle>
                    </DialogHeader>
                    <div className="mb-2 flex gap-2">
                      <Button onClick={() => setForm(buildSample())} type="button" variant="ghost">
                        Preencher exemplo
                      </Button>
                    </div>
                    <form
                      className="space-y-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        createMutation.mutate();
                      }}
                    >
                      <p className="rounded-xl border border-brand-primary/15 bg-brand-primary/5 px-3 py-2 text-xs text-brand-primary">
                        Preencha os blocos abaixo. Campos marcados como <strong>obrigatorio</strong> sao essenciais para gerar o POP.
                      </p>

                      <section className="space-y-3 rounded-2xl border border-slate-200 p-3">
                        <h3 className="text-sm font-black uppercase tracking-wide text-brand-primary">1. Identificacao do documento</h3>
                        <div className="grid gap-3 md:grid-cols-2">
                          <FormField help="Nome completo do procedimento." label="Titulo do POP" required>
                            <Input onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: POP - Manutencao Corretiva Split" required value={form.title} />
                          </FormField>
                          <FormField help="Area macro do processo." label="Categoria" required>
                            <Input onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Ex.: Manutencao" required value={form.category} />
                          </FormField>
                          <FormField help="Departamento ou frente responsavel." label="Area responsavel" required>
                            <Input onChange={(event) => setForm({ ...form, area: event.target.value })} placeholder="Ex.: Operacoes HVAC" required value={form.area} />
                          </FormField>
                          <FormField help="Codigo interno para controle e auditoria." label="Codigo">
                            <Input onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="Ex.: POP-HVAC-001" value={form.code} />
                          </FormField>
                          <FormField help="Numero da revisao atual do documento." label="Revisao" required>
                            <Input onChange={(event) => setForm({ ...form, revision: event.target.value })} placeholder="Ex.: 00" required value={form.revision} />
                          </FormField>
                          <FormField help="Data em que o POP passa a valer." label="Data de vigencia" required>
                            <Input onChange={(event) => setForm({ ...form, effectiveDate: event.target.value })} required type="date" value={form.effectiveDate} />
                          </FormField>
                        </div>
                      </section>

                      <section className="space-y-3 rounded-2xl border border-slate-200 p-3">
                        <h3 className="text-sm font-black uppercase tracking-wide text-brand-primary">2. Escopo e execucao</h3>
                        <FormField help="Qual resultado este POP deve garantir?" label="Objetivo" required>
                          <Textarea onChange={(event) => setForm({ ...form, objective: event.target.value })} placeholder="Descreva o objetivo principal do procedimento." required rows={2} value={form.objective} />
                        </FormField>
                        <FormField help="Onde e para quem este POP se aplica." label="Escopo" required>
                          <Textarea onChange={(event) => setForm({ ...form, scope: event.target.value })} placeholder="Defina equipes, unidades e limites de aplicacao." required rows={2} value={form.scope} />
                        </FormField>
                        <FormField help="Quem executa, valida e aprova durante a operacao." label="Responsabilidades" required>
                          <Textarea onChange={(event) => setForm({ ...form, responsibilities: event.target.value })} placeholder="Ex.: Tecnico executa, supervisor valida, gestor aprova." required rows={2} value={form.responsibilities} />
                        </FormField>
                        <FormField help="Informe um item por linha." label="Materiais e ferramentas">
                          <Textarea onChange={(event) => setForm({ ...form, materials: event.target.value })} placeholder={"Ex.:\nMultimetro\nManifold\nTermometro infravermelho"} rows={4} value={form.materials} />
                        </FormField>
                        <FormField help="Informe um item por linha." label="EPIs obrigatorios">
                          <Textarea onChange={(event) => setForm({ ...form, epis: event.target.value })} placeholder={"Ex.:\nLuva\nOculos de seguranca\nCalcado de seguranca"} rows={4} value={form.epis} />
                        </FormField>
                        <FormField help="Descreva cada etapa em uma linha (ordem de execucao)." label="Passo a passo" required>
                          <Textarea onChange={(event) => setForm({ ...form, procedureSteps: event.target.value })} placeholder={"Ex.:\nValidar ordem de servico\nExecutar diagnostico\nRegistrar causa e acao"} required rows={5} value={form.procedureSteps} />
                        </FormField>
                      </section>

                      <section className="space-y-3 rounded-2xl border border-slate-200 p-3">
                        <h3 className="text-sm font-black uppercase tracking-wide text-brand-primary">3. Seguranca, qualidade e evidencias</h3>
                        <FormField help="Itens de seguranca que devem ser seguidos (1 por linha)." label="Requisitos de seguranca">
                          <Textarea onChange={(event) => setForm({ ...form, safetyRequirements: event.target.value })} placeholder={"Ex.:\nDesenergizar equipamento\nUsar EPI durante toda atividade"} rows={3} value={form.safetyRequirements} />
                        </FormField>
                        <FormField help="Como validar que o servico foi executado corretamente (1 por linha)." label="Criterios de qualidade">
                          <Textarea onChange={(event) => setForm({ ...form, qualityCriteria: event.target.value })} placeholder={"Ex.:\nChecklist 100% preenchido\nEvidencias anexadas"} rows={3} value={form.qualityCriteria} />
                        </FormField>
                        <FormField help="Documentos/comprovantes obrigatorios (1 por linha)." label="Registros obrigatorios">
                          <Textarea onChange={(event) => setForm({ ...form, records: event.target.value })} placeholder={"Ex.:\nChecklist digital\nFotos antes/depois\nAssinatura tecnica"} rows={3} value={form.records} />
                        </FormField>
                        <FormField help="Normas, manuais e referencias utilizadas (1 por linha)." label="Referencias">
                          <Textarea onChange={(event) => setForm({ ...form, references: event.target.value })} placeholder={"Ex.:\nNR-10\nManual do fabricante"} rows={3} value={form.references} />
                        </FormField>
                      </section>

                      <section className="space-y-3 rounded-2xl border border-slate-200 p-3">
                        <h3 className="text-sm font-black uppercase tracking-wide text-brand-primary">4. Governanca e publicacao</h3>
                        <div className="grid gap-3 md:grid-cols-2">
                          <FormField help="Responsavel por escrever o POP." label="Elaborado por" required>
                            <Input onChange={(event) => setForm({ ...form, preparedBy: event.target.value })} placeholder="Nome ou area responsavel" required value={form.preparedBy} />
                          </FormField>
                          <FormField help="Responsavel pela revisao tecnica (opcional)." label="Revisado por">
                            <Input onChange={(event) => setForm({ ...form, reviewedBy: event.target.value })} placeholder="Nome do revisor" value={form.reviewedBy} />
                          </FormField>
                          <FormField help="Responsavel pela aprovacao final." label="Aprovado por" required>
                            <Input onChange={(event) => setForm({ ...form, approvedBy: event.target.value })} placeholder="Nome do aprovador" required value={form.approvedBy} />
                          </FormField>
                          <FormField help="Tags separadas por virgula para facilitar busca." label="Tags">
                            <Input onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="hvac, corretiva, campo" value={form.tags} />
                          </FormField>
                          <FormField help="Estado inicial do documento." label="Status de publicacao">
                            <select className="w-full rounded-xl border px-3 py-2" onChange={(event) => setForm({ ...form, status: event.target.value })} value={form.status}>
                              <option value="DRAFT">DRAFT</option>
                              <option value="ACTIVE">ACTIVE</option>
                              <option value="ARCHIVED">ARCHIVED</option>
                            </select>
                          </FormField>
                        </div>
                      </section>

                      {createMutation.isError ? <p className="text-sm text-red-600">{(createMutation.error as Error)?.message ?? "Falha ao criar POP"}</p> : null}
                      <Button className="w-full" type="submit">{createMutation.isPending ? "Gerando POP..." : "Criar POP"}</Button>
                    </form>
                  </DialogContent>
                </Dialog>

                <Dialog onOpenChange={setUploadOpen} open={uploadOpen}>
                  <DialogTrigger asChild>
                    <Button>Upload PDF</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Enviar POP em PDF</DialogTitle>
                    </DialogHeader>
                    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); uploadMutation.mutate(new FormData(event.currentTarget as HTMLFormElement)); }}>
                      <Input name="title" placeholder="Titulo" required />
                      <Input name="category" placeholder="Categoria" required />
                      <Input name="tags" placeholder="Tags (csv)" />
                      <select className="w-full rounded-xl border px-3 py-2" name="status">
                        <option value="DRAFT">DRAFT</option>
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="ARCHIVED">ARCHIVED</option>
                      </select>
                      <Input accept="application/pdf" name="file" required type="file" />
                      <Button className="w-full" type="submit">{uploadMutation.isPending ? "Enviando..." : "Enviar"}</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="card p-3"><p className="text-xs text-slate-500">Total</p><p className="text-2xl font-black text-brand-primary">{stats.total}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Ativos</p><p className="text-2xl font-black text-emerald-700">{stats.active}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Rascunhos</p><p className="text-2xl font-black text-amber-700">{stats.draft}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Arquivados</p><p className="text-2xl font-black text-slate-700">{stats.archived}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Leituras OK</p><p className="text-2xl font-black text-brand-primary">{stats.acknowledged}</p></div>
        </section>

        <section className="card mb-4 p-4">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
            <Input onChange={(event) => setSearch(event.target.value)} placeholder="Buscar POP por texto livre..." value={search} />
            <select className="w-full rounded-xl border px-3 py-2" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="ALL">Todos os status</option>
              <option value="DRAFT">DRAFT</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </div>
        </section>

        <div className="space-y-2">
          {results.map((result: any) => {
            const detail = previewCache[result.popId] ?? result.fallback;
            const fallback = result.fallback;
            return (
              <PreviewPopover key={result.popId}>
                <PreviewTrigger asChild>
                  <button className="card w-full p-3 text-left transition hover:border-brand-primary" onFocus={() => resolvePreview(result.popId)} onMouseEnter={() => resolvePreview(result.popId)} type="button">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-brand-primary">{result.title}</p>
                        {search.trim().length > 1 ? (
                          <p className="text-xs text-slate-500" dangerouslySetInnerHTML={{ __html: result.snippets?.[0] ?? "" }} />
                        ) : (
                          <p className="text-xs text-slate-500">{result.snippets?.[0] ?? ""}</p>
                        )}
                        <p className="text-xs text-slate-600">{fallback?.category ?? "-"} | v{fallback?.version ?? "-"} | {fallback?.status ?? "-"}</p>
                      </div>
                      <span className="rounded-full bg-brand-highlight px-2 py-1 text-xs font-bold text-brand-primary">score {result.score?.toFixed?.(2) ?? result.score}</span>
                    </div>
                  </button>
                </PreviewTrigger>
                <PreviewContent>
                  {detail?.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="Preview da 1a pagina" className="mb-2 h-40 w-full rounded-lg object-cover" src={toApiAssetUrl(detail.thumbnailUrl)} />
                  ) : (
                    <div className="mb-2 flex h-40 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">Sem thumbnail</div>
                  )}
                  <p className="mb-3 text-xs text-slate-600" dangerouslySetInnerHTML={{ __html: result.snippets?.[0] ?? "" }} />
                  <div className="flex gap-2">
                    <a className="inline-flex items-center rounded-lg bg-brand-primary px-3 py-2 text-xs font-bold text-white" href={detail?.pdfUrl ? toApiAssetUrl(detail.pdfUrl) : "#"} rel="noreferrer" target="_blank">Abrir</a>
                    <a className="inline-flex items-center rounded-lg border border-brand-primary px-3 py-2 text-xs font-bold text-brand-primary" href={detail?.pdfUrl ? toApiAssetUrl(detail.pdfUrl) : "#"}>Baixar</a>
                    <Button onClick={() => ackMutation.mutate(result.popId)} variant="ghost">Li e entendi</Button>
                  </div>
                </PreviewContent>
              </PreviewPopover>
            );
          })}
        </div>
      </AppShell>
    </RequireAuth>
  );
}
