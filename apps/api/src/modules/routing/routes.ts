import type { FastifyPluginAsync } from "fastify";
import { Prisma, RoutePlanStatus, RouteStopStatus, ServiceOrderStatus } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../lib/app-error.js";
import { getRequestUser, sendSuccess } from "../../lib/envelope.js";
import { requirePermission } from "../../lib/authz.js";

const managerRoles = new Set(["SUPERADMIN", "ADMIN", "SUPERVISOR"]);

const routeStatuses = ["PLANNED", "OPTIMIZED", "PUBLISHED", "EXECUTED"] as const;
const routeStopStatuses = ["PLANNED", "STARTED", "COMPLETED", "SKIPPED"] as const;

const RoutePlanCreateSchema = z.object({
  name: z.string().min(3),
  planDate: z.coerce.date(),
  assignedTechnicianId: z.string().optional(),
  notes: z.string().max(2000).optional(),
  stopServiceOrderIds: z.array(z.string()).default([])
});

const RoutePlanUpdateSchema = z.object({
  name: z.string().min(3).optional(),
  planDate: z.coerce.date().optional(),
  assignedTechnicianId: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  status: z.enum(routeStatuses).optional()
});

const RoutePlanQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  assignedTechnicianId: z.string().optional(),
  status: z.enum(routeStatuses).optional()
});

const RouteStopCreateSchema = z.object({
  serviceOrderId: z.string(),
  sequence: z.number().int().min(1).optional(),
  etaStart: z.coerce.date().optional(),
  etaEnd: z.coerce.date().optional(),
  distanceKmFromPrev: z.number().min(0).optional(),
  travelMinutesFromPrev: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional()
});

const RouteStopUpdateSchema = z.object({
  sequence: z.number().int().min(1).optional(),
  etaStart: z.coerce.date().nullable().optional(),
  etaEnd: z.coerce.date().nullable().optional(),
  actualStart: z.coerce.date().nullable().optional(),
  actualEnd: z.coerce.date().nullable().optional(),
  distanceKmFromPrev: z.number().min(0).nullable().optional(),
  travelMinutesFromPrev: z.number().int().min(0).nullable().optional(),
  status: z.enum(routeStopStatuses).optional(),
  notes: z.string().max(1000).nullable().optional()
});

const RouteResequenceSchema = z.object({
  stops: z.array(
    z.object({
      id: z.string(),
      sequence: z.number().int().min(1),
      etaStart: z.coerce.date().optional(),
      etaEnd: z.coerce.date().optional()
    })
  )
});

const routePlanInclude = {
  createdBy: { select: { id: true, name: true, role: true } },
  assignedTechnician: { select: { id: true, name: true, email: true } },
  stops: {
    orderBy: { sequence: "asc" as const },
    include: {
      serviceOrder: {
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          serviceDate: true,
          scheduledStartAt: true,
          scheduledEndAt: true,
          priority: true,
          assignedTechnician: {
            select: { id: true, name: true }
          },
          customer: {
            select: { id: true, name: true }
          },
          siteLocation: {
            select: { id: true, name: true, address: true }
          }
        }
      }
    }
  }
} as const;

const toPlanDayStart = (date: Date) => {
  const next = new Date(date);
  next.setHours(8, 0, 0, 0);
  return next;
};

const ensureTechnicianIfProvided = async (
  prisma: any,
  assignedTechnicianId?: string | null
) => {
  if (!assignedTechnicianId) {
    return;
  }

  const technician = await prisma.user.findFirst({
    where: {
      id: assignedTechnicianId,
      role: "TECNICO"
    },
    select: { id: true }
  });

  if (!technician) {
    throw new AppError(400, "INVALID_TECHNICIAN", "Tecnico informado nao existe");
  }
};

const ensureServiceOrderForStop = async (prisma: any, serviceOrderId: string) => {
  const order = await prisma.serviceOrder.findUnique({
    where: { id: serviceOrderId },
    select: {
      id: true,
      status: true,
      assignedTechnicianId: true,
      serviceDate: true,
      scheduledStartAt: true,
      priority: true
    }
  });

  if (!order) {
    throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
  }

  if (order.status === "COMPLETED" || order.status === "CANCELLED") {
    throw new AppError(409, "INVALID_STATUS", "OS encerrada nao pode entrar em roteiro");
  }

  return order;
};

