import type { FastifyPluginAsync } from "fastify";
import { sendSuccess } from "../../lib/envelope.js";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async (request, reply) => {
    return sendSuccess(reply, {
      status: "ok",
      service: "VULP AIR FieldOps API",
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime()
    });
  });
};
