"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { ChecklistSectionNav } from "@/components/checklist-section-nav";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

type ChecklistItem = {
  id: string;
  label: string;
  itemType: "OK_NOK" | "TEXT" | "NUMBER" | "MULTIPLE_CHOICE" | "PHOTO_REQUIRED" | "SIGNATURE";
  required: boolean;
  unit?: string | null;
  options?: unknown;
};

type ChecklistSection = {
  id: string;
  title: string;
  items: ChecklistItem[];
};

type ChecklistTemplateVersion = {
  id: string;
  version: number;
  sections: ChecklistSection[];
};

type ChecklistTemplate = {
  id: string;
  name: string;
  description?: string | null;
  serviceType: string;
  versions: ChecklistTemplateVersion[];
};

const getStringOptions = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
};

const getIsAnswered = (item: ChecklistItem, value: unknown) => {
  if (item.itemType === "OK_NOK") {
    return typeof value === "boolean";
  }

  if (item.itemType === "NUMBER") {
    return typeof value === "number" && Number.isFinite(value);
  }

  if (item.itemType === "MULTIPLE_CHOICE") {
    return Array.isArray(value) && value.length > 0;
  }

  if (item.itemType === "TEXT" || item.itemType === "SIGNATURE" || item.itemType === "PHOTO_REQUIRED") {
    return typeof value === "string" && value.trim().length > 0;
  }

  return false;
};

