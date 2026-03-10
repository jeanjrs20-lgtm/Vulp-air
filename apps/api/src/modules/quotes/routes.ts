import type { FastifyPluginAsync } from "fastify";
import { QuoteStatus } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../lib/app-error.js";
import { getRequestUser, sendSuccess } from "../../lib/envelope.js";
import { requirePermission } from "../../lib/authz.js";

const quoteStatuses = ["DRAFT", "SENT", "APPROVED", "REJECTED", "EXPIRED"] as const;

const QuoteItemInputSchema = z.object({
  description: z.string().min(2),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative()
});

const QuoteCreateSchema = z.object({
  serviceOrderId: z.string().optional(),
  customerId: z.string().optional(),
  validUntil: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
  discount: z.number().min(0).default(0),
  items: z.array(QuoteItemInputSchema).min(1)
});

const QuoteUpdateSchema = z.object({
  serviceOrderId: z.string().nullable().optional(),
  customerId: z.string().nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  discount: z.number().min(0).optional(),
  items: z.array(QuoteItemInputSchema).min(1).optional(),
  status: z.enum(quoteStatuses).optional()
});

const QuoteListQuerySchema = z.object({
  status: z.enum(quoteStatuses).optional(),
  customerId: z.string().optional(),
  serviceOrderId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  search: z.string().optional()
});

const QuoteStatusSchema = z.object({
  status: z.enum(quoteStatuses)
});

const quoteInclude = {
  createdBy: {
    select: { id: true, name: true, role: true }
  },
  customer: {
    select: { id: true, name: true }
  },
  serviceOrder: {
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      assignedTechnician: {
        select: { id: true, name: true }
      }
    }
  },
  items: {
    orderBy: { createdAt: "asc" as const }
  }
} as const;

const generateQuoteCode = () => {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `QTE-${date}-${random}`;
};

const computeTotals = (items: Array<z.infer<typeof QuoteItemInputSchema>>, discount: number) => {
  const normalized = items.map((item) => {
    const total = Number((item.quantity * item.unitPrice).toFixed(2));
    return {
      description: item.description,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice.toFixed(2)),
      total
    };
  });

  const subtotal = Number(normalized.reduce((acc, item) => acc + item.total, 0).toFixed(2));
  const boundedDiscount = Math.min(discount, subtotal);
  const total = Number((subtotal - boundedDiscount).toFixed(2));

  return {
    normalized,
    subtotal,
    discount: Number(boundedDiscount.toFixed(2)),
    total
  };
};

const ensureReferences = async (params: {
  prisma: any;
  serviceOrderId?: string | null;
  customerId?: string | null;
}) => {
  const serviceOrder = params.serviceOrderId
    ? await params.prisma.serviceOrder.findUnique({
        where: { id: params.serviceOrderId },
        select: { id: true, customerId: true }
      })
    : null;

  if (params.serviceOrderId && !serviceOrder) {
    throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
  }

  if (params.customerId) {
    const customer = await params.prisma.customer.findUnique({
      where: { id: params.customerId },
      select: { id: true }
    });

    if (!customer) {
      throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente nao encontrado");
    }
  }

  return {
    derivedCustomerId: params.customerId ?? serviceOrder?.customerId ?? null
  };
};

