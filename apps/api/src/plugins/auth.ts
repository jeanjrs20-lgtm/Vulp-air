import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import type { FastifyPluginAsync } from "fastify";
import { env } from "../env.js";
import { sendError } from "../lib/envelope.js";

const authPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET
  });

  fastify.decorate("authenticate", async (request, reply) => {
    try {
      await request.jwtVerify();
      request.userContext = {
        id: request.user.userId,
        role: request.user.role,
        email: request.user.email
      };
    } catch {
      sendError(reply, 401, {
        code: "UNAUTHORIZED",
        message: "Token inválido ou ausente"
      });
    }
  });
};

export default fp(authPlugin);
