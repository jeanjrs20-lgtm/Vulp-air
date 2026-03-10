import type { FastifyPluginAsync } from "fastify";
import {
  FinancialChargeChannel,
  FinancialChargeStatus,
  FinancialInvoiceStatus,
  FinancialPaymentMethod,
  Prisma
} from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../lib/app-error.js";
import { getRequestUser, sendSuccess } from "../../lib/envelope.js";
import { requirePermission } from "../../lib/authz.js";

const invoiceStatuses = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELED"
] as const;

const paymentMethods = [
  "PIX",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "BANK_SLIP",
  "CASH",
  "TRANSFER",
  "OTHER"
] as const;

const chargeChannels = ["EMAIL", "WHATSAPP", "SMS", "PHONE", "PORTAL", "MANUAL"] as const;
const chargeStatuses = ["SCHEDULED", "SENT", "VIEWED", "PROMISED", "PAID", "CANCELED"] as const;

const InvoiceItemInputSchema = z.object({
  description: z.string().min(2),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0)
});

const InvoiceCreateSchema = z.object({
  customerId: z.string().optional(),
  serviceOrderId: z.string().optional(),
  quoteId: z.string().optional(),
  deskTicketId: z.string().optional(),
  description: z.string().max(2000).optional(),
  currency: z.string().min(3).max(3).default("BRL"),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date(),
  discount: z.number().min(0).default(0),
  penalties: z.number().min(0).default(0),
  items: z.array(InvoiceItemInputSchema).optional()
});

const InvoiceUpdateSchema = z.object({
  customerId: z.string().optional(),
  serviceOrderId: z.string().nullable().optional(),
  quoteId: z.string().nullable().optional(),
  deskTicketId: z.string().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  currency: z.string().min(3).max(3).optional(),
  issueDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().optional(),
  discount: z.number().min(0).optional(),
  penalties: z.number().min(0).optional(),
  items: z.array(InvoiceItemInputSchema).optional(),
  status: z.enum(invoiceStatuses).optional()
});

const InvoiceListQuerySchema = z.object({
  status: z.string().optional(),
  customerId: z.string().optional(),
  search: z.string().optional(),
  overdueOnly: z.coerce.boolean().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional()
});

const InvoiceIssueSchema = z.object({
  issueDate: z.coerce.date().optional()
});

const RegisterPaymentSchema = z.object({
  method: z.enum(paymentMethods),
  amount: z.number().positive(),
  paidAt: z.coerce.date().optional(),
  reference: z.string().max(120).optional(),
  note: z.string().max(1000).optional()
});

const CreateChargeSchema = z.object({
  channel: z.enum(chargeChannels),
  note: z.string().max(1000).optional(),
  scheduledTo: z.coerce.date().optional(),
  sendNow: z.boolean().default(true),
  externalRef: z.string().max(200).optional()
});

const ChargeStatusSchema = z.object({
  status: z.enum(chargeStatuses),
  note: z.string().max(1000).optional()
});

const CancelInvoiceSchema = z.object({
  reason: z.string().max(1000).optional()
});

const parseInvoiceStatusFilter = (raw?: string) => {
  if (!raw) {
    return undefined;
  }

  const values = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is (typeof invoiceStatuses)[number] =>
      invoiceStatuses.includes(value as (typeof invoiceStatuses)[number])
    );

  return values.length ? (values as FinancialInvoiceStatus[]) : undefined;
};

const generateInvoiceCode = () => {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `INV-${date}-${random}`;
};

const computeTotals = (
  items: Array<z.infer<typeof InvoiceItemInputSchema>>,
  discount: number,
  penalties: number
) => {
  const normalized = items.map((item) => {
    const total = Number((item.quantity * item.unitPrice).toFixed(2));
    return {
      description: item.description,
      quantity: Number(item.quantity.toFixed(4)),
      unitPrice: Number(item.unitPrice.toFixed(2)),
      total
    };
  });

  const subtotal = Number(normalized.reduce((acc, item) => acc + item.total, 0).toFixed(2));
  const boundedDiscount = Math.min(discount, subtotal);
  const totalAmount = Number((subtotal - boundedDiscount + penalties).toFixed(2));

  return {
    normalized,
    subtotal,
    discount: Number(boundedDiscount.toFixed(2)),
    penalties: Number(penalties.toFixed(2)),
    totalAmount
  };
};

