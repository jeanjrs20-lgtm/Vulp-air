import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/app-error.js";
import { requireAuth, requirePermission } from "../../lib/authz.js";
import { getRequestUser, sendSuccess } from "../../lib/envelope.js";
import { saveLocalFile, toPublicAssetUrl } from "../../lib/storage.js";
import { extractPdfContent, ingestPopChunks, searchPopHybrid } from "../../services/pop-search.js";
import { generateStandardPopPdf } from "../../services/pop-standard-pdf.js";

const SearchSchema = z.object({
  q: z.string().min(2),
  category: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  tags: z.string().optional()
});

const CreateStandardPopSchema = z.object({
  title: z.string().min(5),
  category: z.string().min(2),
  area: z.string().min(2),
  code: z.string().min(3).optional(),
  revision: z.string().min(1).default("00"),
  objective: z.string().min(10),
  scope: z.string().min(10),
  responsibilities: z.string().min(10),
  materials: z.array(z.string().min(1)).default([]),
  epis: z.array(z.string().min(1)).default([]),
  procedureSteps: z.array(z.string().min(3)).min(3),
  safetyRequirements: z.array(z.string().min(1)).default([]),
  qualityCriteria: z.array(z.string().min(1)).default([]),
  records: z.array(z.string().min(1)).default([]),
  references: z.array(z.string().min(1)).default([]),
  preparedBy: z.string().min(2),
  reviewedBy: z.string().optional(),
  approvedBy: z.string().min(2),
  effectiveDate: z.coerce.date(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("DRAFT"),
  tags: z.array(z.string().min(1)).default([])
});

const toSlug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const createPopFromPdfBuffer = async (params: {
  prisma: any;
  title: string;
  category: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  tags: string[];
  buffer: Buffer;
  fileName: string;
  createdById: string;
  explicitVersion?: number;
}) => {
  const latest = await params.prisma.popDocument.findFirst({
    where: { title: params.title },
    orderBy: { version: "desc" }
  });

  const version =
    typeof params.explicitVersion === "number" && Number.isFinite(params.explicitVersion)
      ? params.explicitVersion
      : (latest?.version ?? 0) + 1;

  const savedPdf = await saveLocalFile({
    folder: "pops",
    originalName: params.fileName,
    buffer: params.buffer,
    contentType: "application/pdf"
  });

  const pdfAsset = await params.prisma.mediaAsset.create({
    data: {
      type: "PDF",
      title: params.title,
      tags: params.tags,
      storageKey: savedPdf.storageKey,
      mimeType: "application/pdf",
      size: params.buffer.length,
      createdById: params.createdById
    }
  });

  const pop = await params.prisma.popDocument.create({
    data: {
      title: params.title,
      category: params.category,
      tags: params.tags,
      version,
      status: params.status as never,
      pdfAssetId: pdfAsset.id,
      createdById: params.createdById
    }
  });

  const extracted = await extractPdfContent(params.buffer);

  let thumbnailAssetId: string | null = null;
  if (extracted.thumbnail) {
    const savedThumb = await saveLocalFile({
      folder: "pops/thumbs",
      originalName: `${toSlug(params.title)}-thumb.png`,
      buffer: extracted.thumbnail,
      contentType: "image/png"
    });

    const thumbAsset = await params.prisma.mediaAsset.create({
      data: {
        type: "THUMBNAIL",
        title: `${params.title} preview`,
        tags: ["pop-thumbnail", ...params.tags],
        storageKey: savedThumb.storageKey,
        mimeType: "image/png",
        size: extracted.thumbnail.length,
        createdById: params.createdById
      }
    });

    thumbnailAssetId = thumbAsset.id;
  }

  await params.prisma.popDocument.update({
    where: { id: pop.id },
    data: {
      thumbnailAssetId: thumbnailAssetId ?? undefined
    }
  });

  await ingestPopChunks(params.prisma, {
    popId: pop.id,
    pages: extracted.pages
  });

  return params.prisma.popDocument.findUnique({
    where: { id: pop.id },
    include: {
      pdfAsset: true,
      thumbnailAsset: true
    }
  });
};

export const popRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    await requireAuth(request, reply);

    const docs = await fastify.prisma.popDocument.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        pdfAsset: true,
        thumbnailAsset: true
      }
    });

    return sendSuccess(
      reply,
      docs.map((doc) => ({
        ...doc,
        pdfUrl: toPublicAssetUrl(doc.pdfAsset.storageKey),
        thumbnailUrl: doc.thumbnailAsset ? toPublicAssetUrl(doc.thumbnailAsset.storageKey) : null
      }))
    );
  });

  fastify.post("/upload", async (request, reply) => {
    await requirePermission(request, reply, "pop.manage");

    const file = await request.file();
    if (!file) {
      throw new AppError(400, "FILE_REQUIRED", "PDF é obrigatório");
    }

    if (file.mimetype !== "application/pdf") {
      throw new AppError(400, "INVALID_FILE", "Apenas PDF é aceito");
    }

    const fields = file.fields as Record<string, any>;
    const getFieldValue = (key: string) => {
      const raw = fields[key];
      if (Array.isArray(raw)) {
        return raw[0]?.value as string | undefined;
      }
      return raw?.value as string | undefined;
    };

    const title = getFieldValue("title")?.trim();
    const category = getFieldValue("category")?.trim();
    const status = (getFieldValue("status") ?? "DRAFT").toUpperCase();
    const explicitVersion = getFieldValue("version");
    const tags = (getFieldValue("tags") ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (!title || !category) {
      throw new AppError(400, "INVALID_INPUT", "title e category são obrigatórios");
    }

    const buffer = await file.toBuffer();
    const user = getRequestUser(request);
    const created = await createPopFromPdfBuffer({
      prisma: fastify.prisma,
      title,
      category,
      status: status as "DRAFT" | "ACTIVE" | "ARCHIVED",
      tags,
      buffer,
      fileName: file.filename,
      createdById: user.id,
      explicitVersion: explicitVersion ? Number(explicitVersion) : undefined
    });

    return sendSuccess(reply, {
      ...created,
      pdfUrl: created?.pdfAsset ? toPublicAssetUrl(created.pdfAsset.storageKey) : null,
      thumbnailUrl: created?.thumbnailAsset ? toPublicAssetUrl(created.thumbnailAsset.storageKey) : null
    });
  });

  fastify.post("/create-standard", async (request, reply) => {
    await requirePermission(request, reply, "pop.manage");
    const input = CreateStandardPopSchema.parse(request.body);
    const user = getRequestUser(request);

    const code =
      input.code ??
      `POP-${toSlug(input.category).toUpperCase().slice(0, 6) || "GERAL"}-${new Date().getTime()
        .toString()
        .slice(-6)}`;

    const pdfBuffer = await generateStandardPopPdf({
      companyName: "VULP AIR",
      code,
      revision: input.revision,
      title: input.title,
      category: input.category,
      area: input.area,
      objective: input.objective,
      scope: input.scope,
      responsibilities: input.responsibilities,
      materials: input.materials,
      epis: input.epis,
      procedureSteps: input.procedureSteps,
      safetyRequirements: input.safetyRequirements,
      qualityCriteria: input.qualityCriteria,
      records: input.records,
      references: input.references,
      preparedBy: input.preparedBy,
      reviewedBy: input.reviewedBy,
      approvedBy: input.approvedBy,
      effectiveDateIso: input.effectiveDate.toISOString(),
      generatedAtIso: new Date().toISOString()
    });

    const created = await createPopFromPdfBuffer({
      prisma: fastify.prisma,
      title: input.title,
      category: input.category,
      status: input.status,
      tags: Array.from(new Set(["pop-estruturado", "padrão-brasil", ...input.tags])),
      buffer: pdfBuffer,
      fileName: `${toSlug(input.title)}.pdf`,
      createdById: user.id
    });

    return sendSuccess(reply, {
      ...created,
      pdfUrl: created?.pdfAsset ? toPublicAssetUrl(created.pdfAsset.storageKey) : null,
      thumbnailUrl: created?.thumbnailAsset ? toPublicAssetUrl(created.thumbnailAsset.storageKey) : null
    });
  });

  fastify.get("/search", async (request, reply) => {
    await requireAuth(request, reply);

    const query = SearchSchema.parse(request.query);
    const tags = query.tags
      ? query.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : undefined;

    const results = await searchPopHybrid(fastify.prisma, {
      query: query.q,
      category: query.category,
      status: query.status,
      tags
    });

    const thumbnailIds = results
      .map((item) => item.thumbnailAssetId)
      .filter((value): value is string => Boolean(value));

    const thumbnailAssets = thumbnailIds.length
      ? await fastify.prisma.mediaAsset.findMany({
          where: {
            id: {
              in: thumbnailIds
            }
          },
          select: {
            id: true,
            storageKey: true
          }
        })
      : [];

    const thumbnailMap = new Map(
      thumbnailAssets.map((asset) => [asset.id, toPublicAssetUrl(asset.storageKey)])
    );

    return sendSuccess(
      reply,
      results.map((item) => ({
        ...item,
        thumbnailUrl: item.thumbnailAssetId ? (thumbnailMap.get(item.thumbnailAssetId) ?? null) : null
      }))
    );
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    await requireAuth(request, reply);

    const pop = await fastify.prisma.popDocument.findUnique({
      where: { id: request.params.id },
      include: {
        pdfAsset: true,
        thumbnailAsset: true
      }
    });

    if (!pop) {
      throw new AppError(404, "POP_NOT_FOUND", "POP não encontrado");
    }

    return sendSuccess(reply, {
      ...pop,
      pdfUrl: toPublicAssetUrl(pop.pdfAsset.storageKey),
      thumbnailUrl: pop.thumbnailAsset ? toPublicAssetUrl(pop.thumbnailAsset.storageKey) : null
    });
  });

  fastify.post<{ Params: { id: string } }>("/:id/open", async (request, reply) => {
    await requireAuth(request, reply);
    const user = getRequestUser(request);

    const pop = await fastify.prisma.popDocument.findUnique({ where: { id: request.params.id } });
    if (!pop) {
      throw new AppError(404, "POP_NOT_FOUND", "POP não encontrado");
    }

    const receipt = await fastify.prisma.popReadReceipt.upsert({
      where: {
        userId_popId_version: {
          userId: user.id,
          popId: pop.id,
          version: pop.version
        }
      },
      update: {
        openedAt: new Date()
      },
      create: {
        userId: user.id,
        popId: pop.id,
        version: pop.version,
        openedAt: new Date()
      }
    });

    return sendSuccess(reply, receipt);
  });

  fastify.post<{ Params: { id: string } }>("/:id/ack", async (request, reply) => {
    await requireAuth(request, reply);
    const user = getRequestUser(request);

    const pop = await fastify.prisma.popDocument.findUnique({ where: { id: request.params.id } });
    if (!pop) {
      throw new AppError(404, "POP_NOT_FOUND", "POP não encontrado");
    }

    const receipt = await fastify.prisma.popReadReceipt.upsert({
      where: {
        userId_popId_version: {
          userId: user.id,
          popId: pop.id,
          version: pop.version
        }
      },
      update: {
        openedAt: new Date(),
        acknowledgedAt: new Date()
      },
      create: {
        userId: user.id,
        popId: pop.id,
        version: pop.version,
        openedAt: new Date(),
        acknowledgedAt: new Date()
      }
    });

    return sendSuccess(reply, receipt);
  });

  fastify.get("/reports/read", async (request, reply) => {
    await requirePermission(request, reply, "pop.manage");

    const popId = (request.query as any)?.popId as string | undefined;

    const where = popId ? { popId } : {};

    const receipts = await fastify.prisma.popReadReceipt.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        pop: {
          select: {
            id: true,
            title: true,
            version: true
          }
        }
      },
      orderBy: {
        openedAt: "desc"
      }
    });

    return sendSuccess(reply, receipts);
  });
};

