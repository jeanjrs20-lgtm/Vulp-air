import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requirePermission } from "../../lib/authz.js";
import { sendSuccess } from "../../lib/envelope.js";

const OverviewQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  technicianId: z.string().optional()
});

const toNumber = (value: number | null | undefined, precision = 2) =>
  Number((value ?? 0).toFixed(precision));

const mapStatusCounts = (
  rows: Array<{
    status: string;
    _count: {
      _all: number;
    };
  }>
) => {
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.status] = row._count._all;
  }
  return map;
};

export const reportRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/overview", async (request, reply) => {
    await requirePermission(request, reply, "reports.read");
    const query = OverviewQuerySchema.parse(request.query);

    const createdAtRange = query.dateFrom || query.dateTo
      ? {
          createdAt: {
            ...(query.dateFrom ? { gte: query.dateFrom } : {}),
            ...(query.dateTo ? { lte: query.dateTo } : {})
          }
        }
      : undefined;

    const movementDateRange = query.dateFrom || query.dateTo
      ? {
          createdAt: {
            ...(query.dateFrom ? { gte: query.dateFrom } : {}),
            ...(query.dateTo ? { lte: query.dateTo } : {})
          }
        }
      : undefined;

    const serviceMaterialDateRange = query.dateFrom || query.dateTo
      ? {
          usedAt: {
            ...(query.dateFrom ? { gte: query.dateFrom } : {}),
            ...(query.dateTo ? { lte: query.dateTo } : {})
          }
        }
      : undefined;

    const serviceOrderWhere = {
      ...(query.technicianId ? { assignedTechnicianId: query.technicianId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: query.dateFrom } : {}),
              ...(query.dateTo ? { lte: query.dateTo } : {})
            }
          }
        : {})
    };

    const expenseWhere = {
      ...(query.technicianId ? { technicianId: query.technicianId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            expenseDate: {
              ...(query.dateFrom ? { gte: query.dateFrom } : {}),
              ...(query.dateTo ? { lte: query.dateTo } : {})
            }
          }
        : {})
    };

    const quoteWhere = {
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
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
        : {})
    };

    const feedbackWhere = {
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
        : {})
    };

    const inventoryMovementWhere = {
      ...(movementDateRange ?? {}),
      ...(query.technicianId ? { createdById: query.technicianId } : {})
    };

    const inventoryProductSignals: Array<Record<string, unknown>> = [];

    if (query.dateFrom || query.dateTo || query.technicianId) {
      if (createdAtRange) {
        inventoryProductSignals.push(createdAtRange);
      }

      inventoryProductSignals.push({
        movements: {
          some: {
            ...(movementDateRange ?? {}),
            ...(query.technicianId ? { createdById: query.technicianId } : {})
          }
        }
      });

      inventoryProductSignals.push({
        serviceMaterials: {
          some: {
            ...(serviceMaterialDateRange ?? {}),
            ...(query.technicianId
              ? {
                  serviceOrder: {
                    assignedTechnicianId: query.technicianId
                  }
                }
              : {})
          }
        }
      });
    }

    const inventoryProductWhere = inventoryProductSignals.length > 0
      ? {
          OR: inventoryProductSignals
        }
      : undefined;

    const deskWhere = {
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: query.dateFrom } : {}),
              ...(query.dateTo ? { lte: query.dateTo } : {})
            }
          }
        : {}),
      ...(query.technicianId ? { assignedTechnicianId: query.technicianId } : {})
    };

    const financeWhere = {
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
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
        : {})
    };

    const chatWhere = {
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: query.dateFrom } : {}),
              ...(query.dateTo ? { lte: query.dateTo } : {})
            }
          }
        : {}),
      ...(query.technicianId ? { assignedToId: query.technicianId } : {})
    };

    const [
      serviceOrderByStatus,
      serviceOrderTotal,
      quotesByStatus,
      quoteTotals,
      expenseTotals,
      expenseByType,
      feedbackAgg,
      feedbackDistribution,
      products,
      movementByType,
      technicians,
      deskByStatus,
      deskOverdue,
      financeByStatus,
      financeTotals,
      financeOverdue,
      paymentTotals,
      chatByStatus,
      chatByChannel,
      chatMessagesCount
    ] = await Promise.all([
      fastify.prisma.serviceOrder.groupBy({
        by: ["status"],
        where: serviceOrderWhere,
        _count: {
          _all: true
        }
      }),
      fastify.prisma.serviceOrder.count({
        where: serviceOrderWhere
      }),
      fastify.prisma.quote.groupBy({
        by: ["status"],
        where: quoteWhere,
        _count: {
          _all: true
        }
      }),
      fastify.prisma.quote.aggregate({
        where: quoteWhere,
        _sum: {
          total: true
        },
        _count: {
          _all: true
        }
      }),
      fastify.prisma.expenseEntry.aggregate({
        where: expenseWhere,
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
        where: expenseWhere,
        _sum: {
          amount: true,
          distanceKm: true
        },
        _count: {
          _all: true
        }
      }),
      fastify.prisma.customerFeedback.aggregate({
        where: feedbackWhere,
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
        where: feedbackWhere,
        _count: {
          _all: true
        }
      }),
      fastify.prisma.inventoryProduct.findMany({
        ...(inventoryProductWhere ? { where: inventoryProductWhere } : {}),
        select: {
          id: true,
          name: true,
          sku: true,
          currentStock: true,
          minStock: true,
          costPrice: true
        },
        orderBy: {
          name: "asc"
        }
      }),
      fastify.prisma.inventoryMovement.groupBy({
        by: ["type"],
        where: inventoryMovementWhere,
        _sum: {
          quantity: true
        },
        _count: {
          _all: true
        }
      }),
      fastify.prisma.user.findMany({
        where: {
          role: "TECNICO",
          ...(query.technicianId ? { id: query.technicianId } : {})
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
      }),
      fastify.prisma.deskTicket.groupBy({
        by: ["status"],
        where: deskWhere,
        _count: {
          _all: true
        }
      }),
      fastify.prisma.deskTicket.count({
        where: {
          ...deskWhere,
          dueAt: { lt: new Date() },
          status: {
            notIn: ["RESOLVED", "CLOSED", "CANCELLED"]
          }
        }
      }),
      fastify.prisma.financialInvoice.groupBy({
        by: ["status"],
        where: financeWhere,
        _count: {
          _all: true
        }
      }),
      fastify.prisma.financialInvoice.aggregate({
        where: financeWhere,
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
          ...financeWhere,
          dueDate: { lt: new Date() },
          status: {
            notIn: ["PAID", "CANCELED"]
          }
        }
      }),
      fastify.prisma.financialPayment.aggregate({
        where: {
          ...(query.dateFrom || query.dateTo
            ? {
                paidAt: {
                  ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                  ...(query.dateTo ? { lte: query.dateTo } : {})
                }
              }
            : {}),
          ...(query.technicianId
            ? {
                invoice: {
                  serviceOrder: {
                    assignedTechnicianId: query.technicianId
                  }
                }
              }
            : {})
        },
        _sum: {
          amount: true
        },
        _count: {
          _all: true
        }
      }),
      fastify.prisma.chatThread.groupBy({
        by: ["status"],
        where: chatWhere,
        _count: {
          _all: true
        }
      }),
      fastify.prisma.chatThread.groupBy({
        by: ["channel"],
        where: chatWhere,
        _count: {
          _all: true
        }
      }),
      fastify.prisma.chatMessage.count({
        where: {
          ...(query.dateFrom || query.dateTo
            ? {
                createdAt: {
                  ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                  ...(query.dateTo ? { lte: query.dateTo } : {})
                }
              }
            : {}),
          ...(query.technicianId
            ? {
                thread: {
                  assignedToId: query.technicianId
                }
              }
            : {})
        }
      })
    ]);

    const serviceOrderMap = mapStatusCounts(serviceOrderByStatus);
    const quoteMap = mapStatusCounts(quotesByStatus);
    const deskMap = mapStatusCounts(deskByStatus);
    const financeMap = mapStatusCounts(financeByStatus);
    const chatStatusMap = mapStatusCounts(chatByStatus);
    const chatChannelMap = chatByChannel.reduce<Record<string, number>>((acc, row) => {
      acc[row.channel] = row._count._all;
      return acc;
    }, {});

    const lowStockItems = products.filter((product) => product.currentStock <= product.minStock);
    const estimatedStockValue = products.reduce(
      (acc, product) => acc + product.currentStock * (product.costPrice ?? 0),
      0
    );

    const npsBuckets = feedbackDistribution.reduce(
      (acc, row) => {
        if (row.scoreNps === null || row.scoreNps === undefined) {
          return acc;
        }

        if (row.scoreNps >= 9) {
          acc.promoters += row._count._all;
        } else if (row.scoreNps >= 7) {
          acc.passives += row._count._all;
        } else {
          acc.detractors += row._count._all;
        }

        return acc;
      },
      {
        promoters: 0,
        passives: 0,
        detractors: 0
      }
    );

    const npsBase = npsBuckets.promoters + npsBuckets.passives + npsBuckets.detractors;
    const npsScore = npsBase
      ? Number((((npsBuckets.promoters - npsBuckets.detractors) / npsBase) * 100).toFixed(2))
      : 0;

    const productivityByTechnician = await Promise.all(
      technicians.map(async (technician) => {
        const [orders, expenses, feedback] = await Promise.all([
          fastify.prisma.serviceOrder.findMany({
            where: {
              assignedTechnicianId: technician.id,
              ...(query.dateFrom || query.dateTo
                ? {
                    createdAt: {
                      ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                      ...(query.dateTo ? { lte: query.dateTo } : {})
                    }
                  }
                : {})
            },
            select: {
              status: true,
              startedAt: true,
              completedAt: true
            }
          }),
          fastify.prisma.expenseEntry.aggregate({
            where: {
              technicianId: technician.id,
              ...(query.dateFrom || query.dateTo
                ? {
                    expenseDate: {
                      ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                      ...(query.dateTo ? { lte: query.dateTo } : {})
                    }
                  }
                : {})
            },
            _sum: {
              amount: true,
              distanceKm: true
            }
          }),
          fastify.prisma.customerFeedback.aggregate({
            where: {
              serviceOrder: {
                assignedTechnicianId: technician.id
              },
              ...(query.dateFrom || query.dateTo
                ? {
                    submittedAt: {
                      ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                      ...(query.dateTo ? { lte: query.dateTo } : {})
                    }
                  }
                : {})
            },
            _avg: {
              scoreNps: true,
              scoreCsat: true
            },
            _count: {
              _all: true
            }
          })
        ]);

        const completed = orders.filter((order) => order.status === "COMPLETED").length;
        const inProgress = orders.filter((order) => order.status === "IN_PROGRESS").length;

        const completedWithDuration = orders.filter(
          (order) => order.startedAt && order.completedAt
        );

        const avgExecutionMinutes = completedWithDuration.length
          ? completedWithDuration.reduce((acc, order) => {
              const duration =
                (new Date(order.completedAt!).getTime() - new Date(order.startedAt!).getTime()) /
                60_000;
              return acc + duration;
            }, 0) / completedWithDuration.length
          : 0;

        return {
          technicianId: technician.id,
          technicianName: technician.name,
          team: technician.team,
          totalOrders: orders.length,
          completedOrders: completed,
          inProgressOrders: inProgress,
          completionRate: orders.length ? Number(((completed / orders.length) * 100).toFixed(2)) : 0,
          avgExecutionMinutes: toNumber(avgExecutionMinutes),
          totalKm: toNumber(expenses._sum.distanceKm),
          totalExpensesAmount: toNumber(expenses._sum.amount),
          feedbackCount: feedback._count._all,
          avgNps: toNumber(feedback._avg.scoreNps),
          avgCsat: toNumber(feedback._avg.scoreCsat)
        };
      })
    );

    const approvedQuotes = quoteMap.APPROVED ?? 0;
    const quoteConversionRate = quoteTotals._count._all
      ? Number(((approvedQuotes / quoteTotals._count._all) * 100).toFixed(2))
      : 0;

    return sendSuccess(reply, {
      filters: {
        dateFrom: query.dateFrom ?? null,
        dateTo: query.dateTo ?? null,
        technicianId: query.technicianId ?? null
      },
      serviceOrders: {
        total: serviceOrderTotal,
        byStatus: {
          open: serviceOrderMap.OPEN ?? 0,
          scheduled: serviceOrderMap.SCHEDULED ?? 0,
          dispatched: serviceOrderMap.DISPATCHED ?? 0,
          inProgress: serviceOrderMap.IN_PROGRESS ?? 0,
          onHold: serviceOrderMap.ON_HOLD ?? 0,
          completed: serviceOrderMap.COMPLETED ?? 0,
          cancelled: serviceOrderMap.CANCELLED ?? 0
        }
      },
      quotes: {
        total: quoteTotals._count._all,
        approved: approvedQuotes,
        rejected: quoteMap.REJECTED ?? 0,
        sent: quoteMap.SENT ?? 0,
        draft: quoteMap.DRAFT ?? 0,
        expired: quoteMap.EXPIRED ?? 0,
        totalValue: toNumber(quoteTotals._sum.total),
        conversionRate: quoteConversionRate
      },
      expensesAndKm: {
        entries: expenseTotals._count._all,
        totalAmount: toNumber(expenseTotals._sum.amount),
        totalKm: toNumber(expenseTotals._sum.distanceKm),
        byType: expenseByType.map((item) => ({
          type: item.type,
          entries: item._count._all,
          totalAmount: toNumber(item._sum.amount),
          totalKm: toNumber(item._sum.distanceKm)
        }))
      },
      satisfaction: {
        feedbacks: feedbackAgg._count._all,
        avgNps: toNumber(feedbackAgg._avg.scoreNps),
        avgCsat: toNumber(feedbackAgg._avg.scoreCsat),
        npsScore,
        ...npsBuckets
      },
      inventory: {
        products: products.length,
        lowStockCount: lowStockItems.length,
        estimatedStockValue: toNumber(estimatedStockValue),
        lowStockItems: lowStockItems.slice(0, 20).map((item) => ({
          id: item.id,
          sku: item.sku,
          name: item.name,
          currentStock: item.currentStock,
          minStock: item.minStock
        })),
        movementByType: movementByType.map((item) => ({
          type: item.type,
          entries: item._count._all,
          quantity: toNumber(item._sum.quantity, 4)
        }))
      },
      desk: {
        total:
          (deskMap.OPEN ?? 0) +
          (deskMap.TRIAGE ?? 0) +
          (deskMap.IN_PROGRESS ?? 0) +
          (deskMap.ON_HOLD ?? 0) +
          (deskMap.RESOLVED ?? 0) +
          (deskMap.CLOSED ?? 0) +
          (deskMap.CANCELLED ?? 0),
        overdue: deskOverdue,
        byStatus: {
          open: deskMap.OPEN ?? 0,
          triage: deskMap.TRIAGE ?? 0,
          inProgress: deskMap.IN_PROGRESS ?? 0,
          onHold: deskMap.ON_HOLD ?? 0,
          resolved: deskMap.RESOLVED ?? 0,
          closed: deskMap.CLOSED ?? 0,
          cancelled: deskMap.CANCELLED ?? 0
        }
      },
      finance: {
        totalInvoices: financeTotals._count._all,
        overdue: financeOverdue,
        byStatus: {
          draft: financeMap.DRAFT ?? 0,
          issued: financeMap.ISSUED ?? 0,
          partiallyPaid: financeMap.PARTIALLY_PAID ?? 0,
          paid: financeMap.PAID ?? 0,
          overdue: financeMap.OVERDUE ?? 0,
          canceled: financeMap.CANCELED ?? 0
        },
        amounts: {
          total: toNumber(financeTotals._sum.totalAmount),
          paid: toNumber(financeTotals._sum.paidAmount),
          open: toNumber(financeTotals._sum.balanceAmount),
          received: toNumber(paymentTotals._sum.amount)
        },
        payments: {
          entries: paymentTotals._count._all
        }
      },
      chat: {
        totalThreads:
          (chatStatusMap.OPEN ?? 0) + (chatStatusMap.CLOSED ?? 0) + (chatStatusMap.ARCHIVED ?? 0),
        byStatus: {
          open: chatStatusMap.OPEN ?? 0,
          closed: chatStatusMap.CLOSED ?? 0,
          archived: chatStatusMap.ARCHIVED ?? 0
        },
        byChannel: {
          internal: chatChannelMap.INTERNAL ?? 0,
          whatsapp: chatChannelMap.WHATSAPP ?? 0,
          portal: chatChannelMap.PORTAL ?? 0,
          email: chatChannelMap.EMAIL ?? 0,
          phone: chatChannelMap.PHONE ?? 0
        },
        messages: chatMessagesCount
      },
      productivityByTechnician
    });
  });
};