const resolveInvoiceStatus = (params: {
  currentStatus?: FinancialInvoiceStatus;
  dueDate: Date;
  paidAmount: number;
  balanceAmount: number;
  issuedAt?: Date | null;
  forceStatus?: FinancialInvoiceStatus;
}) => {
  if (params.forceStatus) {
    return params.forceStatus;
  }

  if (params.currentStatus === "CANCELED") {
    return "CANCELED" as FinancialInvoiceStatus;
  }

  if (params.balanceAmount <= 0) {
    return "PAID" as FinancialInvoiceStatus;
  }

  if (!params.issuedAt && params.currentStatus === "DRAFT") {
    return "DRAFT" as FinancialInvoiceStatus;
  }

  const now = new Date();
  if (params.dueDate.getTime() < now.getTime()) {
    return params.paidAmount > 0 ? "PARTIALLY_PAID" : "OVERDUE";
  }

  return params.paidAmount > 0 ? "PARTIALLY_PAID" : "ISSUED";
};

const invoiceInclude = {
  customer: {
    select: { id: true, name: true }
  },
  serviceOrder: {
    select: { id: true, code: true, title: true, status: true }
  },
  quote: {
    select: { id: true, code: true, status: true, total: true }
  },
  deskTicket: {
    select: { id: true, code: true, title: true, status: true }
  },
  createdBy: {
    select: { id: true, name: true, role: true }
  },
  items: {
    orderBy: { createdAt: "asc" as const }
  },
  payments: {
    orderBy: { paidAt: "desc" as const },
    include: {
      receivedBy: {
        select: { id: true, name: true, role: true }
      }
    }
  },
  charges: {
    orderBy: { createdAt: "desc" as const },
    include: {
      createdBy: {
        select: { id: true, name: true, role: true }
      }
    }
  }
} as const;

const ensureInvoiceReferences = async (params: {
  prisma: any;
  customerId?: string | null;
  serviceOrderId?: string | null;
  quoteId?: string | null;
  deskTicketId?: string | null;
}) => {
  const [customer, serviceOrder, quote, deskTicket] = await Promise.all([
    params.customerId
      ? params.prisma.customer.findUnique({
          where: { id: params.customerId },
          select: { id: true }
        })
      : Promise.resolve(null),
    params.serviceOrderId
      ? params.prisma.serviceOrder.findUnique({
          where: { id: params.serviceOrderId },
          select: { id: true, customerId: true, title: true }
        })
      : Promise.resolve(null),
    params.quoteId
      ? params.prisma.quote.findUnique({
          where: { id: params.quoteId },
          select: {
            id: true,
            customerId: true,
            serviceOrderId: true,
            items: {
              select: {
                description: true,
                quantity: true,
                unitPrice: true
              }
            }
          }
        })
      : Promise.resolve(null),
    params.deskTicketId
      ? params.prisma.deskTicket.findUnique({
          where: { id: params.deskTicketId },
          select: {
            id: true,
            customerId: true,
            serviceOrderId: true,
            quoteId: true,
            title: true
          }
        })
      : Promise.resolve(null)
  ]);

  if (params.customerId && !customer) {
    throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente nao encontrado");
  }

  if (params.serviceOrderId && !serviceOrder) {
    throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
  }

  if (params.quoteId && !quote) {
    throw new AppError(404, "QUOTE_NOT_FOUND", "Orcamento nao encontrado");
  }

  if (params.deskTicketId && !deskTicket) {
    throw new AppError(404, "DESK_TICKET_NOT_FOUND", "Ticket nao encontrado");
  }

  const derivedCustomerId =
    params.customerId ??
    serviceOrder?.customerId ??
    quote?.customerId ??
    deskTicket?.customerId ??
    null;

  if (!derivedCustomerId) {
    throw new AppError(
      400,
      "CUSTOMER_REQUIRED",
      "Informe cliente ou vincule fatura a OS/orcamento/ticket com cliente"
    );
  }

  return {
    customerId: derivedCustomerId,
    serviceOrder,
    quote,
    deskTicket
  };
};

