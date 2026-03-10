import type { FastifyPluginAsync } from "fastify";
import {
  Prisma,
  ServiceOrderLocationType,
  ServiceOrderPriority,
  ServiceOrderStatus
} from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../lib/app-error.js";
import { requireAuth, requirePermission } from "../../lib/authz.js";
import { getRequestUser, sendSuccess } from "../../lib/envelope.js";
import { generateServiceOrderPdfAsset } from "../../services/service-order-pdf.js";
import { toPublicAssetUrl } from "../../lib/storage.js";

const serviceOrderStatuses = [
  "OPEN",
  "SCHEDULED",
  "DISPATCHED",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED"
] as const;

const serviceOrderPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const ServiceOrderCreateSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  priority: z.enum(serviceOrderPriorities).default("MEDIUM"),
  customerId: z.string().optional(),
  siteLocationId: z.string().optional(),
  equipmentId: z.string().optional(),
  assignedTechnicianId: z.string().optional(),
  serviceDate: z.coerce.date().optional(),
  scheduledStartAt: z.coerce.date().optional(),
  scheduledEndAt: z.coerce.date().optional(),
  slaDueAt: z.coerce.date().optional()
});

const ServiceOrderUpdateSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  priority: z.enum(serviceOrderPriorities).optional(),
  status: z.enum(serviceOrderStatuses).optional(),
  customerId: z.string().nullable().optional(),
  siteLocationId: z.string().nullable().optional(),
  equipmentId: z.string().nullable().optional(),
  assignedTechnicianId: z.string().nullable().optional(),
  serviceDate: z.coerce.date().nullable().optional(),
  scheduledStartAt: z.coerce.date().nullable().optional(),
  scheduledEndAt: z.coerce.date().nullable().optional(),
  slaDueAt: z.coerce.date().nullable().optional()
});

const ServiceOrderListQuerySchema = z.object({
  status: z.string().optional(),
  priority: z.enum(serviceOrderPriorities).optional(),
  technicianId: z.string().optional(),
  customerId: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional()
});

const ServiceOrderScheduleQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  technicianId: z.string().optional(),
  status: z.string().optional()
});

const ServiceOrderScheduleUpdateSchema = z.object({
  assignedTechnicianId: z.string().nullable().optional(),
  serviceDate: z.coerce.date().nullable().optional(),
  scheduledStartAt: z.coerce.date().nullable().optional(),
  scheduledEndAt: z.coerce.date().nullable().optional(),
  slaDueAt: z.coerce.date().nullable().optional()
});

const GeolocationPayloadSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(5000).optional(),
  speed: z.number().optional(),
  heading: z.number().optional(),
  capturedAt: z.coerce.date().optional(),
  source: z.string().max(40).optional(),
  note: z.string().max(500).optional()
});

const LocationTraceQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  limit: z.coerce.number().min(1).max(500).default(200)
});

const LinkChecklistSchema = z.object({
  templateVersionId: z.string(),
  assignedTechnicianId: z.string().optional()
});

const CancelServiceOrderSchema = z.object({
  reason: z.string().min(2).max(500).optional()
});

const managerRoles = new Set(["SUPERADMIN", "ADMIN", "SUPERVISOR"]);

const isManager = (role: string) => managerRoles.has(role);

const generateServiceOrderCode = () => {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `SO-${date}-${random}`;
};

const generateChecklistCode = () => {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `CHK-${date}-${random}`;
};

const parseStatusFilter = (raw?: string) => {
  if (!raw) {
    return undefined;
  }

  const values = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is (typeof serviceOrderStatuses)[number] =>
      serviceOrderStatuses.includes(value as (typeof serviceOrderStatuses)[number])
    );

  return values.length ? (values as ServiceOrderStatus[]) : undefined;
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const calculateDistanceMeters = (params: {
  latitudeA: number;
  longitudeA: number;
  latitudeB: number;
  longitudeB: number;
}) => {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(params.latitudeB - params.latitudeA);
  const dLng = toRadians(params.longitudeB - params.longitudeA);
  const latA = toRadians(params.latitudeA);
  const latB = toRadians(params.latitudeB);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
};

