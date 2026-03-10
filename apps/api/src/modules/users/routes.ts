import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { AppError } from "../../lib/app-error.js";
import { sendSuccess } from "../../lib/envelope.js";
import { requirePermission } from "../../lib/authz.js";

const CreateUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["SUPERADMIN", "ADMIN", "SUPERVISOR", "TECNICO", "LEITOR"]),
  team: z.string().optional(),
  regional: z.string().optional()
});

const UpdateUserSchema = CreateUserSchema.partial().extend({
  password: z.string().min(6).optional()
});

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    await requirePermission(request, reply, "users.manage");

    const users = await fastify.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        team: true,
        regional: true,
        createdAt: true
      }
    });

    return sendSuccess(reply, users);
  });

  fastify.post("/", async (request, reply) => {
    await requirePermission(request, reply, "users.manage");
    const input = CreateUserSchema.parse(request.body);

    const existing = await fastify.prisma.user.findUnique({
      where: { email: input.email }
    });

    if (existing) {
      throw new AppError(409, "USER_EXISTS", "Já existe usuário com este e-mail");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await fastify.prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        team: input.team,
        regional: input.regional
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        team: true,
        regional: true
      }
    });

    return sendSuccess(reply, user);
  });

  fastify.patch<{ Params: { id: string } }>("/:id", async (request, reply) => {
    await requirePermission(request, reply, "users.manage");
    const input = UpdateUserSchema.parse(request.body);

    const user = await fastify.prisma.user.findUnique({ where: { id: request.params.id } });
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado");
    }

    const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : undefined;

    const updated = await fastify.prisma.user.update({
      where: { id: request.params.id },
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        team: input.team,
        regional: input.regional,
        ...(passwordHash ? { passwordHash } : {})
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        team: true,
        regional: true
      }
    });

    return sendSuccess(reply, updated);
  });
};