export const financeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/options", async (request, reply) => {
    await requirePermission(request, reply, "finance.manage");

    const [customers, serviceOrders, quotes, deskTickets] = await Promise.all([
      fastify.prisma.customer.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true }
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
          total: true,
          customerId: true
        }
      }),
      fastify.prisma.deskTicket.findMany({
        where: {
          status: {
            in: ["OPEN", "TRIAGE", "IN_PROGRESS", "ON_HOLD", "RESOLVED"]
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
      })
    ]);

    return sendSuccess(reply, {
      statuses: invoiceStatuses,
      paymentMethods,
      chargeChannels,
      customers,
      serviceOrders,
      quotes,
      deskTickets
    });
  });

  fastify.get("/invoices", async (request, reply) => {
    await requirePermission(request, reply, "finance.manage");
    const query = InvoiceListQuerySchema.parse(request.query);
    const statusFilter = parseInvoiceStatusFilter(query.status);

    const invoices = await fastify.prisma.financialInvoice.findMany({
      where: {
        ...(statusFilter?.length ? { status: { in: statusFilter } } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: "insensitive" } },
                { description: { contains: query.search, mode: "insensitive" } },
                { customer: { name: { contains: query.search, mode: "insensitive" } } }
              ]
            }
          : {}),
        ...(query.dateFrom || query.dateTo
          ? {
              dueDate: {
                ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                ...(query.dateTo ? { lte: query.dateTo } : {})
              }
            }
          : {}),
        ...(query.overdueOnly
          ? {
              dueDate: { lt: new Date() },
              status: {
                notIn: ["PAID", "CANCELED"] as FinancialInvoiceStatus[]
              }
            }
          : {})
      },
      include: invoiceInclude,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }]
    });

    return sendSuccess(reply, invoices);
  });

  fastify.get<{ Params: { id: string } }>("/invoices/:id", async (request, reply) => {
    await requirePermission(request, reply, "finance.manage");

    const invoice = await fastify.prisma.financialInvoice.findUnique({
      where: { id: request.params.id },
      include: invoiceInclude
    });

    if (!invoice) {
      throw new AppError(404, "INVOICE_NOT_FOUND", "Fatura nao encontrada");
    }

    return sendSuccess(reply, invoice);
  });

  fastify.post("/invoices", async (request, reply) => {
    await requirePermission(request, reply, "finance.manage");
    const user = getRequestUser(request);
    const input = InvoiceCreateSchema.parse(request.body);

    const references = await ensureInvoiceReferences({
      prisma: fastify.prisma,
      customerId: input.customerId,
      serviceOrderId: input.serviceOrderId,
      quoteId: input.quoteId,
      deskTicketId: input.deskTicketId
    });

    const itemSource =
      input.items && input.items.length
        ? input.items
        : references.quote?.items.map((item: { description: string; quantity: number; unitPrice: number }) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice
          })) ?? [];

    if (!itemSource.length) {
      throw new AppError(400, "INVOICE_ITEMS_REQUIRED", "Informe ao menos um item da fatura");
    }

    const totals = computeTotals(itemSource, input.discount ?? 0, input.penalties ?? 0);
    const balanceAmount = totals.totalAmount;

    const created = await fastify.prisma.$transaction(async (tx) => {
      const invoice = await tx.financialInvoice.create({
        data: {
          code: generateInvoiceCode(),
          customerId: references.customerId,
          serviceOrderId: input.serviceOrderId,
          quoteId: input.quoteId,
          deskTicketId: input.deskTicketId,
          description: input.description,
          currency: input.currency.toUpperCase(),
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          discount: totals.discount,
          penalties: totals.penalties,
          subtotal: totals.subtotal,
          totalAmount: totals.totalAmount,
          balanceAmount,
          createdById: user.id,
          status: "DRAFT",
          items: {
            create: totals.normalized
          }
        },
        include: invoiceInclude
      });

      if (invoice.serviceOrderId) {
        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: invoice.serviceOrderId,
            actorId: user.id,
            type: "FINANCIAL_INVOICE_CREATED",
            payload: {
              invoiceId: invoice.id,
              invoiceCode: invoice.code,
              totalAmount: invoice.totalAmount
            }
          }
        });
      }

      if (invoice.deskTicketId) {
        await tx.deskTicketEvent.create({
          data: {
            deskTicketId: invoice.deskTicketId,
            actorId: user.id,
            type: "FINANCIAL_INVOICE_CREATED",
            payload: {
              invoiceId: invoice.id,
              invoiceCode: invoice.code
            }
          }
        });
      }

      return invoice;
    });

    return sendSuccess(reply, created);
  });

  fastify.patch<{ Params: { id: string } }>("/invoices/:id", async (request, reply) => {
    await requirePermission(request, reply, "finance.manage");
    const input = InvoiceUpdateSchema.parse(request.body);
    const user = getRequestUser(request);

    const current = await fastify.prisma.financialInvoice.findUnique({
      where: { id: request.params.id },
      include: {
        items: true
      }
    });

    if (!current) {
      throw new AppError(404, "INVOICE_NOT_FOUND", "Fatura nao encontrada");
    }

    if (current.status === "PAID" || current.status === "CANCELED") {
      throw new AppError(409, "INVALID_STATUS", "Fatura encerrada nao pode ser editada");
    }

    const references = await ensureInvoiceReferences({
      prisma: fastify.prisma,
      customerId: input.customerId ?? current.customerId,
      serviceOrderId: input.serviceOrderId !== undefined ? input.serviceOrderId : current.serviceOrderId,
      quoteId: input.quoteId !== undefined ? input.quoteId : current.quoteId,
      deskTicketId: input.deskTicketId !== undefined ? input.deskTicketId : current.deskTicketId
    });

    const nextItems = input.items
      ? input.items
      : current.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice
        }));

    const totals = computeTotals(
      nextItems,
      input.discount ?? current.discount,
      input.penalties ?? current.penalties
    );
    const paidAmount = Number((current.paidAmount ?? 0).toFixed(2));
    const balanceAmount = Number(Math.max(totals.totalAmount - paidAmount, 0).toFixed(2));
    const dueDate = input.dueDate ?? current.dueDate;

    const nextStatus = resolveInvoiceStatus({
      currentStatus: current.status,
      dueDate,
      paidAmount,
      balanceAmount,
      issuedAt: input.issueDate === undefined ? current.issuedAt : input.issueDate,
      forceStatus: input.status as FinancialInvoiceStatus | undefined
    });

    const updated = await fastify.prisma.$transaction(async (tx) => {
      if (input.items) {
        await tx.financialInvoiceItem.deleteMany({
          where: {
            invoiceId: current.id
          }
        });
      }

      const invoice = await tx.financialInvoice.update({
        where: { id: current.id },
        data: {
          customerId: references.customerId,
          ...(input.serviceOrderId !== undefined ? { serviceOrderId: input.serviceOrderId } : {}),
          ...(input.quoteId !== undefined ? { quoteId: input.quoteId } : {}),
          ...(input.deskTicketId !== undefined ? { deskTicketId: input.deskTicketId } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.currency !== undefined ? { currency: input.currency.toUpperCase() } : {}),
          ...(input.issueDate !== undefined ? { issueDate: input.issueDate } : {}),
          ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
          subtotal: totals.subtotal,
          discount: totals.discount,
          penalties: totals.penalties,
          totalAmount: totals.totalAmount,
          balanceAmount,
          status: nextStatus,
          ...(input.items
            ? {
                items: {
                  create: totals.normalized
                }
              }
            : {})
        },
        include: invoiceInclude
      });

      if (invoice.serviceOrderId) {
        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: invoice.serviceOrderId,
            actorId: user.id,
            type: "FINANCIAL_INVOICE_UPDATED",
            payload: {
              invoiceId: invoice.id,
              invoiceCode: invoice.code,
              status: invoice.status
            }
          }
        });
      }

      return invoice;
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/invoices/:id/issue", async (request, reply) => {
    await requirePermission(request, reply, "finance.manage");
    const user = getRequestUser(request);
    const input = InvoiceIssueSchema.parse(request.body);

    const current = await fastify.prisma.financialInvoice.findUnique({
      where: { id: request.params.id }
    });

    if (!current) {
      throw new AppError(404, "INVOICE_NOT_FOUND", "Fatura nao encontrada");
    }

    if (current.status === "PAID" || current.status === "CANCELED") {
      throw new AppError(409, "INVALID_STATUS", "Fatura encerrada nao pode ser emitida");
    }

    const issueDate = input.issueDate ?? new Date();
    const status = resolveInvoiceStatus({
      currentStatus: current.status,
      dueDate: current.dueDate,
      paidAmount: current.paidAmount,
      balanceAmount: current.balanceAmount,
      issuedAt: issueDate
    });

    const issued = await fastify.prisma.$transaction(async (tx) => {
      const invoice = await tx.financialInvoice.update({
        where: { id: current.id },
        data: {
          issueDate,
          issuedAt: issueDate,
          status
        },
        include: invoiceInclude
      });

      if (invoice.serviceOrderId) {
        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: invoice.serviceOrderId,
            actorId: user.id,
            type: "FINANCIAL_INVOICE_ISSUED",
            payload: {
              invoiceId: invoice.id,
              invoiceCode: invoice.code
            }
          }
        });
      }

      return invoice;
    });

    return sendSuccess(reply, issued);
  });

  fastify.post<{ Params: { id: string } }>("/invoices/:id/register-payment", async (request, reply) => {
    await requirePermission(request, reply, "finance.manage");
    const user = getRequestUser(request);
    const input = RegisterPaymentSchema.parse(request.body);

    const current = await fastify.prisma.financialInvoice.findUnique({
      where: { id: request.params.id }
    });

    if (!current) {
      throw new AppError(404, "INVOICE_NOT_FOUND", "Fatura nao encontrada");
    }

    if (current.status === "CANCELED") {
      throw new AppError(409, "INVALID_STATUS", "Fatura cancelada nao aceita pagamento");
    }

    if (input.amount > current.balanceAmount) {
      throw new AppError(409, "INVALID_AMOUNT", "Pagamento nao pode ser maior que saldo em aberto");
    }

    const paidAmount = Number((current.paidAmount + input.amount).toFixed(2));
    const balanceAmount = Number(Math.max(current.totalAmount - paidAmount, 0).toFixed(2));
    const nextStatus = resolveInvoiceStatus({
      currentStatus: current.status,
      dueDate: current.dueDate,
      paidAmount,
      balanceAmount,
      issuedAt: current.issuedAt ?? new Date()
    });

    const updated = await fastify.prisma.$transaction(async (tx) => {
      await tx.financialPayment.create({
        data: {
          invoiceId: current.id,
          method: input.method as FinancialPaymentMethod,
          amount: Number(input.amount.toFixed(2)),
          paidAt: input.paidAt ?? new Date(),
          reference: input.reference,
          note: input.note,
          receivedById: user.id
        }
      });

      const invoice = await tx.financialInvoice.update({
        where: { id: current.id },
        data: {
          paidAmount,
          balanceAmount,
          status: nextStatus,
          paidAt: balanceAmount === 0 ? input.paidAt ?? new Date() : null
        },
        include: invoiceInclude
      });

      if (invoice.serviceOrderId) {
        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: invoice.serviceOrderId,
            actorId: user.id,
            type: "FINANCIAL_PAYMENT_REGISTERED",
            payload: {
              invoiceId: invoice.id,
              invoiceCode: invoice.code,
              amount: input.amount,
              balanceAmount: invoice.balanceAmount
            }
          }
        });
      }

      if (invoice.deskTicketId) {
        await tx.deskTicketEvent.create({
          data: {
            deskTicketId: invoice.deskTicketId,
            actorId: user.id,
            type: "FINANCIAL_PAYMENT_REGISTERED",
            payload: {
              invoiceId: invoice.id,
              amount: input.amount
            }
          }
        });
      }

      return invoice;
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/invoices/:id/charges", async (request, reply) => {
    await requirePermission(request, reply, "finance.manage");
    const input = CreateChargeSchema.parse(request.body);
    const user = getRequestUser(request);

    const invoice = await fastify.prisma.financialInvoice.findUnique({
      where: { id: request.params.id }
    });

    if (!invoice) {
      throw new AppError(404, "INVOICE_NOT_FOUND", "Fatura nao encontrada");
    }

    if (invoice.status === "DRAFT") {
      throw new AppError(409, "INVALID_STATUS", "Fatura em rascunho nao deve entrar na cobranca");
    }

    if (invoice.status === "PAID" || invoice.status === "CANCELED") {
      throw new AppError(409, "INVALID_STATUS", "Fatura encerrada nao aceita nova cobranca");
    }

    const status = input.sendNow ? FinancialChargeStatus.SENT : FinancialChargeStatus.SCHEDULED;
    const now = new Date();
    const charge = await fastify.prisma.financialCharge.create({
      data: {
        invoiceId: invoice.id,
        channel: input.channel as FinancialChargeChannel,
        status,
        note: input.note,
        externalRef: input.externalRef,
        createdById: user.id,
        scheduledTo: input.scheduledTo,
        sentAt: input.sendNow ? now : null
      },
      include: {
        createdBy: {
          select: { id: true, name: true, role: true }
        }
      }
    });

    if (invoice.serviceOrderId) {
      await fastify.prisma.serviceOrderEvent.create({
        data: {
          serviceOrderId: invoice.serviceOrderId,
          actorId: user.id,
          type: "FINANCIAL_COLLECTION_TRIGGERED",
          payload: {
            invoiceId: invoice.id,
            channel: charge.channel,
            chargeId: charge.id
          }
        }
      });
    }

    return sendSuccess(reply, charge);
  });

  fastify.post<{ Params: { id: string } }>("/charges/:id/status", async (request, reply) => {
    await requirePermission(request, reply, "finance.manage");
    const input = ChargeStatusSchema.parse(request.body);

    const charge = await fastify.prisma.financialCharge.findUnique({
      where: { id: request.params.id }
    });

    if (!charge) {
      throw new AppError(404, "CHARGE_NOT_FOUND", "Cobranca nao encontrada");
    }

    const now = new Date();
    const updated = await fastify.prisma.financialCharge.update({
      where: { id: charge.id },
      data: {
        status: input.status as FinancialChargeStatus,
        note: input.note ?? charge.note,
        sentAt: input.status === "SENT" && !charge.sentAt ? now : charge.sentAt,
        viewedAt: input.status === "VIEWED" && !charge.viewedAt ? now : charge.viewedAt,
        resolvedAt:
          input.status === "PAID" || input.status === "CANCELED" ? now : charge.resolvedAt
      },
      include: {
        invoice: {
          select: {
            id: true,
            code: true,
            status: true,
            balanceAmount: true
          }
        },
        createdBy: {
          select: { id: true, name: true, role: true }
        }
      }
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/invoices/:id/cancel", async (request, reply) => {
    await requirePermission(request, reply, "finance.manage");
    const input = CancelInvoiceSchema.parse(request.body);
    const user = getRequestUser(request);

    const current = await fastify.prisma.financialInvoice.findUnique({
      where: { id: request.params.id }
    });

    if (!current) {
      throw new AppError(404, "INVOICE_NOT_FOUND", "Fatura nao encontrada");
    }

    if (current.paidAmount > 0) {
      throw new AppError(409, "INVOICE_HAS_PAYMENTS", "Fatura com pagamento nao pode ser cancelada");
    }

    const canceled = await fastify.prisma.$transaction(async (tx) => {
      const invoice = await tx.financialInvoice.update({
        where: { id: current.id },
        data: {
          status: "CANCELED",
          cancelledAt: new Date()
        },
        include: invoiceInclude
      });

      if (invoice.serviceOrderId) {
        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: invoice.serviceOrderId,
            actorId: user.id,
            type: "FINANCIAL_INVOICE_CANCELED",
            note: input.reason,
            payload: {
              invoiceId: invoice.id,
              invoiceCode: invoice.code
            }
          }
        });
      }

      return invoice;
    });

    return sendSuccess(reply, canceled);
  });

  fastify.get("/summary", async (request, reply) => {
    await requirePermission(request, reply, "finance.manage");

    const now = new Date();
    const [statusRows, totals, overdueCount, paymentTotals] = await Promise.all([
      fastify.prisma.financialInvoice.groupBy({
        by: ["status"],
        _count: {
          _all: true
        }
      }),
      fastify.prisma.financialInvoice.aggregate({
        _sum: {
          totalAmount: true,
          paidAmount: true,
          balanceAmount: true
        },
        _count: {
          _all: true
        }
      }),
      fastify.prisma.financialInvoice.count({
        where: {
          dueDate: {
            lt: now
          },
          status: {
            notIn: ["PAID", "CANCELED"]
          }
        }
      }),
      fastify.prisma.financialPayment.aggregate({
        _sum: {
          amount: true
        },
        _count: {
          _all: true
        }
      })
    ]);

    const map = statusRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {});

    return sendSuccess(reply, {
      totalInvoices: totals._count._all,
      overdue: overdueCount,
      byStatus: {
        draft: map.DRAFT ?? 0,
        issued: map.ISSUED ?? 0,
        partiallyPaid: map.PARTIALLY_PAID ?? 0,
        paid: map.PAID ?? 0,
        overdue: map.OVERDUE ?? 0,
        canceled: map.CANCELED ?? 0
      },
      amounts: {
        total: Number((totals._sum.totalAmount ?? 0).toFixed(2)),
        paid: Number((totals._sum.paidAmount ?? 0).toFixed(2)),
        open: Number((totals._sum.balanceAmount ?? 0).toFixed(2)),
        received: Number((paymentTotals._sum.amount ?? 0).toFixed(2))
      },
      payments: {
        entries: paymentTotals._count._all
      }
    });
  });
};
