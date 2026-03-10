import path from "node:path";
import { readFile } from "node:fs/promises";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/app-error.js";
import { requireAuth } from "../../lib/authz.js";
import { sendSuccess } from "../../lib/envelope.js";
import { getStorageAbsolutePath, saveLocalFile, toPublicAssetUrl } from "../../lib/storage.js";

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
      throw new AppError(400, "FILE_REQUIRED", "Arquivo não enviado");
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
      buffer
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

  fastify.get<{ Params: { storageKey: string } }>("/raw/:storageKey", async (request, reply) => {
    await requireAuth(request, reply);

    const storageKey = decodeURIComponent(request.params.storageKey);
    const fullPath = path.resolve(getStorageAbsolutePath(), storageKey);

    if (!fullPath.startsWith(getStorageAbsolutePath())) {
      throw new AppError(400, "INVALID_PATH", "Path inválido");
    }

    const file = await readFile(fullPath);
    reply.header("content-type", "application/octet-stream");
    return reply.send(file);
  });
};

