"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { SignaturePad } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { authStorage } from "@/lib/auth-storage";
import { cn } from "@/lib/utils";

type ChecklistItemType =
  | "OK_NOK"
  | "TEXT"
  | "NUMBER"
  | "MULTIPLE_CHOICE"
  | "PHOTO_REQUIRED"
  | "SIGNATURE";

type ChecklistItem = {
  id: string;
  label: string;
  itemType: ChecklistItemType;
  required: boolean;
  unit?: string | null;
  options?: unknown;
};

type ChecklistSection = {
  id: string;
  title: string;
  items: ChecklistItem[];
};

type ChecklistAnswer = {
  id: string;
  checklistItemId: string;
  textValue?: string | null;
  numberValue?: number | null;
  booleanValue?: boolean | null;
  optionValue?: string | null;
  valueJson?: unknown;
  notes?: string | null;
  isNonConformity?: boolean;
  attachments?: Array<{ id: string }>;
};

type ChecklistDetail = {
  id: string;
  code: string;
  status: string;
  step: number;
  notes?: string | null;
  technicianSignature?: string | null;
  localResponsibleSignature?: string | null;
  assignedTechnician?: { id: string; name: string } | null;
  customer?: { id: string; name: string } | null;
  siteLocation?: { id: string; name: string } | null;
  serviceDate?: string | null;
  updatedAt?: string | null;
  templateVersion?: {
    id: string;
    template?: { id: string; name: string; serviceType: string } | null;
    sections: ChecklistSection[];
  } | null;
  answers: ChecklistAnswer[];
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Rascunho", className: "bg-slate-100 text-slate-700" },
  IN_PROGRESS: { label: "Em execucao", className: "bg-sky-100 text-sky-700" },
  SUBMITTED: { label: "Submetido", className: "bg-amber-100 text-amber-700" },
  UNDER_REVIEW: { label: "Em conferencia", className: "bg-indigo-100 text-indigo-700" },
  APPROVED: { label: "Aprovado", className: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Reprovado", className: "bg-rose-100 text-rose-700" },
  REOPENED: { label: "Reaberto", className: "bg-orange-100 text-orange-700" }
};

const EDITABLE_STATUSES = new Set(["DRAFT", "IN_PROGRESS", "REOPENED"]);
const DEFAULT_NOK_REASONS = [
  "Sujeira excessiva",
  "Obstrucao",
  "Vazamento",
  "Corrosao/oxidacao",
  "Peca danificada",
  "Fixacao inadequada",
  "Ruido ou vibracao anormal",
  "Fora do padrao tecnico"
];

const toDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "-";

const toStringOptions = (value: unknown) =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

const parseReasonList = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];

