import type { FastifyPluginAsync } from "fastify";
import {
  CrmActivityType,
  CrmLeadPriority,
  CrmLeadStatus,
  Prisma,
  RoleCode
} from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../lib/app-error.js";
import { getRequestUser, sendSuccess } from "../../lib/envelope.js";
import { requirePermission } from "../../lib/authz.js";

const managerRoles = new Set(["SUPERADMIN", "ADMIN", "SUPERVISOR"]);
const isManager = (role: string) => managerRoles.has(role);

const leadStatuses = [
  "NEW",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "ON_HOLD",
  "WON",
  "LOST"
] as const;

const leadPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const activityTypes = ["CALL", "EMAIL", "MEETING", "WHATSAPP", "NOTE", "TASK"] as const;
const openLeadStatuses: CrmLeadStatus[] = [
  "NEW",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "ON_HOLD"
];

const CrmLeadListQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  priority: z.enum(leadPriorities).optional(),
  ownerId: z.string().optional(),
  customerId: z.string().optional(),
  includeClosed: z.coerce.boolean().optional(),
  onlyMine: z.coerce.boolean().optional()
});

const CrmLeadCreateSchema = z.object({
  name: z.string().min(2),
  company: z.string().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  source: z.string().max(120).optional(),
  status: z.enum(leadStatuses).default("NEW"),
  priority: z.enum(leadPriorities).default("MEDIUM"),
  estimatedValue: z.number().min(0).optional(),
  expectedCloseAt: z.coerce.date().optional(),
  ownerId: z.string().optional(),
  customerId: z.string().optional(),
  projectId: z.string().optional(),
  linkedQuoteId: z.string().optional(),
  linkedDeskTicketId: z.string().optional(),
  notes: z.string().max(5000).optional()
});

const CrmLeadUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  company: z.string().max(200).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  source: z.string().max(120).nullable().optional(),
  status: z.enum(leadStatuses).optional(),
  priority: z.enum(leadPriorities).optional(),
  estimatedValue: z.number().min(0).nullable().optional(),
  expectedCloseAt: z.coerce.date().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  customerId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  linkedQuoteId: z.string().nullable().optional(),
  linkedDeskTicketId: z.string().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  lostReason: z.string().max(2000).nullable().optional()
});

const CrmLeadActivityCreateSchema = z.object({
  type: z.enum(activityTypes).default("NOTE"),
  subject: z.string().max(200).optional(),
  note: z.string().max(4000).optional(),
  dueAt: z.coerce.date().optional(),
  done: z.boolean().optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
});

const parseStatusFilter = (raw?: string) => {
  if (!raw) {
    return undefined;
  }

  const values = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is (typeof leadStatuses)[number] =>
      leadStatuses.includes(value as (typeof leadStatuses)[number])
    );

  return values.length ? (values as CrmLeadStatus[]) : undefined;
};

const generateLeadCode = () => {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `CRM-${date}-${random}`;
};

const getLeadVisibilityWhere = (params: {
  role: string;
  userId: string;
}): Prisma.CrmLeadWhereInput => {
  if (isManager(params.role)) {
    return {};
  }

  return {
    OR: [{ ownerId: params.userId }, { activities: { some: { actorId: params.userId } } }]
  };
};

const ensureUserExists = async (prisma: PrismaClient, userId?: string | null) => {
  if (!userId) {
    return;
  }

  const exists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true }
  });

  if (!exists) {
    throw new AppError(404, "USER_NOT_FOUND", "Responsavel nao encontrado");
  }
};

const ensureCustomerExists = async (prisma: PrismaClient, customerId?: string | null) => {
  if (!customerId) {
    return;
  }

  const exists = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true }
  });

  if (!exists) {
    throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente nao encontrado");
  }
};

const ensureProjectExists = async (prisma: PrismaClient, projectId?: string | null) => {
  if (!projectId) {
    return;
  }

  const exists = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true }
  });

  if (!exists) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Projeto nao encontrado");
  }
};

