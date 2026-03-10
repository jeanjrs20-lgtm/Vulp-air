import type { FastifyPluginAsync } from "fastify";
import {
  Prisma,
  ProjectPriority,
  ProjectStatus,
  ProjectTaskPriority,
  ProjectTaskStatus,
  RoleCode
} from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../lib/app-error.js";
import { getRequestUser, sendSuccess } from "../../lib/envelope.js";
import { requirePermission } from "../../lib/authz.js";

const managerRoles = new Set(["SUPERADMIN", "ADMIN", "SUPERVISOR"]);
const isManager = (role: string) => managerRoles.has(role);

const projectStatuses = [
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CLOSED",
  "CANCELLED"
] as const;

const projectPriorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const projectTaskStatuses = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "REVIEW",
  "DONE",
  "CANCELLED"
] as const;

const projectTaskPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const ProjectListQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  ownerId: z.string().optional(),
  customerId: z.string().optional(),
  includeClosed: z.coerce.boolean().optional(),
  onlyMine: z.coerce.boolean().optional()
});

const ProjectCreateSchema = z.object({
  name: z.string().min(3),
  description: z.string().max(5000).optional(),
  status: z.enum(projectStatuses).default("PLANNING"),
  priority: z.enum(projectPriorities).default("MEDIUM"),
  customerId: z.string().optional(),
  ownerId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  budgetAmount: z.number().min(0).optional(),
  memberIds: z.array(z.string()).max(80).optional()
});

const ProjectUpdateSchema = z.object({
  name: z.string().min(3).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(projectStatuses).optional(),
  priority: z.enum(projectPriorities).optional(),
  customerId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  budgetAmount: z.number().min(0).nullable().optional()
});

const ProjectTaskCreateSchema = z.object({
  title: z.string().min(3),
  description: z.string().max(5000).optional(),
  status: z.enum(projectTaskStatuses).default("TODO"),
  priority: z.enum(projectTaskPriorities).default("MEDIUM"),
  assignedToId: z.string().optional(),
  dueDate: z.coerce.date().optional(),
  estimatedHours: z.number().min(0).optional(),
  loggedHours: z.number().min(0).optional(),
  linkedServiceOrderId: z.string().optional(),
  linkedDeskTicketId: z.string().optional()
});

const ProjectTaskUpdateSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(projectTaskStatuses).optional(),
  priority: z.enum(projectTaskPriorities).optional(),
  assignedToId: z.string().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  estimatedHours: z.number().min(0).nullable().optional(),
  loggedHours: z.number().min(0).optional(),
  linkedServiceOrderId: z.string().nullable().optional(),
  linkedDeskTicketId: z.string().nullable().optional()
});

const ProjectMemberAddSchema = z.object({
  userId: z.string(),
  role: z.string().max(40).optional(),
  isWatcher: z.boolean().optional()
});

const parseStatusFilter = <T extends string>(raw: string | undefined, allowed: readonly T[]) => {
  if (!raw) {
    return undefined;
  }

  const values = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is T => allowed.includes(value as T));

  return values.length ? values : undefined;
};

const generateProjectCode = () => {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `PRJ-${date}-${random}`;
};

const getProjectVisibilityWhere = (params: { role: string; userId: string }): Prisma.ProjectWhereInput => {
  if (isManager(params.role)) {
    return {};
  }

  return {
    OR: [
      { ownerId: params.userId },
      { members: { some: { userId: params.userId } } },
      {
        tasks: {
          some: {
            OR: [{ assignedToId: params.userId }, { createdById: params.userId }]
          }
        }
      }
    ]
  };
};

