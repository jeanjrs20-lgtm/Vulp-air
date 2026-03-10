import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/app-error.js";
import { requireAuth } from "../../lib/authz.js";
import { sendSuccess } from "../../lib/envelope.js";
import { readStoredFileBuffer, saveLocalFile, toPublicAssetUrl } from "../../lib/storage.js";

const ListQuerySchema = z.object({
  type: z.enum(["PHOTO", "PDF", "THUMBNAIL", "SIGNATURE", "OTHER"]).optional(),
  tags: z.string().optional(),
  checklistId: z.string().optional(),
  popId: z.string().optional(),
  authorId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional()
});

const inferType = (mimeType: string) => {
  if (mimeType.includes("pdf")) {
    return "PDF" as const;
  }
  if (mimeType.startsWith("image/")) {
    return "PHOTO" as const;
  }
  return "OTHER" as const;
};

export const mediaRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/upload", async (request, reply) => {
    await requireAuth(request, reply);

    const file = await request.file();
    if (!file) {
      throw new AppError(400, "FILE_REQUIRED", "Arquivo nao enviado");
    }

    const buffer = await file.toBuffer();
    const fields = file.fields as Record<string, any>;
    const getFieldValue = (key: string) => {
      const raw = fields[key];
      if (Array.isArray(raw)) {
        return raw[0]?.value as string | undefined;
      }
      return raw?.value as string | undefined;
    };

    const folder = getFieldValue("folder") ?? "uploads";
    const title = getFieldValue("title") ?? file.filename;
    const checklistExecutionId = getFieldValue("checklistExecutionId");
    const tags = (getFieldValue("tags") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const saved = await saveLocalFile({
      folder,
      originalName: file.filename,
      buffer,
      contentType: file.mimetype
    });

    const asset = await fastify.prisma.mediaAsset.create({
      data: {
        type: inferType(file.mimetype),
        title,
        tags,
        storageKey: saved.storageKey,
        mimeType: file.mimetype,
        size: buffer.length,
        createdById: request.userContext!.id,
        checklistExecutionId
      }
    });

    return sendSuccess(reply, {
      ...asset,
      url: toPublicAssetUrl(asset.storageKey)
    });
  });

  fastify.get("/", async (request, reply) => {
    await requireAuth(request, reply);
    const query = ListQuerySchema.parse(request.query);

    const tags = query.tags
      ? query.tags
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];

    const assets = await fastify.prisma.mediaAsset.findMany({
      where: {
        ...(query.type ? { type: query.type } : {}),
        ...(query.checklistId ? { checklistExecutionId: query.checklistId } : {}),
        ...(query.authorId ? { createdById: query.authorId } : {}),
        ...(query.popId
          ? {
              OR: [
                {
                  popPdfDocuments: {
                    some: {
                      id: query.popId
                    }
                  }
                },
                {
                  popThumbnailDocuments: {
                    some: {
                      id: query.popId
                    }
                  }
                }
              ]
            }
          : {}),
        ...(tags.length ? { tags: { hasSome: tags } } : {}),
        ...(query.dateFrom || query.dateTo
          ? {
              createdAt: {
                ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                ...(query.dateTo ? { lte: query.dateTo } : {})
              }
            }
          : {})
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return sendSuccess(
      reply,
      assets.map((asset) => ({
        ...asset,
        url: toPublicAssetUrl(asset.storageKey)
      }))
    );
  });

  fastify.get<{ Params: { "*": string } }>("/file/*", async (request, reply) => {
    const storageKey = decodeURIComponent(request.params["*"] ?? "");
    if (!storageKey) {
      throw new AppError(400, "INVALID_PATH", "Path invalido");
    }

    const asset = await fastify.prisma.mediaAsset.findFirst({
      where: { storageKey }
    });

    if (!asset) {
      throw new AppError(404, "MEDIA_NOT_FOUND", "Arquivo nao encontrado");
    }

    const file = await readStoredFileBuffer(storageKey);
    reply.header("content-type", asset.mimeType || "application/octet-stream");
    reply.header("content-length", String(file.byteLength));
    reply.header("cache-control", "public, max-age=31536000, immutable");
    return reply.send(file);
  });

  fastify.get<{ Params: { "*": string } }>("/raw/*", async (request, reply) => {
    await requireAuth(request, reply);

    const storageKey = decodeURIComponent(request.params["*"] ?? "");
    if (!storageKey) {
      throw new AppError(400, "INVALID_PATH", "Path invalido");
    }

    const file = await readStoredFileBuffer(storageKey);
    reply.header("content-type", "application/octet-stream");
    return reply.send(file);
  });
};
