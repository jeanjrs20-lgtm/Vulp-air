import type { PrismaClient } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    userContext?: {
      id: string;
      role: string;
      email: string;
    };
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      userId: string;
      role: string;
      email: string;
    };
    user: {
      userId: string;
      role: string;
      email: string;
    };
  }
}