const ensureQuoteExists = async (prisma: PrismaClient, quoteId?: string | null) => {
  if (!quoteId) {
    return;
  }

  const exists = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { id: true }
  });

  if (!exists) {
    throw new AppError(404, "QUOTE_NOT_FOUND", "Orcamento nao encontrado");
  }
};

const ensureDeskTicketExists = async (prisma: PrismaClient, deskTicketId?: string | null) => {
  if (!deskTicketId) {
    return;
  }

  const exists = await prisma.deskTicket.findUnique({
    where: { id: deskTicketId },
    select: { id: true }
  });

  if (!exists) {
    throw new AppError(404, "DESK_TICKET_NOT_FOUND", "Ticket nao encontrado");
  }
};

const canAccessLead = (params: {
  role: string;
  userId: string;
  lead: {
    ownerId: string | null;
    activities: Array<{ actorId: string | null }>;
  };
}) => {
  if (isManager(params.role)) {
    return true;
  }

  if (params.lead.ownerId === params.userId) {
    return true;
  }

  return params.lead.activities.some((activity) => activity.actorId === params.userId);
};

const leadListInclude = {
  owner: {
    select: { id: true, name: true, role: true, team: true }
  },
  customer: {
    select: { id: true, name: true }
  },
  project: {
    select: { id: true, code: true, name: true, status: true }
  },
  linkedQuote: {
    select: { id: true, code: true, status: true, total: true }
  },
  linkedDeskTicket: {
    select: { id: true, code: true, title: true, status: true, priority: true }
  },
  _count: {
    select: {
      activities: true
    }
  }
} satisfies Prisma.CrmLeadInclude;

const leadDetailInclude = {
  ...leadListInclude,
  activities: {
    orderBy: [{ createdAt: "desc" }],
    include: {
      actor: {
        select: { id: true, name: true, role: true }
      }
    }
  }
} satisfies Prisma.CrmLeadInclude;

