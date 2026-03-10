import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requirePermission } from "../../lib/authz.js";
import { sendSuccess } from "../../lib/envelope.js";
import { BrandTokens } from "@vulp/shared";

const BrandingSchema = z.object({
  brandingColors: z
    .object({
      primary: z.string().default(BrandTokens.primary),
      background: z.string().default(BrandTokens.background),
      highlight: z.string().default(BrandTokens.highlight),
      textOnDark: z.string().default(BrandTokens.textOnDark),
      neutralBg: z.string().default(BrandTokens.neutralBg)
    })
    .optional(),
  logoAssetId: z.string().nullable().optional(),
  pdfFooter: z.string().optional(),
  useBrandLockup: z.boolean().optional()
});

const SmtpSchema = z.object({
  smtpHost: z.string(),
  smtpPort: z.number(),
  smtpFrom: z.string()
});

const TaxonomySchema = z.object({
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
});

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    await requirePermission(request, reply, "settings.manage");

    const settings = await fastify.prisma.settings.upsert({
      where: { id: "app" },
      update: {},
      create: {
        id: "app",
        brandingColors: BrandTokens,
        useBrandLockup: true
      },
      include: {
        logoAsset: true
      }
    });

    return sendSuccess(reply, settings);
  });

  fastify.patch("/branding", async (request, reply) => {
    await requirePermission(request, reply, "settings.manage");
    const input = BrandingSchema.parse(request.body);

    const settings = await fastify.prisma.settings.upsert({
      where: { id: "app" },
      update: {
        brandingColors: input.brandingColors,
        logoAssetId: input.logoAssetId ?? undefined,
        pdfFooter: input.pdfFooter,
        useBrandLockup: input.useBrandLockup
      },
      create: {
        id: "app",
        brandingColors: input.brandingColors ?? BrandTokens,
        logoAssetId: input.logoAssetId ?? undefined,
        pdfFooter: input.pdfFooter,
        useBrandLockup: input.useBrandLockup ?? true
      },
      include: {
        logoAsset: true
      }
    });

    return sendSuccess(reply, settings);
  });

  fastify.patch("/smtp", async (request, reply) => {
    await requirePermission(request, reply, "settings.manage");
    const input = SmtpSchema.parse(request.body);

    const settings = await fastify.prisma.settings.upsert({
      where: { id: "app" },
      update: {
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpFrom: input.smtpFrom
      },
      create: {
        id: "app",
        brandingColors: BrandTokens,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpFrom: input.smtpFrom,
        useBrandLockup: true
      }
    });

    return sendSuccess(reply, settings);
  });

  fastify.patch("/taxonomy", async (request, reply) => {
    await requirePermission(request, reply, "settings.manage");
    const input = TaxonomySchema.parse(request.body);

    const settings = await fastify.prisma.settings.upsert({
      where: { id: "app" },
      update: {
        categories: input.categories,
        tags: input.tags
      },
      create: {
        id: "app",
        brandingColors: BrandTokens,
        categories: input.categories,
        tags: input.tags,
        useBrandLockup: true
      }
    });

    return sendSuccess(reply, settings);
  });
};
