import type { FastifyPluginAsync } from "fastify";
import { Prisma } from "@prisma/client";
import { ChecklistTemplateCreateSchema } from "@vulp/shared";
import { z } from "zod";
import { requireAuth, requirePermission } from "../../lib/authz.js";
import { AppError } from "../../lib/app-error.js";
import { getRequestUser, sendSuccess } from "../../lib/envelope.js";
import { generateChecklistPdfAsset } from "../../services/report-pdf.js";
import { diagnosticTemplateSeeds, ensureDiagnosticTemplates } from "./diagnostic-templates.js";

const AssignExecutionSchema = z.object({
  templateVersionId: z.string(),
  assignedTechnicianId: z.string(),
  customerId: z.string().optional(),
  siteLocationId: z.string().optional(),
  equipmentId: z.string().optional(),
  serviceDate: z.coerce.date().optional()
});

const ProgressSchema = z.object({
  step: z.number().min(1).max(5).optional(),
  notes: z.string().optional(),
  technicianSignature: z.string().optional(),
  localResponsibleSignature: z.string().optional(),
  answers: z
    .array(
      z.object({
        checklistItemId: z.string(),
        valueJson: z.any().optional(),
        textValue: z.string().optional(),
        numberValue: z.number().optional(),
        booleanValue: z.boolean().optional(),
        optionValue: z.string().optional(),
        notes: z.string().optional(),
        isNonConformity: z.boolean().optional(),
        attachmentIds: z.array(z.string()).optional()
      })
    )
    .optional()
});

const ReviewApproveSchema = z.object({
  supervisorSignature: z.string().optional()
});

const ReviewRejectSchema = z.object({
  comments: z.array(
    z.object({
      checklistItemId: z.string().optional(),
      comment: z.string().min(2)
    })
  )
});

const reviewQueueQuerySchema = z.object({
  technicianId: z.string().optional(),
  status: z
    .enum(["SUBMITTED", "UNDER_REVIEW", "REOPENED", "REJECTED", "APPROVED", "IN_PROGRESS", "DRAFT"])
    .optional(),
  customerId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional()
});

const generateCode = () => {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `CHK-${date}-${random}`;
};

const logAudit = async (
  prisma: any,
  params: {
    actorId?: string;
    entity: string;
    entityId: string;
    action: string;
    payload?: Prisma.JsonValue;
    checklistExecutionId?: string;
  }
) => {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      entity: params.entity,
      entityId: params.entityId,
      action: params.action,
      payload: params.payload,
      checklistExecutionId: params.checklistExecutionId
    }
  });
};

const hasNokReasons = (valueJson: unknown, notes?: string | null) => {
  const reasonsFromJson =
    Array.isArray(valueJson) &&
    valueJson.some((entry) => typeof entry === "string" && entry.trim().length > 0);
  const notesFilled = typeof notes === "string" && notes.trim().length > 0;
  return Boolean(reasonsFromJson || notesFilled);
};

