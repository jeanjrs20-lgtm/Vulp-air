import type { FastifyPluginAsync } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../lib/app-error.js";
import { requirePermission } from "../../lib/authz.js";
import { getRequestUser, sendSuccess } from "../../lib/envelope.js";

const managerRoles = new Set(["SUPERADMIN", "ADMIN", "SUPERVISOR"]);
const isManager = (role: string) => managerRoles.has(role);

const CustomerStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

const CustomerSiteInputSchema = z.object({
  name: z.string().min(2),
  address: z.string().min(5),
  city: z.string().max(120).optional(),
  state: z.string().max(2).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  geofenceRadiusMeters: z.number().min(20).max(5000).optional()
});

const CustomerCreateSchema = z.object({
  name: z.string().min(2),
  legalName: z.string().max(200).optional(),
  document: z.string().max(32).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  status: CustomerStatusSchema.default("ACTIVE"),
  customerGroup: z.string().max(120).optional(),
  segment: z.string().max(120).optional(),
  contactName: z.string().max(160).optional(),
  billingEmail: z.string().email().optional(),
  notes: z.string().max(5000).optional(),
  sites: z.array(CustomerSiteInputSchema).max(50).optional()
});

const CustomerUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  legalName: z.string().max(200).nullable().optional(),
  document: z.string().max(32).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  status: CustomerStatusSchema.optional(),
  customerGroup: z.string().max(120).nullable().optional(),
  segment: z.string().max(120).nullable().optional(),
  contactName: z.string().max(160).nullable().optional(),
  billingEmail: z.string().email().nullable().optional(),
  notes: z.string().max(5000).nullable().optional()
});

const CustomerListQuerySchema = z.object({
  searchName: z.string().optional(),
  searchDocument: z.string().optional(),
  status: CustomerStatusSchema.optional(),
  customerGroup: z.string().optional(),
  segment: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional()
});

const CustomerSiteUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().min(5).optional(),
  city: z.string().max(120).nullable().optional(),
  state: z.string().max(2).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  geofenceRadiusMeters: z.number().min(20).max(5000).nullable().optional()
});

const mapCustomerRow = <T extends { customerId: string | null; _count: { _all: number } }>(
  rows: T[]
) =>
  rows.reduce<Record<string, number>>((acc, row) => {
    if (!row.customerId) {
      return acc;
    }

    acc[row.customerId] = row._count._all;
    return acc;
  }, {});