const toProgressPayload = (items: ChecklistItem[], answers: Record<string, unknown>) => {
  return {
    step: 2,
    notes: "Simulacao em tela web",
    answers: items
      .filter((item) => getIsAnswered(item, answers[item.id]))
      .map((item) => {
        const value = answers[item.id];

        if (item.itemType === "OK_NOK" && typeof value === "boolean") {
          return {
            checklistItemId: item.id,
            booleanValue: value,
            isNonConformity: value === false
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
  };
};

export default function ChecklistSimulatorPage() {
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [started, setStarted] = useState(false);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [showPayload, setShowPayload] = useState(false);

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.get<ChecklistTemplate[]>("/checklists/templates")
  });

  const versionOptions = useMemo(() => {
    const templates = templatesQuery.data ?? [];

    return templates.flatMap((template) =>
      template.versions.map((version) => ({
        value: version.id,
        label: `${template.name} (v${version.version})`,
        templateName: template.name,
        serviceType: template.serviceType,
        description: template.description ?? ""
      }))
    );
  }, [templatesQuery.data]);

  const selectedTemplateData = useMemo(() => {
    const templates = templatesQuery.data ?? [];
    for (const template of templates) {
      for (const version of template.versions) {
        if (version.id === selectedVersionId) {
          return {
            template,
            version
          };
        }
      }
    }
    return null;
  }, [selectedVersionId, templatesQuery.data]);

  const allItems = useMemo(() => {
    if (!selectedTemplateData) {
      return [] as ChecklistItem[];
    }
    return selectedTemplateData.version.sections.flatMap((section) => section.items);
  }, [selectedTemplateData]);

  const currentSection = selectedTemplateData?.version.sections[sectionIndex];

  const totalItems = allItems.length;
  const answeredItems = allItems.filter((item) => getIsAnswered(item, answers[item.id])).length;
  const nonConformities = allItems.filter((item) => item.itemType === "OK_NOK" && answers[item.id] === false).length;
  const progressPct = totalItems > 0 ? Math.round((answeredItems / totalItems) * 100) : 0;

  const payloadPreview = useMemo(() => toProgressPayload(allItems, answers), [allItems, answers]);

  const resetSimulation = () => {
    setStarted(false);
    setSectionIndex(0);
    setAnswers({});
    setShowPayload(false);
  };

  const toggleMultiChoice = (itemId: string, option: string) => {
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

  return (
    <RequireAuth>
      <AppShell>
        <ChecklistSectionNav />
        <div className="mb-4">
          <h1 className="text-2xl font-black text-brand-primary">Simulador de Checklist</h1>
          <p className="text-sm text-slate-600">
            Teste o comportamento do checklist antes de colocar em uso, sem gravar atendimento real.
          </p>
        </div>

        <section className="card mb-4 p-4">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
            <div>
              <label className="mb-1 block text-sm font-semibold text-brand-primary">Template/versao</label>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-brand-primary transition focus:ring-2"
                onChange={(event) => {
                  setSelectedVersionId(event.target.value);
                  resetSimulation();
                }}
                value={selectedVersionId}
              >
                <option value="">Selecione um template</option>
                {versionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                disabled={!selectedVersionId}
                onClick={() => {
                  setStarted(true);
                  setSectionIndex(0);
                }}
                type="button"
              >
                Iniciar simulacao
              </Button>
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={resetSimulation} type="button" variant="outline">
                Resetar
              </Button>
            </div>
          </div>

          {selectedTemplateData ? (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <strong>{selectedTemplateData.template.name}</strong> | {selectedTemplateData.template.serviceType}
              {selectedTemplateData.template.description ? (
                <p className="mt-1 text-xs text-slate-600">{selectedTemplateData.template.description}</p>
              ) : null}
            </div>
          ) : null}
        </section>

        {!started || !selectedTemplateData || !currentSection ? (
          <div className="card p-4 text-sm text-slate-600">
            Selecione um template e clique em <strong>Iniciar simulacao</strong>.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <section className="card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-brand-primary">
                  Secao {sectionIndex + 1}/{selectedTemplateData.version.sections.length}: {currentSection.title}
                </h2>
                <span className="rounded-full bg-brand-highlight px-3 py-1 text-xs font-bold text-brand-primary">
                  {progressPct}% concluido
                </span>
              </div>

              <div className="space-y-3">
                {currentSection.items.map((item) => {
                  const value = answers[item.id];
                  const options = getStringOptions(item.options);

                  return (
                    <article className="rounded-xl border border-slate-200 p-3" key={item.id}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-brand-primary">
                          {item.label}{" "}
                          <span className="text-xs font-normal text-slate-500">
                            ({item.itemType}
                            {item.unit ? `, ${item.unit}` : ""})
                          </span>
                        </p>
                        {item.required ? (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                            obrigatorio
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                            opcional
                          </span>
                        )}
                      </div>

                      {item.itemType === "OK_NOK" ? (
                        <div className="flex gap-2">
                          <Button
                            onClick={() => setAnswers((previous) => ({ ...previous, [item.id]: true }))}
                            type="button"
                            variant={value === true ? "default" : "outline"}
                          >
                            OK
                          </Button>
                          <Button
                            onClick={() => setAnswers((previous) => ({ ...previous, [item.id]: false }))}
                            type="button"
                            variant={value === false ? "danger" : "outline"}
                          >
                            NOK
                          </Button>
                        </div>
                      ) : null}

                      {item.itemType === "NUMBER" ? (
                        <Input
                          onChange={(event) => {
                            const parsed = Number.parseFloat(event.target.value.replace(",", "."));
                            setAnswers((previous) => ({
                              ...previous,
                              [item.id]: Number.isFinite(parsed) ? parsed : undefined
                            }));
                          }}
                          placeholder={item.unit ? `Valor em ${item.unit}` : "Valor numerico"}
                          type="number"
                          value={typeof value === "number" ? String(value) : ""}
                        />
                      ) : null}

                      {item.itemType === "MULTIPLE_CHOICE" ? (
                        <div className="flex flex-wrap gap-2">
                          {options.map((option) => {
                            const selected = Array.isArray(value) && value.includes(option);
                            return (
                              <Button
                                key={option}
                                onClick={() => toggleMultiChoice(item.id, option)}
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
                        item.itemType === "SIGNATURE" ||
                        item.itemType === "PHOTO_REQUIRED") ? (
                        <Textarea
                          onChange={(event) =>
                            setAnswers((previous) => ({
                              ...previous,
                              [item.id]: event.target.value
                            }))
                          }
                          placeholder={
                            item.itemType === "SIGNATURE"
                              ? "Simule a assinatura (nome/base64)"
                              : item.itemType === "PHOTO_REQUIRED"
                                ? "Descreva foto(s) simulada(s)"
                                : "Digite a resposta"
                          }
                          rows={2}
                          value={typeof value === "string" ? value : ""}
                        />
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
                  disabled={sectionIndex >= selectedTemplateData.version.sections.length - 1}
                  onClick={() =>
                    setSectionIndex((previous) =>
                      Math.min(selectedTemplateData.version.sections.length - 1, previous + 1)
                    )
                  }
                  type="button"
                >
                  Proxima secao
                </Button>
              </div>
            </section>

            <aside className="card p-4">
              <h3 className="mb-2 text-base font-bold text-brand-primary">Resumo da simulacao</h3>
              <ul className="space-y-2 text-sm text-slate-700">
                <li>
                  Itens respondidos: <strong>{answeredItems}</strong> / {totalItems}
                </li>
                <li>
                  Nao conformidades (NOK): <strong>{nonConformities}</strong>
                </li>
                <li>
                  Secao atual: <strong>{sectionIndex + 1}</strong> / {selectedTemplateData.version.sections.length}
                </li>
              </ul>

              <Button
                className="mt-4 w-full"
                onClick={() => setShowPayload((previous) => !previous)}
                type="button"
                variant="outline"
              >
                {showPayload ? "Ocultar payload" : "Ver payload simulado"}
              </Button>
            </aside>
          </div>
        )}

        {showPayload && started && selectedTemplateData ? (
          <section className="card mt-4 p-4">
            <h3 className="mb-2 text-base font-bold text-brand-primary">Payload de progresso simulado</h3>
            <pre className="overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">
              {JSON.stringify(payloadPreview, null, 2)}
            </pre>
          </section>
        ) : null}
      </AppShell>
    </RequireAuth>
  );
}
