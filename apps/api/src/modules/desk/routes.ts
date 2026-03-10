import type { FastifyPluginAsync } from "fastify";
import {
  DeskTicketChannel,
  DeskTicketPriority,
  DeskTicketStatus,
  Prisma,
  ServiceOrderPriority,
  ServiceOrderStatus
} from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../lib/app-error.js";
import { getRequestUser, sendSuccess } from "../../lib/envelope.js";
import { requirePermission } from "../../lib/authz.js";

const deskTicketStatuses = [
  "OPEN",
  "TRIAGE",
  "IN_PROGRESS",
  "ON_HOLD",
  "RESOLVED",
  "CLOSED",
  "CANCELLED"
] as const;

const deskTicketPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const deskTicketChannels = ["PORTAL", "PHONE", "EMAIL", "WHATSAPP", "INTERNAL"] as const;

const serviceOrderPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const DeskTicketCreateSchema = z.object({
  title: z.string().min(3),
  description: z.string().max(5000).optional(),
  priority: z.enum(deskTicketPriorities).default("MEDIUM"),
  channel: z.enum(deskTicketChannels).default("INTERNAL"),
  customerId: z.string().optional(),
  siteLocationId: z.string().optional(),
  serviceOrderId: z.string().optional(),
  quoteId: z.string().optional(),
  assignedTechnicianId: z.string().optional(),
  dueAt: z.coerce.date().optional()
});

const DeskTicketUpdateSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().max(5000).nullable().optional(),
  priority: z.enum(deskTicketPriorities).optional(),
  channel: z.enum(deskTicketChannels).optional(),
  customerId: z.string().optional(),
  siteLocationId: z.string().nullable().optional(),
  serviceOrderId: z.string().nullable().optional(),
  quoteId: z.string().nullable().optional(),
  assignedTechnicianId: z.string().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  status: z.enum(deskTicketStatuses).optional()
});

const DeskTicketListQuerySchema = z.object({
  status: z.string().optional(),
  priority: z.enum(deskTicketPriorities).optional(),
  channel: z.enum(deskTicketChannels).optional(),
  customerId: z.string().optional(),
  technicianId: z.string().optional(),
  serviceOrderId: z.string().optional(),
  search: z.string().optional(),
  onlyOverdue: z.coerce.boolean().optional(),
  onlyUnassigned: z.coerce.boolean().optional()
});

const DeskTicketStatusSchema = z.object({
  status: z.enum(deskTicketStatuses),
  note: z.string().max(1000).optional()
});

const DeskTicketNoteSchema = z.object({
  note: z.string().min(1).max(2000)
});

const ConvertDeskTicketToServiceOrderSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().max(5000).optional(),
  priority: z.enum(serviceOrderPriorities).optional(),
  assignedTechnicianId: z.string().optional(),
  serviceDate: z.coerce.date().optional(),
  scheduledStartAt: z.coerce.date().optional(),
  scheduledEndAt: z.coerce.date().optional(),
  slaDueAt: z.coerce.date().optional()
});

const managerRoles = new Set(["SUPERADMIN", "ADMIN", "SUPERVISOR"]);
const isManager = (role: string) => managerRoles.has(role);

const parseDeskStatusFilter = (raw?: string) => {
  if (!raw) {
    return undefined;
  }

  const values = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is (typeof deskTicketStatuses)[number] =>
      deskTicketStatuses.includes(value as (typeof deskTicketStatuses)[number])
    );

  return values.length ? (values as DeskTicketStatus[]) : undefined;
};

const generateDeskTicketCode = () => {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `DSK-${date}-${random}`;
};

const generateServiceOrderCode = () => {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `SO-${date}-${random}`;
};

const buildDeskStatusPatch = (
  previousStatus: DeskTicketStatus,
  nextStatus?: DeskTicketStatus
): Prisma.DeskTicketUncheckedUpdateInput => {
  if (!nextStatus || nextStatus === previousStatus) {
    return {};
  }

  const now = new Date();
  const patch: Prisma.DeskTicketUncheckedUpdateInput = { status: nextStatus };

  if (nextStatus !== "OPEN") {
    patch.firstResponseAt = now;
  }

  if (nextStatus === "RESOLVED") {
    patch.resolvedAt = now;
    patch.closedAt = null;
  } else if (nextStatus === "CLOSED" || nextStatus === "CANCELLED") {
    patch.closedAt = now;
    patch.resolvedAt = patch.resolvedAt ?? now;
  } else {
    patch.closedAt = null;
  }

  return patch;
};