const toProjectMetrics = (
  tasks: Array<{
    status: ProjectTaskStatus;
    dueDate: Date | null;
    estimatedHours: number | null;
    loggedHours: number;
  }>
) => {
  const openStatuses = new Set<ProjectTaskStatus>([
    "BACKLOG",
    "TODO",
    "IN_PROGRESS",
    "BLOCKED",
    "REVIEW"
  ]);
  const open = tasks.filter((task) => openStatuses.has(task.status)).length;
  const done = tasks.filter((task) => task.status === "DONE").length;
  const blocked = tasks.filter((task) => task.status === "BLOCKED").length;
  const late = tasks.filter((task) => {
    if (!task.dueDate) {
      return false;
    }
    if (task.status === "DONE" || task.status === "CANCELLED") {
      return false;
    }
    return task.dueDate.getTime() < Date.now();
  }).length;
  const activePool = tasks.filter((task) => task.status !== "CANCELLED").length;
  const progress = activePool > 0 ? Math.round((done / activePool) * 100) : 0;
  const estimatedHours = tasks.reduce((sum, task) => sum + (task.estimatedHours ?? 0), 0);
  const loggedHours = tasks.reduce((sum, task) => sum + task.loggedHours, 0);

  return {
    open,
    done,
    blocked,
    late,
    progress,
    estimatedHours: Number(estimatedHours.toFixed(1)),
    loggedHours: Number(loggedHours.toFixed(1))
  };
};

const applyClosedStatusRule = (params: {
  where: Prisma.ProjectWhereInput;
  includeClosed?: boolean;
  explicitStatuses?: ProjectStatus[];
}) => {
  if (params.explicitStatuses?.length) {
    params.where.status = {
      in: params.explicitStatuses
    };
    return;
  }

  if (params.includeClosed) {
    return;
  }

  params.where.status = {
    notIn: ["COMPLETED", "CLOSED", "CANCELLED"]
  };
};

const ensureUsersExist = async (params: {
  prisma: PrismaClient;
  ids: string[];
}) => {
  if (!params.ids.length) {
    return;
  }

  const users = await params.prisma.user.findMany({
    where: {
      id: {
        in: params.ids
      }
    },
    select: {
      id: true
    }
  });

  if (users.length !== params.ids.length) {
    throw new AppError(400, "INVALID_USER", "Um ou mais usuarios informados nao existem");
  }
};

const ensureCustomerExists = async (params: {
  prisma: PrismaClient;
  customerId?: string | null;
}) => {
  if (!params.customerId) {
    return;
  }

  const exists = await params.prisma.customer.findUnique({
    where: {
      id: params.customerId
    },
    select: {
      id: true
    }
  });

  if (!exists) {
    throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente nao encontrado");
  }
};

const ensureServiceOrderExists = async (params: {
  prisma: PrismaClient;
  serviceOrderId?: string | null;
}) => {
  if (!params.serviceOrderId) {
    return;
  }

  const exists = await params.prisma.serviceOrder.findUnique({
    where: {
      id: params.serviceOrderId
    },
    select: {
      id: true
    }
  });

  if (!exists) {
    throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
  }
};

const ensureDeskTicketExists = async (params: {
  prisma: PrismaClient;
  deskTicketId?: string | null;
}) => {
  if (!params.deskTicketId) {
    return;
  }

  const exists = await params.prisma.deskTicket.findUnique({
    where: {
      id: params.deskTicketId
    },
    select: {
      id: true
    }
  });

  if (!exists) {
    throw new AppError(404, "DESK_TICKET_NOT_FOUND", "Ticket nao encontrado");
  }
};