export const checklistRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/options", async (request, reply) => {
    await requireAuth(request, reply);

    const [technicians, customers, sites, equipments] = await Promise.all([
      fastify.prisma.user.findMany({
        where: {
          role: "TECNICO"
        },
        select: {
          id: true,
          name: true,
          email: true
        },
        orderBy: {
          name: "asc"
        }
      }),
      fastify.prisma.customer.findMany({
        select: {
          id: true,
          name: true
        },
        orderBy: {
          name: "asc"
        }
      }),
      fastify.prisma.siteLocation.findMany({
        select: {
          id: true,
          name: true,
          customerId: true
        },
        orderBy: {
          name: "asc"
        }
      }),
      fastify.prisma.equipment.findMany({
        select: {
          id: true,
          brand: true,
          model: true,
          siteLocationId: true
        },
        orderBy: {
          createdAt: "desc"
        }
      })
    ]);

    return sendSuccess(reply, {
      technicians,
      customers,
      sites,
      equipments
    });
  });

  fastify.get("/templates", async (request, reply) => {
    await requireAuth(request, reply);

    const templates = await fastify.prisma.checklistTemplate.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          include: {
            sections: {
              orderBy: { order: "asc" },
              include: {
                items: {
                  orderBy: { order: "asc" }
                }
              }
            }
          }
        }
      }
    });

    return sendSuccess(reply, templates);
  });

  fastify.get("/templates/diagnostic-blueprints", async (request, reply) => {
    await requireAuth(request, reply);
    return sendSuccess(reply, diagnosticTemplateSeeds);
  });

  fastify.post("/templates/bootstrap-diagnostic", async (request, reply) => {
    await requirePermission(request, reply, "checklist.template.manage");
    const user = getRequestUser(request);

    const result = await ensureDiagnosticTemplates({
      db: fastify.prisma,
      createdById: user.id
    });

    await logAudit(fastify.prisma, {
      actorId: user.id,
      entity: "ChecklistTemplate",
      entityId: "diagnostic-blueprints",
      action: "TEMPLATE_DIAGNOSTIC_BOOTSTRAP",
      payload: result as unknown as Prisma.JsonValue
    });

    return sendSuccess(reply, result);
  });

  fastify.post("/templates", async (request, reply) => {
    await requirePermission(request, reply, "checklist.template.manage");
    const input = ChecklistTemplateCreateSchema.parse(request.body);
    const user = getRequestUser(request);

    const result = await fastify.prisma.$transaction(async (tx) => {
      const template = await tx.checklistTemplate.create({
        data: {
          name: input.name,
          description: input.description,
          serviceType: input.serviceType,
          createdById: user.id
        }
      });

      const version = await tx.checklistTemplateVersion.create({
        data: {
          templateId: template.id,
          version: 1,
          isActive: true
        }
      });

      for (let sectionIndex = 0; sectionIndex < input.sections.length; sectionIndex += 1) {
        const sectionData = input.sections[sectionIndex];
        const section = await tx.checklistSection.create({
          data: {
            templateVersionId: version.id,
            title: sectionData.title,
            order: sectionIndex + 1
          }
        });

        for (let itemIndex = 0; itemIndex < sectionData.items.length; itemIndex += 1) {
          const itemData = sectionData.items[itemIndex];
          await tx.checklistItem.create({
            data: {
              sectionId: section.id,
              label: itemData.label,
              itemType: itemData.itemType,
              unit: itemData.unit,
              options: itemData.options,
              required: itemData.required ?? false,
              order: itemIndex + 1
            }
          });
        }
      }

      await logAudit(tx, {
        actorId: user.id,
        entity: "ChecklistTemplate",
        entityId: template.id,
        action: "TEMPLATE_CREATED",
        payload: input as unknown as Prisma.JsonValue
      });

      return template;
    });

    return sendSuccess(reply, result);
  });

  fastify.put<{ Params: { id: string } }>("/templates/:id", async (request, reply) => {
    await requirePermission(request, reply, "checklist.template.manage");
    const input = ChecklistTemplateCreateSchema.parse(request.body);
    const user = getRequestUser(request);

    const template = await fastify.prisma.checklistTemplate.findUnique({
      where: { id: request.params.id },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1
        }
      }
    });

    if (!template) {
      throw new AppError(404, "TEMPLATE_NOT_FOUND", "Template não encontrado");
    }

    const currentVersion = template.versions[0]?.version ?? 0;

    const updated = await fastify.prisma.$transaction(async (tx) => {
      await tx.checklistTemplate.update({
        where: { id: request.params.id },
        data: {
          name: input.name,
          description: input.description,
          serviceType: input.serviceType
        }
      });

      const version = await tx.checklistTemplateVersion.create({
        data: {
          templateId: request.params.id,
          version: currentVersion + 1,
          isActive: true
        }
      });

      for (let sectionIndex = 0; sectionIndex < input.sections.length; sectionIndex += 1) {
        const sectionData = input.sections[sectionIndex];
        const section = await tx.checklistSection.create({
          data: {
            templateVersionId: version.id,
            title: sectionData.title,
            order: sectionIndex + 1
          }
        });

        for (let itemIndex = 0; itemIndex < sectionData.items.length; itemIndex += 1) {
          const itemData = sectionData.items[itemIndex];
          await tx.checklistItem.create({
            data: {
              sectionId: section.id,
              label: itemData.label,
              itemType: itemData.itemType,
              unit: itemData.unit,
              options: itemData.options,
              required: itemData.required ?? false,
              order: itemIndex + 1
            }
          });
        }
      }

      await logAudit(tx, {
        actorId: user.id,
        entity: "ChecklistTemplate",
        entityId: request.params.id,
        action: "TEMPLATE_VERSION_CREATED",
        payload: { version: currentVersion + 1 } as Prisma.JsonValue
      });

      return version;
    });

    return sendSuccess(reply, updated);
  });

  fastify.post("/executions/assign", async (request, reply) => {
    await requirePermission(request, reply, "checklist.execution.manage");
    const input = AssignExecutionSchema.parse(request.body);
    const user = getRequestUser(request);

    const templateVersion = await fastify.prisma.checklistTemplateVersion.findUnique({
      where: { id: input.templateVersionId }
    });

    if (!templateVersion) {
      throw new AppError(404, "TEMPLATE_VERSION_NOT_FOUND", "Versão de template não encontrada");
    }

    const execution = await fastify.prisma.checklistExecution.create({
      data: {
        code: generateCode(),
        templateVersionId: templateVersion.id,
        assignedTechnicianId: input.assignedTechnicianId,
        customerId: input.customerId,
        siteLocationId: input.siteLocationId,
        equipmentId: input.equipmentId,
        serviceDate: input.serviceDate,
        status: "DRAFT"
      }
    });

    await logAudit(fastify.prisma, {
      actorId: user.id,
      entity: "ChecklistExecution",
      entityId: execution.id,
      action: "EXECUTION_ASSIGNED",
      payload: input as unknown as Prisma.JsonValue,
      checklistExecutionId: execution.id
    });

    return sendSuccess(reply, execution);
  });

  fastify.get("/executions/my", async (request, reply) => {
    await requireAuth(request, reply);
    const user = getRequestUser(request);

    const where = user.role === "TECNICO"
      ? { assignedTechnicianId: user.id }
      : {};

    const executions = await fastify.prisma.checklistExecution.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        templateVersion: {
          include: {
            template: true,
            sections: {
              orderBy: { order: "asc" },
              include: {
                items: {
                  orderBy: { order: "asc" }
                }
              }
            }
          }
        },
        customer: true,
        siteLocation: true,
        equipment: true,
        answers: true,
        mediaAssets: true,
        reviewComments: true
      }
    });

    return sendSuccess(reply, executions);
  });

  fastify.get("/executions/review-queue", async (request, reply) => {
    await requirePermission(request, reply, "checklist.review.manage");
    const query = reviewQueueQuerySchema.parse(request.query);

    const where: Prisma.ChecklistExecutionWhereInput = {
      status: query.status ? query.status : { in: ["SUBMITTED", "UNDER_REVIEW", "REOPENED"] },
      ...(query.technicianId ? { assignedTechnicianId: query.technicianId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: query.dateFrom } : {}),
              ...(query.dateTo ? { lte: query.dateTo } : {})
            }
          }
        : {})
    };

    const queue = await fastify.prisma.checklistExecution.findMany({
      where,
      orderBy: { submittedAt: "asc" },
      include: {
        assignedTechnician: {
          select: { id: true, name: true }
        },
        customer: {
          select: { id: true, name: true }
        },
        siteLocation: {
          select: { id: true, name: true }
        },
        templateVersion: {
          include: {
            template: true
          }
        }
      }
    });

    return sendSuccess(reply, queue);
  });

  fastify.get<{ Params: { id: string } }>("/executions/:id", async (request, reply) => {
    await requireAuth(request, reply);

    const execution = await fastify.prisma.checklistExecution.findUnique({
      where: { id: request.params.id },
      include: {
        templateVersion: {
          include: {
            template: true,
            sections: {
              orderBy: { order: "asc" },
              include: {
                items: {
                  orderBy: { order: "asc" }
                }
              }
            }
          }
        },
        answers: {
          include: {
            attachments: true
          }
        },
        reviewComments: {
          include: {
            checklistItem: true,
            createdBy: {
              select: { id: true, name: true, role: true }
            }
          }
        },
        mediaAssets: true,
        assignedTechnician: {
          select: { id: true, name: true }
        },
        reviewedBy: {
          select: { id: true, name: true }
        },
        customer: true,
        siteLocation: true,
        equipment: true,
        pdfAsset: true
      }
    });

    if (!execution) {
      throw new AppError(404, "EXECUTION_NOT_FOUND", "Execução não encontrada");
    }

    return sendSuccess(reply, execution);
  });

  fastify.patch<{ Params: { id: string } }>("/executions/:id/progress", async (request, reply) => {
    await requireAuth(request, reply);
    const input = ProgressSchema.parse(request.body);
    const user = getRequestUser(request);

    const execution = await fastify.prisma.checklistExecution.findUnique({
      where: { id: request.params.id }
    });

    if (!execution) {
      throw new AppError(404, "EXECUTION_NOT_FOUND", "Execução não encontrada");
    }

    if (user.role === "TECNICO" && execution.assignedTechnicianId !== user.id) {
      throw new AppError(403, "FORBIDDEN", "Você não pode editar este atendimento");
    }

    if (
      user.role === "TECNICO" &&
      !["DRAFT", "IN_PROGRESS", "REOPENED"].includes(execution.status)
    ) {
      throw new AppError(
        409,
        "INVALID_STATUS",
        "Tecnico so pode editar quando status esta em DRAFT, IN_PROGRESS ou REOPENED"
      );
    }

    if (
      input.answers?.some(
        (answer) => answer.booleanValue === false && !hasNokReasons(answer.valueJson, answer.notes)
      )
    ) {
      throw new AppError(
        409,
        "NOK_REASON_REQUIRED",
        "Para marcar NOK, informe ao menos um motivo predefinido"
      );
    }

    const updated = await fastify.prisma.$transaction(async (tx) => {
      const next = await tx.checklistExecution.update({
        where: { id: request.params.id },
        data: {
          step: input.step,
          notes: input.notes,
          technicianSignature: input.technicianSignature,
          localResponsibleSignature: input.localResponsibleSignature,
          status: execution.status === "DRAFT" ? "IN_PROGRESS" : execution.status,
          startedAt: execution.startedAt ?? new Date()
        }
      });

      if (input.answers?.length) {
        for (const answer of input.answers) {
          const record = await tx.checklistAnswer.upsert({
            where: {
              executionId_checklistItemId: {
                executionId: request.params.id,
                checklistItemId: answer.checklistItemId
              }
            },
            update: {
              valueJson: answer.valueJson,
              textValue: answer.textValue,
              numberValue: answer.numberValue,
              booleanValue: answer.booleanValue,
              optionValue: answer.optionValue,
              notes: answer.notes,
              isNonConformity: answer.isNonConformity ?? false
            },
            create: {
              executionId: request.params.id,
              checklistItemId: answer.checklistItemId,
              valueJson: answer.valueJson,
              textValue: answer.textValue,
              numberValue: answer.numberValue,
              booleanValue: answer.booleanValue,
              optionValue: answer.optionValue,
              notes: answer.notes,
              isNonConformity: answer.isNonConformity ?? false
            }
          });

          if (answer.attachmentIds?.length) {
            await tx.checklistAnswer.update({
              where: { id: record.id },
              data: {
                attachments: {
                  set: answer.attachmentIds.map((id) => ({ id }))
                }
              }
            });
          }
        }
      }

      await logAudit(tx, {
        actorId: user.id,
        entity: "ChecklistExecution",
        entityId: request.params.id,
        action: "EXECUTION_PROGRESS_SAVED",
        payload: input as unknown as Prisma.JsonValue,
        checklistExecutionId: request.params.id
      });

      return next;
    });

    return sendSuccess(reply, updated);
  });

  fastify.post<{ Params: { id: string } }>("/executions/:id/submit", async (request, reply) => {
    await requireAuth(request, reply);
    const user = getRequestUser(request);

    const execution = await fastify.prisma.checklistExecution.findUnique({
      where: { id: request.params.id }
    });

    if (!execution) {
      throw new AppError(404, "EXECUTION_NOT_FOUND", "Execução não encontrada");
    }

    if (user.role === "TECNICO" && execution.assignedTechnicianId !== user.id) {
      throw new AppError(403, "FORBIDDEN", "Você não pode submeter este atendimento");
    }

    if (!["IN_PROGRESS", "REOPENED"].includes(execution.status)) {
      throw new AppError(409, "INVALID_STATUS", "Atendimento precisa estar em execução para submeter");
    }

    const answers = await fastify.prisma.checklistAnswer.findMany({
      where: {
        executionId: request.params.id
      },
      select: {
        booleanValue: true,
        valueJson: true,
        notes: true
      }
    });

    const invalidNokAnswer = answers.some(
      (answer) => answer.booleanValue === false && !hasNokReasons(answer.valueJson, answer.notes)
    );
    if (invalidNokAnswer) {
      throw new AppError(
        409,
        "NOK_REASON_REQUIRED",
        "Nao e possivel submeter: existe item NOK sem motivo preenchido"
      );
    }

    const submitted = await fastify.prisma.checklistExecution.update({
      where: { id: request.params.id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        step: 5
      }
    });

    await logAudit(fastify.prisma, {
      actorId: user.id,
      entity: "ChecklistExecution",
      entityId: request.params.id,
      action: "EXECUTION_SUBMITTED",
      checklistExecutionId: request.params.id
    });

    return sendSuccess(reply, submitted);
  });

  fastify.post<{ Params: { id: string } }>("/executions/:id/review/approve", async (request, reply) => {
    await requirePermission(request, reply, "checklist.review.manage");
    const input = ReviewApproveSchema.parse(request.body);
    const user = getRequestUser(request);

    const execution = await fastify.prisma.checklistExecution.findUnique({ where: { id: request.params.id } });
    if (!execution) {
      throw new AppError(404, "EXECUTION_NOT_FOUND", "Execução não encontrada");
    }

    const approved = await fastify.prisma.checklistExecution.update({
      where: { id: request.params.id },
      data: {
        status: "APPROVED",
        reviewedById: user.id,
        reviewedAt: new Date(),
        approvedAt: new Date(),
        supervisorSignature: input.supervisorSignature
      }
    });

    await logAudit(fastify.prisma, {
      actorId: user.id,
      entity: "ChecklistExecution",
      entityId: request.params.id,
      action: "EXECUTION_APPROVED",
      checklistExecutionId: request.params.id
    });

    return sendSuccess(reply, approved);
  });

  fastify.post<{ Params: { id: string } }>("/executions/:id/review/reject", async (request, reply) => {
    await requirePermission(request, reply, "checklist.review.manage");
    const input = ReviewRejectSchema.parse(request.body);
    const user = getRequestUser(request);

    const execution = await fastify.prisma.checklistExecution.findUnique({ where: { id: request.params.id } });
    if (!execution) {
      throw new AppError(404, "EXECUTION_NOT_FOUND", "Execução não encontrada");
    }

    const rejected = await fastify.prisma.$transaction(async (tx) => {
      for (const entry of input.comments) {
        await tx.reviewComment.create({
          data: {
            executionId: request.params.id,
            checklistItemId: entry.checklistItemId,
            comment: entry.comment,
            createdById: user.id
          }
        });
      }

      const result = await tx.checklistExecution.update({
        where: { id: request.params.id },
        data: {
          status: "REJECTED",
          reviewedById: user.id,
          reviewedAt: new Date()
        }
      });

      await logAudit(tx, {
        actorId: user.id,
        entity: "ChecklistExecution",
        entityId: request.params.id,
        action: "EXECUTION_REJECTED",
        payload: input as unknown as Prisma.JsonValue,
        checklistExecutionId: request.params.id
      });

      return result;
    });

    return sendSuccess(reply, rejected);
  });

  fastify.post<{ Params: { id: string } }>("/executions/:id/review/reopen", async (request, reply) => {
    await requirePermission(request, reply, "checklist.review.manage");
    const input = ReviewRejectSchema.parse(request.body);
    const user = getRequestUser(request);

    const execution = await fastify.prisma.checklistExecution.findUnique({ where: { id: request.params.id } });
    if (!execution) {
      throw new AppError(404, "EXECUTION_NOT_FOUND", "Execução não encontrada");
    }

    const reopened = await fastify.prisma.$transaction(async (tx) => {
      for (const entry of input.comments) {
        await tx.reviewComment.create({
          data: {
            executionId: request.params.id,
            checklistItemId: entry.checklistItemId,
            comment: entry.comment,
            createdById: user.id
          }
        });
      }

      const result = await tx.checklistExecution.update({
        where: { id: request.params.id },
        data: {
          status: "REOPENED",
          reviewedById: user.id,
          reviewedAt: new Date(),
          step: 2
        }
      });

      await logAudit(tx, {
        actorId: user.id,
        entity: "ChecklistExecution",
        entityId: request.params.id,
        action: "EXECUTION_REOPENED",
        payload: input as unknown as Prisma.JsonValue,
        checklistExecutionId: request.params.id
      });

      return result;
    });

    return sendSuccess(reply, reopened);
  });

  fastify.post<{ Params: { id: string } }>("/executions/:id/emit-pdf", async (request, reply) => {
    await requirePermission(request, reply, "checklist.review.manage");
    const user = getRequestUser(request);

    const execution = await fastify.prisma.checklistExecution.findUnique({
      where: { id: request.params.id },
      include: {
        templateVersion: {
          include: {
            template: true,
            sections: {
              orderBy: { order: "asc" },
              include: {
                items: {
                  orderBy: { order: "asc" }
                }
              }
            }
          }
        },
        answers: {
          include: { attachments: true }
        },
        mediaAssets: true,
        assignedTechnician: true,
        reviewedBy: true,
        customer: true,
        siteLocation: true,
        pdfAsset: true
      }
    });

    if (!execution) {
      throw new AppError(404, "EXECUTION_NOT_FOUND", "Execução não encontrada");
    }

    if (execution.status !== "APPROVED") {
      throw new AppError(409, "INVALID_STATUS", "PDF só pode ser emitido após aprovação");
    }

    const mediaAsset = await generateChecklistPdfAsset({
      prisma: fastify.prisma,
      execution
    });

    await fastify.prisma.checklistExecution.update({
      where: { id: execution.id },
      data: {
        pdfAssetId: mediaAsset.id
      }
    });

    await logAudit(fastify.prisma, {
      actorId: user.id,
      entity: "ChecklistExecution",
      entityId: execution.id,
      action: "PDF_EMITTED",
      payload: { pdfAssetId: mediaAsset.id } as Prisma.JsonValue,
      checklistExecutionId: execution.id
    });

    return sendSuccess(reply, mediaAsset);
  });
};