export const crmRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/options", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");

    const [owners, customers, projects, quotes, deskTickets] = await Promise.all([
      fastify.prisma.user.findMany({
        where: {
          role: {
            in: [RoleCode.SUPERADMIN, RoleCode.ADMIN, RoleCode.SUPERVISOR, RoleCode.TECNICO]
          }
        },
        select: { id: true, name: true, role: true, team: true },
        orderBy: { name: "asc" }
      }),
      fastify.prisma.customer.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
      fastify.prisma.project.findMany({
        where: {
          status: {
            in: ["PLANNING", "ACTIVE", "ON_HOLD"]
          }
        },
        select: { id: true, code: true, name: true, status: true },
        orderBy: [{ updatedAt: "desc" }],
        take: 200
      }),
      fastify.prisma.quote.findMany({
        where: {
          status: {
            in: ["DRAFT", "SENT", "APPROVED"]
          }
        },
        select: { id: true, code: true, status: true, total: true },
        orderBy: [{ createdAt: "desc" }],
        take: 300
      }),
      fastify.prisma.deskTicket.findMany({
        where: {
          status: {
            in: ["OPEN", "TRIAGE", "IN_PROGRESS", "ON_HOLD"]
          }
        },
        select: { id: true, code: true, title: true, status: true },
        orderBy: [{ createdAt: "desc" }],
        take: 300
      })
    ]);

    return sendSuccess(reply, {
      statuses: leadStatuses,
      priorities: leadPriorities,
      activityTypes,
      owners,
      customers,
      projects,
      quotes,
      deskTickets
    });
  });

  fastify.get("/summary", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const visibility = getLeadVisibilityWhere({ role: user.role, userId: user.id });

    const [total, byStatus, valueAgg, overdue, activitiesToday] = await Promise.all([
      fastify.prisma.crmLead.count({ where: visibility }),
      fastify.prisma.crmLead.groupBy({
        by: ["status"],
        where: visibility,
        _count: { _all: true }
      }),
      fastify.prisma.crmLead.aggregate({
        where: visibility,
        _sum: { estimatedValue: true }
      }),
      fastify.prisma.crmLead.count({
        where: {
          ...visibility,
          expectedCloseAt: { lt: new Date() },
          status: {
            in: openLeadStatuses
          }
        }
      }),
      fastify.prisma.crmLeadActivity.count({
        where: {
          lead: visibility,
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      })
    ]);

    const statusMap = byStatus.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {});

    return sendSuccess(reply, {
      total,
      open:
        (statusMap.NEW ?? 0) +
        (statusMap.QUALIFIED ?? 0) +
        (statusMap.PROPOSAL ?? 0) +
        (statusMap.NEGOTIATION ?? 0) +
        (statusMap.ON_HOLD ?? 0),
      won: statusMap.WON ?? 0,
      lost: statusMap.LOST ?? 0,
      overdue,
      activitiesToday,
      estimatedValue: Number((valueAgg._sum.estimatedValue ?? 0).toFixed(2)),
      byStatus: {
        new: statusMap.NEW ?? 0,
        qualified: statusMap.QUALIFIED ?? 0,
        proposal: statusMap.PROPOSAL ?? 0,
        negotiation: statusMap.NEGOTIATION ?? 0,
        onHold: statusMap.ON_HOLD ?? 0,
        won: statusMap.WON ?? 0,
        lost: statusMap.LOST ?? 0
      }
    });
  });

  fastify.get("/", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const query = CrmLeadListQuerySchema.parse(request.query);
    const statusFilter = parseStatusFilter(query.status);
    const visibility = getLeadVisibilityWhere({ role: user.role, userId: user.id });

    const where: Prisma.CrmLeadWhereInput = {
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } },
              { company: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } }
            ]
          }
        : {}),
      ...(query.priority ? { priority: query.priority as CrmLeadPriority } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {})
    };

    const andClauses: Prisma.CrmLeadWhereInput[] = [visibility];

    if (statusFilter?.length) {
      andClauses.push({
        status: {
          in: statusFilter
        }
      });
    } else if (!query.includeClosed) {
      andClauses.push({
        status: {
          in: openLeadStatuses
        }
      });
    }

    if (query.onlyMine) {
      andClauses.push({
        ownerId: user.id
      });
    }

    where.AND = andClauses;

    const leads = await fastify.prisma.crmLead.findMany({
      where,
      orderBy: [{ status: "asc" }, { expectedCloseAt: "asc" }, { updatedAt: "desc" }],
      include: leadListInclude
    });

    return sendSuccess(
      reply,
      leads.map((lead) => ({
        ...lead,
        daysOpen:
          lead.status === "WON" || lead.status === "LOST"
            ? null
            : Math.floor((Date.now() - lead.createdAt.getTime()) / 86_400_000)
      }))
    );
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);

    const lead = await fastify.prisma.crmLead.findUnique({
      where: { id: request.params.id },
      include: leadDetailInclude
    });

    if (!lead) {
      throw new AppError(404, "CRM_LEAD_NOT_FOUND", "Lead nao encontrado");
    }

    if (!canAccessLead({ role: user.role, userId: user.id, lead })) {
      throw new AppError(403, "FORBIDDEN", "Sem permissao para acessar este lead");
    }

    return sendSuccess(reply, lead);
  });

  fastify.post("/", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const input = CrmLeadCreateSchema.parse(request.body);

    if (!isManager(user.role) && input.ownerId && input.ownerId !== user.id) {
      throw new AppError(403, "FORBIDDEN", "Sem permissao para criar lead para outro responsavel");
    }

    const ownerId = input.ownerId ?? user.id;
    await Promise.all([
      ensureUserExists(fastify.prisma, ownerId),
      ensureCustomerExists(fastify.prisma, input.customerId),
      ensureProjectExists(fastify.prisma, input.projectId),
      ensureQuoteExists(fastify.prisma, input.linkedQuoteId),
      ensureDeskTicketExists(fastify.prisma, input.linkedDeskTicketId)
    ]);

    const status = input.status as CrmLeadStatus;

    const created = await fastify.prisma.$transaction(async (tx) => {
      const lead = await tx.crmLead.create({
        data: {
          code: generateLeadCode(),
          name: input.name,
          company: input.company,
          email: input.email,
          phone: input.phone,
          source: input.source,
          status,
          priority: input.priority as CrmLeadPriority,
          estimatedValue: input.estimatedValue ?? 0,
          expectedCloseAt: input.expectedCloseAt,
          ownerId,
          customerId: input.customerId,
          projectId: input.projectId,
          linkedQuoteId: input.linkedQuoteId,
          linkedDeskTicketId: input.linkedDeskTicketId,
          notes: input.notes,
          wonAt: status === "WON" ? new Date() : null,
          lostAt: status === "LOST" ? new Date() : null
        },
        include: leadDetailInclude
      });

      await tx.crmLeadActivity.create({
        data: {
          leadId: lead.id,
          actorId: user.id,
          type: CrmActivityType.NOTE,
          subject: "Lead criado",
          note: "Lead criado no CRM"
        }
      });

      return tx.crmLead.findUniqueOrThrow({
        where: { id: lead.id },
        include: leadDetailInclude
      });
    });

    return sendSuccess(reply, created);
  });

  fastify.patch<{ Params: { id: string } }>("/:id", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const input = CrmLeadUpdateSchema.parse(request.body);

    const current = await fastify.prisma.crmLead.findUnique({
      where: { id: request.params.id },
      include: {
        activities: {
          select: { actorId: true }
        }
      }
    });

    if (!current) {
      throw new AppError(404, "CRM_LEAD_NOT_FOUND", "Lead nao encontrado");
    }

    if (!canAccessLead({ role: user.role, userId: user.id, lead: current })) {
      throw new AppError(403, "FORBIDDEN", "Sem permissao para editar este lead");
    }

    if (!isManager(user.role)) {
      const forbiddenFieldsChanged =
        input.name !== undefined ||
        input.company !== undefined ||
        input.email !== undefined ||
        input.phone !== undefined ||
        input.source !== undefined ||
        input.priority !== undefined ||
        input.ownerId !== undefined ||
        input.customerId !== undefined ||
        input.projectId !== undefined ||
        input.linkedQuoteId !== undefined ||
        input.linkedDeskTicketId !== undefined ||
        input.estimatedValue !== undefined;

      if (forbiddenFieldsChanged) {
        throw new AppError(403, "FORBIDDEN", "Somente gestores podem alterar dados estruturais do lead");
      }
    }

    if (input.ownerId && !isManager(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Somente gestores podem reatribuir lead");
    }

    await Promise.all([
      ensureUserExists(fastify.prisma, input.ownerId ?? undefined),
      ensureCustomerExists(fastify.prisma, input.customerId ?? undefined),
      ensureProjectExists(fastify.prisma, input.projectId ?? undefined),
      ensureQuoteExists(fastify.prisma, input.linkedQuoteId ?? undefined),
      ensureDeskTicketExists(fastify.prisma, input.linkedDeskTicketId ?? undefined)
    ]);

    const nextStatus = (input.status as CrmLeadStatus | undefined) ?? current.status;
    const wonAt = nextStatus === "WON" ? current.wonAt ?? new Date() : null;
    const lostAt = nextStatus === "LOST" ? current.lostAt ?? new Date() : null;

    const updated = await fastify.prisma.$transaction(async (tx) => {
      const lead = await tx.crmLead.update({
        where: { id: current.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.company !== undefined ? { company: input.company } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.source !== undefined ? { source: input.source } : {}),
          ...(input.status !== undefined ? { status: input.status as CrmLeadStatus } : {}),
          ...(input.priority !== undefined ? { priority: input.priority as CrmLeadPriority } : {}),
          ...(input.estimatedValue !== undefined ? { estimatedValue: input.estimatedValue } : {}),
          ...(input.expectedCloseAt !== undefined ? { expectedCloseAt: input.expectedCloseAt } : {}),
          ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
          ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
          ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
          ...(input.linkedQuoteId !== undefined ? { linkedQuoteId: input.linkedQuoteId } : {}),
          ...(input.linkedDeskTicketId !== undefined
            ? { linkedDeskTicketId: input.linkedDeskTicketId }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.lostReason !== undefined ? { lostReason: input.lostReason } : {}),
          wonAt,
          lostAt
        },
        include: leadDetailInclude
      });

      if (input.status && input.status !== current.status) {
        await tx.crmLeadActivity.create({
          data: {
            leadId: current.id,
            actorId: user.id,
            type: CrmActivityType.NOTE,
            subject: "Status alterado",
            note: `Status alterado de ${current.status} para ${input.status}`
          }
        });
      }

      return lead;
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/:id/activities", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const input = CrmLeadActivityCreateSchema.parse(request.body);

    const lead = await fastify.prisma.crmLead.findUnique({
      where: { id: request.params.id },
      include: {
        activities: {
          select: { actorId: true }
        }
      }
    });

    if (!lead) {
      throw new AppError(404, "CRM_LEAD_NOT_FOUND", "Lead nao encontrado");
    }

    if (!canAccessLead({ role: user.role, userId: user.id, lead })) {
      throw new AppError(403, "FORBIDDEN", "Sem permissao para registrar atividade neste lead");
    }

    const activity = await fastify.prisma.crmLeadActivity.create({
      data: {
        leadId: lead.id,
        actorId: user.id,
        type: input.type as CrmActivityType,
        subject: input.subject,
        note: input.note,
        dueAt: input.dueAt,
        doneAt: input.done ? new Date() : null,
        metadata: input.metadata ?? undefined
      },
      include: {
        actor: {
          select: { id: true, name: true, role: true }
        }
      }
    });

    return sendSuccess(reply, activity);
  });

  fastify.post<{ Params: { id: string } }>("/:id/convert-to-customer", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);

    if (!isManager(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem converter lead em cliente");
    }

    const lead = await fastify.prisma.crmLead.findUnique({
      where: { id: request.params.id }
    });

    if (!lead) {
      throw new AppError(404, "CRM_LEAD_NOT_FOUND", "Lead nao encontrado");
    }

    const converted = await fastify.prisma.$transaction(async (tx) => {
      const customer =
        lead.customerId != null
          ? await tx.customer.findUnique({
              where: { id: lead.customerId }
            })
          : await tx.customer.create({
              data: {
                name: lead.company ?? lead.name,
                legalName: lead.company ?? lead.name,
                email: lead.email,
                phone: lead.phone,
                contactName: lead.name,
                status: "ACTIVE",
                notes: `Cliente convertido do lead ${lead.code}`
              }
            });

      if (!customer) {
        throw new AppError(500, "CRM_CUSTOMER_CONVERSION_FAILED", "Falha ao converter lead");
      }

      const updatedLead = await tx.crmLead.update({
        where: { id: lead.id },
        data: {
          customerId: customer.id,
          status: CrmLeadStatus.WON,
          wonAt: lead.wonAt ?? new Date()
        }
      });

      await tx.crmLeadActivity.create({
        data: {
          leadId: lead.id,
          actorId: user.id,
          type: CrmActivityType.NOTE,
          subject: "Lead convertido",
          note: `Lead convertido para cliente ${customer.name}`
        }
      });

      return {
        customer,
        lead: updatedLead
      };
    });

    return sendSuccess(reply, converted);
  });
};
