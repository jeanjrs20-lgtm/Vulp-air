import type { FastifyPluginAsync } from "fastify";
import {
  ServiceOrderLocationType,
  TeamGpsStatus,
  TeamInternetStatus
} from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../lib/app-error.js";
import { getRequestUser, sendSuccess } from "../../lib/envelope.js";
import { requirePermission } from "../../lib/authz.js";

const managerRoles = new Set(["SUPERADMIN", "ADMIN", "SUPERVISOR"]);

const TeamPingSchema = z.object({
  technicianId: z.string().optional(),
  serviceOrderId: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(5000).optional(),
  speed: z.number().optional(),
  heading: z.number().optional(),
  source: z.string().max(40).optional(),
  capturedAt: z.coerce.date().optional(),
  gpsStatus: z.nativeEnum(TeamGpsStatus).optional(),
  internetStatus: z.nativeEnum(TeamInternetStatus).optional(),
  batteryLevel: z.number().int().min(0).max(100).optional(),
  isCharging: z.boolean().optional(),
  appVersion: z.string().max(40).optional(),
  osVersion: z.string().max(40).optional(),
  deviceModel: z.string().max(80).optional(),
  deviceId: z.string().max(120).optional(),
  isMockLocation: z.boolean().optional(),
  integrityFlags: z.array(z.string().max(80)).max(20).optional()
});

const TeamHistoryQuerySchema = z.object({
  technicianId: z.string().optional(),
  serviceOrderId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  limit: z.coerce.number().min(1).max(1000).default(300)
});

const TeamLiveQuerySchema = z.object({
  technicianId: z.string().optional(),
  minutes: z.coerce.number().min(1).max(24 * 60).default(30)
});

const TeamMonitoringQuerySchema = z.object({
  technicianId: z.string().optional(),
  search: z.string().optional(),
  staleMinutes: z.coerce.number().min(5).max(24 * 60).default(30),
  latestAppVersion: z.string().max(40).optional()
});

const resolveGpsStatus = (params: {
  gpsStatus?: TeamGpsStatus | null;
  isMockLocation?: boolean | null;
  accuracy?: number | null;
}) => {
  if (params.isMockLocation) {
    return TeamGpsStatus.MOCKED;
  }

  if (params.gpsStatus) {
    return params.gpsStatus;
  }

  if (params.accuracy == null) {
    return TeamGpsStatus.UNAVAILABLE;
  }

  if (params.accuracy <= 25) {
    return TeamGpsStatus.HIGH_ACCURACY;
  }

  return TeamGpsStatus.LOW_ACCURACY;
};

const resolveInternetStatus = (status?: TeamInternetStatus | null) =>
  status ?? TeamInternetStatus.UNAVAILABLE;

const getRiskLevel = (params: {
  alerts: string[];
  minutesWithoutPing: number | null;
  staleMinutes: number;
}) => {
  const hasCriticalAlert = params.alerts.some((alert) =>
    ["POSSIBLE_GPS_SPOOFING", "NO_MONITORING_RECORD"].includes(alert)
  );
  if (hasCriticalAlert) {
    return "HIGH" as const;
  }

  if (
    params.minutesWithoutPing != null &&
    params.minutesWithoutPing > params.staleMinutes * 2
  ) {
    return "HIGH" as const;
  }

  if (params.alerts.length >= 2) {
    return "MEDIUM" as const;
  }

  return "LOW" as const;
};

