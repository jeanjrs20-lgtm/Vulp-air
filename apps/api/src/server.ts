import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { env } from "./env.js";
import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth.js";
import { sendError } from "./lib/envelope.js";
import { AppError } from "./lib/app-error.js";
import { apiRoutes } from "./modules/index.js";

export const buildServer = () => {
  const server = Fastify({
    logger: true
  });

  server.register(cors, {
    origin: true,
    credentials: true
  });

  server.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024
    }
  });

  server.register(prismaPlugin);
  server.register(authPlugin);

  server.register(apiRoutes, { prefix: "/api/v1" });

  server.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (error instanceof AppError) {
      return sendError(reply, error.statusCode, {
        code: error.code,
        message: error.message,
        details: error.details
      });
    }

    return sendError(reply, 500, {
      code: "INTERNAL_SERVER_ERROR",
      message: "Erro interno do servidor"
    });
  });

  return server;
};

export const startServer = async () => {
  const server = buildServer();
  await server.listen({ port: env.PORT, host: "0.0.0.0" });
  return server;
};
