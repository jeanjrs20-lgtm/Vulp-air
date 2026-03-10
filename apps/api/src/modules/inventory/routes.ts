import type { FastifyPluginAsync } from "fastify";
import { InventoryMovementType } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../lib/app-error.js";
import { getRequestUser, sendSuccess } from "../../lib/envelope.js";
import { requirePermission } from "../../lib/authz.js";

const movementTypes = ["INBOUND", "OUTBOUND", "ADJUSTMENT", "RESERVED", "CONSUMED"] as const;

const ProductCreateSchema = z.object({
  sku: z.string().min(2),
  name: z.string().min(2),
  description: z.string().max(1000).optional(),
  unit: z.string().min(1).max(12).default("UN"),
  currentStock: z.number().min(0).default(0),
  minStock: z.number().min(0).default(0),
  maxStock: z.number().min(0).optional(),
  costPrice: z.number().min(0).optional(),
  salePrice: z.number().min(0).optional(),
  active: z.boolean().default(true)
});

const ProductUpdateSchema = ProductCreateSchema.partial();

const ProductListQuerySchema = z.object({
  search: z.string().optional(),
  active: z.enum(["true", "false"]).optional(),
  lowStockOnly: z.enum(["true", "false"]).optional()
});

const MovementCreateSchema = z.object({
  productId: z.string(),
  type: z.enum(movementTypes),
  quantity: z.number().refine((value) => value !== 0, {
    message: "Quantidade nao pode ser zero"
  }),
  unitCost: z.number().min(0).optional(),
  referenceType: z.string().max(64).optional(),
  referenceId: z.string().max(64).optional(),
  notes: z.string().max(1000).optional()
});

const MovementListQuerySchema = z.object({
  productId: z.string().optional(),
  type: z.enum(movementTypes).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(300)
});

const ServiceMaterialCreateSchema = z.object({
  productId: z.string(),
  quantity: z.number().positive(),
  unitCost: z.number().min(0).optional()
});

const calcStockDelta = (type: InventoryMovementType, quantity: number) => {
  const absolute = Math.abs(quantity);

  if (type === "INBOUND") {
    return absolute;
  }

  if (type === "ADJUSTMENT") {
    return quantity;
  }

  return -absolute;
};

const applyMovement = async (params: {
  tx: any;
  userId?: string;
  productId: string;
  type: InventoryMovementType;
  quantity: number;
  unitCost?: number;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
}) => {
  const product = await params.tx.inventoryProduct.findUnique({
    where: { id: params.productId }
  });

  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Produto nao encontrado");
  }

  const delta = calcStockDelta(params.type, params.quantity);
  const nextStock = Number((product.currentStock + delta).toFixed(4));

  if (nextStock < 0) {
    throw new AppError(409, "INSUFFICIENT_STOCK", "Estoque insuficiente para movimentacao");
  }

  await params.tx.inventoryProduct.update({
    where: { id: product.id },
    data: {
      currentStock: nextStock
    }
  });

  return params.tx.inventoryMovement.create({
    data: {
      productId: product.id,
      type: params.type,
      quantity: Math.abs(params.quantity),
      unitCost: params.unitCost,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      notes: params.notes,
      createdById: params.userId
    },
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          currentStock: true,
          minStock: true
        }
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          role: true
        }
      }
    }
  });
};

const isServiceOrderReference = (referenceType?: string | null) =>
  (referenceType ?? "").toUpperCase() === "SERVICE_ORDER";

const isTransferEvent = (movement: { referenceType?: string | null; notes?: string | null }) =>
  /\btransfer/i.test(`${movement.referenceType ?? ""} ${movement.notes ?? ""}`);

const isSaleEvent = (movement: { referenceType?: string | null; notes?: string | null }) =>
  /\b(sale|sold|venda|vendido)\b/i.test(`${movement.referenceType ?? ""} ${movement.notes ?? ""}`);

const formatMovementTitle = (type: InventoryMovementType) => {
  if (type === "INBOUND") return "Entrada de estoque";
  if (type === "OUTBOUND") return "Saida de estoque";
  if (type === "ADJUSTMENT") return "Ajuste de estoque";
  if (type === "RESERVED") return "Reserva de estoque";
  return "Consumo de estoque";
};