export const projectRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/options", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");

    const [customers, owners, collaborators, serviceOrders, deskTickets] = await Promise.all([
      fastify.prisma.customer.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
      fastify.prisma.user.findMany({
        where: {
          role: {
            in: [RoleCode.SUPERADMIN, RoleCode.ADMIN, RoleCode.SUPERVISOR]
          }
        },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" }
      }),
      fastify.prisma.user.findMany({
        where: {
          role: {
            in: [RoleCode.SUPERADMIN, RoleCode.ADMIN, RoleCode.SUPERVISOR, RoleCode.TECNICO]
          }
        },
        select: { id: true, name: true, role: true, team: true },
        orderBy: { name: "asc" }
      }),
      fastify.prisma.serviceOrder.findMany({
        where: {
          status: {
            in: ["OPEN", "SCHEDULED", "DISPATCHED", "IN_PROGRESS", "ON_HOLD"]
          }
        },
        orderBy: [{ createdAt: "desc" }],
        take: 250,
        select: {
          id: true,
          code: true,
          title: true,
          status: true
        }
      }),
      fastify.prisma.deskTicket.findMany({
        where: {
          status: {
            in: ["OPEN", "TRIAGE", "IN_PROGRESS", "ON_HOLD"]
          }
        },
        orderBy: [{ createdAt: "desc" }],
        take: 250,
        select: {
          id: true,
          code: true,
          title: true,
          status: true
        }
      })
    ]);

    return sendSuccess(reply, {
      statuses: projectStatuses,
      priorities: projectPriorities,
      taskStatuses: projectTaskStatuses,
      taskPriorities: projectTaskPriorities,
      customers,
      owners,
      collaborators,
      serviceOrders,
      deskTickets
    });
  });

  fastify.get("/summary", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const visibility = getProjectVisibilityWhere({
      role: user.role,
      userId: user.id
    });

    const openProjectStatuses: ProjectStatus[] = ["PLANNING", "ACTIVE", "ON_HOLD"];

    const [total, active, onHold, completed, closed, overdue, taskByStatus, taskHours] =
      await Promise.all([
        fastify.prisma.project.count({
          where: visibility
        }),
        fastify.prisma.project.count({
          where: {
            ...visibility,
            status: {
              in: ["PLANNING", "ACTIVE"]
            }
          }
        }),
        fastify.prisma.project.count({
          where: {
            ...visibility,
            status: "ON_HOLD"
          }
        }),
        fastify.prisma.project.count({
          where: {
            ...visibility,
            status: "COMPLETED"
          }
        }),
        fastify.prisma.project.count({
          where: {
            ...visibility,
            status: {
              in: ["CLOSED", "CANCELLED"]
            }
          }
        }),
        fastify.prisma.project.count({
          where: {
            ...visibility,
            dueDate: { lt: new Date() },
            status: {
              in: openProjectStatuses
            }
          }
        }),
        fastify.prisma.projectTask.groupBy({
          by: ["status"],
          where: {
            project: visibility
          },
          _count: {
            _all: true
          }
        }),
        fastify.prisma.projectTask.aggregate({
          where: {
            project: visibility
          },
          _sum: {
            estimatedHours: true,
            loggedHours: true
          }
        })
      ]);

    const taskStatusMap = taskByStatus.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {});

    return sendSuccess(reply, {
      total,
      active,
      onHold,
      completed,
      closed,
      overdue,
      tasks: {
        total: taskByStatus.reduce((sum, row) => sum + row._count._all, 0),
        done: taskStatusMap.DONE ?? 0,
        inProgress: taskStatusMap.IN_PROGRESS ?? 0,
        blocked: taskStatusMap.BLOCKED ?? 0
      },
      hours: {
        estimated: Number((taskHours._sum.estimatedHours ?? 0).toFixed(1)),
        logged: Number((taskHours._sum.loggedHours ?? 0).toFixed(1))
      }
    });
  });

  fastify.get("/", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const query = ProjectListQuerySchema.parse(request.query);

    const statusFilter = parseStatusFilter<ProjectStatus>(query.status, projectStatuses);
    const visibility = getProjectVisibilityWhere({
      role: user.role,
      userId: user.id
    });

    const where: Prisma.ProjectWhereInput = {
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
              { customer: { name: { contains: query.search, mode: "insensitive" } } }
            ]
          }
        : {})
    };

    const andClauses: Prisma.ProjectWhereInput[] = [visibility];
    if (query.onlyMine) {
      andClauses.push({
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } },
          { tasks: { some: { assignedToId: user.id } } }
        ]
      });
    }
    where.AND = andClauses;

    applyClosedStatusRule({
      where,
      includeClosed: query.includeClosed,
      explicitStatuses: statusFilter
    });

    const projects = await fastify.prisma.project.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      include: {
        customer: {
          select: { id: true, name: true }
        },
        owner: {
          select: { id: true, name: true, role: true }
        },
        members: {
          select: {
            userId: true
          }
        },
        tasks: {
          select: {
            status: true,
            dueDate: true,
            estimatedHours: true,
            loggedHours: true
          }
        }
      }
    });

    return sendSuccess(
      reply,
      projects.map((project) => {
        const metrics = toProjectMetrics(project.tasks);

        return {
          id: project.id,
          code: project.code,
          name: project.name,
          description: project.description,
          status: project.status,
          priority: project.priority,
          startDate: project.startDate,
          dueDate: project.dueDate,
          closedAt: project.closedAt,
          budgetAmount: project.budgetAmount ?? 0,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          customer: project.customer,
          owner: project.owner,
          membersCount: project.members.length,
          tasksCount: project.tasks.length,
          metrics
        };
      })
    );
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);

    const project = await fastify.prisma.project.findUnique({
      where: {
        id: request.params.id
      },
      include: {
        customer: {
          select: { id: true, name: true }
        },
        owner: {
          select: { id: true, name: true, role: true }
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, role: true, team: true, email: true }
            }
          }
        },
        tasks: {
          orderBy: [{ createdAt: "desc" }],
          include: {
            assignedTo: {
              select: { id: true, name: true, role: true, team: true }
            },
            createdBy: {
              select: { id: true, name: true, role: true }
            },
            linkedServiceOrder: {
              select: { id: true, code: true, title: true, status: true }
            },
            linkedDeskTicket: {
              select: { id: true, code: true, title: true, status: true }
            }
          }
        }
      }
    });

    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Projeto nao encontrado");
    }

    if (!isManager(user.role)) {
      const visible =
        project.ownerId === user.id ||
        project.members.some((member) => member.userId === user.id) ||
        project.tasks.some((task) => task.assignedToId === user.id || task.createdById === user.id);

      if (!visible) {
        throw new AppError(403, "FORBIDDEN", "Sem permissao para acessar este projeto");
      }
    }

    const metrics = toProjectMetrics(project.tasks);

    return sendSuccess(reply, {
      ...project,
      metrics
    });
  });

  fastify.post("/", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);

    if (!isManager(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem criar projetos");
    }

    const input = ProjectCreateSchema.parse(request.body);
    await ensureCustomerExists({
      prisma: fastify.prisma,
      customerId: input.customerId
    });

    const ownerId = input.ownerId ?? user.id;
    await ensureUsersExist({
      prisma: fastify.prisma,
      ids: [ownerId]
    });

    const uniqueMemberIds = [...new Set([ownerId, ...(input.memberIds ?? [])])];
    if (uniqueMemberIds.length) {
      await ensureUsersExist({
        prisma: fastify.prisma,
        ids: uniqueMemberIds
      });
    }

    const status = input.status as ProjectStatus;
    const closedAt =
      status === "COMPLETED" || status === "CLOSED" || status === "CANCELLED"
        ? new Date()
        : null;

    const created = await fastify.prisma.project.create({
      data: {
        code: generateProjectCode(),
        name: input.name,
        description: input.description,
        status,
        priority: input.priority as ProjectPriority,
        customerId: input.customerId,
        ownerId,
        startDate: input.startDate,
        dueDate: input.dueDate,
        budgetAmount: input.budgetAmount ?? 0,
        closedAt,
        members: uniqueMemberIds.length
          ? {
              createMany: {
                data: uniqueMemberIds.map((memberId) => ({
                  userId: memberId,
                  role: memberId === ownerId ? "OWNER" : "MEMBER",
                  isWatcher: memberId === ownerId
                })),
                skipDuplicates: true
              }
            }
          : undefined
      },
      include: {
        customer: {
          select: { id: true, name: true }
        },
        owner: {
          select: { id: true, name: true, role: true }
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, role: true, team: true, email: true }
            }
          }
        }
      }
    });

    return sendSuccess(reply, created);
  });

  fastify.patch<{ Params: { id: string } }>("/:id", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);

    if (!isManager(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem editar projetos");
    }

    const input = ProjectUpdateSchema.parse(request.body);

    const current = await fastify.prisma.project.findUnique({
      where: {
        id: request.params.id
      },
      select: {
        id: true,
        status: true
      }
    });

    if (!current) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Projeto nao encontrado");
    }

    await ensureCustomerExists({
      prisma: fastify.prisma,
      customerId: input.customerId ?? undefined
    });

    if (input.ownerId) {
      await ensureUsersExist({
        prisma: fastify.prisma,
        ids: [input.ownerId]
      });
    }

    const nextStatus = (input.status as ProjectStatus | undefined) ?? current.status;
    const shouldClose =
      nextStatus === "COMPLETED" || nextStatus === "CLOSED" || nextStatus === "CANCELLED";

    const updated = await fastify.prisma.project.update({
      where: {
        id: current.id
      },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status as ProjectStatus } : {}),
        ...(input.priority !== undefined ? { priority: input.priority as ProjectPriority } : {}),
        ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        ...(input.budgetAmount !== undefined ? { budgetAmount: input.budgetAmount } : {}),
        closedAt: shouldClose ? new Date() : null
      },
      include: {
        customer: {
          select: { id: true, name: true }
        },
        owner: {
          select: { id: true, name: true, role: true }
        }
      }
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/:id/tasks", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const input = ProjectTaskCreateSchema.parse(request.body);

    const project = await fastify.prisma.project.findUnique({
      where: {
        id: request.params.id
      },
      include: {
        members: {
          select: {
            userId: true
          }
        }
      }
    });

    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Projeto nao encontrado");
    }

    const canAccess =
      isManager(user.role) ||
      project.ownerId === user.id ||
      project.members.some((member) => member.userId === user.id);

    if (!canAccess) {
      throw new AppError(403, "FORBIDDEN", "Sem permissao para criar tarefa neste projeto");
    }

    if (input.assignedToId) {
      await ensureUsersExist({
        prisma: fastify.prisma,
        ids: [input.assignedToId]
      });
    }

    await ensureServiceOrderExists({
      prisma: fastify.prisma,
      serviceOrderId: input.linkedServiceOrderId
    });
    await ensureDeskTicketExists({
      prisma: fastify.prisma,
      deskTicketId: input.linkedDeskTicketId
    });

    const status = input.status as ProjectTaskStatus;
    const startedAt = status === "IN_PROGRESS" ? new Date() : null;
    const completedAt = status === "DONE" ? new Date() : null;

    const created = await fastify.prisma.projectTask.create({
      data: {
        projectId: project.id,
        title: input.title,
        description: input.description,
        status,
        priority: input.priority as ProjectTaskPriority,
        assignedToId: input.assignedToId,
        createdById: user.id,
        linkedServiceOrderId: input.linkedServiceOrderId,
        linkedDeskTicketId: input.linkedDeskTicketId,
        dueDate: input.dueDate,
        estimatedHours: input.estimatedHours,
        loggedHours: input.loggedHours ?? 0,
        startedAt,
        completedAt
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, role: true, team: true }
        },
        createdBy: {
          select: { id: true, name: true, role: true }
        },
        linkedServiceOrder: {
          select: { id: true, code: true, title: true, status: true }
        },
        linkedDeskTicket: {
          select: { id: true, code: true, title: true, status: true }
        }
      }
    });

    return sendSuccess(reply, created);
  });

  fastify.patch<{ Params: { id: string; taskId: string } }>("/:id/tasks/:taskId", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const input = ProjectTaskUpdateSchema.parse(request.body);

    const [project, task] = await Promise.all([
      fastify.prisma.project.findUnique({
        where: {
          id: request.params.id
        },
        include: {
          members: {
            select: { userId: true }
          }
        }
      }),
      fastify.prisma.projectTask.findUnique({
        where: {
          id: request.params.taskId
        }
      })
    ]);

    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Projeto nao encontrado");
    }

    if (!task || task.projectId !== project.id) {
      throw new AppError(404, "PROJECT_TASK_NOT_FOUND", "Tarefa nao encontrada neste projeto");
    }

    const projectAccess =
      isManager(user.role) ||
      project.ownerId === user.id ||
      project.members.some((member) => member.userId === user.id);

    const taskOwnerAccess = task.assignedToId === user.id || task.createdById === user.id;

    if (!projectAccess && !taskOwnerAccess) {
      throw new AppError(403, "FORBIDDEN", "Sem permissao para atualizar esta tarefa");
    }

    if (!isManager(user.role) && input.assignedToId !== undefined && input.assignedToId !== task.assignedToId) {
      throw new AppError(403, "FORBIDDEN", "Somente gestores podem reatribuir tarefa");
    }

    if (input.assignedToId) {
      await ensureUsersExist({
        prisma: fastify.prisma,
        ids: [input.assignedToId]
      });
    }

    await ensureServiceOrderExists({
      prisma: fastify.prisma,
      serviceOrderId: input.linkedServiceOrderId ?? undefined
    });
    await ensureDeskTicketExists({
      prisma: fastify.prisma,
      deskTicketId: input.linkedDeskTicketId ?? undefined
    });

    const nextStatus = (input.status as ProjectTaskStatus | undefined) ?? task.status;
    const statusPatch: Prisma.ProjectTaskUncheckedUpdateInput = {};

    if (nextStatus === "IN_PROGRESS" && !task.startedAt) {
      statusPatch.startedAt = new Date();
      statusPatch.completedAt = null;
    } else if (nextStatus === "DONE") {
      statusPatch.completedAt = new Date();
      statusPatch.startedAt = task.startedAt ?? new Date();
    } else if (nextStatus === "CANCELLED") {
      statusPatch.completedAt = new Date();
    } else {
      statusPatch.completedAt = null;
    }

    const updated = await fastify.prisma.projectTask.update({
      where: {
        id: task.id
      },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status as ProjectTaskStatus } : {}),
        ...(input.priority !== undefined ? { priority: input.priority as ProjectTaskPriority } : {}),
        ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        ...(input.estimatedHours !== undefined ? { estimatedHours: input.estimatedHours } : {}),
        ...(input.loggedHours !== undefined ? { loggedHours: input.loggedHours } : {}),
        ...(input.linkedServiceOrderId !== undefined
          ? { linkedServiceOrderId: input.linkedServiceOrderId }
          : {}),
        ...(input.linkedDeskTicketId !== undefined
          ? { linkedDeskTicketId: input.linkedDeskTicketId }
          : {}),
        ...statusPatch
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, role: true, team: true }
        },
        createdBy: {
          select: { id: true, name: true, role: true }
        },
        linkedServiceOrder: {
          select: { id: true, code: true, title: true, status: true }
        },
        linkedDeskTicket: {
          select: { id: true, code: true, title: true, status: true }
        }
      }
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/:id/members", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);

    if (!isManager(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem adicionar membros");
    }

    const input = ProjectMemberAddSchema.parse(request.body);

    await ensureUsersExist({
      prisma: fastify.prisma,
      ids: [input.userId]
    });

    const project = await fastify.prisma.project.findUnique({
      where: {
        id: request.params.id
      },
      select: {
        id: true
      }
    });

    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Projeto nao encontrado");
    }

    const member = await fastify.prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: project.id,
          userId: input.userId
        }
      },
      update: {
        role: input.role ?? "MEMBER",
        isWatcher: input.isWatcher ?? false
      },
      create: {
        projectId: project.id,
        userId: input.userId,
        role: input.role ?? "MEMBER",
        isWatcher: input.isWatcher ?? false
      },
      include: {
        user: {
          select: { id: true, name: true, role: true, team: true, email: true }
        }
      }
    });

    return sendSuccess(reply, member);
  });
};