export const customerRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/summary", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");

    const [total, active, inactive, openTickets, overdueInvoices] = await Promise.all([
      fastify.prisma.customer.count(),
      fastify.prisma.customer.count({
        where: {
          status: "ACTIVE"
        }
      }),
      fastify.prisma.customer.count({
        where: {
          status: "INACTIVE"
        }
      }),
      fastify.prisma.deskTicket.groupBy({
        by: ["customerId"],
        where: {
          status: {
            in: ["OPEN", "TRIAGE", "IN_PROGRESS", "ON_HOLD"]
          }
        },
        _count: {
          _all: true
        }
      }),
      fastify.prisma.financialInvoice.groupBy({
        by: ["customerId"],
        where: {
          status: "OVERDUE"
        },
        _count: {
          _all: true
        }
      })
    ]);

    return sendSuccess(reply, {
      total,
      active,
      inactive,
      withOpenTickets: openTickets.length,
      withOverdueInvoices: overdueInvoices.length
    });
  });

  fastify.get("/options", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");

    const [groups, segments, states, cities] = await Promise.all([
      fastify.prisma.customer.findMany({
        where: {
          customerGroup: {
            not: null
          }
        },
        select: {
          customerGroup: true
        },
        distinct: ["customerGroup"]
      }),
      fastify.prisma.customer.findMany({
        where: {
          segment: {
            not: null
          }
        },
        select: {
          segment: true
        },
        distinct: ["segment"]
      }),
      fastify.prisma.siteLocation.findMany({
        where: {
          state: {
            not: null
          }
        },
        select: {
          state: true
        },
        distinct: ["state"]
      }),
      fastify.prisma.siteLocation.findMany({
        where: {
          city: {
            not: null
          }
        },
        select: {
          city: true
        },
        distinct: ["city"]
      })
    ]);

    return sendSuccess(reply, {
      statuses: ["ACTIVE", "INACTIVE"],
      groups: groups.map((item) => item.customerGroup).filter(Boolean),
      segments: segments.map((item) => item.segment).filter(Boolean),
      states: states.map((item) => item.state).filter(Boolean),
      cities: cities.map((item) => item.city).filter(Boolean)
    });
  });

  fastify.get("/", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const query = CustomerListQuerySchema.parse(request.query);

    const where: Prisma.CustomerWhereInput = {
      ...(query.searchName
        ? {
            name: {
              contains: query.searchName,
              mode: "insensitive"
            }
          }
        : {}),
      ...(query.searchDocument
        ? {
            document: {
              contains: query.searchDocument,
              mode: "insensitive"
            }
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerGroup ? { customerGroup: query.customerGroup } : {}),
      ...(query.segment ? { segment: query.segment } : {}),
      ...(query.city || query.state
        ? {
            sites: {
              some: {
                ...(query.city ? { city: query.city } : {}),
                ...(query.state ? { state: query.state } : {})
              }
            }
          }
        : {})
    };

    const customers = await fastify.prisma.customer.findMany({
      where,
      orderBy: {
        name: "asc"
      },
      include: {
        sites: {
          orderBy: {
            name: "asc"
          },
          select: {
            id: true,
            name: true,
            city: true,
            state: true
          }
        }
      }
    });

    const customerIds = customers.map((customer) => customer.id);

    const [openTicketRows, overdueInvoiceRows, openOrderRows] =
      customerIds.length > 0
        ? await Promise.all([
            fastify.prisma.deskTicket.groupBy({
              by: ["customerId"],
              where: {
                customerId: {
                  in: customerIds
                },
                status: {
                  in: ["OPEN", "TRIAGE", "IN_PROGRESS", "ON_HOLD"]
                }
              },
              _count: {
                _all: true
              }
            }),
            fastify.prisma.financialInvoice.groupBy({
              by: ["customerId"],
              where: {
                customerId: {
                  in: customerIds
                },
                status: "OVERDUE"
              },
              _count: {
                _all: true
              }
            }),
            fastify.prisma.serviceOrder.groupBy({
              by: ["customerId"],
              where: {
                customerId: {
                  in: customerIds
                },
                status: {
                  in: ["OPEN", "SCHEDULED", "DISPATCHED", "IN_PROGRESS", "ON_HOLD"]
                }
              },
              _count: {
                _all: true
              }
            })
          ])
        : [[], [], []];

    const openTicketMap = mapCustomerRow(openTicketRows);
    const overdueInvoiceMap = mapCustomerRow(overdueInvoiceRows);
    const openOrderMap = mapCustomerRow(openOrderRows);

    return sendSuccess(
      reply,
      customers.map((customer) => ({
        ...customer,
        openTickets: openTicketMap[customer.id] ?? 0,
        overdueInvoices: overdueInvoiceMap[customer.id] ?? 0,
        openServiceOrders: openOrderMap[customer.id] ?? 0
      }))
    );
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");

    const customer = await fastify.prisma.customer.findUnique({
      where: {
        id: request.params.id
      },
      include: {
        sites: {
          orderBy: {
            name: "asc"
          }
        },
        serviceOrders: {
          orderBy: {
            createdAt: "desc"
          },
          take: 15,
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            serviceDate: true
          }
        },
        deskTickets: {
          orderBy: {
            createdAt: "desc"
          },
          take: 15,
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true
          }
        }
      }
    });

    if (!customer) {
      throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente nao encontrado");
    }

    const [invoiceSummary, quoteSummary] = await Promise.all([
      fastify.prisma.financialInvoice.aggregate({
        where: {
          customerId: customer.id
        },
        _sum: {
          totalAmount: true,
          balanceAmount: true
        },
        _count: {
          _all: true
        }
      }),
      fastify.prisma.quote.aggregate({
        where: {
          customerId: customer.id
        },
        _sum: {
          total: true
        },
        _count: {
          _all: true
        }
      })
    ]);

    return sendSuccess(reply, {
      ...customer,
      metrics: {
        totalInvoices: invoiceSummary._count._all,
        totalBilled: Number((invoiceSummary._sum.totalAmount ?? 0).toFixed(2)),
        totalOutstanding: Number((invoiceSummary._sum.balanceAmount ?? 0).toFixed(2)),
        totalQuotes: quoteSummary._count._all,
        totalQuoted: Number((quoteSummary._sum.total ?? 0).toFixed(2))
      }
    });
  });

  fastify.post("/", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);

    if (!isManager(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem cadastrar clientes");
    }

    const input = CustomerCreateSchema.parse(request.body);

    const created = await fastify.prisma.customer.create({
      data: {
        name: input.name,
        legalName: input.legalName,
        document: input.document,
        email: input.email,
        phone: input.phone,
        status: input.status,
        customerGroup: input.customerGroup,
        segment: input.segment,
        contactName: input.contactName,
        billingEmail: input.billingEmail,
        notes: input.notes,
        sites: input.sites?.length
          ? {
              createMany: {
                data: input.sites.map((site) => ({
                  name: site.name,
                  address: site.address,
                  city: site.city,
                  state: site.state,
                  latitude: site.latitude,
                  longitude: site.longitude,
                  geofenceRadiusMeters: site.geofenceRadiusMeters
                }))
              }
            }
          : undefined
      },
      include: {
        sites: true
      }
    });

    return sendSuccess(reply, created);
  });

  fastify.patch<{ Params: { id: string } }>("/:id", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);

    if (!isManager(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem editar clientes");
    }

    const input = CustomerUpdateSchema.parse(request.body);
    const exists = await fastify.prisma.customer.findUnique({
      where: {
        id: request.params.id
      },
      select: {
        id: true
      }
    });

    if (!exists) {
      throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente nao encontrado");
    }

    const updated = await fastify.prisma.customer.update({
      where: {
        id: request.params.id
      },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
        ...(input.document !== undefined ? { document: input.document } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.customerGroup !== undefined ? { customerGroup: input.customerGroup } : {}),
        ...(input.segment !== undefined ? { segment: input.segment } : {}),
        ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
        ...(input.billingEmail !== undefined ? { billingEmail: input.billingEmail } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {})
      },
      include: {
        sites: true
      }
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/:id/sites", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);

    if (!isManager(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem cadastrar unidades");
    }

    const input = CustomerSiteInputSchema.parse(request.body);
    const customer = await fastify.prisma.customer.findUnique({
      where: {
        id: request.params.id
      },
      select: {
        id: true
      }
    });

    if (!customer) {
      throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente nao encontrado");
    }

    const site = await fastify.prisma.siteLocation.create({
      data: {
        customerId: customer.id,
        name: input.name,
        address: input.address,
        city: input.city,
        state: input.state,
        latitude: input.latitude,
        longitude: input.longitude,
        geofenceRadiusMeters: input.geofenceRadiusMeters
      }
    });

    return sendSuccess(reply, site);
  });

  fastify.patch<{ Params: { id: string; siteId: string } }>("/:id/sites/:siteId", async (request, reply) => {
    await requirePermission(request, reply, "serviceOrder.manage");
    const user = getRequestUser(request);

    if (!isManager(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Apenas gestores podem editar unidades");
    }

    const input = CustomerSiteUpdateSchema.parse(request.body);

    const site = await fastify.prisma.siteLocation.findUnique({
      where: {
        id: request.params.siteId
      },
      select: {
        id: true,
        customerId: true
      }
    });

    if (!site || site.customerId !== request.params.id) {
      throw new AppError(404, "SITE_NOT_FOUND", "Unidade nao encontrada para este cliente");
    }

    const updated = await fastify.prisma.siteLocation.update({
      where: {
        id: site.id
      },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
        ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
        ...(input.geofenceRadiusMeters !== undefined
          ? { geofenceRadiusMeters: input.geofenceRadiusMeters }
          : {})
      }
    });

    return sendSuccess(reply, updated);
  });
};
