import type { FastifyPluginAsync } from "fastify";
import { ChatSenderType, ChatThreadChannel, ChatThreadStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../lib/app-error.js";
import { getRequestUser, sendSuccess } from "../../lib/envelope.js";
import { requirePermission } from "../../lib/authz.js";

const chatThreadStatuses = ["OPEN", "CLOSED", "ARCHIVED"] as const;
const chatThreadChannels = ["INTERNAL", "WHATSAPP", "PORTAL", "EMAIL", "PHONE"] as const;

const ChatThreadCreateSchema = z.object({
  subject: z.string().min(2),
  channel: z.enum(chatThreadChannels).default("INTERNAL"),
  customerId: z.string().optional(),
  deskTicketId: z.string().optional(),
  serviceOrderId: z.string().optional(),
  quoteId: z.string().optional(),
  assignedToId: z.string().optional(),
  initialMessage: z.string().max(4000).optional()
});

const ChatThreadUpdateSchema = z.object({
  subject: z.string().min(2).optional(),
  channel: z.enum(chatThreadChannels).optional(),
  assignedToId: z.string().nullable().optional(),
  customerId: z.string().nullable().optional(),
  deskTicketId: z.string().nullable().optional(),
  serviceOrderId: z.string().nullable().optional(),
  quoteId: z.string().nullable().optional()
});

const ChatThreadListQuerySchema = z.object({
  status: z.string().optional(),
  customerId: z.string().optional(),
  assignedToId: z.string().optional(),
  search: z.string().optional(),
  channel: z.enum(chatThreadChannels).optional()
});

const ChatThreadStatusSchema = z.object({
  status: z.enum(chatThreadStatuses)
});

const ChatMessageCreateSchema = z.object({
  message: z.string().min(1).max(4000)
});

const ChatMessageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200)
});

const managerRoles = new Set(["SUPERADMIN", "ADMIN", "SUPERVISOR"]);
const isManager = (role: string) => managerRoles.has(role);

const parseThreadStatusFilter = (raw?: string) => {
  if (!raw) {
    return undefined;
  }

  const values = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is (typeof chatThreadStatuses)[number] =>
      chatThreadStatuses.includes(value as (typeof chatThreadStatuses)[number])
    );

  return values.length ? (values as ChatThreadStatus[]) : undefined;
};

const generateThreadCode = () => {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `CHT-${date}-${random}`;
};

const threadListInclude = {
  customer: {
    select: { id: true, name: true }
  },
  deskTicket: {
    select: { id: true, code: true, title: true, status: true }
  },
  serviceOrder: {
    select: { id: true, code: true, title: true, status: true }
  },
  quote: {
    select: { id: true, code: true, status: true, total: true }
  },
  createdBy: {
    select: { id: true, name: true, role: true }
  },
  assignedTo: {
    select: { id: true, name: true, role: true }
  },
  messages: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      id: true,
      senderType: true,
      senderName: true,
      message: true,
      createdAt: true
    }
  }
} as const;

const threadDetailInclude = {
  ...threadListInclude,
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
} as const;