const validateCheckInGeofence = (params: {
  order: {
    siteLocation?: {
      id: string;
      name: string;
      latitude?: number | null;
      longitude?: number | null;
      geofenceRadiusMeters?: number | null;
    } | null;
  };
  input: z.infer<typeof GeolocationPayloadSchema>;
}) => {
  const site = params.order.siteLocation;
  if (!site || site.latitude == null || site.longitude == null) {
    return null;
  }

  const radiusMeters = site.geofenceRadiusMeters ?? 200;
  const distanceMeters = calculateDistanceMeters({
    latitudeA: params.input.latitude,
    longitudeA: params.input.longitude,
    latitudeB: site.latitude,
    longitudeB: site.longitude
  });

  if (distanceMeters > radiusMeters) {
    throw new AppError(409, "OUTSIDE_GEOFENCE", "Check-in fora do raio da unidade", {
      siteLocationId: site.id,
      siteName: site.name,
      radiusMeters: Number(radiusMeters.toFixed(2)),
      distanceMeters: Number(distanceMeters.toFixed(2))
    });
  }

  return {
    siteLocationId: site.id,
    siteName: site.name,
    radiusMeters: Number(radiusMeters.toFixed(2)),
    distanceMeters: Number(distanceMeters.toFixed(2))
  };
};

const assertServiceOrderAccess = (params: {
  role: string;
  userId: string;
  assignedTechnicianId?: string | null;
}) => {
  if (isManager(params.role)) {
    return;
  }

  if (params.role === "TECNICO" && params.assignedTechnicianId === params.userId) {
    return;
  }

  throw new AppError(403, "FORBIDDEN", "Sem permissao para acessar esta ordem de servico");
};

const buildStatusPatch = (
  previousStatus: ServiceOrderStatus,
  nextStatus?: ServiceOrderStatus
): Prisma.ServiceOrderUncheckedUpdateInput => {
  if (!nextStatus || nextStatus === previousStatus) {
    return {};
  }

  const now = new Date();
  const statusPatch: Prisma.ServiceOrderUncheckedUpdateInput = { status: nextStatus };

  if (nextStatus === "DISPATCHED") {
    statusPatch.dispatchedAt = now;
  }

  if (nextStatus === "IN_PROGRESS") {
    statusPatch.startedAt = now;
  }

  if (nextStatus === "COMPLETED") {
    statusPatch.completedAt = now;
  }

  if (nextStatus === "CANCELLED") {
    statusPatch.cancelledAt = now;
  }

  return statusPatch;
};

const createServiceOrderEvent = async (params: {
  prisma: any;
  serviceOrderId: string;
  actorId?: string;
  type: string;
  note?: string;
  payload?: Prisma.InputJsonValue;
}) => {
  await params.prisma.serviceOrderEvent.create({
    data: {
      serviceOrderId: params.serviceOrderId,
      actorId: params.actorId,
      type: params.type,
      note: params.note,
      payload: params.payload
    }
  });
};

const createServiceOrderLocation = async (params: {
  prisma: any;
  serviceOrderId: string;
  type: ServiceOrderLocationType;
  input: z.infer<typeof GeolocationPayloadSchema>;
}) => {
  return params.prisma.serviceOrderLocationPoint.create({
    data: {
      serviceOrderId: params.serviceOrderId,
      type: params.type,
      latitude: params.input.latitude,
      longitude: params.input.longitude,
      accuracy: params.input.accuracy,
      speed: params.input.speed,
      heading: params.input.heading,
      source: params.input.source,
      note: params.input.note,
      capturedAt: params.input.capturedAt ?? new Date()
    }
  });
};