const parseReasonsFromNotes = (value?: string | null) => {
  if (!value?.trim()) {
    return [] as string[];
  }

  const normalized = value.replace(/^Motivos NOK:\s*/i, "");
  return normalized
    .split(/[|,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const getNokReasonsFromAnswer = (answer?: ChecklistAnswer) => {
  if (!answer || answer.booleanValue !== false) {
    return [] as string[];
  }

  const reasonsFromJson = parseReasonList(answer.valueJson);
  if (reasonsFromJson.length) {
    return reasonsFromJson;
  }

  return parseReasonsFromNotes(answer.notes);
};

const answerToStateValue = (answer?: ChecklistAnswer) => {
  if (!answer) {
    return undefined;
  }

  if (typeof answer.booleanValue === "boolean") {
    return answer.booleanValue;
  }

  if (typeof answer.numberValue === "number" && Number.isFinite(answer.numberValue)) {
    return answer.numberValue;
  }

  if (answer.textValue?.trim()) {
    return answer.textValue;
  }

  if (answer.optionValue?.trim()) {
    return answer.optionValue;
  }

  if (Array.isArray(answer.valueJson)) {
    return answer.valueJson.filter((entry): entry is string => typeof entry === "string");
  }

  if (answer.valueJson != null) {
    return answer.valueJson;
  }

  return undefined;
};

const isAnswered = (item: ChecklistItem, value: unknown, nokReasons: string[] = []) => {
  if (item.itemType === "OK_NOK") {
    if (typeof value !== "boolean") {
      return false;
    }

    if (value === false) {
      return nokReasons.length > 0;
    }

    return true;
  }

  if (item.itemType === "NUMBER") {
    return typeof value === "number" && Number.isFinite(value);
  }

  if (item.itemType === "MULTIPLE_CHOICE") {
    return Array.isArray(value) && value.length > 0;
  }

  if (item.itemType === "TEXT" || item.itemType === "PHOTO_REQUIRED" || item.itemType === "SIGNATURE") {
    return typeof value === "string" && value.trim().length > 0;
  }

  return false;
};

const buildProgressPayload = (params: {
  step: number;
  notes: string;
  technicianSignature: string | null;
  localResponsibleSignature: string | null;
  items: ChecklistItem[];
  answers: Record<string, unknown>;
  nokReasons: Record<string, string[]>;
}) => ({
  step: params.step,
  notes: params.notes.trim() ? params.notes.trim() : undefined,
  technicianSignature: params.technicianSignature ?? undefined,
  localResponsibleSignature: params.localResponsibleSignature ?? undefined,
  answers: params.items
    .filter((item) =>
      isAnswered(item, params.answers[item.id], params.nokReasons[item.id] ?? [])
    )
    .map((item) => {
      const value = params.answers[item.id];

      if (item.itemType === "OK_NOK" && typeof value === "boolean") {
        const selectedReasons = value ? [] : params.nokReasons[item.id] ?? [];

        return {
          checklistItemId: item.id,
          booleanValue: value,
          isNonConformity: value === false,
          valueJson: selectedReasons,
          notes: value ? "" : `Motivos NOK: ${selectedReasons.join(" | ")}`
        };
      }

      if (item.itemType === "NUMBER" && typeof value === "number") {
        return {
          checklistItemId: item.id,
          numberValue: value
        };
      }

      if (item.itemType === "MULTIPLE_CHOICE" && Array.isArray(value)) {
        return {
          checklistItemId: item.id,
          valueJson: value
        };
      }

      return {
        checklistItemId: item.id,
        textValue: String(value ?? "")
      };
    })
});

function ChecklistExecutionPageContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const user = authStorage.getUser();

  const executionId = Array.isArray(params.id) ? params.id[0] : params.id;
  const serviceOrderId = searchParams.get("serviceOrderId");

  const [sectionIndex, setSectionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [nokReasons, setNokReasons] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState("");
  const [technicianSignature, setTechnicianSignature] = useState<string | null>(null);
  const [localResponsibleSignature, setLocalResponsibleSignature] = useState<string | null>(null);
  const [loadedExecutionId, setLoadedExecutionId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["checklist-execution", executionId],
    queryFn: () => api.get<ChecklistDetail>(`/checklists/executions/${executionId}`),
    enabled: Boolean(executionId)
  });

  const execution = detailQuery.data;
  const sections = execution?.templateVersion?.sections ?? [];
  const allItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const currentSection = sections[sectionIndex];

  const canEdit = useMemo(() => {
    if (!execution) {
      return false;
    }
    if (user?.role !== "TECNICO") {
      return true;
    }
    return EDITABLE_STATUSES.has(execution.status);
  }, [execution, user?.role]);

  useEffect(() => {
    if (!execution || execution.id === loadedExecutionId) {
      return;
    }

    const initialAnswers: Record<string, unknown> = {};
    const initialNokReasons: Record<string, string[]> = {};
    for (const answer of execution.answers ?? []) {
      initialAnswers[answer.checklistItemId] = answerToStateValue(answer);
      const reasons = getNokReasonsFromAnswer(answer);
      if (reasons.length) {
        initialNokReasons[answer.checklistItemId] = reasons;
      }
    }

    setAnswers(initialAnswers);
    setNokReasons(initialNokReasons);
    setNotes(execution.notes ?? "");
    setTechnicianSignature(execution.technicianSignature ?? null);
    setLocalResponsibleSignature(execution.localResponsibleSignature ?? null);
    setSectionIndex(0);
    setLoadedExecutionId(execution.id);
    setErrorMsg(null);
  }, [execution, loadedExecutionId]);

  const requiredMissing = useMemo(
    () =>
      allItems.filter(
        (item) => item.required && !isAnswered(item, answers[item.id], nokReasons[item.id] ?? [])
      ).length,
    [allItems, answers, nokReasons]
  );

  const answeredCount = useMemo(
    () => allItems.filter((item) => isAnswered(item, answers[item.id], nokReasons[item.id] ?? [])).length,
    [allItems, answers, nokReasons]
  );
  const nokPendingReasons = useMemo(
    () =>
      allItems.filter(
        (item) =>
          item.itemType === "OK_NOK" &&
          answers[item.id] === false &&
          (nokReasons[item.id]?.length ?? 0) === 0
      ).length,
    [allItems, answers, nokReasons]
  );

  const payloadStep = Math.min(sections.length + 1, sectionIndex + 2);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["checklist-execution", executionId] });
    queryClient.invalidateQueries({ queryKey: ["executions-tracking"] });
    queryClient.invalidateQueries({ queryKey: ["service-order-detail"] });
    queryClient.invalidateQueries({ queryKey: ["service-orders"] });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!executionId) {
        throw new Error("Checklist invalido");
      }

      return api.patch(`/checklists/executions/${executionId}/progress`, {
        ...buildProgressPayload({
          step: payloadStep,
          notes,
          technicianSignature,
          localResponsibleSignature,
          items: allItems,
          answers,
          nokReasons
        })
      });
    },
    onSuccess: () => {
      setErrorMsg(null);
      refresh();
    },
    onError: (error) => {
      setErrorMsg(error.message);
    }
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!executionId) {
        throw new Error("Checklist invalido");
      }

      await api.patch(`/checklists/executions/${executionId}/progress`, {
        ...buildProgressPayload({
          step: sections.length + 1,
          notes,
          technicianSignature,
          localResponsibleSignature,
          items: allItems,
          answers,
          nokReasons
        })
      });

      return api.post(`/checklists/executions/${executionId}/submit`, {});
    },
    onSuccess: () => {
      setErrorMsg(null);
      refresh();
    },
    onError: (error) => {
      setErrorMsg(error.message);
    }
  });

  const statusMeta = STATUS_META[execution?.status ?? ""] ?? {
    label: execution?.status ?? "-",
    className: "bg-slate-100 text-slate-700"
  };

  const toggleChoice = (itemId: string, option: string) => {
    const currentValue = answers[itemId];
    const selected = Array.isArray(currentValue)
      ? currentValue.filter((entry): entry is string => typeof entry === "string")
      : [];

    if (selected.includes(option)) {
      setAnswers((previous) => ({
        ...previous,
        [itemId]: selected.filter((entry) => entry !== option)
      }));
      return;
    }

    setAnswers((previous) => ({
      ...previous,
      [itemId]: [...selected, option]
    }));
  };

  const toggleNokReason = (itemId: string, reason: string) => {
    const selected = nokReasons[itemId] ?? [];
    if (selected.includes(reason)) {
      setNokReasons((previous) => ({
        ...previous,
        [itemId]: selected.filter((entry) => entry !== reason)
      }));
      return;
    }

    setNokReasons((previous) => ({
      ...previous,
      [itemId]: [...selected, reason]
    }));
  };

  return (
    <RequireAuth>
      <AppShell>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-brand-primary">Execucao de Checklist</h1>
            <p className="text-sm text-slate-600">Preencha os itens da OS e salve o progresso durante o atendimento.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary transition hover:bg-brand-primary/10"
              href="/checklists/acompanhamento"
            >
              Acompanhamento
            </Link>
            {serviceOrderId ? (
              <Link
                className="inline-flex items-center justify-center rounded-xl border border-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary transition hover:bg-brand-primary/10"
                href="/service-orders"
              >
                Voltar para OS
              </Link>
            ) : null}
          </div>
        </div>

        {detailQuery.isLoading ? (
          <div className="card p-4 text-sm text-slate-600">Carregando checklist...</div>
        ) : null}

        {detailQuery.isError ? (
          <div className="card p-4 text-sm text-red-700">Nao foi possivel carregar o checklist.</div>
        ) : null}

        {execution ? (
          <div className="space-y-4">
            <section className="card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-lg font-bold text-brand-primary">{execution.code}</p>
                  <p className="text-sm text-slate-600">
                    {execution.templateVersion?.template?.name ?? "Template sem nome"} -{" "}
                    {execution.templateVersion?.template?.serviceType ?? "-"}
                  </p>
                </div>
                <span className={cn("rounded-full px-3 py-1 text-xs font-bold", statusMeta.className)}>
                  {statusMeta.label}
                </span>
              </div>

              <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                <p>
                  <strong>Tecnico:</strong> {execution.assignedTechnician?.name ?? "-"}
                </p>
                <p>
                  <strong>Cliente:</strong> {execution.customer?.name ?? "-"}
                </p>
                <p>
                  <strong>Unidade:</strong> {execution.siteLocation?.name ?? "-"}
                </p>
                <p>
                  <strong>Data servico:</strong> {toDateTime(execution.serviceDate)}
                </p>
                <p>
                  <strong>Atualizado:</strong> {toDateTime(execution.updatedAt)}
                </p>
                <p>
                  <strong>Respondidos:</strong> {answeredCount}/{allItems.length}
                </p>
              </div>
            </section>

            {currentSection ? (
              <section className="card p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-bold text-brand-primary">
                    Secao {sectionIndex + 1}/{sections.length}: {currentSection.title}
                  </h2>
                  <span className="rounded-full bg-brand-highlight px-3 py-1 text-xs font-bold text-brand-primary">
                    Faltam {requiredMissing} obrigatorios
                  </span>
                </div>

                <div className="space-y-3">
                  {currentSection.items.map((item) => {
                    const answerValue = answers[item.id];
                    const answerRecord = execution.answers.find((entry) => entry.checklistItemId === item.id);
                    const itemOptions = toStringOptions(item.options);
                    const selectedNokReasons = nokReasons[item.id] ?? [];
                    const nokOptions =
                      item.itemType === "OK_NOK"
                        ? itemOptions.length
                          ? itemOptions
                          : DEFAULT_NOK_REASONS
                        : [];

                    return (
                      <article className="rounded-xl border border-slate-200 p-3" key={item.id}>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-brand-primary">
                            {item.label}{" "}
                            <span className="text-xs font-normal text-slate-500">
                              ({item.itemType}
                              {item.unit ? `, ${item.unit}` : ""})
                            </span>
                          </p>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-bold",
                              item.required
                                ? "bg-rose-100 text-rose-700"
                                : "bg-slate-100 text-slate-500"
                            )}
                          >
                            {item.required ? "obrigatorio" : "opcional"}
                          </span>
                        </div>

                        {item.itemType === "OK_NOK" ? (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <Button
                                disabled={!canEdit}
                                onClick={() => {
                                  setAnswers((previous) => ({
                                    ...previous,
                                    [item.id]: true
                                  }));
                                  setNokReasons((previous) => ({
                                    ...previous,
                                    [item.id]: []
                                  }));
                                }}
                                type="button"
                                variant={answerValue === true ? "default" : "outline"}
                              >
                                OK
                              </Button>
                              <Button
                                disabled={!canEdit}
                                onClick={() =>
                                  setAnswers((previous) => ({
                                    ...previous,
                                    [item.id]: false
                                  }))
                                }
                                type="button"
                                variant={answerValue === false ? "danger" : "outline"}
                              >
                                NOK
                              </Button>
                            </div>
                            {answerValue === false ? (
                              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                                <p className="mb-2 text-xs font-semibold text-amber-800">
                                  Motivos predefinidos do NOK (marque ao menos 1)
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {nokOptions.map((reason) => {
                                    const selected = selectedNokReasons.includes(reason);
                                    return (
                                      <Button
                                        disabled={!canEdit}
                                        key={`${item.id}-${reason}`}
                                        onClick={() => toggleNokReason(item.id, reason)}
                                        type="button"
                                        variant={selected ? "default" : "outline"}
                                      >
                                        {selected ? "[x] " : "[ ] "}
                                        {reason}
                                      </Button>
                                    );
                                  })}
                                </div>
                                {(selectedNokReasons.length ?? 0) === 0 ? (
                                  <p className="mt-2 text-xs font-semibold text-red-700">
                                    Se marcar NOK, selecione pelo menos um motivo.
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {item.itemType === "NUMBER" ? (
                          <Input
                            disabled={!canEdit}
                            onChange={(event) => {
                              const parsed = Number.parseFloat(event.target.value.replace(",", "."));
                              setAnswers((previous) => ({
                                ...previous,
                                [item.id]: Number.isFinite(parsed) ? parsed : undefined
                              }));
                            }}
                            placeholder={item.unit ? `Valor em ${item.unit}` : "Valor numerico"}
                            type="number"
                            value={typeof answerValue === "number" ? String(answerValue) : ""}
                          />
                        ) : null}

                        {item.itemType === "MULTIPLE_CHOICE" ? (
                          <div className="flex flex-wrap gap-2">
                            {itemOptions.map((option) => {
                              const selected =
                                Array.isArray(answerValue) && answerValue.includes(option);
                              return (
                                <Button
                                  disabled={!canEdit}
                                  key={option}
                                  onClick={() => toggleChoice(item.id, option)}
                                  type="button"
                                  variant={selected ? "default" : "outline"}
                                >
                                  {selected ? "[x] " : "[ ] "}
                                  {option}
                                </Button>
                              );
                            })}
                          </div>
                        ) : null}

                        {(item.itemType === "TEXT" ||
                          item.itemType === "PHOTO_REQUIRED" ||
                          item.itemType === "SIGNATURE") ? (
                          <Textarea
                            disabled={!canEdit}
                            onChange={(event) =>
                              setAnswers((previous) => ({
                                ...previous,
                                [item.id]: event.target.value
                              }))
                            }
                            placeholder={
                              item.itemType === "PHOTO_REQUIRED"
                                ? "Descreva as fotos/anexos coletados"
                                : item.itemType === "SIGNATURE"
                                  ? "Assinatura do item"
                                  : "Digite a resposta"
                            }
                            rows={2}
                            value={typeof answerValue === "string" ? answerValue : ""}
                          />
                        ) : null}

                        {answerRecord?.attachments?.length ? (
                          <p className="mt-2 text-xs text-slate-500">
                            Anexos existentes: {answerRecord.attachments.length}
                          </p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap justify-between gap-2">
                  <Button
                    disabled={sectionIndex === 0}
                    onClick={() => setSectionIndex((previous) => Math.max(0, previous - 1))}
                    type="button"
                    variant="outline"
                  >
                    Secao anterior
                  </Button>
                  <Button
                    disabled={sectionIndex >= sections.length - 1}
                    onClick={() =>
                      setSectionIndex((previous) => Math.min(sections.length - 1, previous + 1))
                    }
                    type="button"
                    variant="outline"
                  >
                    Proxima secao
                  </Button>
                </div>
              </section>
            ) : null}

            <section className="card p-4">
              <h3 className="mb-2 text-base font-bold text-brand-primary">Assinaturas e observacoes</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-sm font-semibold text-brand-primary">Assinatura do tecnico</p>
                  <SignaturePad disabled={!canEdit} onChange={setTechnicianSignature} value={technicianSignature} />
                </div>
                <div>
                  <p className="mb-1 text-sm font-semibold text-brand-primary">Assinatura do responsavel local</p>
                  <SignaturePad
                    disabled={!canEdit}
                    onChange={setLocalResponsibleSignature}
                    value={localResponsibleSignature}
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-sm font-semibold text-brand-primary">Observacoes finais</label>
                <Textarea
                  disabled={!canEdit}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  value={notes}
                />
              </div>
            </section>

            {!canEdit ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Este checklist esta em status que nao permite edicao para o seu perfil.
              </p>
            ) : null}

            {canEdit && nokPendingReasons > 0 ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                Existem {nokPendingReasons} item(ns) marcados como NOK sem motivo. Marque pelo menos um motivo em cada NOK.
              </p>
            ) : null}

            {errorMsg ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMsg}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!canEdit || saveMutation.isPending || nokPendingReasons > 0}
                onClick={() => saveMutation.mutate()}
                type="button"
                variant="outline"
              >
                {saveMutation.isPending ? "Salvando..." : "Salvar progresso"}
              </Button>
              <Button
                disabled={
                  !canEdit ||
                  submitMutation.isPending ||
                  allItems.length === 0 ||
                  requiredMissing > 0 ||
                  nokPendingReasons > 0
                }
                onClick={() => submitMutation.mutate()}
                type="button"
              >
                {submitMutation.isPending ? "Enviando..." : "Enviar checklist"}
              </Button>
              <Button onClick={refresh} type="button" variant="ghost">
                Atualizar
              </Button>
            </div>
          </div>
        ) : null}
      </AppShell>
    </RequireAuth>
  );
}

export default function ChecklistExecutionPage() {
  return (
    <Suspense
      fallback={
        <RequireAuth>
          <AppShell>
            <div className="card p-4 text-sm text-slate-600">Carregando checklist...</div>
          </AppShell>
        </RequireAuth>
      }
    >
      <ChecklistExecutionPageContent />
    </Suspense>
  );
}
