import type { FastifyPluginAsync } from "fastify";
import { ExpenseStatus, ExpenseType } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../lib/app-error.js";
import { getRequestUser, sendSuccess } from "../../lib/envelope.js";
import { requirePermission } from "../../lib/authz.js";

const managerRoles = new Set(["SUPERADMIN", "ADMIN", "SUPERVISOR"]);

const expenseTypes = ["FUEL", "TOLL", "PARKING", "MEAL", "LODGING", "OTHER"] as const;
const expenseStatuses = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const;

const ExpenseCreateSchema = z.object({
  serviceOrderId: z.string().optional(),
  technicianId: z.string().optional(),
  type: z.enum(expenseTypes),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3).default("BRL"),
  distanceKm: z.number().min(0).optional(),
  expenseDate: z.coerce.date().optional(),
  description: z.string().max(1000).optional(),
  receiptAssetId: z.string().optional(),
  status: z.enum(expenseStatuses).optional()
});

const ExpenseUpdateSchema = z.object({
  serviceOrderId: z.string().nullable().optional(),
  type: z.enum(expenseTypes).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().min(3).max(3).optional(),
  distanceKm: z.number().min(0).nullable().optional(),
  expenseDate: z.coerce.date().optional(),
  description: z.string().max(1000).nullable().optional(),
  receiptAssetId: z.string().nullable().optional(),
  status: z.enum(expenseStatuses).optional()
});

const ExpenseListQuerySchema = z.object({
  status: z.enum(expenseStatuses).optional(),
  technicianId: z.string().optional(),
  serviceOrderId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  type: z.enum(expenseTypes).optional()
});

const ExpenseSubmitSchema = z.object({
  note: z.string().max(1000).optional()
});

const ExpenseApproveSchema = z.object({
  approved: z.boolean(),
  note: z.string().max(1000).optional()
});

const KmSummaryQuerySchema = z.object({
  technicianId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional()
});

const expenseInclude = {
  technician: {
    select: { id: true, name: true, email: true, team: true }
  },
  approvedBy: {
    select: { id: true, name: true, role: true }
  },
  serviceOrder: {
    select: {
      id: true,
      code: true,
      title: true,
      status: true
    }
  },
  receiptAsset: {
    select: {
      id: true,
      storageKey: true,
      mimeType: true,
      createdAt: true
    }
  }
} as const;

const ensureReferences = async (params: {
  prisma: any;
  serviceOrderId?: string | null;
  receiptAssetId?: string | null;
  technicianId?: string;
}) => {
  if (params.technicianId) {
    const technician = await params.prisma.user.findFirst({
      where: {
        id: params.technicianId,
        role: "TECNICO"
      },
      select: { id: true }
    });

    if (!technician) {
      throw new AppError(400, "INVALID_TECHNICIAN", "Tecnico informado nao existe");
    }
  }

  if (params.serviceOrderId) {
    const order = await params.prisma.serviceOrder.findUnique({
      where: { id: params.serviceOrderId },
      select: { id: true }
    });

    if (!order) {
      throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
    }
  }

  if (params.receiptAssetId) {
    const media = await params.prisma.mediaAsset.findUnique({
      where: { id: params.receiptAssetId },
      select: { id: true }
    });

    if (!media) {
      throw new AppError(404, "RECEIPT_NOT_FOUND", "Comprovante nao encontrado");
    }
  }
};

const canEditExpense = (params: {
  role: string;
  userId: string;
  technicianId: string;
  status: ExpenseStatus;
}) => {
  if (managerRoles.has(params.role)) {
    return true;
  }

  return (
    params.role === "TECNICO" &&
    params.userId === params.technicianId &&
    (params.status === "DRAFT" || params.status === "REJECTED")
  );
};

