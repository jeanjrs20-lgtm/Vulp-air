import type { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../lib/authz.js";
import { sendSuccess } from "../../lib/envelope.js";

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/kpis", async (request, reply) => {
    await requirePermission(request, reply, "dashboard.read");

    const byStatus = await fastify.prisma.checklistExecution.groupBy({
      by: ["status"],
      _count: { _all: true }
    });

    const map = byStatus.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});

    const [executionTime] = (await fastify.prisma.$queryRawUnsafe(`
      SELECT COALESCE(AVG(EXTRACT(EPOCH FROM ("submittedAt" - "startedAt")) / 60), 0) AS value
      FROM "ChecklistExecution"
      WHERE "startedAt" IS NOT NULL AND "submittedAt" IS NOT NULL
    `)) as Array<{ value: number }>;

    const [reviewTime] = (await fastify.prisma.$queryRawUnsafe(`
      SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE("approvedAt", "reviewedAt") - "submittedAt")) / 60), 0) AS value
      FROM "ChecklistExecution"
      WHERE "submittedAt" IS NOT NULL AND ("approvedAt" IS NOT NULL OR "reviewedAt" IS NOT NULL)
    `)) as Array<{ value: number }>;

    const monthlyVolume = (await fastify.prisma.$queryRawUnsafe(`
      SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
             COUNT(*)::int AS total
      FROM "ChecklistExecution"
      GROUP BY 1
      ORDER BY 1
    `)) as Array<{ month: string; total: number }>;

    const [totals] = (await fastify.prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END)::int AS rejected
      FROM "ChecklistExecution"
    `)) as Array<{ total: number; rejected: number }>;

    const topNonConformities = (await fastify.prisma.$queryRawUnsafe(`
      SELECT i.label, COUNT(*)::int AS total
      FROM "ChecklistAnswer" a
      JOIN "ChecklistItem" i ON i.id = a."checklistItemId"
      WHERE a."isNonConformity" = true
      GROUP BY i.label
      ORDER BY total DESC
      LIMIT 5
    `)) as Array<{ label: string; total: number }>;

    const recentActivities = await fastify.prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            role: true
          }
        }
      }
    });

    return sendSuccess(reply, {
      kpis: {
        pending: map.DRAFT ?? 0,
        inProgress: map.IN_PROGRESS ?? 0,
        submitted: map.SUBMITTED ?? 0,
        approved: map.APPROVED ?? 0,
        rejected: map.REJECTED ?? 0,
        reopened: map.REOPENED ?? 0,
        underReview: map.UNDER_REVIEW ?? 0,
        avgExecutionMinutes: Number(executionTime?.value ?? 0),
        avgReviewMinutes: Number(reviewTime?.value ?? 0)
      },
      charts: {
        monthlyVolume,
        rejectionRate: totals?.total ? Number(((totals.rejected / totals.total) * 100).toFixed(2)) : 0,
        topNonConformities
      },
      recentActivities
    });
  });
};