const ticketListInclude = {
  customer: {
    select: { id: true, name: true }
  },
  siteLocation: {
    select: { id: true, name: true, address: true, city: true, state: true }
  },
  serviceOrder: {
    select: { id: true, code: true, title: true, status: true }
  },
  quote: {
    select: { id: true, code: true, status: true, total: true }
  },
  assignedTechnician: {
    select: { id: true, name: true, email: true }
  },
  createdBy: {
    select: { id: true, name: true, role: true }
  }
} as const;

const ticketDetailInclude = {
  ...ticketListInclude,
  events: {
    orderBy: { createdAt: "desc" as const },
    include: {
      actor: {
        select: { id: true, name: true, role: true }
      }
    }
  },
  chatThreads: {
    orderBy: { createdAt: "asc" as const },
    include: {
      messages: {
        orderBy: { createdAt: "asc" as const },
        take: 300,
        include: {
          senderUser: {
            select: { id: true, name: true, role: true }
          },
          senderCustomer: {
            select: { id: true, name: true }
          }
        }
      }
    }
  }
} as const;

const assertDeskTicketAccess = (params: {
  role: string;
  userId: string;
  ticket: {
    assignedTechnicianId?: string | null;
    createdById?: string | null;
  };
}) => {
  if (isManager(params.role)) {
    return;
  }

  if (
    params.role === "TECNICO" &&
    (params.ticket.assignedTechnicianId === params.userId || params.ticket.createdById === params.userId)
  ) {
    return;
  }

  throw new AppError(403, "FORBIDDEN", "Sem permissao para acessar este ticket");
};

const createDeskTicketEvent = async (params: {
  prisma: any;
  deskTicketId: string;
  actorId?: string;
  type: string;
  note?: string;
  payload?: Prisma.InputJsonValue;
}) => {
  await params.prisma.deskTicketEvent.create({
    data: {
      deskTicketId: params.deskTicketId,
      actorId: params.actorId,
      type: params.type,
      note: params.note,
      payload: params.payload
    }
  });
};

const ensureDeskReferencesExist = async (params: {
  prisma: any;
  customerId?: string;
  siteLocationId?: string | null;
  serviceOrderId?: string | null;
  quoteId?: string | null;
  assignedTechnicianId?: string | null;
}) => {
  const [customer, siteLocation, serviceOrder, quote, technician] = await Promise.all([
    params.customerId
      ? params.prisma.customer.findUnique({
          where: { id: params.customerId },
          select: { id: true }
        })
      : Promise.resolve(null),
    params.siteLocationId
      ? params.prisma.siteLocation.findUnique({
          where: { id: params.siteLocationId },
          select: { id: true, customerId: true }
        })
      : Promise.resolve(null),
    params.serviceOrderId
      ? params.prisma.serviceOrder.findUnique({
          where: { id: params.serviceOrderId },
          select: {
            id: true,
            customerId: true,
            siteLocationId: true,
            assignedTechnicianId: true,
            title: true,
            description: true
          }
        })
      : Promise.resolve(null),
    params.quoteId
      ? params.prisma.quote.findUnique({
          where: { id: params.quoteId },
          select: {
            id: true,
            customerId: true,
            serviceOrderId: true
          }
        })
      : Promise.resolve(null),
    params.assignedTechnicianId
      ? params.prisma.user.findFirst({
          where: {
            id: params.assignedTechnicianId,
            role: "TECNICO"
          },
          select: { id: true }
        })
      : Promise.resolve(null)
  ]);

  if (params.customerId && !customer) {
    throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente nao encontrado");
  }

  if (params.siteLocationId && !siteLocation) {
    throw new AppError(404, "SITE_NOT_FOUND", "Unidade nao encontrada");
  }

  if (params.serviceOrderId && !serviceOrder) {
    throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
  }

  if (params.quoteId && !quote) {
    throw new AppError(404, "QUOTE_NOT_FOUND", "Orcamento nao encontrado");
  }

  if (params.assignedTechnicianId && !technician) {
    throw new AppError(400, "INVALID_TECHNICIAN", "Tecnico informado nao existe");
  }

  const derivedCustomerId =
    params.customerId ?? serviceOrder?.customerId ?? quote?.customerId ?? siteLocation?.customerId ?? null;
  const derivedSiteLocationId = params.siteLocationId ?? serviceOrder?.siteLocationId ?? null;
  const derivedTechnicianId = params.assignedTechnicianId ?? serviceOrder?.assignedTechnicianId ?? null;

  if (!derivedCustomerId) {
    throw new AppError(
      400,
      "CUSTOMER_REQUIRED",
      "Informe cliente ou vincule o ticket a OS/orcamento/unidade com cliente"
    );
  }

  if (siteLocation && siteLocation.customerId !== derivedCustomerId) {
    throw new AppError(
      400,
      "SITE_CUSTOMER_MISMATCH",
      "A unidade informada nao pertence ao cliente do ticket"
    );
  }

  return {
    customerId: derivedCustomerId,
    siteLocationId: derivedSiteLocationId,
    serviceOrder,
    quote,
    assignedTechnicianId: derivedTechnicianId
  };
};