const ensureChatReferences = async (params: {
  prisma: any;
  customerId?: string | null;
  deskTicketId?: string | null;
  serviceOrderId?: string | null;
  quoteId?: string | null;
  assignedToId?: string | null;
}) => {
  const [customer, deskTicket, serviceOrder, quote, assignedTo] = await Promise.all([
    params.customerId
      ? params.prisma.customer.findUnique({
          where: { id: params.customerId },
          select: { id: true }
        })
      : Promise.resolve(null),
    params.deskTicketId
      ? params.prisma.deskTicket.findUnique({
          where: { id: params.deskTicketId },
          select: { id: true, customerId: true, assignedTechnicianId: true }
        })
      : Promise.resolve(null),
    params.serviceOrderId
      ? params.prisma.serviceOrder.findUnique({
          where: { id: params.serviceOrderId },
          select: { id: true, customerId: true, assignedTechnicianId: true }
        })
      : Promise.resolve(null),
    params.quoteId
      ? params.prisma.quote.findUnique({
          where: { id: params.quoteId },
          select: { id: true, customerId: true }
        })
      : Promise.resolve(null),
    params.assignedToId
      ? params.prisma.user.findUnique({
          where: { id: params.assignedToId },
          select: { id: true, role: true, name: true }
        })
      : Promise.resolve(null)
  ]);

  if (params.customerId && !customer) {
    throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente nao encontrado");
  }

  if (params.deskTicketId && !deskTicket) {
    throw new AppError(404, "DESK_TICKET_NOT_FOUND", "Ticket nao encontrado");
  }

  if (params.serviceOrderId && !serviceOrder) {
    throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
  }

  if (params.quoteId && !quote) {
    throw new AppError(404, "QUOTE_NOT_FOUND", "Orcamento nao encontrado");
  }

  if (params.assignedToId && !assignedTo) {
    throw new AppError(404, "USER_NOT_FOUND", "Usuario responsavel nao encontrado");
  }

  const derivedCustomerId =
    params.customerId ?? deskTicket?.customerId ?? serviceOrder?.customerId ?? quote?.customerId ?? null;

  const derivedAssignedTo =
    params.assignedToId ?? deskTicket?.assignedTechnicianId ?? serviceOrder?.assignedTechnicianId ?? null;

  return {
    customerId: derivedCustomerId,
    assignedToId: derivedAssignedTo
  };
};

const assertThreadAccess = (params: {
  role: string;
  userId: string;
  thread: {
    createdById?: string | null;
    assignedToId?: string | null;
  };
}) => {
  if (isManager(params.role)) {
    return;
  }

  if (
    params.role === "TECNICO" &&
    (params.thread.assignedToId === params.userId || params.thread.createdById === params.userId)
  ) {
    return;
  }

  throw new AppError(403, "FORBIDDEN", "Sem permissao para acessar esta conversa");
};

const createLinkedEvents = async (params: {
  prisma: any;
  actorId?: string;
  deskTicketId?: string | null;
  serviceOrderId?: string | null;
  type: string;
  payload?: Prisma.InputJsonValue;
}) => {
  if (params.deskTicketId) {
    await params.prisma.deskTicketEvent.create({
      data: {
        deskTicketId: params.deskTicketId,
        actorId: params.actorId,
        type: params.type,
        payload: params.payload
      }
    });
  }

  if (params.serviceOrderId) {
    await params.prisma.serviceOrderEvent.create({
      data: {
        serviceOrderId: params.serviceOrderId,
        actorId: params.actorId,
        type: params.type,
        payload: params.payload
      }
    });
  }
};

