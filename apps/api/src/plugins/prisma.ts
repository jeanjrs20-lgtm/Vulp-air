import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { PrismaClient } from "@prisma/client";

const prismaPlugin: FastifyPluginAsync = async (fastify) => {
  const prisma = new PrismaClient();

  fastify.decorate("prisma", prisma);

  fastify.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
};

export default fp(prismaPlugin);