const applyStopStatusEffects = async (params: {
  tx: any;
  userId: string;
  stopId: string;
  serviceOrderId: string;
  status?: RouteStopStatus;
}) => {
  if (!params.status) {
    return;
  }

  if (params.status === "STARTED") {
    await params.tx.serviceOrder.update({
      where: { id: params.serviceOrderId },
      data: {
        status: ServiceOrderStatus.IN_PROGRESS,
        startedAt: new Date()
      }
    });

    await params.tx.serviceOrderEvent.create({
      data: {
        serviceOrderId: params.serviceOrderId,
        actorId: params.userId,
        type: "ROUTE_STOP_STARTED",
        payload: { stopId: params.stopId }
      }
    });
  }

  if (params.status === "COMPLETED") {
    await params.tx.serviceOrderEvent.create({
      data: {
        serviceOrderId: params.serviceOrderId,
        actorId: params.userId,
        type: "ROUTE_STOP_COMPLETED",
        payload: { stopId: params.stopId }
      }
    });
  }

  if (params.status === "SKIPPED") {
    await params.tx.serviceOrderEvent.create({
      data: {
        serviceOrderId: params.serviceOrderId,
        actorId: params.userId,
        type: "ROUTE_STOP_SKIPPED",
        payload: { stopId: params.stopId }
      }
    });
  }
};