export const deskRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/options", async (request, reply) => {
    await requirePermission(request, reply, "desk.manage");

    const [customers, sites, technicians, serviceOrders, quotes] = await Promise.all([
      fastify.prisma.customer.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
      fastify.prisma.siteLocation.findMany({
        select: {
          id: true,
          name: true,
          customerId: true
        },
        orderBy: { name: "asc" }
      }),
      fastify.prisma.user.findMany({
        where: { role: "TECNICO" },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" }
      }),
      fastify.prisma.serviceOrder.findMany({
        where: {
          status: {
            in: ["OPEN", "SCHEDULED", "DISPATCHED", "IN_PROGRESS", "ON_HOLD", "COMPLETED"]
          }
        },
        orderBy: [{ createdAt: "desc" }],
        take: 300,
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          customerId: true
        }
      }),
      fastify.prisma.quote.findMany({
        where: {
          status: {
            in: ["DRAFT", "SENT", "APPROVED"]
          }
        },
        orderBy: [{ createdAt: "desc" }],
        take: 300,
        select: {
          id: true,
          code: true,
          status: true,
          customerId: true
        }
      })
    ]);

    return sendSuccess(reply, {
      statuses: deskTicketStatuses,
      priorities: deskTicketPriorities,
      channels: deskTicketChannels,
      customers,
      sites,
      technicians,
      serviceOrders,
      quotes
    });
  });

  fastify.get("/", async (request, reply) => {
    await requirePermission(request, reply, "desk.manage");
    const user = getRequestUser(request);
    const query = DeskTicketListQuerySchema.parse(request.query);
    const statusFilter = parseDeskStatusFilter(query.status);

    const where: Prisma.DeskTicketWhereInput = {
      ...(query.priority ? { priority: query.priority as DeskTicketPriority } : {}),
      ...(query.channel ? { channel: query.channel as DeskTicketChannel } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.technicianId ? { assignedTechnicianId: query.technicianId } : {}),
      ...(query.serviceOrderId ? { serviceOrderId: query.serviceOrderId } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { title: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
              { customer: { name: { contains: query.search, mode: "insensitive" } } }
            ]
          }
        : {})
    };

    const andClauses: Prisma.DeskTicketWhereInput[] = [];
    if (statusFilter?.length) {
      andClauses.push({
        status: {
          in: statusFilter
        }
      });
    }

    if (query.onlyOverdue) {
      andClauses.push({
        dueAt: { lt: new Date() },
        status: {
          notIn: ["RESOLVED", "CLOSED", "CANCELLED"] as DeskTicketStatus[]
        }
      });
    }

    if (query.onlyUnassigned) {
      andClauses.push({
        assignedTechnicianId: null,
        status: {
          notIn: ["RESOLVED", "CLOSED", "CANCELLED"] as DeskTicketStatus[]
        }
      });
    }

    if (!isManager(user.role)) {
      andClauses.push({
        OR: [{ assignedTechnicianId: user.id }, { createdById: user.id }]
      });
    }

    if (andClauses.length) {
      where.AND = andClauses;
    }

    const tickets = await fastify.prisma.deskTicket.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: ticketListInclude
    });

    return sendSuccess(reply, tickets);
  });

  fastify.get("/summary", async (request, reply) => {
    await requirePermission(request, reply, "desk.manage");
    const user = getRequestUser(request);

    const where: Prisma.DeskTicketWhereInput = !isManager(user.role)
      ? {
          OR: [{ assignedTechnicianId: user.id }, { createdById: user.id }]
        }
      : {};

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const [total, byStatus, overdue, dueToday, unread, open, waiting, paused, unassigned] = await Promise.all([
      fastify.prisma.deskTicket.count({ where }),
      fastify.prisma.deskTicket.groupBy({
        by: ["status"],
        where,
        _count: {
          _all: true
        }
      }),
      fastify.prisma.deskTicket.count({
        where: {
          ...where,
          dueAt: { lt: now },
          status: {
            notIn: ["RESOLVED", "CLOSED", "CANCELLED"]
          }
        }
      }),
      fastify.prisma.deskTicket.count({
        where: {
          ...where,
          dueAt: {
            gte: todayStart,
            lte: todayEnd
          },
          status: {
            notIn: ["RESOLVED", "CLOSED", "CANCELLED"]
          }
        }
      }),
      fastify.prisma.deskTicket.count({
        where: {
          ...where,
          status: {
            in: ["OPEN", "TRIAGE", "IN_PROGRESS", "ON_HOLD"]
          },
          firstResponseAt: null
        }
      }),
      fastify.prisma.deskTicket.count({
        where: {
          ...where,
          status: {
            in: ["OPEN", "TRIAGE", "IN_PROGRESS", "ON_HOLD"]
          }
        }
      }),
      fastify.prisma.deskTicket.count({
        where: {
          ...where,
          status: "TRIAGE"
        }
      }),
      fastify.prisma.deskTicket.count({
        where: {
          ...where,
          status: "ON_HOLD"
        }
      }),
      fastify.prisma.deskTicket.count({
        where: {
          ...where,
          assignedTechnicianId: null,
          status: {
            notIn: ["RESOLVED", "CLOSED", "CANCELLED"]
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
      overdue,
      dueToday,
      unread,
      open,
      waiting,
      paused,
      unassigned,
      closingToday: dueToday,
      byStatus: {
        open: statusMap.OPEN ?? 0,
        triage: statusMap.TRIAGE ?? 0,
        inProgress: statusMap.IN_PROGRESS ?? 0,
        onHold: statusMap.ON_HOLD ?? 0,
        resolved: statusMap.RESOLVED ?? 0,
        closed: statusMap.CLOSED ?? 0,
        cancelled: statusMap.CANCELLED ?? 0
      }
    });
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    await requirePermission(request, reply, "desk.manage");
    const user = getRequestUser(request);

    const ticket = await fastify.prisma.deskTicket.findUnique({
      where: { id: request.params.id },
      include: ticketDetailInclude
    });

    if (!ticket) {
      throw new AppError(404, "DESK_TICKET_NOT_FOUND", "Ticket nao encontrado");
    }

    assertDeskTicketAccess({
      role: user.role,
      userId: user.id,
      ticket
    });

    return sendSuccess(reply, ticket);
  });

  fastify.post("/", async (request, reply) => {
    await requirePermission(request, reply, "desk.manage");
    const user = getRequestUser(request);
    const input = DeskTicketCreateSchema.parse(request.body);

    const references = await ensureDeskReferencesExist({
      prisma: fastify.prisma,
      customerId: input.customerId,
      siteLocationId: input.siteLocationId,
      serviceOrderId: input.serviceOrderId,
      quoteId: input.quoteId,
      assignedTechnicianId: input.assignedTechnicianId
    });

    const assignedTechnicianId =
      user.role === "TECNICO" ? user.id : input.assignedTechnicianId ?? references.assignedTechnicianId;

    if (user.role === "TECNICO" && input.assignedTechnicianId && input.assignedTechnicianId !== user.id) {
      throw new AppError(403, "FORBIDDEN", "Tecnico nao pode atribuir ticket para outro tecnico");
    }

    const ticket = await fastify.prisma.$transaction(async (tx) => {
      const created = await tx.deskTicket.create({
        data: {
          code: generateDeskTicketCode(),
          title: input.title,
          description: input.description,
          priority: input.priority as DeskTicketPriority,
          channel: input.channel as DeskTicketChannel,
          customerId: references.customerId,
          siteLocationId: references.siteLocationId,
          serviceOrderId: input.serviceOrderId,
          quoteId: input.quoteId,
          assignedTechnicianId,
          createdById: user.id,
          dueAt: input.dueAt
        },
        include: ticketDetailInclude
      });

      await createDeskTicketEvent({
        prisma: tx,
        deskTicketId: created.id,
        actorId: user.id,
        type: "DESK_TICKET_CREATED",
        payload: {
          channel: created.channel,
          priority: created.priority
        } as Prisma.InputJsonValue
      });

      if (created.serviceOrderId) {
        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: created.serviceOrderId,
            actorId: user.id,
            type: "DESK_TICKET_LINKED",
            payload: {
              deskTicketId: created.id,
              deskTicketCode: created.code
            }
          }
        });
      }

      return tx.deskTicket.findUniqueOrThrow({
        where: { id: created.id },
        include: ticketDetailInclude
      });
    });

    return sendSuccess(reply, ticket);
  });

  fastify.patch<{ Params: { id: string } }>("/:id", async (request, reply) => {
    await requirePermission(request, reply, "desk.manage");
    const user = getRequestUser(request);
    const input = DeskTicketUpdateSchema.parse(request.body);

    const current = await fastify.prisma.deskTicket.findUnique({
      where: { id: request.params.id }
    });

    if (!current) {
      throw new AppError(404, "DESK_TICKET_NOT_FOUND", "Ticket nao encontrado");
    }

    if (!isManager(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem editar o ticket");
    }

    const references = await ensureDeskReferencesExist({
      prisma: fastify.prisma,
      customerId: input.customerId ?? current.customerId,
      siteLocationId:
        input.siteLocationId !== undefined ? input.siteLocationId : current.siteLocationId,
      serviceOrderId:
        input.serviceOrderId !== undefined ? input.serviceOrderId : current.serviceOrderId,
      quoteId: input.quoteId !== undefined ? input.quoteId : current.quoteId,
      assignedTechnicianId:
        input.assignedTechnicianId !== undefined
          ? input.assignedTechnicianId
          : current.assignedTechnicianId
    });

    const statusPatch = buildDeskStatusPatch(current.status, input.status as DeskTicketStatus | undefined);

    const updated = await fastify.prisma.$transaction(async (tx) => {
      const next = await tx.deskTicket.update({
        where: { id: current.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.priority !== undefined
            ? { priority: input.priority as DeskTicketPriority }
            : {}),
          ...(input.channel !== undefined ? { channel: input.channel as DeskTicketChannel } : {}),
          customerId: references.customerId,
          ...(input.siteLocationId !== undefined
            ? { siteLocationId: input.siteLocationId }
            : {}),
          ...(input.serviceOrderId !== undefined
            ? { serviceOrderId: input.serviceOrderId }
            : {}),
          ...(input.quoteId !== undefined ? { quoteId: input.quoteId } : {}),
          ...(input.assignedTechnicianId !== undefined
            ? { assignedTechnicianId: input.assignedTechnicianId }
            : {}),
          ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
          ...statusPatch
        },
        include: ticketDetailInclude
      });

      await createDeskTicketEvent({
        prisma: tx,
        deskTicketId: next.id,
        actorId: user.id,
        type: "DESK_TICKET_UPDATED",
        payload: input as unknown as Prisma.InputJsonValue
      });

      return next;
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/:id/status", async (request, reply) => {
    await requirePermission(request, reply, "desk.manage");
    const user = getRequestUser(request);
    const input = DeskTicketStatusSchema.parse(request.body);

    const ticket = await fastify.prisma.deskTicket.findUnique({
      where: { id: request.params.id }
    });

    if (!ticket) {
      throw new AppError(404, "DESK_TICKET_NOT_FOUND", "Ticket nao encontrado");
    }

    assertDeskTicketAccess({
      role: user.role,
      userId: user.id,
      ticket
    });

    const patch = buildDeskStatusPatch(ticket.status, input.status as DeskTicketStatus);

    const updated = await fastify.prisma.$transaction(async (tx) => {
      const next = await tx.deskTicket.update({
        where: { id: ticket.id },
        data: patch,
        include: ticketDetailInclude
      });

      await createDeskTicketEvent({
        prisma: tx,
        deskTicketId: ticket.id,
        actorId: user.id,
        type: "DESK_TICKET_STATUS_UPDATED",
        note: input.note,
        payload: {
          previousStatus: ticket.status,
          status: input.status
        } as Prisma.InputJsonValue
      });

      return next;
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/:id/note", async (request, reply) => {
    await requirePermission(request, reply, "desk.manage");
    const user = getRequestUser(request);
    const input = DeskTicketNoteSchema.parse(request.body);

    const ticket = await fastify.prisma.deskTicket.findUnique({
      where: { id: request.params.id }
    });

    if (!ticket) {
      throw new AppError(404, "DESK_TICKET_NOT_FOUND", "Ticket nao encontrado");
    }

    assertDeskTicketAccess({
      role: user.role,
      userId: user.id,
      ticket
    });

    await createDeskTicketEvent({
      prisma: fastify.prisma,
      deskTicketId: ticket.id,
      actorId: user.id,
      type: "DESK_TICKET_NOTE",
      note: input.note
    });

    const updated = await fastify.prisma.deskTicket.findUnique({
      where: { id: ticket.id },
      include: ticketDetailInclude
    });

    return sendSuccess(reply, updated!);
  });

  fastify.post<{ Params: { id: string } }>("/:id/convert-to-service-order", async (request, reply) => {
    await requirePermission(request, reply, "desk.manage");
    const user = getRequestUser(request);
    const input = ConvertDeskTicketToServiceOrderSchema.parse(request.body);

    if (!isManager(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem converter ticket em OS");
    }

    const ticket = await fastify.prisma.deskTicket.findUnique({
      where: { id: request.params.id },
      include: {
        customer: {
          select: { id: true }
        }
      }
    });

    if (!ticket) {
      throw new AppError(404, "DESK_TICKET_NOT_FOUND", "Ticket nao encontrado");
    }

    if (ticket.serviceOrderId) {
      throw new AppError(409, "TICKET_ALREADY_LINKED", "Ticket ja possui ordem de servico vinculada");
    }

    const assignedTechnicianId = input.assignedTechnicianId ?? ticket.assignedTechnicianId ?? undefined;
    if (assignedTechnicianId) {
      const technician = await fastify.prisma.user.findFirst({
        where: {
          id: assignedTechnicianId,
          role: "TECNICO"
        },
        select: { id: true }
      });

      if (!technician) {
        throw new AppError(400, "INVALID_TECHNICIAN", "Tecnico informado nao existe");
      }
    }

    const created = await fastify.prisma.$transaction(async (tx) => {
      const serviceOrder = await tx.serviceOrder.create({
        data: {
          code: generateServiceOrderCode(),
          title: input.title ?? ticket.title,
          description: input.description ?? ticket.description ?? undefined,
          priority:
            (input.priority as ServiceOrderPriority | undefined) ??
            ((ticket.priority as unknown) as ServiceOrderPriority),
          customerId: ticket.customerId,
          siteLocationId: ticket.siteLocationId,
          assignedTechnicianId,
          serviceDate: input.serviceDate,
          scheduledStartAt: input.scheduledStartAt,
          scheduledEndAt: input.scheduledEndAt,
          slaDueAt: input.slaDueAt ?? ticket.dueAt,
          createdById: user.id,
          status: assignedTechnicianId ? ServiceOrderStatus.SCHEDULED : ServiceOrderStatus.OPEN
        },
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          assignedTechnicianId: true
        }
      });

      const nextTicket = await tx.deskTicket.update({
        where: { id: ticket.id },
        data: {
          serviceOrderId: serviceOrder.id,
          status: ticket.status === "OPEN" ? DeskTicketStatus.IN_PROGRESS : ticket.status,
          firstResponseAt: ticket.firstResponseAt ?? new Date()
        },
        include: ticketDetailInclude
      });

      await createDeskTicketEvent({
        prisma: tx,
        deskTicketId: ticket.id,
        actorId: user.id,
        type: "DESK_TICKET_CONVERTED_TO_SERVICE_ORDER",
        payload: {
          serviceOrderId: serviceOrder.id,
          serviceOrderCode: serviceOrder.code
        } as Prisma.InputJsonValue
      });

      await tx.serviceOrderEvent.create({
        data: {
          serviceOrderId: serviceOrder.id,
          actorId: user.id,
          type: "SERVICE_ORDER_CREATED_FROM_DESK",
          payload: {
            deskTicketId: ticket.id,
            deskTicketCode: ticket.code
          }
        }
      });

      return nextTicket;
    });

    return sendSuccess(reply, created);
  });
};