export const inventoryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/products", async (request, reply) => {
    await requirePermission(request, reply, "inventory.manage");
    const query = ProductListQuerySchema.parse(request.query);

    const products = await fastify.prisma.inventoryProduct.findMany({
      where: {
        ...(query.search
          ? {
              OR: [
                { sku: { contains: query.search, mode: "insensitive" } },
                { name: { contains: query.search, mode: "insensitive" } }
              ]
            }
          : {}),
        ...(query.active
          ? {
              active: query.active === "true"
            }
          : {})
      },
      orderBy: [{ name: "asc" }]
    });

    const lowStockItems = products.filter((product) => product.currentStock <= product.minStock);
    const items = query.lowStockOnly === "true" ? lowStockItems : products;

    return sendSuccess(reply, {
      items,
      stats: {
        total: items.length,
        lowStock: lowStockItems.length
      }
    });
  });

  fastify.get<{ Params: { id: string } }>("/products/:id/history", async (request, reply) => {
    await requirePermission(request, reply, "inventory.manage");

    const product = await fastify.prisma.inventoryProduct.findUnique({
      where: { id: request.params.id }
    });

    if (!product) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Produto nao encontrado");
    }

    const [movements, serviceMaterials] = await Promise.all([
      fastify.prisma.inventoryMovement.findMany({
        where: { productId: product.id },
        orderBy: { createdAt: "asc" },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              role: true
            }
          }
        }
      }),
      fastify.prisma.serviceOrderMaterial.findMany({
        where: { productId: product.id },
        orderBy: { usedAt: "asc" },
        include: {
          serviceOrder: {
            select: {
              id: true,
              code: true,
              title: true,
              status: true,
              serviceDate: true,
              completedAt: true,
              cancelledAt: true,
              customer: {
                select: {
                  id: true,
                  name: true
                }
              },
              siteLocation: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      })
    ]);

    const serviceOrderIds = Array.from(
      new Set([
        ...movements
          .filter((movement) => isServiceOrderReference(movement.referenceType) && movement.referenceId)
          .map((movement) => movement.referenceId as string),
        ...serviceMaterials.map((material) => material.serviceOrderId)
      ])
    );

    const serviceOrders = serviceOrderIds.length
      ? await fastify.prisma.serviceOrder.findMany({
          where: {
            id: {
              in: serviceOrderIds
            }
          },
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            serviceDate: true,
            completedAt: true,
            cancelledAt: true,
            customer: {
              select: {
                id: true,
                name: true
              }
            },
            siteLocation: {
              select: {
                id: true,
                name: true
              }
            },
            assignedTechnician: {
              select: {
                id: true,
                name: true
              }
            },
            checklistExecution: {
              select: {
                id: true,
                status: true,
                submittedAt: true,
                approvedAt: true,
                templateVersion: {
                  select: {
                    template: {
                      select: {
                        id: true,
                        name: true,
                        serviceType: true
                      }
                    }
                  }
                }
              }
            }
          }
        })
      : [];

    const serviceOrderMap = new Map(serviceOrders.map((order) => [order.id, order]));

    const timeline: Array<{
      id: string;
      at: Date;
      title: string;
      description: string;
      type: string;
      tags: string[];
      actor?: {
        id: string;
        name: string;
        role: string;
      } | null;
      reference?: {
        type: string;
        id?: string | null;
        code?: string | null;
        status?: string | null;
        customer?: string | null;
        site?: string | null;
      } | null;
    }> = [
      {
        id: `PRODUCT_CREATED-${product.id}`,
        at: product.createdAt,
        title: "Produto cadastrado no estoque",
        description: `${product.sku} - ${product.name}`,
        type: "PRODUCT_CREATED",
        tags: ["cadastro"]
      }
    ];

    for (const movement of movements) {
      const linkedServiceOrder =
        isServiceOrderReference(movement.referenceType) && movement.referenceId
          ? serviceOrderMap.get(movement.referenceId)
          : null;

      const movementTags = [movement.type.toLowerCase()];
      if (linkedServiceOrder) {
        movementTags.push("os");
      }
      if (isTransferEvent(movement)) {
        movementTags.push("transferencia");
      }
      if (isSaleEvent(movement)) {
        movementTags.push("venda");
      }
      if (linkedServiceOrder?.checklistExecution) {
        movementTags.push("checklist");
        if (linkedServiceOrder.checklistExecution.templateVersion.template.serviceType === "PMOC") {
          movementTags.push("pmoc");
        }
      }
      if (linkedServiceOrder && ["COMPLETED", "CANCELLED"].includes(linkedServiceOrder.status)) {
        movementTags.push("encerrado");
      }

      const descriptionParts = [
        `Quantidade: ${movement.quantity} ${product.unit}`,
        movement.unitCost != null ? `Custo unitario: ${movement.unitCost}` : null,
        linkedServiceOrder ? `OS: ${linkedServiceOrder.code} - ${linkedServiceOrder.title}` : null,
        linkedServiceOrder?.customer ? `Cliente: ${linkedServiceOrder.customer.name}` : null,
        linkedServiceOrder?.siteLocation ? `Unidade: ${linkedServiceOrder.siteLocation.name}` : null,
        linkedServiceOrder?.assignedTechnician
          ? `Tecnico: ${linkedServiceOrder.assignedTechnician.name}`
          : null,
        linkedServiceOrder?.checklistExecution
          ? `Checklist: ${linkedServiceOrder.checklistExecution.status}`
          : null,
        linkedServiceOrder?.checklistExecution?.templateVersion.template.serviceType === "PMOC"
          ? "Atendimento PMOC"
          : null,
        movement.notes ? `Observacao: ${movement.notes}` : null
      ].filter(Boolean) as string[];

      timeline.push({
        id: `MOVEMENT-${movement.id}`,
        at: movement.createdAt,
        title: formatMovementTitle(movement.type),
        description: descriptionParts.join(" | "),
        type: movement.type,
        tags: movementTags,
        actor: movement.createdBy,
        reference: movement.referenceType
          ? {
              type: movement.referenceType,
              id: movement.referenceId,
              code: linkedServiceOrder?.code ?? null,
              status: linkedServiceOrder?.status ?? null,
              customer: linkedServiceOrder?.customer?.name ?? null,
              site: linkedServiceOrder?.siteLocation?.name ?? null
            }
          : null
      });
    }

    for (const material of serviceMaterials) {
      const mappedServiceOrder = serviceOrderMap.get(material.serviceOrderId);
      const serviceOrder = mappedServiceOrder ?? material.serviceOrder;
      if (!serviceOrder) {
        continue;
      }

      const materialTags = ["aplicacao", "os"];
      if (serviceOrder.status === "COMPLETED" || serviceOrder.status === "CANCELLED") {
        materialTags.push("encerrado");
      }

      if (mappedServiceOrder?.checklistExecution) {
        materialTags.push("checklist");
        const serviceType =
          mappedServiceOrder.checklistExecution.templateVersion.template.serviceType;
        if (serviceType === "PMOC") {
          materialTags.push("pmoc");
        }
      }

      timeline.push({
        id: `SERVICE_MATERIAL-${material.id}`,
        at: material.usedAt,
        title: "Material aplicado em ordem de servico",
        description: [
          `OS: ${serviceOrder.code} - ${serviceOrder.title}`,
          `Quantidade: ${material.quantity} ${product.unit}`,
          material.totalCost != null ? `Custo total: ${material.totalCost}` : null,
          serviceOrder.customer ? `Cliente: ${serviceOrder.customer.name}` : null,
          serviceOrder.siteLocation ? `Unidade: ${serviceOrder.siteLocation.name}` : null
        ]
          .filter(Boolean)
          .join(" | "),
        type: "SERVICE_MATERIAL",
        tags: materialTags,
        reference: {
          type: "SERVICE_ORDER",
          id: serviceOrder.id,
          code: serviceOrder.code,
          status: serviceOrder.status,
          customer: serviceOrder.customer?.name ?? null,
          site: serviceOrder.siteLocation?.name ?? null
        }
      });
    }

    timeline.sort((a, b) => a.at.getTime() - b.at.getTime());

    const summary = movements.reduce(
      (acc, movement) => {
        acc.totalMovements += 1;
        if (movement.type === "INBOUND") acc.inboundQty += movement.quantity;
        if (movement.type === "OUTBOUND") acc.outboundQty += movement.quantity;
        if (movement.type === "CONSUMED") acc.consumedQty += movement.quantity;
        if (movement.type === "RESERVED") acc.reservedQty += movement.quantity;
        if (movement.type === "ADJUSTMENT") acc.adjustmentEntries += 1;
        return acc;
      },
      {
        totalMovements: 0,
        inboundQty: 0,
        outboundQty: 0,
        consumedQty: 0,
        reservedQty: 0,
        adjustmentEntries: 0
      }
    );

    return sendSuccess(reply, {
      product,
      summary: {
        ...summary,
        timelineEntries: timeline.length,
        serviceApplications: serviceMaterials.length,
        currentStock: product.currentStock,
        minStock: product.minStock,
        maxStock: product.maxStock ?? null
      },
      timeline: timeline.map((item) => ({
        ...item,
        at: item.at.toISOString()
      }))
    });
  });

  fastify.post("/products", async (request, reply) => {
    await requirePermission(request, reply, "inventory.manage");
    const input = ProductCreateSchema.parse(request.body);

    const product = await fastify.prisma.inventoryProduct.create({
      data: {
        sku: input.sku.trim(),
        name: input.name.trim(),
        description: input.description,
        unit: input.unit,
        currentStock: input.currentStock,
        minStock: input.minStock,
        maxStock: input.maxStock,
        costPrice: input.costPrice,
        salePrice: input.salePrice,
        active: input.active
      }
    });

    return sendSuccess(reply, product);
  });

  fastify.patch<{ Params: { id: string } }>("/products/:id", async (request, reply) => {
    await requirePermission(request, reply, "inventory.manage");
    const input = ProductUpdateSchema.parse(request.body);

    const product = await fastify.prisma.inventoryProduct.findUnique({
      where: { id: request.params.id },
      select: { id: true }
    });

    if (!product) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Produto nao encontrado");
    }

    const updated = await fastify.prisma.inventoryProduct.update({
      where: { id: request.params.id },
      data: {
        ...(input.sku !== undefined ? { sku: input.sku.trim() } : {}),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.currentStock !== undefined ? { currentStock: input.currentStock } : {}),
        ...(input.minStock !== undefined ? { minStock: input.minStock } : {}),
        ...(input.maxStock !== undefined ? { maxStock: input.maxStock } : {}),
        ...(input.costPrice !== undefined ? { costPrice: input.costPrice } : {}),
        ...(input.salePrice !== undefined ? { salePrice: input.salePrice } : {}),
        ...(input.active !== undefined ? { active: input.active } : {})
      }
    });

    return sendSuccess(reply, updated);
  });

  fastify.get("/movements", async (request, reply) => {
    await requirePermission(request, reply, "inventory.manage");
    const query = MovementListQuerySchema.parse(request.query);

    const movements = await fastify.prisma.inventoryMovement.findMany({
      where: {
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.dateFrom || query.dateTo
          ? {
              createdAt: {
                ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                ...(query.dateTo ? { lte: query.dateTo } : {})
              }
            }
          : {})
      },
      orderBy: { createdAt: "desc" },
      take: query.limit,
      include: {
        product: {
          select: { id: true, sku: true, name: true, unit: true }
        },
        createdBy: {
          select: { id: true, name: true, role: true }
        }
      }
    });

    return sendSuccess(reply, movements);
  });

  fastify.post("/movements", async (request, reply) => {
    await requirePermission(request, reply, "inventory.manage");
    const user = getRequestUser(request);
    const input = MovementCreateSchema.parse(request.body);

    const movement = await fastify.prisma.$transaction((tx) =>
      applyMovement({
        tx,
        userId: user.id,
        productId: input.productId,
        type: input.type as InventoryMovementType,
        quantity: input.quantity,
        unitCost: input.unitCost,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        notes: input.notes
      })
    );

    return sendSuccess(reply, movement);
  });

  fastify.get<{ Params: { serviceOrderId: string } }>(
    "/service-orders/:serviceOrderId/materials",
    async (request, reply) => {
      await requirePermission(request, reply, "inventory.manage");

      const materials = await fastify.prisma.serviceOrderMaterial.findMany({
        where: { serviceOrderId: request.params.serviceOrderId },
        orderBy: { usedAt: "desc" },
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              unit: true
            }
          }
        }
      });

      return sendSuccess(reply, materials);
    }
  );

  fastify.post<{ Params: { serviceOrderId: string } }>(
    "/service-orders/:serviceOrderId/materials",
    async (request, reply) => {
      await requirePermission(request, reply, "inventory.manage");
      const user = getRequestUser(request);
      const input = ServiceMaterialCreateSchema.parse(request.body);

      const serviceOrder = await fastify.prisma.serviceOrder.findUnique({
        where: { id: request.params.serviceOrderId },
        select: { id: true, code: true }
      });

      if (!serviceOrder) {
        throw new AppError(404, "SERVICE_ORDER_NOT_FOUND", "Ordem de servico nao encontrada");
      }

      const result = await fastify.prisma.$transaction(async (tx) => {
        const movement = await applyMovement({
          tx,
          userId: user.id,
          productId: input.productId,
          type: InventoryMovementType.CONSUMED,
          quantity: input.quantity,
          unitCost: input.unitCost,
          referenceType: "SERVICE_ORDER",
          referenceId: serviceOrder.id,
          notes: `Consumo em OS ${serviceOrder.code}`
        });

        const material = await tx.serviceOrderMaterial.create({
          data: {
            serviceOrderId: serviceOrder.id,
            productId: input.productId,
            quantity: input.quantity,
            unitCost: input.unitCost ?? movement.unitCost,
            totalCost:
              input.unitCost != null
                ? Number((input.unitCost * input.quantity).toFixed(2))
                : movement.unitCost != null
                  ? Number((movement.unitCost * input.quantity).toFixed(2))
                  : undefined
          },
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                unit: true
              }
            }
          }
        });

        await tx.serviceOrderEvent.create({
          data: {
            serviceOrderId: serviceOrder.id,
            actorId: user.id,
            type: "MATERIAL_CONSUMED",
            payload: {
              productId: input.productId,
              quantity: input.quantity,
              movementId: movement.id
            }
          }
        });

        return {
          movement,
          material
        };
      });

      return sendSuccess(reply, result);
    }
  );
};
