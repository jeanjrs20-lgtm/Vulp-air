import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sendSuccess } from "../../lib/envelope.js";
import { AppError } from "../../lib/app-error.js";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/login", async (request, reply) => {
    const input = LoginSchema.parse(request.body);

    const user = await fastify.prisma.user.findUnique({
      where: { email: input.email }
    });

    if (!user) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Credenciais inválidas");
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Credenciais inválidas");
    }

    const token = await reply.jwtSign({
      userId: user.id,
      role: user.role,
      email: user.email
    });

    return sendSuccess(reply, {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        team: user.team,
        regional: user.regional
      }
    });
  });

  fastify.get("/me", async (request, reply) => {
    await fastify.authenticate(request, reply);

    if (!request.userContext) {
      throw new AppError(401, "UNAUTHORIZED", "Não autenticado");
    }

    const user = await fastify.prisma.user.findUnique({
      where: { id: request.userContext.id }
    });

    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado");
    }

    return sendSuccess(reply, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      team: user.team,
      regional: user.regional
    });
  });
};