export const teamLocationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/ping", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const input = TeamPingSchema.parse(request.body);

    const technicianId =
      user.role === "TECNICO" ? user.id : input.technicianId ?? user.id;

    const technician = await fastify.prisma.user.findFirst({
      where: {
        id: technicianId,
        role: "TECNICO"
      },
      select: { id: true }
    });

    if (!technician) {
      throw new AppError(400, "INVALID_TECHNICIAN", "Tecnico informado nao existe");
    }

    if (input.serviceOrderId) {
      const order = await fastify.prisma.serviceOrder.findUnique({
        where: { id: input.serviceOrderId },
        select: { id: true, assignedTechnicianId: true, status: true }
      });

      if (!order) {
        throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
      }

      if (
        user.role === "TECNICO" &&
        order.assignedTechnicianId &&
        order.assignedTechnicianId !== user.id
      ) {
        throw new AppError(403, "FORBIDDEN", "Sem permissao para registrar localizacao nesta OS");
      }

      if (order.status === "COMPLETED" || order.status === "CANCELLED") {
        throw new AppError(409, "INVALID_STATUS", "OS encerrada nao aceita novos pings");
      }
    }

    const ping = await fastify.prisma.$transaction(async (tx) => {
      const created = await tx.teamLocationPing.create({
        data: {
          technicianId,
          serviceOrderId: input.serviceOrderId,
          latitude: input.latitude,
          longitude: input.longitude,
          accuracy: input.accuracy,
          speed: input.speed,
          heading: input.heading,
          source: input.source,
          gpsStatus: input.gpsStatus,
          internetStatus: input.internetStatus,
          batteryLevel: input.batteryLevel,
          isCharging: input.isCharging,
          appVersion: input.appVersion,
          osVersion: input.osVersion,
          deviceModel: input.deviceModel,
          deviceId: input.deviceId,
          isMockLocation: input.isMockLocation,
          integrityFlags: input.integrityFlags,
          capturedAt: input.capturedAt ?? new Date()
        },
        include: {
          technician: {
            select: { id: true, name: true, email: true }
          },
          serviceOrder: {
            select: { id: true, code: true, title: true, status: true }
          }
        }
      });

      if (input.serviceOrderId) {
        await tx.serviceOrderLocationPoint.create({
          data: {
            serviceOrderId: input.serviceOrderId,
            type: ServiceOrderLocationType.PING,
            latitude: input.latitude,
            longitude: input.longitude,
            accuracy: input.accuracy,
            speed: input.speed,
            heading: input.heading,
            source: input.source,
            capturedAt: input.capturedAt ?? new Date()
          }
        });

        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: input.serviceOrderId,
            actorId: user.id,
            type: "TEAM_LOCATION_PING",
            payload: {
              technicianId,
              latitude: input.latitude,
              longitude: input.longitude,
              source: input.source
            }
          }
        });
      }

      return created;
    });

    return sendSuccess(reply, ping);
  });

  fastify.get("/history", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const query = TeamHistoryQuerySchema.parse(request.query);

    const where = {
      ...(query.technicianId ? { technicianId: query.technicianId } : {}),
      ...(query.serviceOrderId ? { serviceOrderId: query.serviceOrderId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            capturedAt: {
              ...(query.dateFrom ? { gte: query.dateFrom } : {}),
              ...(query.dateTo ? { lte: query.dateTo } : {})
            }
          }
        : {})
    };

    if (!managerRoles.has(user.role)) {
      (where as { technicianId?: string }).technicianId = user.id;
    }

    const points = await fastify.prisma.teamLocationPing.findMany({
      where,
      take: query.limit,
      orderBy: { capturedAt: "desc" },
      include: {
        technician: {
          select: { id: true, name: true, email: true, team: true }
        },
        serviceOrder: {
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            assignedTechnicianId: true
          }
        }
      }
    });

    return sendSuccess(reply, points);
  });

  fastify.get("/live", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const query = TeamLiveQuerySchema.parse(request.query);

    const after = new Date(Date.now() - query.minutes * 60_000);

    const rows = await fastify.prisma.teamLocationPing.findMany({
      where: {
        capturedAt: { gte: after },
        ...(query.technicianId ? { technicianId: query.technicianId } : {}),
        ...(!managerRoles.has(user.role) ? { technicianId: user.id } : {})
      },
      orderBy: { capturedAt: "desc" },
      include: {
        technician: {
          select: { id: true, name: true, email: true, team: true }
        },
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

    const latestByTechnician = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latestByTechnician.has(row.technicianId)) {
        latestByTechnician.set(row.technicianId, row);
      }
    }

    return sendSuccess(reply, {
      collectedAt: new Date(),
      items: Array.from(latestByTechnician.values())
    });
  });

  fastify.get("/monitoring", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);
    const query = TeamMonitoringQuerySchema.parse(request.query);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const technicians = await fastify.prisma.user.findMany({
      where: {
        role: "TECNICO",
        ...(query.technicianId ? { id: query.technicianId } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: "insensitive" } },
                { email: { contains: query.search, mode: "insensitive" } },
                { team: { contains: query.search, mode: "insensitive" } }
              ]
            }
          : {}),
        ...(!managerRoles.has(user.role) ? { id: user.id } : {})
      },
      select: {
        id: true,
        name: true,
        email: true,
        team: true
      },
      orderBy: {
        name: "asc"
      }
    });

    if (!technicians.length) {
      return sendSuccess(reply, {
        collectedAt: new Date(),
        staleMinutes: query.staleMinutes,
        latestAppVersion: query.latestAppVersion ?? null,
        items: []
      });
    }

    const technicianIds = technicians.map((technician) => technician.id);

    const latestCapturedRows = await fastify.prisma.teamLocationPing.groupBy({
      by: ["technicianId"],
      where: {
        technicianId: {
          in: technicianIds
        }
      },
      _max: {
        capturedAt: true
      }
    });

    const [latestPings, pendingByTechnician, completedTodayByTechnician, checkInsToday] =
      await Promise.all([
        Promise.all(
          latestCapturedRows.map((row) =>
            fastify.prisma.teamLocationPing.findFirst({
              where: {
                technicianId: row.technicianId,
                capturedAt: row._max.capturedAt ?? undefined
              },
              include: {
                serviceOrder: {
                  select: {
                    id: true,
                    code: true,
                    title: true,
                    status: true,
                    siteLocation: {
                      select: {
                        name: true,
                        address: true,
                        city: true,
                        state: true
                      }
                    }
                  }
                }
              }
            })
          )
        ),
        fastify.prisma.serviceOrder.groupBy({
          by: ["assignedTechnicianId"],
          where: {
            assignedTechnicianId: {
              in: technicianIds
            },
            status: {
              in: ["SCHEDULED", "DISPATCHED", "IN_PROGRESS", "ON_HOLD"]
            }
          },
          _count: {
            _all: true
          }
        }),
        fastify.prisma.serviceOrder.groupBy({
          by: ["assignedTechnicianId"],
          where: {
            assignedTechnicianId: {
              in: technicianIds
            },
            status: "COMPLETED",
            completedAt: {
              gte: dayStart,
              lt: dayEnd
            }
          },
          _count: {
            _all: true
          }
        }),
        fastify.prisma.serviceOrderLocationPoint.findMany({
          where: {
            type: ServiceOrderLocationType.CHECK_IN,
            capturedAt: {
              gte: dayStart,
              lt: dayEnd
            },
            serviceOrder: {
              assignedTechnicianId: {
                in: technicianIds
              }
            }
          },
          select: {
            serviceOrder: {
              select: {
                assignedTechnicianId: true
              }
            }
          }
        })
      ]);

    const pingMap = new Map(
      latestPings.filter(Boolean).map((ping) => [ping!.technicianId, ping!])
    );
    const pendingTaskMap = new Map(
      pendingByTechnician
        .filter((row) => row.assignedTechnicianId != null)
        .map((row) => [row.assignedTechnicianId as string, row._count._all])
    );
    const completedTodayTaskMap = new Map(
      completedTodayByTechnician
        .filter((row) => row.assignedTechnicianId != null)
        .map((row) => [row.assignedTechnicianId as string, row._count._all])
    );
    const checkInsTodayMap = checkInsToday.reduce((acc, row) => {
      const assignedTechnicianId = row.serviceOrder.assignedTechnicianId;
      if (!assignedTechnicianId) {
        return acc;
      }

      acc.set(assignedTechnicianId, (acc.get(assignedTechnicianId) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());

    const now = Date.now();
    const items = technicians.map((technician) => {
      const ping = pingMap.get(technician.id);
      const checkInsCount = checkInsTodayMap.get(technician.id) ?? 0;
      const pendingTasks = pendingTaskMap.get(technician.id) ?? 0;
      const completedTasksToday = completedTodayTaskMap.get(technician.id) ?? 0;
      if (!ping) {
        return {
          technician,
          lastPingAt: null,
          minutesWithoutPing: null,
          gpsStatus: TeamGpsStatus.UNAVAILABLE,
          internetStatus: TeamInternetStatus.UNAVAILABLE,
          batteryLevel: null,
          isCharging: null,
          appVersion: null,
          deviceModel: null,
          osVersion: null,
          source: null,
          location: null,
          serviceOrder: null,
          todayCheckIns: checkInsCount,
          pendingTasks,
          completedTasksToday,
          lastKnownAddress: null,
          riskLevel: "HIGH" as const,
          alerts: ["NO_MONITORING_RECORD"]
        };
      }

      const minutesWithoutPing = Math.round((now - ping.capturedAt.getTime()) / 60_000);
      const gpsStatus = resolveGpsStatus({
        gpsStatus: ping.gpsStatus,
        isMockLocation: ping.isMockLocation,
        accuracy: ping.accuracy
      });
      const internetStatus = resolveInternetStatus(ping.internetStatus);

      const alerts: string[] = [];
      if (minutesWithoutPing > query.staleMinutes) {
        alerts.push("STALE_PING");
      }
      if (gpsStatus === TeamGpsStatus.MOCKED || ping.isMockLocation) {
        alerts.push("POSSIBLE_GPS_SPOOFING");
      }
      if (gpsStatus === TeamGpsStatus.OFF || gpsStatus === TeamGpsStatus.UNAVAILABLE) {
        alerts.push("GPS_UNAVAILABLE");
      }
      if (
        internetStatus === TeamInternetStatus.OFFLINE ||
        internetStatus === TeamInternetStatus.UNAVAILABLE
      ) {
        alerts.push("INTERNET_OFFLINE");
      }
      if (ping.batteryLevel != null && ping.batteryLevel <= 10) {
        alerts.push("BATTERY_CRITICAL");
      }
      if (
        query.latestAppVersion &&
        ping.appVersion &&
        ping.appVersion !== query.latestAppVersion
      ) {
        alerts.push("APP_OUTDATED");
      }
      if (ping.integrityFlags.length) {
        alerts.push(...ping.integrityFlags.map((flag) => `FLAG_${flag.toUpperCase()}`));
      }

      return {
        technician,
        lastPingAt: ping.capturedAt,
        minutesWithoutPing,
        gpsStatus,
        internetStatus,
        batteryLevel: ping.batteryLevel ?? null,
        isCharging: ping.isCharging ?? null,
        appVersion: ping.appVersion ?? null,
        deviceModel: ping.deviceModel ?? null,
        osVersion: ping.osVersion ?? null,
        source: ping.source ?? null,
        location: {
          latitude: ping.latitude,
          longitude: ping.longitude,
          accuracy: ping.accuracy ?? null
        },
        serviceOrder: ping.serviceOrder ?? null,
        todayCheckIns: checkInsCount,
        pendingTasks,
        completedTasksToday,
        lastKnownAddress: ping.serviceOrder?.siteLocation
          ? [
              ping.serviceOrder.siteLocation.address,
              ping.serviceOrder.siteLocation.city,
              ping.serviceOrder.siteLocation.state
            ]
              .filter(Boolean)
              .join(", ")
          : null,
        riskLevel: getRiskLevel({
          alerts,
          minutesWithoutPing,
          staleMinutes: query.staleMinutes
        }),
        alerts
      };
    });

    return sendSuccess(reply, {
      collectedAt: new Date(),
      staleMinutes: query.staleMinutes,
      latestAppVersion: query.latestAppVersion ?? null,
      items
    });
  });
};
