import { FastifyReply, FastifyRequest } from "fastify";
import { PermissionAction } from "@vulp/rbac";
import { AppError } from "./app-error.js";
import { assertPermission } from "./rbac.js";

export const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
  await request.server.authenticate(request, reply);

  if (!request.userContext) {
    throw new AppError(401, "UNAUTHORIZED", "Autenticação obrigatória");
  }
};

export const requirePermission = async (
  request: FastifyRequest,
  reply: FastifyReply,
  permission: PermissionAction
) => {
  await requireAuth(request, reply);
  assertPermission(request.userContext!.role, permission);
};
