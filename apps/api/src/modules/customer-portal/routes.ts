import { createHash, randomBytes } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import {
  ChatSenderType,
  ChatThreadChannel,
  DeskTicketChannel,
  DeskTicketPriority,
  FinancialInvoiceStatus,
  FinancialPaymentMethod
} from "@prisma/client";
import { z } from "zod";
import { env } from "../../env.js";
import { AppError } from "../../lib/app-error.js";
import { getRequestUser, sendSuccess } from "../../lib/envelope.js";
import { requirePermission } from "../../lib/authz.js";

const CreatePortalAccessSchema = z.object({
  customerId: z.string(),
  label: z.string().max(120).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(3650).optional()
});

const RevokePortalAccessSchema = z.object({
  reason: z.string().max(500).optional()
});

const PublicPortalTicketCreateSchema = z.object({
  title: z.string().min(3),
  description: z.string().max(5000).optional(),
  siteLocationId: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM")
});

const PublicPortalPaymentConfirmSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(["PIX", "CREDIT_CARD", "DEBIT_CARD", "BANK_SLIP", "CASH", "TRANSFER", "OTHER"]),
  reference: z.string().max(120).optional(),
  note: z.string().max(1000).optional(),
  paidAt: z.coerce.date().optional()
});

const PublicPortalChatThreadCreateSchema = z.object({
  subject: z.string().min(2),
  message: z.string().min(1).max(4000),
  channel: z.enum(["PORTAL", "WHATSAPP", "EMAIL", "PHONE"]).default("PORTAL"),
  deskTicketId: z.string().optional(),
  serviceOrderId: z.string().optional(),
  quoteId: z.string().optional()
});

const PublicPortalChatMessageCreateSchema = z.object({
  message: z.string().min(1).max(4000)
});

const PublicPortalListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

const generatePortalToken = () => randomBytes(24).toString("base64url");

const toPortalUrl = (token: string) => `${env.PUBLIC_WEB_URL.replace(/\/$/, "")}/portal/${token}`;

