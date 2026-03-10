"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppShell } from "@/components/app-shell";
import { ChecklistSectionNav } from "@/components/checklist-section-nav";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

const TemplateSchema = z.object({
  name: z.string().min(2, "Informe ao menos 2 caracteres para o nome"),
  description: z.string().optional(),
  serviceType: z.enum(["INSTALACAO", "PREVENTIVA", "CORRETIVA", "PMOC", "VISTORIA"]),
  sectionsJson: z.string().min(4, "Informe um JSON valido para secoes e itens")
});

type TemplateInput = z.infer<typeof TemplateSchema>;

const AssignmentSchema = z.object({
  templateVersionId: z.string().min(1),
  assignedTechnicianId: z.string().min(1),
  customerId: z.string().optional(),
  siteLocationId: z.string().optional(),
  equipmentId: z.string().optional()
});

type AssignmentInput = z.infer<typeof AssignmentSchema>;

const templateSeed = [
  {
    title: "Dados do Equipamento",
    items: [
      { label: "Marca", itemType: "TEXT", required: true },
      { label: "Modelo", itemType: "TEXT", required: true }
    ]
  }
];

const getDefaultTemplateValues = (): TemplateInput => ({
  name: "",
  description: "",
  serviceType: "PREVENTIVA",
  sectionsJson: JSON.stringify(templateSeed, null, 2)
});

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [templateDialog, setTemplateDialog] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [assignDialog, setAssignDialog] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  const templateForm = useForm<TemplateInput>({
    resolver: zodResolver(TemplateSchema),
    defaultValues: getDefaultTemplateValues()
  });

  const assignForm = useForm<AssignmentInput>({
    resolver: zodResolver(AssignmentSchema),
    defaultValues: {
      templateVersionId: "",
      assignedTechnicianId: "",
      customerId: "",
      siteLocationId: "",
      equipmentId: ""
    }
  });

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.get<any[]>("/checklists/templates")
  });

  const optionsQuery = useQuery({
    queryKey: ["checklist-options"],
    queryFn: () => api.get<any>("/checklists/options")
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async ({ values, templateId }: { values: TemplateInput; templateId?: string | null }) => {
      let sections: unknown;

      try {
        sections = JSON.parse(values.sectionsJson);
      } catch {
        throw new Error("JSON de secoes/itens invalido");
      }

      const payload = {
        name: values.name,
        description: values.description,
        serviceType: values.serviceType,
        sections
      };

      if (templateId) {
        return api.put(`/checklists/templates/${templateId}`, payload);
      }

      return api.post("/checklists/templates", payload);
    },
    onSuccess: () => {
      setTemplateError(null);
      setTemplateDialog(false);
      setEditingTemplateId(null);
      templateForm.reset(getDefaultTemplateValues());
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (error) => {
      setTemplateError(error.message);
    }
  });

  const assignMutation = useMutation({
    mutationFn: (values: AssignmentInput) => api.post("/checklists/executions/assign", values),
    onSuccess: () => {
      setAssignError(null);
      setAssignDialog(false);
      assignForm.reset();
      queryClient.invalidateQueries({ queryKey: ["executions-tracking"] });
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
    },
    onError: (error) => {
      setAssignError(error.message);
    }
  });

  const templateOptions = useMemo(() => {
    const templates = templatesQuery.data ?? [];
    return templates.map((template) => ({
      label: `${template.name} (v${template.versions[0]?.version ?? "?"})`,
      value: template.versions[0]?.id
    }));
  }, [templatesQuery.data]);

  const openCreateTemplate = () => {
    setTemplateError(null);
    setEditingTemplateId(null);
    templateForm.reset(getDefaultTemplateValues());
    setTemplateDialog(true);
  };

  const openEditTemplate = (template: any) => {
    const sections = (template.versions[0]?.sections ?? []).map((section: any) => ({
      title: section.title,
      items: (section.items ?? []).map((item: any) => ({
        label: item.label,
        itemType: item.itemType,
        required: item.required ?? false,
        ...(item.unit ? { unit: item.unit } : {}),
        ...(Array.isArray(item.options) ? { options: item.options } : {})
      }))
    }));

    setTemplateError(null);
    setEditingTemplateId(template.id);
    templateForm.reset({
      name: template.name ?? "",
      description: template.description ?? "",
      serviceType: template.serviceType ?? "PREVENTIVA",
      sectionsJson: JSON.stringify(sections, null, 2)
    });
    setTemplateDialog(true);
  };

  return (
    <RequireAuth>
      <AppShell>
        <ChecklistSectionNav />
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-brand-primary">Templates de Checklist</h1>
            <p className="text-sm text-slate-600">CRUD via overlay e versionamento automático</p>
          </div>
          <div className="flex gap-2">
            <Dialog
              onOpenChange={(open) => {
                setAssignDialog(open);
                if (!open) {
                  setAssignError(null);
                }
              }}
              open={assignDialog}
            >
              <DialogTrigger asChild>
                <Button variant="outline">Atribuir Checklist</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Atribuir atendimento</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-3"
                  onSubmit={assignForm.handleSubmit(
                    (values) => {
                      setAssignError(null);
                      assignMutation.mutate(values);
                    },
                    () => {
                      setAssignError("Revise os campos obrigatorios para atribuir");
                    }
                  )}
                >
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Template versão</label>
                    <select className="w-full rounded-xl border px-3 py-2" {...assignForm.register("templateVersionId")}>
                      <option value="">Selecione</option>
                      {templateOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Técnico</label>
                    <select className="w-full rounded-xl border px-3 py-2" {...assignForm.register("assignedTechnicianId")}>
                      <option value="">Selecione</option>
                      {(optionsQuery.data?.technicians ?? []).map((tech: any) => (
                        <option key={tech.id} value={tech.id}>
                          {tech.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Cliente</label>
                    <select className="w-full rounded-xl border px-3 py-2" {...assignForm.register("customerId")}>
                      <option value="">Selecione</option>
                      {(optionsQuery.data?.customers ?? []).map((customer: any) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Unidade</label>
                    <select className="w-full rounded-xl border px-3 py-2" {...assignForm.register("siteLocationId")}>
                      <option value="">Selecione</option>
                      {(optionsQuery.data?.sites ?? []).map((site: any) => (
                        <option key={site.id} value={site.id}>
                          {site.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Equipamento</label>
                    <select className="w-full rounded-xl border px-3 py-2" {...assignForm.register("equipmentId")}>
                      <option value="">Selecione</option>
                      {(optionsQuery.data?.equipments ?? []).map((equipment: any) => (
                        <option key={equipment.id} value={equipment.id}>
                          {(equipment.brand ?? "-") + " " + (equipment.model ?? "-")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button className="w-full" type="submit">
                    {assignMutation.isPending ? "Atribuindo..." : "Atribuir"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog
              onOpenChange={(open) => {
                setTemplateDialog(open);
                if (!open) {
                  setTemplateError(null);
                  setEditingTemplateId(null);
                }
              }}
              open={templateDialog}
            >
              <DialogTrigger asChild>
                <Button onClick={openCreateTemplate}>Novo Template</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingTemplateId ? "Editar template" : "Criar template"}</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-3"
                  onSubmit={templateForm.handleSubmit(
                    (values) => {
                      setTemplateError(null);
                      saveTemplateMutation.mutate({
                        values,
                        templateId: editingTemplateId
                      });
                    },
                    () => {
                      setTemplateError("Revise os campos obrigatorios antes de salvar");
                    }
                  )}
                >
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Nome</label>
                    <Input {...templateForm.register("name")} />
                    {templateForm.formState.errors.name ? (
                      <p className="mt-1 text-xs text-red-600">{templateForm.formState.errors.name.message}</p>
                    ) : null}
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Descrição</label>
                    <Input {...templateForm.register("description")} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Tipo de serviço</label>
                    <select className="w-full rounded-xl border px-3 py-2" {...templateForm.register("serviceType")}>
                      <option value="INSTALACAO">Instalação</option>
                      <option value="PREVENTIVA">Preventiva</option>
                      <option value="CORRETIVA">Corretiva</option>
                      <option value="PMOC">PMOC</option>
                      <option value="VISTORIA">Vistoria</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold">Seções/itens (JSON)</label>
                    <Textarea rows={12} {...templateForm.register("sectionsJson")} />
                    {templateForm.formState.errors.sectionsJson ? (
                      <p className="mt-1 text-xs text-red-600">{templateForm.formState.errors.sectionsJson.message}</p>
                    ) : null}
                  </div>
                  {templateError ? <p className="text-sm text-red-600">{templateError}</p> : null}
                  <Button className="w-full" type="submit">
                    {saveTemplateMutation.isPending
                      ? "Salvando..."
                      : editingTemplateId
                        ? "Salvar nova versao"
                        : "Salvar"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

          </div>
        </div>

        {assignError ? (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{assignError}</p>
        ) : null}

        <div className="space-y-3">
          {(templatesQuery.data ?? []).map((template: any) => (
            <article className="card p-4" key={template.id}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-brand-primary">{template.name}</h2>
                  <p className="text-sm text-slate-600">
                    {template.description || "Sem descrição"} - {template.serviceType}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={() => openEditTemplate(template)} type="button" variant="outline">
                    Editar
                  </Button>
                  <span className="rounded-full bg-brand-highlight px-3 py-1 text-xs font-bold text-brand-primary">
                    v{template.versions[0]?.version ?? "-"}
                  </span>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {(template.versions[0]?.sections ?? []).map((section: any) => (
                  <div className="rounded-xl border border-slate-200 p-3" key={section.id}>
                    <p className="text-sm font-bold text-brand-primary">{section.title}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                      {section.items.map((item: any) => (
                        <li key={item.id}>
                          {item.label} ({item.itemType})
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </AppShell>
    </RequireAuth>
  );
}
