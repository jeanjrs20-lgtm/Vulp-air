import type { FastifyPluginAsync } from "fastify";
import { SatisfactionChannel } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../lib/app-error.js";
import { getRequestUser, sendSuccess } from "../../lib/envelope.js";
import { requirePermission } from "../../lib/authz.js";

const feedbackChannels = ["APP", "WHATSAPP", "EMAIL", "PHONE"] as const;
const managerRoles = new Set(["SUPERADMIN", "ADMIN", "SUPERVISOR"]);

const FeedbackCreateSchema = z
  .object({
    serviceOrderId: z.string(),
    customerId: z.string().optional(),
    scoreNps: z.number().int().min(0).max(10).optional(),
    scoreCsat: z.number().int().min(1).max(5).optional(),
    comment: z.string().max(2000).optional(),
    channel: z.enum(feedbackChannels).default("APP")
  })
  .refine((input) => input.scoreNps !== undefined || input.scoreCsat !== undefined || !!input.comment, {
    message: "Informe ao menos NPS, CSAT ou comentario"
  });

const FeedbackListQuerySchema = z.object({
  serviceOrderId: z.string().optional(),
  customerId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  minNps: z.coerce.number().int().min(0).max(10).optional(),
  maxNps: z.coerce.number().int().min(0).max(10).optional()
});

const FeedbackSummaryQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  technicianId: z.string().optional()
});

const feedbackInclude = {
  customer: {
    select: { id: true, name: true }
  },
  serviceOrder: {
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      assignedTechnicianId: true,
      assignedTechnician: {
        select: { id: true, name: true }
      },
      customer: {
        select: { id: true, name: true }
      }
    }
  }
} as const;

export const feedbackRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    await requirePermission(request, reply, "feedback.manage");
    const user = getRequestUser(request);
    const query = FeedbackListQuerySchema.parse(request.query);

    const feedbacks = await fastify.prisma.customerFeedback.findMany({
      where: {
        ...(query.serviceOrderId ? { serviceOrderId: query.serviceOrderId } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.minNps !== undefined || query.maxNps !== undefined
          ? {
              scoreNps: {
                ...(query.minNps !== undefined ? { gte: query.minNps } : {}),
                ...(query.maxNps !== undefined ? { lte: query.maxNps } : {})
              }
            }
          : {}),
        ...(query.dateFrom || query.dateTo
          ? {
              submittedAt: {
                ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                ...(query.dateTo ? { lte: query.dateTo } : {})
              }
            }
          : {}),
        ...(!managerRoles.has(user.role)
          ? {
              serviceOrder: {
                assignedTechnicianId: user.id
              }
            }
          : {})
      },
      orderBy: { submittedAt: "desc" },
      include: feedbackInclude
    });

    return sendSuccess(reply, feedbacks);
  });

  fastify.post("/", async (request, reply) => {
    await requirePermission(request, reply, "feedback.manage");
    const user = getRequestUser(request);
    const input = FeedbackCreateSchema.parse(request.body);

    const order = await fastify.prisma.serviceOrder.findUnique({
      where: { id: input.serviceOrderId },
      select: {
        id: true,
        status: true,
        customerId: true,
        assignedTechnicianId: true
      }
    });

    if (!order) {
      throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
    }

    if (!managerRoles.has(user.role) && order.assignedTechnicianId !== user.id) {
      throw new AppError(403, "FORBIDDEN", "Sem permissao para registrar satisfacao desta OS");
    }

    if (order.status !== "COMPLETED") {
      throw new AppError(
        409,
        "INVALID_STATUS",
        "Satisfacao so pode ser registrada para ordem concluida"
      );
    }

    const customerId = input.customerId ?? order.customerId ?? undefined;

    if (customerId) {
      const customer = await fastify.prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true }
      });

      if (!customer) {
        throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente nao encontrado");
      }
    }

    const feedback = await fastify.prisma.$transaction(async (tx) => {
      const created = await tx.customerFeedback.upsert({
        where: { serviceOrderId: order.id },
        update: {
          customerId,
          scoreNps: input.scoreNps,
          scoreCsat: input.scoreCsat,
          comment: input.comment,
          channel: input.channel as SatisfactionChannel,
          submittedAt: new Date()
        },
        create: {
          serviceOrderId: order.id,
          customerId,
          scoreNps: input.scoreNps,
          scoreCsat: input.scoreCsat,
          comment: input.comment,
          channel: input.channel as SatisfactionChannel,
          submittedAt: new Date()
        },
        include: feedbackInclude
      });

      await tx.serviceOrderEvent.create({
        data: {
          serviceOrderId: order.id,
          actorId: user.id,
          type: "CUSTOMER_FEEDBACK_RECORDED",
          payload: {
            feedbackId: created.id,
            scoreNps: created.scoreNps,
            scoreCsat: created.scoreCsat,
            channel: created.channel
          }
        }
      });

      return created;
    });

    return sendSuccess(reply, feedback);
  });

  fastify.get("/summary", async (request, reply) => {
    await requirePermission(request, reply, "feedback.manage");
    const user = getRequestUser(request);
    const query = FeedbackSummaryQuerySchema.parse(request.query);

    const where = {
      ...(query.dateFrom || query.dateTo
        ? {
            submittedAt: {
              ...(query.dateFrom ? { gte: query.dateFrom } : {}),
              ...(query.dateTo ? { lte: query.dateTo } : {})
            }
          }
        : {}),
      ...(query.technicianId
        ? {
            serviceOrder: {
              assignedTechnicianId: query.technicianId
            }
          }
        : {}),
      ...(!managerRoles.has(user.role)
        ? {
            serviceOrder: {
              assignedTechnicianId: user.id
            }
          }
        : {})
    };

    const [aggregate, distribution] = await Promise.all([
      fastify.prisma.customerFeedback.aggregate({
        where,
        _avg: {
          scoreNps: true,
          scoreCsat: true
        },
        _count: {
          _all: true
        }
      }),
      fastify.prisma.customerFeedback.groupBy({
        by: ["scoreNps"],
        where,
        _count: {
          _all: true
        },
        orderBy: {
          scoreNps: "asc"
        }
      })
    ]);

    const classified = distribution.reduce(
      (acc, item) => {
        if (item.scoreNps === null || item.scoreNps === undefined) {
          return acc;
        }

        if (item.scoreNps >= 9) {
          acc.promoters += item._count._all;
        } else if (item.scoreNps >= 7) {
          acc.passives += item._count._all;
        } else {
          acc.detractors += item._count._all;
        }

        return acc;
      },
      { promoters: 0, passives: 0, detractors: 0 }
    );

    const npsBase = classified.promoters + classified.passives + classified.detractors;
    const npsScore = npsBase
      ? Number((((classified.promoters - classified.detractors) / npsBase) * 100).toFixed(2))
      : 0;

    return sendSuccess(reply, {
      totals: {
        feedbacks: aggregate._count._all,
        avgNps: Number((aggregate._avg.scoreNps ?? 0).toFixed(2)),
        avgCsat: Number((aggregate._avg.scoreCsat ?? 0).toFixed(2)),
        npsScore,
        ...classified
      },
      distribution: distribution.map((entry) => ({
        scoreNps: entry.scoreNps,
        total: entry._count._all
      }))
    });
  });
};
