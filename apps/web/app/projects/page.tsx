"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Filter, FolderKanban, Plus, RefreshCcw, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { authStorage } from "@/lib/auth-storage";

type ProjectStatus = "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CLOSED" | "CANCELLED";
type ProjectPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type ProjectTaskStatus =
  | "BACKLOG"
  | "TODO"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "REVIEW"
  | "DONE"
  | "CANCELLED";
type ProjectTaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type ProjectViewMode = "LIST" | "KANBAN" | "TIMELINE";
type TaskViewMode = "TABLE" | "KANBAN";

type ProjectSummary = {
  total: number;
  active: number;
  onHold: number;
  completed: number;
  overdue: number;
  tasks: { total: number; done: number; inProgress: number; blocked: number };
  hours: { estimated: number; logged: number };
};

type ProjectOptions = {
  statuses: ProjectStatus[];
  priorities: ProjectPriority[];
  taskStatuses: ProjectTaskStatus[];
  taskPriorities: ProjectTaskPriority[];
  customers: Array<{ id: string; name: string }>;
  owners: Array<{ id: string; name: string }>;
  collaborators: Array<{ id: string; name: string }>;
  serviceOrders: Array<{ id: string; code: string; title: string; status: string }>;
  deskTickets: Array<{ id: string; code: string; title: string; status: string }>;
};

type ProjectListItem = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  dueDate?: string | null;
  customer?: { id: string; name: string } | null;
  owner?: { id: string; name: string } | null;
  tasksCount: number;
  metrics: { progress: number; open: number; done: number; blocked: number; late: number };
};

type ProjectDetail = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  dueDate?: string | null;
  budgetAmount?: number | null;
  members: Array<{
    userId: string;
    role: string;
    user: { id: string; name: string };
  }>;
  metrics: { progress: number; open: number; done: number; blocked: number; late: number };
  tasks: Array<{
    id: string;
    title: string;
    status: ProjectTaskStatus;
    priority: ProjectTaskPriority;
    dueDate?: string | null;
    loggedHours: number;
    estimatedHours?: number | null;
    assignedTo?: { id: string; name: string } | null;
    linkedServiceOrder?: { code: string } | null;
    linkedDeskTicket?: { code: string } | null;
  }>;
};

type Filters = {
  search: string;
  status: "ALL" | ProjectStatus;
  ownerId: string;
  customerId: string;
  includeClosed: boolean;
  onlyMine: boolean;
};

const MANAGER_ROLES = new Set(["SUPERADMIN", "ADMIN", "SUPERVISOR"]);
const initialFilters: Filters = {
  search: "",
  status: "ALL",
  ownerId: "",
  customerId: "",
  includeClosed: false,
  onlyMine: false
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNING: "Planejamento",
  ACTIVE: "Ativo",
  ON_HOLD: "Em espera",
  COMPLETED: "Concluido",
  CLOSED: "Fechado",
  CANCELLED: "Cancelado"
};

const TASK_STATUS_LABEL: Record<ProjectTaskStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "A fazer",
  IN_PROGRESS: "Em andamento",
  BLOCKED: "Bloqueada",
  REVIEW: "Revisao",
  DONE: "Concluida",
  CANCELLED: "Cancelada"
};

const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CLOSED",
  "CANCELLED"
];

const TASK_STATUS_FALLBACK_ORDER: ProjectTaskStatus[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "REVIEW",
  "DONE",
  "CANCELLED"
];

const toDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString("pt-BR") : "-");

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const user = authStorage.getUser();
  const managerView = MANAGER_ROLES.has(user?.role ?? "");

  const [draftFilters, setDraftFilters] = useState<Filters>(initialFilters);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [projectViewMode, setProjectViewMode] = useState<ProjectViewMode>("LIST");
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>("TABLE");

  const [openCreateProject, setOpenCreateProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>("PLANNING");
  const [projectPriority, setProjectPriority] = useState<ProjectPriority>("MEDIUM");
  const [projectOwnerId, setProjectOwnerId] = useState("");
  const [projectCustomerId, setProjectCustomerId] = useState("");

  const [openCreateTask, setOpenCreateTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskStatus, setTaskStatus] = useState<ProjectTaskStatus>("TODO");
  const [taskPriority, setTaskPriority] = useState<ProjectTaskPriority>("MEDIUM");
  const [taskAssignedToId, setTaskAssignedToId] = useState("");
  const [taskLinkedServiceOrderId, setTaskLinkedServiceOrderId] = useState("");
  const [taskLinkedDeskTicketId, setTaskLinkedDeskTicketId] = useState("");

  const summaryQuery = useQuery({
    queryKey: ["projects-summary"],
    queryFn: () => api.get<ProjectSummary>("/projects/summary")
  });

  const optionsQuery = useQuery({
    queryKey: ["projects-options"],
    queryFn: () => api.get<ProjectOptions>("/projects/options")
  });

  const projectsQuery = useQuery({
    queryKey: ["projects-list", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.search.trim()) params.set("search", filters.search.trim());
      if (filters.status !== "ALL") params.set("status", filters.status);
      if (filters.ownerId) params.set("ownerId", filters.ownerId);
      if (filters.customerId) params.set("customerId", filters.customerId);
      if (filters.includeClosed) params.set("includeClosed", "true");
      if (filters.onlyMine) params.set("onlyMine", "true");
      return api.get<ProjectListItem[]>(`/projects${params.toString() ? `?${params.toString()}` : ""}`);
    }
  });

  const selectedProjectQuery = useQuery({
    queryKey: ["projects-detail", selectedProjectId],
    queryFn: () => api.get<ProjectDetail>(`/projects/${selectedProjectId}`),
    enabled: Boolean(selectedProjectId)
  });

  const createProjectMutation = useMutation({
    mutationFn: () =>
      api.post("/projects", {
        name: projectName.trim(),
        description: projectDescription.trim() || undefined,
        status: projectStatus,
        priority: projectPriority,
        ownerId: projectOwnerId || undefined,
        customerId: projectCustomerId || undefined
      }),
    onSuccess: () => {
      setOpenCreateProject(false);
      setErrorMsg(null);
      setProjectName("");
      setProjectDescription("");
      setProjectStatus("PLANNING");
      setProjectPriority("MEDIUM");
      setProjectOwnerId("");
      setProjectCustomerId("");
      queryClient.invalidateQueries({ queryKey: ["projects-list"] });
      queryClient.invalidateQueries({ queryKey: ["projects-summary"] });
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const createTaskMutation = useMutation({
    mutationFn: () =>
      api.post(`/projects/${selectedProjectId}/tasks`, {
        title: taskTitle.trim(),
        status: taskStatus,
        priority: taskPriority,
        assignedToId: taskAssignedToId || undefined,
        linkedServiceOrderId: taskLinkedServiceOrderId || undefined,
        linkedDeskTicketId: taskLinkedDeskTicketId || undefined
      }),
    onSuccess: () => {
      setOpenCreateTask(false);
      setErrorMsg(null);
      setTaskTitle("");
      setTaskStatus("TODO");
      setTaskPriority("MEDIUM");
      setTaskAssignedToId("");
      setTaskLinkedServiceOrderId("");
      setTaskLinkedDeskTicketId("");
      queryClient.invalidateQueries({ queryKey: ["projects-detail", selectedProjectId] });
      queryClient.invalidateQueries({ queryKey: ["projects-list"] });
      queryClient.invalidateQueries({ queryKey: ["projects-summary"] });
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: (params: { taskId: string; status: ProjectTaskStatus }) =>
      api.patch(`/projects/${selectedProjectId}/tasks/${params.taskId}`, { status: params.status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects-detail", selectedProjectId] });
      queryClient.invalidateQueries({ queryKey: ["projects-list"] });
      queryClient.invalidateQueries({ queryKey: ["projects-summary"] });
    },
    onError: (error) => setErrorMsg(error.message)
  });

  const projects = projectsQuery.data ?? [];
  const options = optionsQuery.data;
  const selectedProject = selectedProjectQuery.data ?? null;

  useEffect(() => {
    if (!projects.length) {
      setSelectedProjectId("");
      return;
    }
    if (!selectedProjectId || !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const activeFilters = useMemo(
    () =>
      Number(Boolean(filters.search.trim())) +
      Number(filters.status !== "ALL") +
      Number(Boolean(filters.ownerId)) +
      Number(Boolean(filters.customerId)) +
      Number(filters.includeClosed) +
      Number(filters.onlyMine),
    [filters]
  );

  const projectsByStatus = useMemo(
    () =>
      projects.reduce<Record<ProjectStatus, ProjectListItem[]>>(
        (acc, project) => {
          acc[project.status].push(project);
          return acc;
        },
        {
          PLANNING: [],
          ACTIVE: [],
          ON_HOLD: [],
          COMPLETED: [],
          CLOSED: [],
          CANCELLED: []
        }
      ),
    [projects]
  );

  const projectTimeline = useMemo(() => {
    const withDueDate = projects
      .filter((project) => Boolean(project.dueDate))
      .sort(
        (a, b) =>
          new Date(a.dueDate as string).getTime() - new Date(b.dueDate as string).getTime()
      );
    const withoutDueDate = projects.filter((project) => !project.dueDate);
    return [...withDueDate, ...withoutDueDate];
  }, [projects]);

  const taskStatusOrder = useMemo(
    () => (options?.taskStatuses?.length ? options.taskStatuses : TASK_STATUS_FALLBACK_ORDER),
    [options?.taskStatuses]
  );

  const taskBoard = useMemo(() => {
    const grouped: Record<ProjectTaskStatus, ProjectDetail["tasks"]> = {
      BACKLOG: [],
      TODO: [],
      IN_PROGRESS: [],
      BLOCKED: [],
      REVIEW: [],
      DONE: [],
      CANCELLED: []
    };

    for (const task of selectedProject?.tasks ?? []) {
      grouped[task.status].push(task);
    }

    return grouped;
  }, [selectedProject?.tasks]);

  return (
    <RequireAuth>
      <AppShell>
        <section className="mb-5 rounded-3xl border border-brand-primary/20 bg-white p-4 shadow-[0_12px_30px_rgba(7,56,77,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-brand-highlight/70 px-3 py-1 text-xs font-black uppercase tracking-wide text-brand-primary">
                <FolderKanban className="h-3.5 w-3.5" />
                Controle de projetos
              </p>
              <h1 className="mt-2 text-2xl font-black text-brand-primary">Area de projetos</h1>
              <p className="text-sm text-slate-600">
                Ver todas as tarefas, tempo gasto geral e atividades gerais.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => projectsQuery.refetch()} type="button" variant="outline">
                <RefreshCcw className="mr-1 h-4 w-4" />
                Atualizar
              </Button>
              <Dialog open={openCreateProject} onOpenChange={setOpenCreateProject}>
                <DialogTrigger asChild>
                  <Button disabled={!managerView} onClick={() => setErrorMsg(null)} type="button">
                    <Plus className="mr-1 h-4 w-4" />
                    Novo projeto
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Novo projeto</DialogTitle>
                  </DialogHeader>
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      createProjectMutation.mutate();
                    }}
                  >
                    <Input placeholder="Nome do projeto*" required value={projectName} onChange={(event) => setProjectName(event.target.value)} />
                    <textarea className="w-full rounded-xl border px-3 py-2" placeholder="Descricao" rows={3} value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <select className="w-full rounded-xl border px-3 py-2" value={projectStatus} onChange={(event) => setProjectStatus(event.target.value as ProjectStatus)}>
                        {(options?.statuses ?? []).map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABEL[status]}
                          </option>
                        ))}
                      </select>
                      <select className="w-full rounded-xl border px-3 py-2" value={projectPriority} onChange={(event) => setProjectPriority(event.target.value as ProjectPriority)}>
                        {(options?.priorities ?? []).map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                      <select className="w-full rounded-xl border px-3 py-2" value={projectOwnerId} onChange={(event) => setProjectOwnerId(event.target.value)}>
                        <option value="">Responsavel atual</option>
                        {(options?.owners ?? []).map((owner) => (
                          <option key={owner.id} value={owner.id}>
                            {owner.name}
                          </option>
                        ))}
                      </select>
                      <select className="w-full rounded-xl border px-3 py-2" value={projectCustomerId} onChange={(event) => setProjectCustomerId(event.target.value)}>
                        <option value="">Sem cliente</option>
                        {(options?.customers ?? []).map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {errorMsg ? <p className="text-sm text-red-600">{errorMsg}</p> : null}
                    <Button className="w-full" disabled={createProjectMutation.isPending} type="submit">
                      {createProjectMutation.isPending ? "Salvando..." : "Salvar projeto"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </section>

        <section className="mb-4 grid gap-3 md:grid-cols-5">
          <article className="card p-3"><p className="text-xs font-semibold uppercase text-slate-500">Projetos</p><p className="mt-2 text-2xl font-black text-brand-primary">{summaryQuery.data?.total ?? 0}</p></article>
          <article className="card p-3"><p className="text-xs font-semibold uppercase text-slate-500">Ativos</p><p className="mt-2 text-2xl font-black text-emerald-700">{summaryQuery.data?.active ?? 0}</p></article>
          <article className="card p-3"><p className="text-xs font-semibold uppercase text-slate-500">Em espera</p><p className="mt-2 text-2xl font-black text-amber-700">{summaryQuery.data?.onHold ?? 0}</p></article>
          <article className="card p-3"><p className="text-xs font-semibold uppercase text-slate-500">Concluidos</p><p className="mt-2 text-2xl font-black text-sky-700">{summaryQuery.data?.completed ?? 0}</p></article>
          <article className="card border-rose-200 bg-rose-50 p-3"><p className="text-xs font-semibold uppercase text-rose-700">Atrasados</p><p className="mt-2 text-2xl font-black text-rose-700">{summaryQuery.data?.overdue ?? 0}</p></article>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <div className="card p-3">
              <div className="inline-flex rounded-xl border border-brand-primary/20 bg-slate-50 p-1">
                <Button
                  className="h-8 px-3 text-xs"
                  onClick={() => setProjectViewMode("LIST")}
                  type="button"
                  variant={projectViewMode === "LIST" ? "default" : "ghost"}
                >
                  Lista
                </Button>
                <Button
                  className="h-8 px-3 text-xs"
                  onClick={() => setProjectViewMode("KANBAN")}
                  type="button"
                  variant={projectViewMode === "KANBAN" ? "default" : "ghost"}
                >
                  Kanban
                </Button>
                <Button
                  className="h-8 px-3 text-xs"
                  onClick={() => setProjectViewMode("TIMELINE")}
                  type="button"
                  variant={projectViewMode === "TIMELINE" ? "default" : "ghost"}
                >
                  Timeline
                </Button>
              </div>
            </div>

            {projectViewMode === "LIST" ? (
              <div className="card overflow-auto">
                <table className="min-w-[920px] text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left">
                      <th className="px-3 py-2">Projeto</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Responsavel</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Progresso</th>
                      <th className="px-3 py-2">Prazo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project) => (
                      <tr
                        className={`cursor-pointer border-b hover:bg-slate-50 ${project.id === selectedProjectId ? "bg-brand-primary/5" : ""}`}
                        key={project.id}
                        onClick={() => setSelectedProjectId(project.id)}
                      >
                        <td className="px-3 py-2">
                          <p className="font-semibold text-brand-primary">{project.name}</p>
                          <p className="text-xs text-slate-500">{project.code}</p>
                        </td>
                        <td className="px-3 py-2">{project.customer?.name ?? "-"}</td>
                        <td className="px-3 py-2">{project.owner?.name ?? "-"}</td>
                        <td className="px-3 py-2">{STATUS_LABEL[project.status]}</td>
                        <td className="px-3 py-2">{project.metrics.progress}%</td>
                        <td className="px-3 py-2">{toDate(project.dueDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {projectViewMode === "KANBAN" ? (
              <div className="card overflow-x-auto p-3">
                <div className="flex min-w-[1200px] gap-3">
                  {PROJECT_STATUS_ORDER.map((status) => (
                    <section className="w-[270px] shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-2" key={status}>
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-sm font-black text-brand-primary">{STATUS_LABEL[status]}</h3>
                        <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-xs font-semibold text-brand-primary">
                          {projectsByStatus[status].length}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {projectsByStatus[status].map((project) => (
                          <button
                            className={`w-full rounded-xl border bg-white p-3 text-left transition hover:border-brand-primary/40 ${
                              selectedProjectId === project.id ? "border-brand-primary bg-brand-primary/5" : "border-slate-200"
                            }`}
                            key={project.id}
                            onClick={() => setSelectedProjectId(project.id)}
                            type="button"
                          >
                            <p className="text-sm font-bold text-brand-primary">{project.name}</p>
                            <p className="text-xs text-slate-500">{project.code}</p>
                            <p className="mt-2 text-xs text-slate-600">Cliente: {project.customer?.name ?? "-"}</p>
                            <p className="text-xs text-slate-600">Responsavel: {project.owner?.name ?? "-"}</p>
                            <div className="mt-2 flex items-center justify-between text-xs">
                              <span className="text-slate-500">{toDate(project.dueDate)}</span>
                              <span className="font-semibold text-brand-primary">{project.metrics.progress}%</span>
                            </div>
                          </button>
                        ))}

                        {projectsByStatus[status].length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500">
                            Sem projetos nesta etapa
                          </div>
                        ) : null}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : null}

            {projectViewMode === "TIMELINE" ? (
              <section className="card p-4">
                <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-brand-primary">
                  Linha do tempo de entregas
                </h3>
                {projectTimeline.length ? (
                  <ol className="relative ml-2 border-l border-brand-primary/20">
                    {projectTimeline.map((project) => (
                      <li className="mb-3 ml-4 last:mb-0" key={project.id}>
                        <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full bg-brand-primary" />
                        <button
                          className={`w-full rounded-xl border p-3 text-left transition hover:border-brand-primary/40 ${
                            selectedProjectId === project.id ? "border-brand-primary bg-brand-primary/5" : "border-slate-200 bg-white"
                          }`}
                          onClick={() => setSelectedProjectId(project.id)}
                          type="button"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-bold text-brand-primary">{project.name}</p>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              {STATUS_LABEL[project.status]}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">{project.code}</p>
                          <p className="mt-1 text-xs text-slate-600">
                            Prazo: {toDate(project.dueDate)} | Progresso: {project.metrics.progress}% | Responsavel:{" "}
                            {project.owner?.name ?? "-"}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-slate-500">Nenhum projeto encontrado com os filtros atuais.</p>
                )}
              </section>
            ) : null}

            {selectedProject ? (
              <section className="card p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xl font-black text-brand-primary">
                      {selectedProject.name} <span className="text-sm text-slate-500">({selectedProject.code})</span>
                    </h2>
                    <p className="text-sm text-slate-600">{selectedProject.description ?? "Sem descricao"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-xl border border-brand-primary/20 bg-slate-50 p-1">
                      <Button
                        className="h-8 px-3 text-xs"
                        onClick={() => setTaskViewMode("TABLE")}
                        type="button"
                        variant={taskViewMode === "TABLE" ? "default" : "ghost"}
                      >
                        Tabela
                      </Button>
                      <Button
                        className="h-8 px-3 text-xs"
                        onClick={() => setTaskViewMode("KANBAN")}
                        type="button"
                        variant={taskViewMode === "KANBAN" ? "default" : "ghost"}
                      >
                        Kanban
                      </Button>
                    </div>
                    <Dialog open={openCreateTask} onOpenChange={setOpenCreateTask}>
                      <DialogTrigger asChild>
                        <Button onClick={() => setErrorMsg(null)} type="button" variant="outline">
                          <Plus className="mr-1 h-4 w-4" />
                          Nova tarefa
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Nova tarefa</DialogTitle>
                        </DialogHeader>
                        <form
                          className="space-y-3"
                          onSubmit={(event) => {
                            event.preventDefault();
                            createTaskMutation.mutate();
                          }}
                        >
                          <Input
                            onChange={(event) => setTaskTitle(event.target.value)}
                            placeholder="Titulo*"
                            required
                            value={taskTitle}
                          />
                          <div className="grid gap-3 md:grid-cols-2">
                            <select
                              className="w-full rounded-xl border px-3 py-2"
                              onChange={(event) => setTaskStatus(event.target.value as ProjectTaskStatus)}
                              value={taskStatus}
                            >
                              {taskStatusOrder.map((status) => (
                                <option key={status} value={status}>
                                  {TASK_STATUS_LABEL[status]}
                                </option>
                              ))}
                            </select>
                            <select className="w-full rounded-xl border px-3 py-2" onChange={(event) => setTaskPriority(event.target.value as ProjectTaskPriority)} value={taskPriority}>
                              {(options?.taskPriorities ?? []).map((priority) => (
                                <option key={priority} value={priority}>
                                  {priority}
                                </option>
                              ))}
                            </select>
                            <select className="w-full rounded-xl border px-3 py-2" onChange={(event) => setTaskAssignedToId(event.target.value)} value={taskAssignedToId}>
                              <option value="">Sem responsavel</option>
                              {(options?.collaborators ?? []).map((person) => (
                                <option key={person.id} value={person.id}>
                                  {person.name}
                                </option>
                              ))}
                            </select>
                            <select className="w-full rounded-xl border px-3 py-2" onChange={(event) => setTaskLinkedServiceOrderId(event.target.value)} value={taskLinkedServiceOrderId}>
                              <option value="">Sem OS vinculada</option>
                              {(options?.serviceOrders ?? []).map((order) => (
                                <option key={order.id} value={order.id}>
                                  {order.code} - {order.title}
                                </option>
                              ))}
                            </select>
                            <select className="w-full rounded-xl border px-3 py-2" onChange={(event) => setTaskLinkedDeskTicketId(event.target.value)} value={taskLinkedDeskTicketId}>
                              <option value="">Sem ticket vinculado</option>
                              {(options?.deskTickets ?? []).map((ticket) => (
                                <option key={ticket.id} value={ticket.id}>
                                  {ticket.code} - {ticket.title}
                                </option>
                              ))}
                            </select>
                          </div>
                          {errorMsg ? <p className="text-sm text-red-600">{errorMsg}</p> : null}
                          <Button className="w-full" disabled={createTaskMutation.isPending} type="submit">
                            {createTaskMutation.isPending ? "Salvando..." : "Salvar tarefa"}
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>

                <div className="mb-3 grid gap-3 md:grid-cols-4">
                  <article className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">Progresso</p><p className="mt-1 text-xl font-black text-brand-primary">{selectedProject.metrics.progress}%</p></article>
                  <article className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">Abertas</p><p className="mt-1 text-xl font-black text-brand-primary">{selectedProject.metrics.open}</p></article>
                  <article className="rounded-xl border border-rose-200 bg-rose-50 p-3"><p className="text-xs font-semibold uppercase text-rose-700">Bloqueadas</p><p className="mt-1 text-xl font-black text-rose-700">{selectedProject.metrics.blocked}</p></article>
                  <article className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">Horas logadas</p><p className="mt-1 text-xl font-black text-brand-primary">{selectedProject.tasks.reduce((sum, task) => sum + task.loggedHours, 0).toFixed(1)}h</p></article>
                </div>

                {taskViewMode === "TABLE" ? (
                  <div className="overflow-auto">
                    <table className="min-w-[900px] text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50 text-left">
                          <th className="px-3 py-2">Tarefa</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Responsavel</th>
                          <th className="px-3 py-2">Prazo</th>
                          <th className="px-3 py-2">Vinculos</th>
                          <th className="px-3 py-2">Horas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedProject.tasks.map((task) => (
                          <tr className="border-b" key={task.id}>
                            <td className="px-3 py-2">{task.title}</td>
                            <td className="px-3 py-2">
                              <select
                                className="rounded-lg border px-2 py-1 text-xs"
                                onChange={(event) =>
                                  updateTaskStatusMutation.mutate({
                                    taskId: task.id,
                                    status: event.target.value as ProjectTaskStatus
                                  })
                                }
                                value={task.status}
                              >
                                {taskStatusOrder.map((status) => (
                                  <option key={status} value={status}>
                                    {TASK_STATUS_LABEL[status]}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">{task.assignedTo?.name ?? "-"}</td>
                            <td className="px-3 py-2">{toDate(task.dueDate)}</td>
                            <td className="px-3 py-2">
                              OS: {task.linkedServiceOrder?.code ?? "-"} / Ticket:{" "}
                              {task.linkedDeskTicket?.code ?? "-"}
                            </td>
                            <td className="px-3 py-2">{task.loggedHours.toFixed(1)}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="flex min-w-[1200px] gap-3">
                      {taskStatusOrder.map((status) => (
                        <section className="w-[260px] shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-2" key={status}>
                          <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase tracking-wide text-brand-primary">
                              {TASK_STATUS_LABEL[status]}
                            </h3>
                            <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-xs font-semibold text-brand-primary">
                              {taskBoard[status].length}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {taskBoard[status].map((task) => (
                              <article className="rounded-xl border border-slate-200 bg-white p-2.5" key={task.id}>
                                <p className="text-sm font-bold text-brand-primary">{task.title}</p>
                                <p className="text-xs text-slate-500">Responsavel: {task.assignedTo?.name ?? "-"}</p>
                                <p className="text-xs text-slate-500">Prazo: {toDate(task.dueDate)}</p>
                                <p className="text-xs text-slate-500">
                                  OS: {task.linkedServiceOrder?.code ?? "-"} / Ticket:{" "}
                                  {task.linkedDeskTicket?.code ?? "-"}
                                </p>
                                <div className="mt-2">
                                  <select
                                    className="w-full rounded-lg border px-2 py-1 text-xs"
                                    onChange={(event) =>
                                      updateTaskStatusMutation.mutate({
                                        taskId: task.id,
                                        status: event.target.value as ProjectTaskStatus
                                      })
                                    }
                                    value={task.status}
                                  >
                                    {taskStatusOrder.map((item) => (
                                      <option key={item} value={item}>
                                        {TASK_STATUS_LABEL[item]}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </article>
                            ))}

                            {taskBoard[status].length === 0 ? (
                              <div className="rounded-xl border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500">
                                Sem tarefas nesta etapa
                              </div>
                            ) : null}
                          </div>
                        </section>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            ) : null}
          </div>

          <aside className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-black text-brand-primary">Filtros</h2>
              <span className="rounded-full bg-brand-primary/10 px-2 py-1 text-xs font-semibold text-brand-primary">{activeFilters} ativos</span>
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-600">
                <Search className="mr-1 inline h-4 w-4" />
                Pesquisar
                <Input className="mt-1" value={draftFilters.search} onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))} />
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                <input checked={draftFilters.includeClosed} className="h-4 w-4 rounded border-slate-400 text-brand-primary focus:ring-brand-primary" onChange={(event) => setDraftFilters((current) => ({ ...current, includeClosed: event.target.checked }))} type="checkbox" />
                Visualizar projetos fechados
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                Status
                <select className="mt-1 w-full rounded-xl border px-3 py-2" value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value as "ALL" | ProjectStatus }))}>
                  <option value="ALL">Todos</option>
                  {(options?.statuses ?? []).map((status) => (
                    <option key={status} value={status}>{STATUS_LABEL[status]}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                Responsavel
                <select className="mt-1 w-full rounded-xl border px-3 py-2" value={draftFilters.ownerId} onChange={(event) => setDraftFilters((current) => ({ ...current, ownerId: event.target.value }))}>
                  <option value="">Todos</option>
                  {(options?.owners ?? []).map((owner) => (
                    <option key={owner.id} value={owner.id}>{owner.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-600">
                Cliente
                <select className="mt-1 w-full rounded-xl border px-3 py-2" value={draftFilters.customerId} onChange={(event) => setDraftFilters((current) => ({ ...current, customerId: event.target.value }))}>
                  <option value="">Todos</option>
                  {(options?.customers ?? []).map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                <input checked={draftFilters.onlyMine} className="h-4 w-4 rounded border-slate-400 text-brand-primary focus:ring-brand-primary" onChange={(event) => setDraftFilters((current) => ({ ...current, onlyMine: event.target.checked }))} type="checkbox" />
                Meus projetos
              </label>
              <Button className="w-full" onClick={() => setFilters(draftFilters)} type="button">Aplicar</Button>
              <Button className="w-full" onClick={() => { setDraftFilters(initialFilters); setFilters(initialFilters); }} type="button" variant="outline">
                <Filter className="mr-1 h-4 w-4" />
                Limpar filtros
              </Button>
            </div>
          </aside>
        </section>
      </AppShell>
    </RequireAuth>
  );
}