const ensureReferencesExist = async (params: {
  prisma: any;
  assignedTechnicianId?: string | null;
  customerId?: string | null;
  siteLocationId?: string | null;
  equipmentId?: string | null;
}) => {
  const checks = await Promise.all([
    params.assignedTechnicianId
      ? params.prisma.user.findFirst({
          where: { id: params.assignedTechnicianId, role: "TECNICO" },
          select: { id: true }
        })
      : Promise.resolve(true),
    params.customerId
      ? params.prisma.customer.findUnique({
          where: { id: params.customerId },
          select: { id: true }
        })
      : Promise.resolve(true),
    params.siteLocationId
      ? params.prisma.siteLocation.findUnique({
          where: { id: params.siteLocationId },
          select: { id: true }
        })
      : Promise.resolve(true),
    params.equipmentId
      ? params.prisma.equipment.findUnique({
          where: { id: params.equipmentId },
          select: { id: true }
        })
      : Promise.resolve(true)
  ]);

  if (params.assignedTechnicianId && !checks[0]) {
    throw new AppError(400, "INVALID_TECHNICIAN", "Tecnico informado nao existe");
  }

  if (params.customerId && !checks[1]) {
    throw new AppError(400, "INVALID_CUSTOMER", "Cliente informado nao existe");
  }

  if (params.siteLocationId && !checks[2]) {
    throw new AppError(400, "INVALID_SITE", "Unidade informada nao existe");
  }

  if (params.equipmentId && !checks[3]) {
    throw new AppError(400, "INVALID_EQUIPMENT", "Equipamento informado nao existe");
  }
};

const serviceOrderListInclude = {
  assignedTechnician: {
    select: { id: true, name: true, email: true }
  },
  customer: {
    select: { id: true, name: true }
  },
  siteLocation: {
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      latitude: true,
      longitude: true,
      geofenceRadiusMeters: true
    }
  },
  equipment: {
    select: { id: true, brand: true, model: true, serial: true }
  },
  checklistExecution: {
    select: { id: true, code: true, status: true, step: true }
  }
} as const;

const serviceOrderDetailInclude = {
  ...serviceOrderListInclude,
  locations: {
    orderBy: { capturedAt: "desc" as const },
    take: 20
  },
  events: {
    orderBy: { createdAt: "desc" as const },
    include: {
      actor: {
        select: { id: true, name: true, role: true }
      }
    }
  }
} as const;