export const routingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/options", async (request, reply) => {
    await requirePermission(request, reply, "routing.manage");

    const [technicians, serviceOrders] = await Promise.all([
      fastify.prisma.user.findMany({
        where: { role: "TECNICO" },
        select: { id: true, name: true, email: true, team: true },
        orderBy: { name: "asc" }
      }),
      fastify.prisma.serviceOrder.findMany({
        where: {
          status: {
            in: ["OPEN", "SCHEDULED", "DISPATCHED", "IN_PROGRESS", "ON_HOLD"]
          }
        },
        orderBy: [{ scheduledStartAt: "asc" }, { serviceDate: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          priority: true,
          serviceDate: true,
          scheduledStartAt: true,
          assignedTechnicianId: true,
          customer: {
            select: { id: true, name: true }
          },
          siteLocation: {
            select: { id: true, name: true, address: true }
          }
        }
      })
    ]);

    return sendSuccess(reply, {
      technicians,
      serviceOrders
    });
  });

  fastify.get("/plans", async (request, reply) => {
    await requirePermission(request, reply, "routing.manage");
    const query = RoutePlanQuerySchema.parse(request.query);

    const plans = await fastify.prisma.routePlan.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.assignedTechnicianId
          ? { assignedTechnicianId: query.assignedTechnicianId }
          : {}),
        ...(query.dateFrom || query.dateTo
          ? {
              planDate: {
                ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                ...(query.dateTo ? { lte: query.dateTo } : {})
              }
            }
          : {})
      },
      orderBy: [{ planDate: "asc" }, { createdAt: "desc" }],
      include: routePlanInclude
    });

    return sendSuccess(reply, plans);
  });

  fastify.get<{ Params: { id: string } }>("/plans/:id", async (request, reply) => {
    await requirePermission(request, reply, "routing.manage");

    const plan = await fastify.prisma.routePlan.findUnique({
      where: { id: request.params.id },
      include: routePlanInclude
    });

    if (!plan) {
      throw new AppError(404, "ROUTE_PLAN_NOT_FOUND", "Roteiro nao encontrado");
    }

    return sendSuccess(reply, plan);
  });

  fastify.post("/plans", async (request, reply) => {
    await requirePermission(request, reply, "routing.manage");
    const user = getRequestUser(request);
    const input = RoutePlanCreateSchema.parse(request.body);

    if (!managerRoles.has(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem criar roteiros");
    }

    await ensureTechnicianIfProvided(fastify.prisma, input.assignedTechnicianId);

    const uniqueServiceOrderIds = Array.from(new Set(input.stopServiceOrderIds));

    for (const serviceOrderId of uniqueServiceOrderIds) {
      await ensureServiceOrderForStop(fastify.prisma, serviceOrderId);
    }

    const plan = await fastify.prisma.$transaction(async (tx) => {
      const created = await tx.routePlan.create({
        data: {
          name: input.name,
          planDate: input.planDate,
          status: "PLANNED",
          createdById: user.id,
          assignedTechnicianId: input.assignedTechnicianId,
          notes: input.notes
        }
      });

      for (let index = 0; index < uniqueServiceOrderIds.length; index += 1) {
        const serviceOrderId = uniqueServiceOrderIds[index];
        await tx.routePlanStop.create({
          data: {
            routePlanId: created.id,
            serviceOrderId,
            sequence: index + 1,
            status: "PLANNED"
          }
        });

        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId,
            actorId: user.id,
            type: "ROUTE_STOP_PLANNED",
            payload: {
              routePlanId: created.id,
              sequence: index + 1
            }
          }
        });
      }

      if (input.assignedTechnicianId && uniqueServiceOrderIds.length > 0) {
        await tx.serviceOrder.updateMany({
          where: {
            id: { in: uniqueServiceOrderIds },
            assignedTechnicianId: null
          },
          data: {
            assignedTechnicianId: input.assignedTechnicianId,
            status: ServiceOrderStatus.SCHEDULED
          }
        });
      }

      return tx.routePlan.findUniqueOrThrow({
        where: { id: created.id },
        include: routePlanInclude
      });
    });

    return sendSuccess(reply, plan);
  });

  fastify.patch<{ Params: { id: string } }>("/plans/:id", async (request, reply) => {
    await requirePermission(request, reply, "routing.manage");
    const user = getRequestUser(request);
    const input = RoutePlanUpdateSchema.parse(request.body);

    if (!managerRoles.has(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem editar roteiros");
    }

    const existing = await fastify.prisma.routePlan.findUnique({
      where: { id: request.params.id },
      select: { id: true }
    });

    if (!existing) {
      throw new AppError(404, "ROUTE_PLAN_NOT_FOUND", "Roteiro nao encontrado");
    }

    await ensureTechnicianIfProvided(fastify.prisma, input.assignedTechnicianId ?? undefined);

    const updated = await fastify.prisma.routePlan.update({
      where: { id: request.params.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.planDate !== undefined ? { planDate: input.planDate } : {}),
        ...(input.status !== undefined
          ? { status: input.status as RoutePlanStatus }
          : {}),
        ...(input.assignedTechnicianId !== undefined
          ? { assignedTechnicianId: input.assignedTechnicianId }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {})
      },
      include: routePlanInclude
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/plans/:id/stops", async (request, reply) => {
    await requirePermission(request, reply, "routing.manage");
    const user = getRequestUser(request);
    const input = RouteStopCreateSchema.parse(request.body);

    if (!managerRoles.has(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem alterar paradas");
    }

    const plan = await fastify.prisma.routePlan.findUnique({
      where: { id: request.params.id },
      include: {
        stops: {
          orderBy: { sequence: "asc" },
          select: { id: true, sequence: true }
        }
      }
    });

    if (!plan) {
      throw new AppError(404, "ROUTE_PLAN_NOT_FOUND", "Roteiro nao encontrado");
    }

    await ensureServiceOrderForStop(fastify.prisma, input.serviceOrderId);

    const requestedSequence = input.sequence ?? plan.stops.length + 1;
    const sequence = Math.max(1, Math.min(requestedSequence, plan.stops.length + 1));

    const created = await fastify.prisma.$transaction(async (tx) => {
      await tx.routePlanStop.updateMany({
        where: {
          routePlanId: plan.id,
          sequence: {
            gte: sequence
          }
        },
        data: {
          sequence: {
            increment: 1
          }
        }
      });

      const stop = await tx.routePlanStop.create({
        data: {
          routePlanId: plan.id,
          serviceOrderId: input.serviceOrderId,
          sequence,
          etaStart: input.etaStart,
          etaEnd: input.etaEnd,
          distanceKmFromPrev: input.distanceKmFromPrev,
          travelMinutesFromPrev: input.travelMinutesFromPrev,
          notes: input.notes,
          status: "PLANNED"
        },
        include: {
          serviceOrder: {
            select: {
              id: true,
              code: true,
              title: true,
              status: true
            }
          }
        }
      });

      await tx.serviceOrderEvent.create({
        data: {
          serviceOrderId: input.serviceOrderId,
          actorId: user.id,
          type: "ROUTE_STOP_PLANNED",
          payload: {
            routePlanId: plan.id,
            sequence
          }
        }
      });

      return stop;
    });

    return sendSuccess(reply, created);
  });

  fastify.post<{ Params: { id: string } }>("/plans/:id/stops/resequence", async (request, reply) => {
    await requirePermission(request, reply, "routing.manage");
    const user = getRequestUser(request);
    const input = RouteResequenceSchema.parse(request.body);

    if (!managerRoles.has(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem reordenar paradas");
    }

    const plan = await fastify.prisma.routePlan.findUnique({
      where: { id: request.params.id },
      include: {
        stops: {
          select: {
            id: true,
            serviceOrderId: true
          }
        }
      }
    });

    if (!plan) {
      throw new AppError(404, "ROUTE_PLAN_NOT_FOUND", "Roteiro nao encontrado");
    }

    const stopIdSet = new Set(plan.stops.map((stop) => stop.id));
    for (const stop of input.stops) {
      if (!stopIdSet.has(stop.id)) {
        throw new AppError(400, "INVALID_STOP", "Parada informada nao pertence ao roteiro");
      }
    }

    const sequenceSet = new Set(input.stops.map((stop) => stop.sequence));
    if (sequenceSet.size !== input.stops.length) {
      throw new AppError(400, "DUPLICATE_SEQUENCE", "Sequencias repetidas nao sao permitidas");
    }

    await fastify.prisma.$transaction(async (tx) => {
      for (const stop of input.stops) {
        await tx.routePlanStop.update({
          where: { id: stop.id },
          data: {
            sequence: stop.sequence,
            etaStart: stop.etaStart,
            etaEnd: stop.etaEnd
          }
        });
      }

      for (const stop of plan.stops) {
        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: stop.serviceOrderId,
            actorId: user.id,
            type: "ROUTE_RESEQUENCED",
            payload: {
              routePlanId: plan.id
            }
          }
        });
      }
    });

    const updated = await fastify.prisma.routePlan.findUniqueOrThrow({
      where: { id: request.params.id },
      include: routePlanInclude
    });

    return sendSuccess(reply, updated);
  });

  fastify.patch<{ Params: { id: string; stopId: string } }>(
    "/plans/:id/stops/:stopId",
    async (request, reply) => {
      await requirePermission(request, reply, "routing.manage");
      const user = getRequestUser(request);
      const input = RouteStopUpdateSchema.parse(request.body);

      if (!managerRoles.has(user.role)) {
        throw new AppError(403, "FORBIDDEN", "Apenas gestores podem atualizar paradas");
      }

      const stop = await fastify.prisma.routePlanStop.findFirst({
        where: {
          id: request.params.stopId,
          routePlanId: request.params.id
        },
        select: {
          id: true,
          routePlanId: true,
          serviceOrderId: true,
          status: true,
          actualStart: true,
          actualEnd: true
        }
      });

      if (!stop) {
        throw new AppError(404, "ROUTE_STOP_NOT_FOUND", "Parada nao encontrada");
      }

      const updated = await fastify.prisma.$transaction(async (tx) => {
        const next = await tx.routePlanStop.update({
          where: { id: stop.id },
          data: {
            ...(input.sequence !== undefined ? { sequence: input.sequence } : {}),
            ...(input.etaStart !== undefined ? { etaStart: input.etaStart } : {}),
            ...(input.etaEnd !== undefined ? { etaEnd: input.etaEnd } : {}),
            ...(input.distanceKmFromPrev !== undefined
              ? { distanceKmFromPrev: input.distanceKmFromPrev }
              : {}),
            ...(input.travelMinutesFromPrev !== undefined
              ? { travelMinutesFromPrev: input.travelMinutesFromPrev }
              : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
            ...(input.status !== undefined
              ? { status: input.status as RouteStopStatus }
              : {}),
            ...(input.actualStart !== undefined
              ? { actualStart: input.actualStart }
              : input.status === "STARTED" && !stop.actualStart
                ? { actualStart: new Date() }
                : {}),
            ...(input.actualEnd !== undefined
              ? { actualEnd: input.actualEnd }
              : input.status === "COMPLETED" && !stop.actualEnd
                ? { actualEnd: new Date() }
                : {})
          },
          include: {
            serviceOrder: {
              select: {
                id: true,
                code: true,
                title: true,
                status: true
              }
            }
          }
        });

        await applyStopStatusEffects({
          tx,
          userId: user.id,
          stopId: stop.id,
          serviceOrderId: stop.serviceOrderId,
          status: input.status as RouteStopStatus | undefined
        });

        return next;
      });

      return sendSuccess(reply, updated);
    }
  );

  fastify.post<{ Params: { id: string } }>("/plans/:id/optimize", async (request, reply) => {
    await requirePermission(request, reply, "routing.manage");
    const user = getRequestUser(request);

    if (!managerRoles.has(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem otimizar roteiros");
    }

    const plan = await fastify.prisma.routePlan.findUnique({
      where: { id: request.params.id },
      include: {
        stops: {
          include: {
            serviceOrder: {
              select: {
                id: true,
                serviceDate: true,
                scheduledStartAt: true,
                priority: true
              }
            }
          }
        }
      }
    });

    if (!plan) {
      throw new AppError(404, "ROUTE_PLAN_NOT_FOUND", "Roteiro nao encontrado");
    }

    const priorityWeight: Record<string, number> = {
      URGENT: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3
    };

    const sortedStops = [...plan.stops].sort((left, right) => {
      const leftPriority = priorityWeight[left.serviceOrder.priority] ?? 99;
      const rightPriority = priorityWeight[right.serviceOrder.priority] ?? 99;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      const leftDate = new Date(
        left.serviceOrder.scheduledStartAt ?? left.serviceOrder.serviceDate ?? plan.planDate
      ).getTime();
      const rightDate = new Date(
        right.serviceOrder.scheduledStartAt ?? right.serviceOrder.serviceDate ?? plan.planDate
      ).getTime();

      return leftDate - rightDate;
    });

    const optimized = await fastify.prisma.$transaction(async (tx) => {
      const start = toPlanDayStart(plan.planDate);

      for (let index = 0; index < sortedStops.length; index += 1) {
        const etaStart = new Date(start.getTime() + index * 60 * 60_000);
        const etaEnd = new Date(etaStart.getTime() + 45 * 60_000);

        await tx.routePlanStop.update({
          where: { id: sortedStops[index].id },
          data: {
            sequence: index + 1,
            etaStart,
            etaEnd,
            status: "PLANNED"
          }
        });
      }

      await tx.routePlan.update({
        where: { id: plan.id },
        data: {
          status: "OPTIMIZED"
        }
      });

      for (const stop of sortedStops) {
        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: stop.serviceOrderId,
            actorId: user.id,
            type: "ROUTE_OPTIMIZED",
            payload: {
              routePlanId: plan.id
            }
          }
        });
      }

      return tx.routePlan.findUniqueOrThrow({
        where: { id: plan.id },
        include: routePlanInclude
      });
    });

    return sendSuccess(reply, optimized);
  });

  fastify.post<{ Params: { id: string } }>("/plans/:id/publish", async (request, reply) => {
    await requirePermission(request, reply, "routing.manage");
    const user = getRequestUser(request);

    if (!managerRoles.has(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem publicar roteiros");
    }

    const plan = await fastify.prisma.routePlan.findUnique({
      where: { id: request.params.id },
      include: {
        stops: {
          select: {
            id: true,
            serviceOrderId: true,
            sequence: true
          }
        }
      }
    });

    if (!plan) {
      throw new AppError(404, "ROUTE_PLAN_NOT_FOUND", "Roteiro nao encontrado");
    }

    const published = await fastify.prisma.$transaction(async (tx) => {
      await tx.routePlan.update({
        where: { id: plan.id },
        data: {
          status: "PUBLISHED"
        }
      });

      for (const stop of plan.stops) {
        await tx.serviceOrder.update({
          where: { id: stop.serviceOrderId },
          data: {
            status: ServiceOrderStatus.DISPATCHED,
            dispatchedAt: new Date(),
            ...(plan.assignedTechnicianId
              ? { assignedTechnicianId: plan.assignedTechnicianId }
              : {})
          }
        });

        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: stop.serviceOrderId,
            actorId: user.id,
            type: "ROUTE_PUBLISHED",
            payload: {
              routePlanId: plan.id,
              sequence: stop.sequence
            } as Prisma.JsonObject
          }
        });
      }

      return tx.routePlan.findUniqueOrThrow({
        where: { id: plan.id },
        include: routePlanInclude
      });
    });

    return sendSuccess(reply, published);
  });
};