const ensureCustomerPortalAccess = async (params: {
  prisma: any;
  token: string;
  touchUsage?: boolean;
}) => {
  const now = new Date();
  const access = await params.prisma.customerPortalAccess.findFirst({
    where: {
      tokenHash: tokenHash(params.token),
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!access) {
    throw new AppError(404, "PORTAL_ACCESS_INVALID", "Link do portal invalido ou expirado");
  }

  if (params.touchUsage ?? true) {
    await params.prisma.customerPortalAccess.update({
      where: { id: access.id },
      data: { lastUsedAt: now }
    });
  }

  return access;
};

const generateDeskTicketCode = () => {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `DSK-${date}-${random}`;
};

const generateThreadCode = () => {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `CHT-${date}-${random}`;
};

export const customerPortalRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/access", async (request, reply) => {
    await requirePermission(request, reply, "customerPortal.manage");
    const query = z.object({ customerId: z.string().optional() }).parse(request.query);

    const accesses = await fastify.prisma.customerPortalAccess.findMany({
      where: {
        ...(query.customerId ? { customerId: query.customerId } : {})
      },
      orderBy: [{ createdAt: "desc" }],
      include: {
        customer: {
          select: { id: true, name: true }
        },
        createdBy: {
          select: { id: true, name: true, role: true }
        }
      }
    });

    return sendSuccess(
      reply,
      accesses.map((access) => ({
        ...access,
        isRevoked: Boolean(access.revokedAt),
        isExpired: Boolean(access.expiresAt && new Date(access.expiresAt) <= new Date())
      }))
    );
  });

  fastify.post("/access", async (request, reply) => {
    await requirePermission(request, reply, "customerPortal.manage");
    const user = getRequestUser(request);
    const input = CreatePortalAccessSchema.parse(request.body);

    const customer = await fastify.prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true, name: true }
    });

    if (!customer) {
      throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente nao encontrado");
    }

    const token = generatePortalToken();
    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const access = await fastify.prisma.customerPortalAccess.create({
      data: {
        customerId: customer.id,
        tokenHash: tokenHash(token),
        label: input.label,
        expiresAt,
        createdById: user.id
      },
      include: {
        customer: {
          select: { id: true, name: true }
        },
        createdBy: {
          select: { id: true, name: true, role: true }
        }
      }
    });

    return sendSuccess(reply, {
      access,
      token,
      portalUrl: toPortalUrl(token)
    });
  });

  fastify.post<{ Params: { id: string } }>("/access/:id/revoke", async (request, reply) => {
    await requirePermission(request, reply, "customerPortal.manage");
    const input = RevokePortalAccessSchema.parse(request.body);
    const user = getRequestUser(request);

    const access = await fastify.prisma.customerPortalAccess.findUnique({
      where: { id: request.params.id }
    });

    if (!access) {
      throw new AppError(404, "PORTAL_ACCESS_NOT_FOUND", "Acesso nao encontrado");
    }

    const revoked = await fastify.prisma.customerPortalAccess.update({
      where: { id: access.id },
      data: {
        revokedAt: new Date()
      }
    });

    await fastify.prisma.auditLog.create({
      data: {
        actorId: user.id,
        entity: "CustomerPortalAccess",
        entityId: revoked.id,
        action: "REVOKED",
        payload: {
          reason: input.reason
        }
      }
    });

    return sendSuccess(reply, revoked);
  });

  fastify.get<{ Params: { token: string } }>("/public/:token/overview", async (request, reply) => {
    const access = await ensureCustomerPortalAccess({
      prisma: fastify.prisma,
      token: request.params.token
    });

    const customerId = access.customerId;
    const [tickets, serviceOrders, quotes, feedbackSummary, invoices, chatThreads] = await Promise.all([
      fastify.prisma.deskTicket.groupBy({
        by: ["status"],
        where: { customerId },
        _count: { _all: true }
      }),
      fastify.prisma.serviceOrder.groupBy({
        by: ["status"],
        where: { customerId },
        _count: { _all: true }
      }),
      fastify.prisma.quote.groupBy({
        by: ["status"],
        where: { customerId },
        _count: { _all: true }
      }),
      fastify.prisma.customerFeedback.aggregate({
        where: { customerId },
        _avg: { scoreNps: true, scoreCsat: true },
        _count: { _all: true }
      }),
      fastify.prisma.financialInvoice.groupBy({
        by: ["status"],
        where: { customerId },
        _count: { _all: true },
        _sum: {
          totalAmount: true,
          balanceAmount: true
        }
      }),
      fastify.prisma.chatThread.groupBy({
        by: ["status"],
        where: { customerId },
        _count: { _all: true }
      })
    ]);

    const mapGroup = (rows: Array<{ status: string; _count: { _all: number } }>) =>
      rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      }, {});

    const ticketMap = mapGroup(tickets);
    const serviceOrderMap = mapGroup(serviceOrders);
    const quoteMap = mapGroup(quotes);
    const invoiceMap = invoices.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {});
    const invoiceTotals = invoices.reduce(
      (acc, row) => {
        acc.totalAmount += row._sum.totalAmount ?? 0;
        acc.balanceAmount += row._sum.balanceAmount ?? 0;
        return acc;
      },
      { totalAmount: 0, balanceAmount: 0 }
    );
    const chatMap = mapGroup(chatThreads);

    return sendSuccess(reply, {
      customer: access.customer,
      ticketSummary: {
        open: (ticketMap.OPEN ?? 0) + (ticketMap.TRIAGE ?? 0) + (ticketMap.IN_PROGRESS ?? 0),
        resolved: ticketMap.RESOLVED ?? 0,
        closed: ticketMap.CLOSED ?? 0,
        cancelled: ticketMap.CANCELLED ?? 0
      },
      serviceOrderSummary: {
        scheduled: serviceOrderMap.SCHEDULED ?? 0,
        inProgress: serviceOrderMap.IN_PROGRESS ?? 0,
        completed: serviceOrderMap.COMPLETED ?? 0,
        cancelled: serviceOrderMap.CANCELLED ?? 0
      },
      quoteSummary: {
        draft: quoteMap.DRAFT ?? 0,
        sent: quoteMap.SENT ?? 0,
        approved: quoteMap.APPROVED ?? 0,
        rejected: quoteMap.REJECTED ?? 0,
        expired: quoteMap.EXPIRED ?? 0
      },
      financeSummary: {
        draft: invoiceMap.DRAFT ?? 0,
        issued: invoiceMap.ISSUED ?? 0,
        partiallyPaid: invoiceMap.PARTIALLY_PAID ?? 0,
        paid: invoiceMap.PAID ?? 0,
        overdue: invoiceMap.OVERDUE ?? 0,
        canceled: invoiceMap.CANCELED ?? 0,
        totalAmount: Number(invoiceTotals.totalAmount.toFixed(2)),
        balanceAmount: Number(invoiceTotals.balanceAmount.toFixed(2))
      },
      chatSummary: {
        open: chatMap.OPEN ?? 0,
        closed: chatMap.CLOSED ?? 0,
        archived: chatMap.ARCHIVED ?? 0
      },
      satisfaction: {
        feedbacks: feedbackSummary._count._all,
        avgNps: Number((feedbackSummary._avg.scoreNps ?? 0).toFixed(2)),
        avgCsat: Number((feedbackSummary._avg.scoreCsat ?? 0).toFixed(2))
      }
    });
  });

  fastify.get<{ Params: { token: string } }>("/public/:token/service-orders", async (request, reply) => {
    const access = await ensureCustomerPortalAccess({
      prisma: fastify.prisma,
      token: request.params.token
    });
    const query = PublicPortalListQuerySchema.parse(request.query);

    const orders = await fastify.prisma.serviceOrder.findMany({
      where: { customerId: access.customerId },
      orderBy: [{ createdAt: "desc" }],
      take: query.limit,
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        priority: true,
        serviceDate: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        completedAt: true,
        siteLocation: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            state: true
          }
        },
        assignedTechnician: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return sendSuccess(reply, orders);
  });

  fastify.get<{ Params: { token: string } }>("/public/:token/quotes", async (request, reply) => {
    const access = await ensureCustomerPortalAccess({
      prisma: fastify.prisma,
      token: request.params.token
    });
    const query = PublicPortalListQuerySchema.parse(request.query);

    const quotes = await fastify.prisma.quote.findMany({
      where: { customerId: access.customerId },
      orderBy: [{ createdAt: "desc" }],
      take: query.limit,
      select: {
        id: true,
        code: true,
        status: true,
        subtotal: true,
        discount: true,
        total: true,
        validUntil: true,
        createdAt: true,
        serviceOrder: {
          select: {
            id: true,
            code: true,
            title: true
          }
        },
        items: {
          select: {
            id: true,
            description: true,
            quantity: true,
            unitPrice: true,
            total: true
          }
        }
      }
    });

    return sendSuccess(reply, quotes);
  });

  fastify.get<{ Params: { token: string } }>("/public/:token/invoices", async (request, reply) => {
    const access = await ensureCustomerPortalAccess({
      prisma: fastify.prisma,
      token: request.params.token
    });
    const query = PublicPortalListQuerySchema.parse(request.query);

    const invoices = await fastify.prisma.financialInvoice.findMany({
      where: { customerId: access.customerId },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: query.limit,
      select: {
        id: true,
        code: true,
        status: true,
        issueDate: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        balanceAmount: true,
        description: true,
        currency: true,
        serviceOrder: {
          select: {
            id: true,
            code: true,
            title: true
          }
        },
        quote: {
          select: {
            id: true,
            code: true
          }
        },
        payments: {
          orderBy: { paidAt: "desc" },
          select: {
            id: true,
            amount: true,
            method: true,
            paidAt: true,
            reference: true
          }
        },
        charges: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            channel: true,
            status: true,
            createdAt: true,
            sentAt: true
          }
        }
      }
    });

    return sendSuccess(reply, invoices);
  });

  fastify.post<{ Params: { token: string; invoiceId: string } }>(
    "/public/:token/invoices/:invoiceId/confirm-payment",
    async (request, reply) => {
      const access = await ensureCustomerPortalAccess({
        prisma: fastify.prisma,
        token: request.params.token
      });
      const input = PublicPortalPaymentConfirmSchema.parse(request.body);

      const invoice = await fastify.prisma.financialInvoice.findFirst({
        where: {
          id: request.params.invoiceId,
          customerId: access.customerId
        }
      });

      if (!invoice) {
        throw new AppError(404, "INVOICE_NOT_FOUND", "Fatura nao encontrada para este cliente");
      }

      if (invoice.status === "CANCELED") {
        throw new AppError(409, "INVALID_STATUS", "Fatura cancelada nao aceita pagamento");
      }

      if (input.amount > invoice.balanceAmount) {
        throw new AppError(409, "INVALID_AMOUNT", "Valor informado maior que saldo da fatura");
      }

      const paidAmount = Number((invoice.paidAmount + input.amount).toFixed(2));
      const balanceAmount = Number(Math.max(invoice.totalAmount - paidAmount, 0).toFixed(2));
      const now = input.paidAt ?? new Date();
      const nextStatus: FinancialInvoiceStatus =
        balanceAmount <= 0
          ? "PAID"
          : invoice.dueDate.getTime() < Date.now()
            ? "PARTIALLY_PAID"
            : "PARTIALLY_PAID";

      const updated = await fastify.prisma.$transaction(async (tx) => {
        await tx.financialPayment.create({
          data: {
            invoiceId: invoice.id,
            amount: Number(input.amount.toFixed(2)),
            method: input.method as FinancialPaymentMethod,
            paidAt: now,
            reference: input.reference,
            note: input.note ?? "Pagamento confirmado via portal do cliente"
          }
        });

        await tx.financialCharge.create({
          data: {
            invoiceId: invoice.id,
            channel: "PORTAL",
            status: "PAID",
            note: "Cliente confirmou pagamento pelo portal",
            sentAt: now,
            viewedAt: now,
            resolvedAt: now
          }
        });

        const next = await tx.financialInvoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount,
            balanceAmount,
            status: nextStatus,
            paidAt: balanceAmount <= 0 ? now : null
          },
          select: {
            id: true,
            code: true,
            status: true,
            totalAmount: true,
            paidAmount: true,
            balanceAmount: true
          }
        });

        return next;
      });

      return sendSuccess(reply, updated);
    }
  );

  fastify.get<{ Params: { token: string } }>("/public/:token/tickets", async (request, reply) => {
    const access = await ensureCustomerPortalAccess({
      prisma: fastify.prisma,
      token: request.params.token
    });
    const query = PublicPortalListQuerySchema.parse(request.query);

    const tickets = await fastify.prisma.deskTicket.findMany({
      where: { customerId: access.customerId },
      orderBy: [{ createdAt: "desc" }],
      take: query.limit,
      select: {
        id: true,
        code: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        channel: true,
        openedAt: true,
        dueAt: true,
        resolvedAt: true,
        closedAt: true,
        createdAt: true,
        serviceOrder: {
          select: {
            id: true,
            code: true,
            title: true,
            status: true
          }
        },
        siteLocation: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return sendSuccess(reply, tickets);
  });

  fastify.get<{ Params: { token: string } }>("/public/:token/chat/threads", async (request, reply) => {
    const access = await ensureCustomerPortalAccess({
      prisma: fastify.prisma,
      token: request.params.token
    });
    const query = PublicPortalListQuerySchema.parse(request.query);

    const threads = await fastify.prisma.chatThread.findMany({
      where: {
        customerId: access.customerId,
        channel: {
          in: ["PORTAL", "WHATSAPP", "EMAIL", "PHONE"]
        }
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: query.limit,
      select: {
        id: true,
        code: true,
        subject: true,
        status: true,
        channel: true,
        createdAt: true,
        lastMessageAt: true,
        deskTicket: {
          select: { id: true, code: true, title: true, status: true }
        },
        serviceOrder: {
          select: { id: true, code: true, title: true, status: true }
        },
        quote: {
          select: { id: true, code: true, status: true }
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            senderType: true,
            senderName: true,
            message: true,
            createdAt: true
          }
        }
      }
    });

    return sendSuccess(reply, threads);
  });

  fastify.get<{ Params: { token: string; threadId: string } }>(
    "/public/:token/chat/threads/:threadId/messages",
    async (request, reply) => {
      const access = await ensureCustomerPortalAccess({
        prisma: fastify.prisma,
        token: request.params.token
      });
      const query = PublicPortalListQuerySchema.parse(request.query);

      const thread = await fastify.prisma.chatThread.findFirst({
        where: {
          id: request.params.threadId,
          customerId: access.customerId
        },
        select: {
          id: true
        }
      });

      if (!thread) {
        throw new AppError(404, "CHAT_THREAD_NOT_FOUND", "Conversa nao encontrada");
      }

      const messages = await fastify.prisma.chatMessage.findMany({
        where: {
          threadId: thread.id
        },
        orderBy: { createdAt: "asc" },
        take: query.limit,
        select: {
          id: true,
          senderType: true,
          senderName: true,
          message: true,
          createdAt: true
        }
      });

      return sendSuccess(reply, messages);
    }
  );

  fastify.post<{ Params: { token: string } }>("/public/:token/chat/threads", async (request, reply) => {
    const access = await ensureCustomerPortalAccess({
      prisma: fastify.prisma,
      token: request.params.token
    });
    const input = PublicPortalChatThreadCreateSchema.parse(request.body);

    if (input.deskTicketId) {
      const ticket = await fastify.prisma.deskTicket.findFirst({
        where: { id: input.deskTicketId, customerId: access.customerId },
        select: { id: true }
      });

      if (!ticket) {
        throw new AppError(400, "INVALID_TICKET", "Ticket informado nao pertence ao cliente");
      }
    }

    if (input.serviceOrderId) {
      const order = await fastify.prisma.serviceOrder.findFirst({
        where: { id: input.serviceOrderId, customerId: access.customerId },
        select: { id: true }
      });

      if (!order) {
        throw new AppError(400, "INVALID_SERVICE_ORDER", "OS informada nao pertence ao cliente");
      }
    }

    if (input.quoteId) {
      const quote = await fastify.prisma.quote.findFirst({
        where: { id: input.quoteId, customerId: access.customerId },
        select: { id: true }
      });

      if (!quote) {
        throw new AppError(400, "INVALID_QUOTE", "Orcamento informado nao pertence ao cliente");
      }
    }

    const now = new Date();
    const created = await fastify.prisma.$transaction(async (tx) => {
      const thread = await tx.chatThread.create({
        data: {
          code: generateThreadCode(),
          subject: input.subject,
          channel: input.channel as ChatThreadChannel,
          customerId: access.customerId,
          deskTicketId: input.deskTicketId,
          serviceOrderId: input.serviceOrderId,
          quoteId: input.quoteId,
          lastMessageAt: now
        },
        select: {
          id: true,
          code: true,
          subject: true,
          status: true,
          channel: true,
          deskTicketId: true,
          serviceOrderId: true,
          createdAt: true,
          lastMessageAt: true
        }
      });

      await tx.chatMessage.create({
        data: {
          threadId: thread.id,
          senderType: ChatSenderType.CUSTOMER,
          senderCustomerId: access.customerId,
          senderName: access.customer.name,
          message: input.message.trim()
        }
      });

      if (thread.deskTicketId) {
        await tx.deskTicketEvent.create({
          data: {
            deskTicketId: thread.deskTicketId,
            type: "CHAT_THREAD_CREATED_FROM_PORTAL",
            payload: {
              threadId: thread.id,
              threadCode: thread.code,
              customerPortalAccessId: access.id
            }
          }
        });
      }

      if (thread.serviceOrderId) {
        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: thread.serviceOrderId,
            type: "CHAT_THREAD_CREATED_FROM_PORTAL",
            payload: {
              threadId: thread.id,
              threadCode: thread.code,
              customerPortalAccessId: access.id
            }
          }
        });
      }

      return thread;
    });

    return sendSuccess(reply, created);
  });

  fastify.post<{ Params: { token: string; threadId: string } }>(
    "/public/:token/chat/threads/:threadId/messages",
    async (request, reply) => {
      const access = await ensureCustomerPortalAccess({
        prisma: fastify.prisma,
        token: request.params.token
      });
      const input = PublicPortalChatMessageCreateSchema.parse(request.body);

      const thread = await fastify.prisma.chatThread.findFirst({
        where: {
          id: request.params.threadId,
          customerId: access.customerId
        },
        select: {
          id: true,
          status: true,
          deskTicketId: true,
          serviceOrderId: true
        }
      });

      if (!thread) {
        throw new AppError(404, "CHAT_THREAD_NOT_FOUND", "Conversa nao encontrada");
      }

      if (thread.status !== "OPEN") {
        throw new AppError(409, "THREAD_CLOSED", "Conversa fechada nao aceita novas mensagens");
      }

      const now = new Date();
      const result = await fastify.prisma.$transaction(async (tx) => {
        const message = await tx.chatMessage.create({
          data: {
            threadId: thread.id,
            senderType: ChatSenderType.CUSTOMER,
            senderCustomerId: access.customerId,
            senderName: access.customer.name,
            message: input.message.trim()
          },
          select: {
            id: true,
            senderType: true,
            senderName: true,
            message: true,
            createdAt: true
          }
        });

        await tx.chatThread.update({
          where: { id: thread.id },
          data: {
            lastMessageAt: now
          }
        });

        if (thread.deskTicketId) {
          await tx.deskTicketEvent.create({
            data: {
              deskTicketId: thread.deskTicketId,
              type: "CHAT_MESSAGE_POSTED_FROM_PORTAL",
              payload: {
                threadId: thread.id
              }
            }
          });
        }

        if (thread.serviceOrderId) {
          await tx.serviceOrderEvent.create({
            data: {
              serviceOrderId: thread.serviceOrderId,
              type: "CHAT_MESSAGE_POSTED_FROM_PORTAL",
              payload: {
                threadId: thread.id
              }
            }
          });
        }

        return message;
      });

      return sendSuccess(reply, result);
    }
  );

  fastify.post<{ Params: { token: string } }>("/public/:token/tickets", async (request, reply) => {
    const access = await ensureCustomerPortalAccess({
      prisma: fastify.prisma,
      token: request.params.token
    });
    const input = PublicPortalTicketCreateSchema.parse(request.body);

    if (input.siteLocationId) {
      const site = await fastify.prisma.siteLocation.findUnique({
        where: { id: input.siteLocationId },
        select: { id: true, customerId: true }
      });

      if (!site || site.customerId !== access.customerId) {
        throw new AppError(
          400,
          "INVALID_SITE",
          "Unidade informada nao pertence ao cliente deste portal"
        );
      }
    }

    const ticket = await fastify.prisma.$transaction(async (tx) => {
      const created = await tx.deskTicket.create({
        data: {
          code: generateDeskTicketCode(),
          title: input.title,
          description: input.description,
          priority: input.priority as DeskTicketPriority,
          channel: DeskTicketChannel.PORTAL,
          customerId: access.customerId,
          siteLocationId: input.siteLocationId
        },
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          priority: true,
          createdAt: true
        }
      });

      await tx.deskTicketEvent.create({
        data: {
          deskTicketId: created.id,
          type: "DESK_TICKET_CREATED_FROM_PORTAL",
          payload: {
            channel: "PORTAL",
            customerPortalAccessId: access.id
          }
        }
      });

      return created;
    });

    return sendSuccess(reply, ticket);
  });
};