export const quoteRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/options", async (request, reply) => {
    await requirePermission(request, reply, "quote.manage");

    const [customers, serviceOrders] = await Promise.all([
      fastify.prisma.customer.findMany({
        select: { id: true, name: true },
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
          customerId: true,
          customer: {
            select: { id: true, name: true }
          }
        }
      })
    ]);

    return sendSuccess(reply, { customers, serviceOrders });
  });

  fastify.get("/", async (request, reply) => {
    await requirePermission(request, reply, "quote.manage");
    const query = QuoteListQuerySchema.parse(request.query);

    const quotes = await fastify.prisma.quote.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.serviceOrderId ? { serviceOrderId: query.serviceOrderId } : {}),
        ...(query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: "insensitive" } },
                { notes: { contains: query.search, mode: "insensitive" } },
                { serviceOrder: { title: { contains: query.search, mode: "insensitive" } } },
                { customer: { name: { contains: query.search, mode: "insensitive" } } }
              ]
            }
          : {}),
        ...(query.dateFrom || query.dateTo
          ? {
              createdAt: {
                ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                ...(query.dateTo ? { lte: query.dateTo } : {})
              }
            }
          : {})
      },
      orderBy: [{ createdAt: "desc" }],
      include: quoteInclude
    });

    return sendSuccess(reply, quotes);
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    await requirePermission(request, reply, "quote.manage");

    const quote = await fastify.prisma.quote.findUnique({
      where: { id: request.params.id },
      include: quoteInclude
    });

    if (!quote) {
      throw new AppError(404, "QUOTE_NOT_FOUND", "Orcamento nao encontrado");
    }

    return sendSuccess(reply, quote);
  });

  fastify.post("/", async (request, reply) => {
    await requirePermission(request, reply, "quote.manage");
    const user = getRequestUser(request);
    const input = QuoteCreateSchema.parse(request.body);

    const references = await ensureReferences({
      prisma: fastify.prisma,
      serviceOrderId: input.serviceOrderId,
      customerId: input.customerId
    });

    if (!input.serviceOrderId && !references.derivedCustomerId) {
      throw new AppError(400, "CUSTOMER_REQUIRED", "Cliente obrigatorio quando nao houver OS");
    }

    const totals = computeTotals(input.items, input.discount ?? 0);

    const quote = await fastify.prisma.$transaction(async (tx) => {
      const created = await tx.quote.create({
        data: {
          code: generateQuoteCode(),
          serviceOrderId: input.serviceOrderId,
          customerId: references.derivedCustomerId,
          createdById: user.id,
          status: QuoteStatus.DRAFT,
          validUntil: input.validUntil,
          notes: input.notes,
          subtotal: totals.subtotal,
          discount: totals.discount,
          total: totals.total,
          items: {
            create: totals.normalized
          }
        },
        include: quoteInclude
      });

      if (created.serviceOrderId) {
        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: created.serviceOrderId,
            actorId: user.id,
            type: "QUOTE_CREATED",
            payload: {
              quoteId: created.id,
              quoteCode: created.code,
              total: created.total
            }
          }
        });
      }

      return created;
    });

    return sendSuccess(reply, quote);
  });

  fastify.patch<{ Params: { id: string } }>("/:id", async (request, reply) => {
    await requirePermission(request, reply, "quote.manage");
    const user = getRequestUser(request);
    const input = QuoteUpdateSchema.parse(request.body);

    const quote = await fastify.prisma.quote.findUnique({
      where: { id: request.params.id },
      include: { items: true }
    });

    if (!quote) {
      throw new AppError(404, "QUOTE_NOT_FOUND", "Orcamento nao encontrado");
    }

    const references = await ensureReferences({
      prisma: fastify.prisma,
      serviceOrderId: input.serviceOrderId ?? quote.serviceOrderId,
      customerId: input.customerId ?? quote.customerId
    });

    const nextItems = input.items ?? quote.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice
    }));

    const totals = computeTotals(nextItems, input.discount ?? quote.discount);

    const updated = await fastify.prisma.$transaction(async (tx) => {
      if (input.items) {
        await tx.quoteItem.deleteMany({
          where: { quoteId: quote.id }
        });
      }

      const next = await tx.quote.update({
        where: { id: quote.id },
        data: {
          ...(input.serviceOrderId !== undefined
            ? { serviceOrderId: input.serviceOrderId }
            : {}),
          ...(input.customerId !== undefined
            ? { customerId: input.customerId ?? references.derivedCustomerId }
            : {}),
          ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.status !== undefined ? { status: input.status as QuoteStatus } : {}),
          subtotal: totals.subtotal,
          discount: totals.discount,
          total: totals.total,
          ...(input.items
            ? {
                items: {
                  create: totals.normalized
                }
              }
            : {})
        },
        include: quoteInclude
      });

      if (next.serviceOrderId) {
        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: next.serviceOrderId,
            actorId: user.id,
            type: "QUOTE_UPDATED",
            payload: {
              quoteId: next.id,
              quoteCode: next.code,
              status: next.status,
              total: next.total
            }
          }
        });
      }

      return next;
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/:id/status", async (request, reply) => {
    await requirePermission(request, reply, "quote.manage");
    const user = getRequestUser(request);
    const input = QuoteStatusSchema.parse(request.body);

    const quote = await fastify.prisma.quote.findUnique({
      where: { id: request.params.id }
    });

    if (!quote) {
      throw new AppError(404, "QUOTE_NOT_FOUND", "Orcamento nao encontrado");
    }

    const updated = await fastify.prisma.$transaction(async (tx) => {
      const next = await tx.quote.update({
        where: { id: quote.id },
        data: {
          status: input.status as QuoteStatus
        },
        include: quoteInclude
      });

      if (next.serviceOrderId) {
        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: next.serviceOrderId,
            actorId: user.id,
            type:
              input.status === "APPROVED"
                ? "QUOTE_APPROVED"
                : input.status === "REJECTED"
                  ? "QUOTE_REJECTED"
                  : "QUOTE_STATUS_UPDATED",
            payload: {
              quoteId: next.id,
              status: next.status,
              total: next.total
            }
          }
        });
      }

      return next;
    });

    return sendSuccess(reply, updated);
  });
};