export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/options", async (request, reply) => {
    await requirePermission(request, reply, "chat.manage");

    const [customers, users, serviceOrders, quotes, deskTickets] = await Promise.all([
      fastify.prisma.customer.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
      fastify.prisma.user.findMany({
        select: { id: true, name: true, role: true, email: true },
        orderBy: { name: "asc" }
      }),
      fastify.prisma.serviceOrder.findMany({
        orderBy: [{ createdAt: "desc" }],
        take: 300,
        select: { id: true, code: true, title: true, status: true, customerId: true }
      }),
      fastify.prisma.quote.findMany({
        orderBy: [{ createdAt: "desc" }],
        take: 300,
        select: { id: true, code: true, status: true, customerId: true }
      }),
      fastify.prisma.deskTicket.findMany({
        orderBy: [{ createdAt: "desc" }],
        take: 300,
        select: { id: true, code: true, title: true, status: true, customerId: true }
      })
    ]);

    return sendSuccess(reply, {
      statuses: chatThreadStatuses,
      channels: chatThreadChannels,
      customers,
      users,
      serviceOrders,
      quotes,
      deskTickets
    });
  });

  fastify.get("/threads", async (request, reply) => {
    await requirePermission(request, reply, "chat.manage");
    const user = getRequestUser(request);
    const query = ChatThreadListQuerySchema.parse(request.query);
    const statusFilter = parseThreadStatusFilter(query.status);

    const where: Prisma.ChatThreadWhereInput = {
      ...(statusFilter?.length ? { status: { in: statusFilter } } : {}),
      ...(query.channel ? { channel: query.channel as ChatThreadChannel } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { subject: { contains: query.search, mode: "insensitive" } },
              { customer: { name: { contains: query.search, mode: "insensitive" } } }
            ]
          }
        : {})
    };

    if (!isManager(user.role)) {
      const andFilters = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
      where.AND = [
        ...andFilters,
        {
          OR: [{ assignedToId: user.id }, { createdById: user.id }]
        }
      ];
    }

    const threads = await fastify.prisma.chatThread.findMany({
      where,
      include: threadListInclude,
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }]
    });

    return sendSuccess(reply, threads);
  });

  fastify.get<{ Params: { id: string } }>("/threads/:id", async (request, reply) => {
    await requirePermission(request, reply, "chat.manage");
    const user = getRequestUser(request);

    const thread = await fastify.prisma.chatThread.findUnique({
      where: { id: request.params.id },
      include: threadDetailInclude
    });

    if (!thread) {
      throw new AppError(404, "CHAT_THREAD_NOT_FOUND", "Conversa nao encontrada");
    }

    assertThreadAccess({
      role: user.role,
      userId: user.id,
      thread
    });

    return sendSuccess(reply, thread);
  });

  fastify.get<{ Params: { id: string } }>("/threads/:id/messages", async (request, reply) => {
    await requirePermission(request, reply, "chat.manage");
    const user = getRequestUser(request);
    const query = ChatMessageListQuerySchema.parse(request.query);

    const thread = await fastify.prisma.chatThread.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        createdById: true,
        assignedToId: true
      }
    });

    if (!thread) {
      throw new AppError(404, "CHAT_THREAD_NOT_FOUND", "Conversa nao encontrada");
    }

    assertThreadAccess({
      role: user.role,
      userId: user.id,
      thread
    });

    const messages = await fastify.prisma.chatMessage.findMany({
      where: { threadId: thread.id },
      include: {
        senderUser: {
          select: { id: true, name: true, role: true }
        },
        senderCustomer: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: "asc" },
      take: query.limit
    });

    return sendSuccess(reply, messages);
  });

  fastify.post("/threads", async (request, reply) => {
    await requirePermission(request, reply, "chat.manage");
    const user = getRequestUser(request);
    const input = ChatThreadCreateSchema.parse(request.body);
    const senderName =
      (
        await fastify.prisma.user.findUnique({
          where: { id: user.id },
          select: { name: true }
        })
      )?.name ?? user.email;

    if (!isManager(user.role) && input.assignedToId && input.assignedToId !== user.id) {
      throw new AppError(403, "FORBIDDEN", "Tecnico nao pode atribuir conversa para outro usuario");
    }

    const references = await ensureChatReferences({
      prisma: fastify.prisma,
      customerId: input.customerId,
      deskTicketId: input.deskTicketId,
      serviceOrderId: input.serviceOrderId,
      quoteId: input.quoteId,
      assignedToId: input.assignedToId
    });

    const assignedToId = !isManager(user.role)
      ? user.id
      : input.assignedToId ?? references.assignedToId ?? undefined;

    const now = new Date();

    const thread = await fastify.prisma.$transaction(async (tx) => {
      const created = await tx.chatThread.create({
        data: {
          code: generateThreadCode(),
          subject: input.subject,
          channel: input.channel as ChatThreadChannel,
          customerId: references.customerId,
          deskTicketId: input.deskTicketId,
          serviceOrderId: input.serviceOrderId,
          quoteId: input.quoteId,
          createdById: user.id,
          assignedToId,
          lastMessageAt: input.initialMessage?.trim() ? now : null
        },
        include: threadDetailInclude
      });

      if (input.initialMessage?.trim()) {
        await tx.chatMessage.create({
          data: {
            threadId: created.id,
            senderType: ChatSenderType.USER,
            senderUserId: user.id,
            senderName,
            message: input.initialMessage.trim()
          }
        });
      }

      await createLinkedEvents({
        prisma: tx,
        actorId: user.id,
        deskTicketId: created.deskTicketId,
        serviceOrderId: created.serviceOrderId,
        type: "CHAT_THREAD_CREATED",
        payload: {
          threadId: created.id,
          threadCode: created.code
        } as Prisma.InputJsonValue
      });

      return tx.chatThread.findUniqueOrThrow({
        where: { id: created.id },
        include: threadDetailInclude
      });
    });

    return sendSuccess(reply, thread);
  });

  fastify.patch<{ Params: { id: string } }>("/threads/:id", async (request, reply) => {
    await requirePermission(request, reply, "chat.manage");
    const user = getRequestUser(request);
    const input = ChatThreadUpdateSchema.parse(request.body);

    const current = await fastify.prisma.chatThread.findUnique({
      where: { id: request.params.id }
    });

    if (!current) {
      throw new AppError(404, "CHAT_THREAD_NOT_FOUND", "Conversa nao encontrada");
    }

    if (!isManager(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem editar metadados da conversa");
    }

    const references = await ensureChatReferences({
      prisma: fastify.prisma,
      customerId: input.customerId !== undefined ? input.customerId : current.customerId,
      deskTicketId: input.deskTicketId !== undefined ? input.deskTicketId : current.deskTicketId,
      serviceOrderId:
        input.serviceOrderId !== undefined ? input.serviceOrderId : current.serviceOrderId,
      quoteId: input.quoteId !== undefined ? input.quoteId : current.quoteId,
      assignedToId: input.assignedToId !== undefined ? input.assignedToId : current.assignedToId
    });

    const updated = await fastify.prisma.chatThread.update({
      where: { id: current.id },
      data: {
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.channel !== undefined ? { channel: input.channel as ChatThreadChannel } : {}),
        ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
        ...(input.deskTicketId !== undefined ? { deskTicketId: input.deskTicketId } : {}),
        ...(input.serviceOrderId !== undefined ? { serviceOrderId: input.serviceOrderId } : {}),
        ...(input.quoteId !== undefined ? { quoteId: input.quoteId } : {}),
        ...(input.assignedToId !== undefined
          ? { assignedToId: input.assignedToId }
          : references.assignedToId
            ? { assignedToId: references.assignedToId }
            : {})
      },
      include: threadDetailInclude
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/threads/:id/messages", async (request, reply) => {
    await requirePermission(request, reply, "chat.manage");
    const user = getRequestUser(request);
    const input = ChatMessageCreateSchema.parse(request.body);
    const senderName =
      (
        await fastify.prisma.user.findUnique({
          where: { id: user.id },
          select: { name: true }
        })
      )?.name ?? user.email;

    const thread = await fastify.prisma.chatThread.findUnique({
      where: { id: request.params.id }
    });

    if (!thread) {
      throw new AppError(404, "CHAT_THREAD_NOT_FOUND", "Conversa nao encontrada");
    }

    assertThreadAccess({
      role: user.role,
      userId: user.id,
      thread
    });

    if (thread.status !== "OPEN") {
      throw new AppError(409, "THREAD_CLOSED", "Conversa fechada nao aceita novas mensagens");
    }

    const now = new Date();
    const updated = await fastify.prisma.$transaction(async (tx) => {
      await tx.chatMessage.create({
        data: {
          threadId: thread.id,
          senderType: ChatSenderType.USER,
          senderUserId: user.id,
          senderName,
          message: input.message.trim()
        }
      });

      const next = await tx.chatThread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: now
        },
        include: threadDetailInclude
      });

      await createLinkedEvents({
        prisma: tx,
        actorId: user.id,
        deskTicketId: next.deskTicketId,
        serviceOrderId: next.serviceOrderId,
        type: "CHAT_MESSAGE_POSTED",
        payload: {
          threadId: next.id,
          threadCode: next.code
        } as Prisma.InputJsonValue
      });

      return next;
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/threads/:id/status", async (request, reply) => {
    await requirePermission(request, reply, "chat.manage");
    const user = getRequestUser(request);
    const input = ChatThreadStatusSchema.parse(request.body);

    const thread = await fastify.prisma.chatThread.findUnique({
      where: { id: request.params.id }
    });

    if (!thread) {
      throw new AppError(404, "CHAT_THREAD_NOT_FOUND", "Conversa nao encontrada");
    }

    assertThreadAccess({
      role: user.role,
      userId: user.id,
      thread
    });

    const updated = await fastify.prisma.chatThread.update({
      where: { id: thread.id },
      data: {
        status: input.status as ChatThreadStatus
      },
      include: threadDetailInclude
    });

    return sendSuccess(reply, updated);
  });
};