export const expenseRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    await requirePermission(request, reply, "expense.manage");
    const user = getRequestUser(request);
    const query = ExpenseListQuerySchema.parse(request.query);

    const expenses = await fastify.prisma.expenseEntry.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.technicianId ? { technicianId: query.technicianId } : {}),
        ...(query.serviceOrderId ? { serviceOrderId: query.serviceOrderId } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.dateFrom || query.dateTo
          ? {
              expenseDate: {
                ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                ...(query.dateTo ? { lte: query.dateTo } : {})
              }
            }
          : {}),
        ...(!managerRoles.has(user.role) ? { technicianId: user.id } : {})
      },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      include: expenseInclude
    });

    return sendSuccess(reply, expenses);
  });

  fastify.post("/", async (request, reply) => {
    await requirePermission(request, reply, "expense.manage");
    const user = getRequestUser(request);
    const input = ExpenseCreateSchema.parse(request.body);

    const serviceOrder =
      input.serviceOrderId && user.role !== "TECNICO"
        ? await fastify.prisma.serviceOrder.findUnique({
            where: { id: input.serviceOrderId },
            select: { id: true, assignedTechnicianId: true }
          })
        : null;

    const technicianId =
      user.role === "TECNICO"
        ? user.id
        : input.technicianId ?? serviceOrder?.assignedTechnicianId ?? null;

    if (!technicianId) {
      throw new AppError(
        400,
        "TECHNICIAN_REQUIRED",
        "Informe um tecnico para registrar a despesa"
      );
    }

    const requestedStatus =
      user.role === "TECNICO" ? ExpenseStatus.DRAFT : input.status ?? ExpenseStatus.DRAFT;

    if (!managerRoles.has(user.role) && requestedStatus !== "DRAFT") {
      throw new AppError(403, "FORBIDDEN", "Tecnico so pode criar despesas em rascunho");
    }

    await ensureReferences({
      prisma: fastify.prisma,
      serviceOrderId: input.serviceOrderId,
      receiptAssetId: input.receiptAssetId,
      technicianId
    });

    const created = await fastify.prisma.$transaction(async (tx) => {
      const expense = await tx.expenseEntry.create({
        data: {
          serviceOrderId: input.serviceOrderId,
          technicianId,
          type: input.type as ExpenseType,
          amount: Number(input.amount.toFixed(2)),
          currency: input.currency.toUpperCase(),
          distanceKm: input.distanceKm,
          expenseDate: input.expenseDate ?? new Date(),
          description: input.description,
          receiptAssetId: input.receiptAssetId,
          status: requestedStatus
        },
        include: expenseInclude
      });

      if (expense.serviceOrderId) {
        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: expense.serviceOrderId,
            actorId: user.id,
            type: "EXPENSE_CREATED",
            payload: {
              expenseId: expense.id,
              type: expense.type,
              amount: expense.amount,
              distanceKm: expense.distanceKm
            }
          }
        });
      }

      return expense;
    });

    return sendSuccess(reply, created);
  });

  fastify.patch<{ Params: { id: string } }>("/:id", async (request, reply) => {
    await requirePermission(request, reply, "expense.manage");
    const user = getRequestUser(request);
    const input = ExpenseUpdateSchema.parse(request.body);

    const expense = await fastify.prisma.expenseEntry.findUnique({
      where: { id: request.params.id }
    });

    if (!expense) {
      throw new AppError(404, "EXPENSE_NOT_FOUND", "Despesa nao encontrada");
    }

    if (!canEditExpense({
      role: user.role,
      userId: user.id,
      technicianId: expense.technicianId,
      status: expense.status
    })) {
      throw new AppError(403, "FORBIDDEN", "Sem permissao para editar esta despesa");
    }

    await ensureReferences({
      prisma: fastify.prisma,
      serviceOrderId: input.serviceOrderId,
      receiptAssetId: input.receiptAssetId
    });

    if (expense.status === "APPROVED") {
      throw new AppError(409, "INVALID_STATUS", "Despesa aprovada nao pode ser alterada");
    }

    const updated = await fastify.prisma.expenseEntry.update({
      where: { id: expense.id },
      data: {
        ...(input.serviceOrderId !== undefined ? { serviceOrderId: input.serviceOrderId } : {}),
        ...(input.type !== undefined ? { type: input.type as ExpenseType } : {}),
        ...(input.amount !== undefined ? { amount: Number(input.amount.toFixed(2)) } : {}),
        ...(input.currency !== undefined ? { currency: input.currency.toUpperCase() } : {}),
        ...(input.distanceKm !== undefined ? { distanceKm: input.distanceKm } : {}),
        ...(input.expenseDate !== undefined ? { expenseDate: input.expenseDate } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.receiptAssetId !== undefined ? { receiptAssetId: input.receiptAssetId } : {}),
        ...(input.status !== undefined && managerRoles.has(user.role)
          ? { status: input.status as ExpenseStatus }
          : {})
      },
      include: expenseInclude
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/:id/submit", async (request, reply) => {
    await requirePermission(request, reply, "expense.manage");
    const user = getRequestUser(request);
    const input = ExpenseSubmitSchema.parse(request.body);

    const expense = await fastify.prisma.expenseEntry.findUnique({
      where: { id: request.params.id }
    });

    if (!expense) {
      throw new AppError(404, "EXPENSE_NOT_FOUND", "Despesa nao encontrada");
    }

    if (!managerRoles.has(user.role) && expense.technicianId !== user.id) {
      throw new AppError(403, "FORBIDDEN", "Sem permissao para submeter esta despesa");
    }

    if (!["DRAFT", "REJECTED"].includes(expense.status)) {
      throw new AppError(409, "INVALID_STATUS", "Somente rascunho/rejeitada pode ser submetida");
    }

    const submitted = await fastify.prisma.$transaction(async (tx) => {
      const next = await tx.expenseEntry.update({
        where: { id: expense.id },
        data: { status: "SUBMITTED" },
        include: expenseInclude
      });

      if (next.serviceOrderId) {
        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: next.serviceOrderId,
            actorId: user.id,
            type: "EXPENSE_SUBMITTED",
            note: input.note,
            payload: {
              expenseId: next.id,
              amount: next.amount,
              type: next.type
            }
          }
        });
      }

      return next;
    });

    return sendSuccess(reply, submitted);
  });

  fastify.post<{ Params: { id: string } }>("/:id/approve", async (request, reply) => {
    await requirePermission(request, reply, "expense.manage");
    const user = getRequestUser(request);
    const input = ExpenseApproveSchema.parse(request.body);

    if (!managerRoles.has(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem aprovar despesas");
    }

    const expense = await fastify.prisma.expenseEntry.findUnique({
      where: { id: request.params.id }
    });

    if (!expense) {
      throw new AppError(404, "EXPENSE_NOT_FOUND", "Despesa nao encontrada");
    }

    if (expense.status !== "SUBMITTED") {
      throw new AppError(409, "INVALID_STATUS", "Apenas despesas submetidas podem ser avaliadas");
    }

    const status = input.approved ? ExpenseStatus.APPROVED : ExpenseStatus.REJECTED;

    const reviewed = await fastify.prisma.$transaction(async (tx) => {
      const next = await tx.expenseEntry.update({
        where: { id: expense.id },
        data: {
          status,
          approvedById: user.id,
          approvedAt: new Date()
        },
        include: expenseInclude
      });

      if (next.serviceOrderId) {
        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: next.serviceOrderId,
            actorId: user.id,
            type: input.approved ? "EXPENSE_APPROVED" : "EXPENSE_REJECTED",
            note: input.note,
            payload: {
              expenseId: next.id,
              amount: next.amount,
              type: next.type
            }
          }
        });
      }

      return next;
    });

    return sendSuccess(reply, reviewed);
  });

  fastify.get("/km-summary", async (request, reply) => {
    await requirePermission(request, reply, "expense.manage");
    const user = getRequestUser(request);
    const query = KmSummaryQuerySchema.parse(request.query);

    const where = {
      ...(query.technicianId ? { technicianId: query.technicianId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            expenseDate: {
              ...(query.dateFrom ? { gte: query.dateFrom } : {}),
              ...(query.dateTo ? { lte: query.dateTo } : {})
            }
          }
        : {}),
      status: {
        in: ["SUBMITTED", "APPROVED"] as ExpenseStatus[]
      },
      ...(!managerRoles.has(user.role) ? { technicianId: user.id } : {})
    };

    const [aggregate, byType] = await Promise.all([
      fastify.prisma.expenseEntry.aggregate({
        where,
        _sum: {
          amount: true,
          distanceKm: true
        },
        _count: {
          _all: true
        }
      }),
      fastify.prisma.expenseEntry.groupBy({
        by: ["type"],
        where,
        _sum: {
          amount: true,
          distanceKm: true
        },
        _count: {
          _all: true
        },
        orderBy: {
          _sum: {
            amount: "desc"
          }
        }
      })
    ]);

    return sendSuccess(reply, {
      totals: {
        totalAmount: Number((aggregate._sum.amount ?? 0).toFixed(2)),
        totalKm: Number((aggregate._sum.distanceKm ?? 0).toFixed(2)),
        entries: aggregate._count._all
      },
      byType: byType.map((entry) => ({
        type: entry.type,
        totalAmount: Number((entry._sum.amount ?? 0).toFixed(2)),
        totalKm: Number((entry._sum.distanceKm ?? 0).toFixed(2)),
        entries: entry._count._all
      }))
    });
  });
};