export const serviceOrderRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/options", async (request, reply) => {
    await requireAuth(request, reply);

    const [technicians, customers, sites, equipments, templateVersions] = await Promise.all([
      fastify.prisma.user.findMany({
        where: { role: "TECNICO" },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" }
      }),
      fastify.prisma.customer.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
      fastify.prisma.siteLocation.findMany({
        select: {
          id: true,
          name: true,
          customerId: true,
          latitude: true,
          longitude: true,
          geofenceRadiusMeters: true
        },
        orderBy: { name: "asc" }
      }),
      fastify.prisma.equipment.findMany({
        select: { id: true, brand: true, model: true, siteLocationId: true },
        orderBy: { createdAt: "desc" }
      }),
      fastify.prisma.checklistTemplateVersion.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          version: true,
          template: {
            select: {
              id: true,
              name: true,
              serviceType: true
            }
          }
        }
      })
    ]);

    return sendSuccess(reply, {
      technicians,
      customers,
      sites,
      equipments,
      templateVersions
    });
  });

  fastify.post("/", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const input = ServiceOrderCreateSchema.parse(request.body);

    if (!isManager(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem criar ordem de servico");
    }

    await ensureReferencesExist({
      prisma: fastify.prisma,
      assignedTechnicianId: input.assignedTechnicianId,
      customerId: input.customerId,
      siteLocationId: input.siteLocationId,
      equipmentId: input.equipmentId
    });

    const created = await fastify.prisma.serviceOrder.create({
      data: {
        code: generateServiceOrderCode(),
        title: input.title,
        description: input.description,
        priority: input.priority as ServiceOrderPriority,
        customerId: input.customerId,
        siteLocationId: input.siteLocationId,
        equipmentId: input.equipmentId,
        assignedTechnicianId: input.assignedTechnicianId,
        serviceDate: input.serviceDate,
        scheduledStartAt: input.scheduledStartAt,
        scheduledEndAt: input.scheduledEndAt,
        slaDueAt: input.slaDueAt,
        createdById: user.id,
        status: input.assignedTechnicianId ? "SCHEDULED" : "OPEN"
      },
      include: serviceOrderListInclude
    });

    await createServiceOrderEvent({
      prisma: fastify.prisma,
      serviceOrderId: created.id,
      actorId: user.id,
      type: "SERVICE_ORDER_CREATED",
      payload: input as unknown as Prisma.InputJsonValue
    });

    return sendSuccess(reply, created);
  });

  fastify.get("/", async (request, reply) => {
    await requireAuth(request, reply);
    const user = getRequestUser(request);
    const query = ServiceOrderListQuerySchema.parse(request.query);
    const statusFilter = parseStatusFilter(query.status);

    if (!isManager(user.role) && user.role !== "TECNICO") {
      throw new AppError(403, "FORBIDDEN", "Sem permissao para listar ordens de servico");
    }

    const where: Prisma.ServiceOrderWhereInput = {
      ...(statusFilter?.length ? { status: { in: statusFilter } } : {}),
      ...(query.priority ? { priority: query.priority as ServiceOrderPriority } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { title: { contains: query.search, mode: "insensitive" } }
            ]
          }
        : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            serviceDate: {
              ...(query.dateFrom ? { gte: query.dateFrom } : {}),
              ...(query.dateTo ? { lte: query.dateTo } : {})
            }
          }
        : {})
    };

    if (isManager(user.role)) {
      if (query.technicianId) {
        where.assignedTechnicianId = query.technicianId;
      }
    } else {
      where.assignedTechnicianId = user.id;
    }

    const orders = await fastify.prisma.serviceOrder.findMany({
      where,
      include: serviceOrderListInclude,
      orderBy: [{ serviceDate: "asc" }, { createdAt: "desc" }]
    });

    return sendSuccess(reply, orders);
  });

  fastify.get("/schedule", async (request, reply) => {
    await requireAuth(request, reply);
    const user = getRequestUser(request);
    const query = ServiceOrderScheduleQuerySchema.parse(request.query);
    const statusFilter = parseStatusFilter(query.status);

    if (!isManager(user.role) && user.role !== "TECNICO") {
      throw new AppError(403, "FORBIDDEN", "Sem permissao para visualizar agenda");
    }

    const rangeStart = query.dateFrom ?? new Date(new Date().setHours(0, 0, 0, 0));
    const rangeEnd = query.dateTo ?? new Date(new Date(rangeStart).setDate(rangeStart.getDate() + 7));

    const where: Prisma.ServiceOrderWhereInput = {
      ...(statusFilter?.length ? { status: { in: statusFilter } } : {}),
      AND: [
        {
          OR: [
            { scheduledStartAt: { gte: rangeStart, lte: rangeEnd } },
            { scheduledEndAt: { gte: rangeStart, lte: rangeEnd } },
            { serviceDate: { gte: rangeStart, lte: rangeEnd } }
          ]
        }
      ]
    };

    if (isManager(user.role)) {
      if (query.technicianId) {
        where.assignedTechnicianId = query.technicianId;
      }
    } else {
      where.assignedTechnicianId = user.id;
    }

    const schedule = await fastify.prisma.serviceOrder.findMany({
      where,
      include: serviceOrderListInclude,
      orderBy: [{ scheduledStartAt: "asc" }, { serviceDate: "asc" }, { createdAt: "desc" }]
    });

    return sendSuccess(reply, {
      range: {
        dateFrom: rangeStart,
        dateTo: rangeEnd
      },
      items: schedule
    });
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    await requireAuth(request, reply);
    const user = getRequestUser(request);

    const order = await fastify.prisma.serviceOrder.findUnique({
      where: { id: request.params.id },
      include: serviceOrderDetailInclude
    });

    if (!order) {
      throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
    }

    assertServiceOrderAccess({
      role: user.role,
      userId: user.id,
      assignedTechnicianId: order.assignedTechnicianId
    });

    const latestDocument = await fastify.prisma.mediaAsset.findFirst({
      where: {
        type: "PDF",
        tags: {
          has: `service-order:${order.id}`
        }
      },
      select: {
        id: true,
        title: true,
        storageKey: true,
        mimeType: true,
        size: true,
        createdAt: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return sendSuccess(reply, {
      ...order,
      latestDocument: latestDocument
        ? {
            ...latestDocument,
            url: toPublicAssetUrl(latestDocument.storageKey)
          }
        : null
    });
  });

  fastify.patch<{ Params: { id: string } }>("/:id", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const input = ServiceOrderUpdateSchema.parse(request.body);

    if (!isManager(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem editar ordem de servico");
    }

    const current = await fastify.prisma.serviceOrder.findUnique({
      where: { id: request.params.id }
    });

    if (!current) {
      throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
    }

    await ensureReferencesExist({
      prisma: fastify.prisma,
      assignedTechnicianId: input.assignedTechnicianId,
      customerId: input.customerId,
      siteLocationId: input.siteLocationId,
      equipmentId: input.equipmentId
    });

    const statusPatch = buildStatusPatch(current.status, input.status as ServiceOrderStatus | undefined);

    const updateData: Prisma.ServiceOrderUncheckedUpdateInput = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.priority !== undefined ? { priority: input.priority as ServiceOrderPriority } : {}),
      ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
      ...(input.siteLocationId !== undefined ? { siteLocationId: input.siteLocationId } : {}),
      ...(input.equipmentId !== undefined ? { equipmentId: input.equipmentId } : {}),
      ...(input.assignedTechnicianId !== undefined ? { assignedTechnicianId: input.assignedTechnicianId } : {}),
      ...(input.serviceDate !== undefined ? { serviceDate: input.serviceDate } : {}),
      ...(input.scheduledStartAt !== undefined ? { scheduledStartAt: input.scheduledStartAt } : {}),
      ...(input.scheduledEndAt !== undefined ? { scheduledEndAt: input.scheduledEndAt } : {}),
      ...(input.slaDueAt !== undefined ? { slaDueAt: input.slaDueAt } : {}),
      ...statusPatch
    };

    const updated = await fastify.prisma.serviceOrder.update({
      where: { id: request.params.id },
      data: updateData,
      include: serviceOrderListInclude
    });

    await createServiceOrderEvent({
      prisma: fastify.prisma,
      serviceOrderId: updated.id,
      actorId: user.id,
      type: "SERVICE_ORDER_UPDATED",
      payload: input as unknown as Prisma.InputJsonValue
    });

    return sendSuccess(reply, updated);
  });

  fastify.patch<{ Params: { id: string } }>("/:id/schedule", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const input = ServiceOrderScheduleUpdateSchema.parse(request.body);

    if (!isManager(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem ajustar agenda");
    }

    const current = await fastify.prisma.serviceOrder.findUnique({
      where: { id: request.params.id }
    });

    if (!current) {
      throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
    }

    await ensureReferencesExist({
      prisma: fastify.prisma,
      assignedTechnicianId: input.assignedTechnicianId
    });

    const shouldSchedule =
      current.status === "OPEN" &&
      Boolean(input.assignedTechnicianId || input.serviceDate || input.scheduledStartAt);

    const updated = await fastify.prisma.serviceOrder.update({
      where: { id: request.params.id },
      data: {
        ...(input.assignedTechnicianId !== undefined
          ? { assignedTechnicianId: input.assignedTechnicianId }
          : {}),
        ...(input.serviceDate !== undefined ? { serviceDate: input.serviceDate } : {}),
        ...(input.scheduledStartAt !== undefined ? { scheduledStartAt: input.scheduledStartAt } : {}),
        ...(input.scheduledEndAt !== undefined ? { scheduledEndAt: input.scheduledEndAt } : {}),
        ...(input.slaDueAt !== undefined ? { slaDueAt: input.slaDueAt } : {}),
        ...(shouldSchedule ? { status: "SCHEDULED" as ServiceOrderStatus } : {})
      },
      include: serviceOrderListInclude
    });

    await createServiceOrderEvent({
      prisma: fastify.prisma,
      serviceOrderId: updated.id,
      actorId: user.id,
      type: "SERVICE_ORDER_SCHEDULE_UPDATED",
      payload: input as unknown as Prisma.InputJsonValue
    });

    return sendSuccess(reply, updated);
  });

  fastify.get<{ Params: { id: string } }>("/:id/location-trace", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const query = LocationTraceQuerySchema.parse(request.query);

    const order = await fastify.prisma.serviceOrder.findUnique({
      where: { id: request.params.id }
    });

    if (!order) {
      throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
    }

    assertServiceOrderAccess({
      role: user.role,
      userId: user.id,
      assignedTechnicianId: order.assignedTechnicianId
    });

    const points = await fastify.prisma.serviceOrderLocationPoint.findMany({
      where: {
        serviceOrderId: request.params.id,
        ...(query.dateFrom || query.dateTo
          ? {
              capturedAt: {
                ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                ...(query.dateTo ? { lte: query.dateTo } : {})
              }
            }
          : {})
      },
      orderBy: { capturedAt: "asc" },
      take: query.limit
    });

    return sendSuccess(reply, points);
  });

  fastify.post<{ Params: { id: string } }>("/:id/check-in", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const input = GeolocationPayloadSchema.parse(request.body);

    const order = await fastify.prisma.serviceOrder.findUnique({
      where: { id: request.params.id },
      include: {
        siteLocation: {
          select: {
            id: true,
            name: true,
            latitude: true,
            longitude: true,
            geofenceRadiusMeters: true
          }
        }
      }
    });

    if (!order) {
      throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
    }

    assertServiceOrderAccess({
      role: user.role,
      userId: user.id,
      assignedTechnicianId: order.assignedTechnicianId
    });

    if (order.status === "COMPLETED" || order.status === "CANCELLED") {
      throw new AppError(409, "INVALID_STATUS", "Nao e possivel fazer check-in em ordem encerrada");
    }

    const geofence = validateCheckInGeofence({
      order,
      input
    });

    const updated = await fastify.prisma.$transaction(async (tx) => {
      await createServiceOrderLocation({
        prisma: tx,
        serviceOrderId: order.id,
        type: ServiceOrderLocationType.CHECK_IN,
        input
      });

      const next = await tx.serviceOrder.update({
        where: { id: order.id },
        data: {
          status: "IN_PROGRESS",
          startedAt: order.startedAt ?? new Date()
        },
        include: serviceOrderListInclude
      });

      await createServiceOrderEvent({
        prisma: tx,
        serviceOrderId: order.id,
        actorId: user.id,
        type: "SERVICE_ORDER_CHECK_IN",
        payload: {
          latitude: input.latitude,
          longitude: input.longitude,
          accuracy: input.accuracy,
          speed: input.speed,
          heading: input.heading,
          source: input.source,
          capturedAt: (input.capturedAt ?? new Date()).toISOString(),
          geofence: geofence ?? null
        } as unknown as Prisma.InputJsonValue
      });

      return next;
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/:id/check-out", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const input = GeolocationPayloadSchema.parse(request.body);

    const order = await fastify.prisma.serviceOrder.findUnique({
      where: { id: request.params.id }
    });

    if (!order) {
      throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
    }

    assertServiceOrderAccess({
      role: user.role,
      userId: user.id,
      assignedTechnicianId: order.assignedTechnicianId
    });

    if (order.status === "COMPLETED" || order.status === "CANCELLED") {
      throw new AppError(409, "INVALID_STATUS", "Nao e possivel fazer check-out em ordem encerrada");
    }

    const updated = await fastify.prisma.$transaction(async (tx) => {
      await createServiceOrderLocation({
        prisma: tx,
        serviceOrderId: order.id,
        type: ServiceOrderLocationType.CHECK_OUT,
        input
      });

      const next = await tx.serviceOrder.update({
        where: { id: order.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          startedAt: order.startedAt ?? new Date()
        },
        include: serviceOrderListInclude
      });

      await createServiceOrderEvent({
        prisma: tx,
        serviceOrderId: order.id,
        actorId: user.id,
        type: "SERVICE_ORDER_CHECK_OUT",
        payload: input as unknown as Prisma.InputJsonValue
      });

      return next;
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/:id/location-ping", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const input = GeolocationPayloadSchema.parse(request.body);

    const order = await fastify.prisma.serviceOrder.findUnique({
      where: { id: request.params.id }
    });

    if (!order) {
      throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
    }

    assertServiceOrderAccess({
      role: user.role,
      userId: user.id,
      assignedTechnicianId: order.assignedTechnicianId
    });

    if (order.status === "COMPLETED" || order.status === "CANCELLED") {
      throw new AppError(409, "INVALID_STATUS", "Nao e possivel registrar localizacao em ordem encerrada");
    }

    const point = await createServiceOrderLocation({
      prisma: fastify.prisma,
      serviceOrderId: order.id,
      type: ServiceOrderLocationType.PING,
      input
    });

    await createServiceOrderEvent({
      prisma: fastify.prisma,
      serviceOrderId: order.id,
      actorId: user.id,
      type: "SERVICE_ORDER_LOCATION_PING",
      payload: input as unknown as Prisma.InputJsonValue
    });

    return sendSuccess(reply, point);
  });

  fastify.post<{ Params: { id: string } }>("/:id/start", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);

    const current = await fastify.prisma.serviceOrder.findUnique({
      where: { id: request.params.id }
    });

    if (!current) {
      throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
    }

    assertServiceOrderAccess({
      role: user.role,
      userId: user.id,
      assignedTechnicianId: current.assignedTechnicianId
    });

    if (current.status === "COMPLETED" || current.status === "CANCELLED") {
      throw new AppError(409, "INVALID_STATUS", "Nao e possivel iniciar uma ordem encerrada");
    }

    const updated = await fastify.prisma.serviceOrder.update({
      where: { id: request.params.id },
      data: {
        status: "IN_PROGRESS",
        startedAt: current.startedAt ?? new Date()
      },
      include: serviceOrderListInclude
    });

    await createServiceOrderEvent({
      prisma: fastify.prisma,
      serviceOrderId: updated.id,
      actorId: user.id,
      type: "SERVICE_ORDER_STARTED"
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/:id/complete", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);

    const current = await fastify.prisma.serviceOrder.findUnique({
      where: { id: request.params.id }
    });

    if (!current) {
      throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
    }

    assertServiceOrderAccess({
      role: user.role,
      userId: user.id,
      assignedTechnicianId: current.assignedTechnicianId
    });

    if (current.status === "COMPLETED" || current.status === "CANCELLED") {
      throw new AppError(409, "INVALID_STATUS", "A ordem ja esta encerrada");
    }

    const updated = await fastify.prisma.serviceOrder.update({
      where: { id: request.params.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        startedAt: current.startedAt ?? new Date()
      },
      include: serviceOrderListInclude
    });

    await createServiceOrderEvent({
      prisma: fastify.prisma,
      serviceOrderId: updated.id,
      actorId: user.id,
      type: "SERVICE_ORDER_COMPLETED"
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/:id/cancel", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const input = CancelServiceOrderSchema.parse(request.body);

    if (!isManager(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem cancelar ordem de servico");
    }

    const current = await fastify.prisma.serviceOrder.findUnique({
      where: { id: request.params.id }
    });

    if (!current) {
      throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
    }

    if (current.status === "COMPLETED") {
      throw new AppError(409, "INVALID_STATUS", "Nao e possivel cancelar ordem concluida");
    }

    const updated = await fastify.prisma.serviceOrder.update({
      where: { id: request.params.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date()
      },
      include: serviceOrderListInclude
    });

    await createServiceOrderEvent({
      prisma: fastify.prisma,
      serviceOrderId: updated.id,
      actorId: user.id,
      type: "SERVICE_ORDER_CANCELLED",
      note: input.reason,
      payload: input.reason ? ({ reason: input.reason } as Prisma.InputJsonValue) : undefined
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/:id/assign-checklist", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const input = LinkChecklistSchema.parse(request.body);

    if (!isManager(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem vincular checklist");
    }

    const templateVersion = await fastify.prisma.checklistTemplateVersion.findUnique({
      where: { id: input.templateVersionId }
    });

    if (!templateVersion) {
      throw new AppError(404, "TEMPLATE_VERSION_NOT_FOUND", "Versao do template nao encontrada");
    }

    const order = await fastify.prisma.serviceOrder.findUnique({
      where: { id: request.params.id }
    });

    if (!order) {
      throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
    }

    if (order.checklistExecutionId) {
      throw new AppError(409, "CHECKLIST_ALREADY_LINKED", "Esta ordem ja possui checklist vinculado");
    }

    const technicianId = input.assignedTechnicianId ?? order.assignedTechnicianId;

    if (!technicianId) {
      throw new AppError(
        400,
        "TECHNICIAN_REQUIRED",
        "Informe um tecnico para criar o checklist de execucao"
      );
    }

    await ensureReferencesExist({
      prisma: fastify.prisma,
      assignedTechnicianId: technicianId
    });

    const result = await fastify.prisma.$transaction(async (tx) => {
      const checklistExecution = await tx.checklistExecution.create({
        data: {
          code: generateChecklistCode(),
          templateVersionId: input.templateVersionId,
          assignedTechnicianId: technicianId,
          customerId: order.customerId,
          siteLocationId: order.siteLocationId,
          equipmentId: order.equipmentId,
          serviceDate: order.serviceDate,
          status: "DRAFT"
        }
      });

      const updatedOrder = await tx.serviceOrder.update({
        where: { id: order.id },
        data: {
          checklistExecutionId: checklistExecution.id,
          assignedTechnicianId: technicianId,
          status: order.status === "OPEN" ? "DISPATCHED" : order.status,
          dispatchedAt: order.status === "OPEN" ? new Date() : order.dispatchedAt
        },
        include: serviceOrderListInclude
      });

      await tx.serviceOrderEvent.create({
        data: {
          serviceOrderId: order.id,
          actorId: user.id,
          type: "SERVICE_ORDER_CHECKLIST_LINKED",
          payload: {
            checklistExecutionId: checklistExecution.id,
            templateVersionId: input.templateVersionId
          } as Prisma.InputJsonValue
        }
      });

      return updatedOrder;
    });

    return sendSuccess(reply, result);
  });

  fastify.post<{ Params: { id: string } }>("/:id/emit-document", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);

    const order = await fastify.prisma.serviceOrder.findUnique({
      where: { id: request.params.id },
      include: {
        customer: {
          select: { id: true, name: true }
        },
        siteLocation: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            state: true
          }
        },
        equipment: {
          select: {
            id: true,
            brand: true,
            model: true,
            serial: true,
            btu: true,
            equipmentType: true
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

    if (!order) {
      throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
    }

    assertServiceOrderAccess({
      role: user.role,
      userId: user.id,
      assignedTechnicianId: order.assignedTechnicianId
    });

    const asset = await generateServiceOrderPdfAsset({
      prisma: fastify.prisma,
      serviceOrder: order,
      actorId: user.id
    });

    await createServiceOrderEvent({
      prisma: fastify.prisma,
      serviceOrderId: order.id,
      actorId: user.id,
      type: "SERVICE_ORDER_DOCUMENT_EMITTED",
      payload: {
        mediaAssetId: asset.id,
        storageKey: asset.storageKey
      } as Prisma.InputJsonValue
    });

    return sendSuccess(reply, {
      ...asset,
      url: toPublicAssetUrl(asset.storageKey)
    });
  });
};
