import { FastifyReply, FastifyRequest } from "fastify";

export type ApiErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

export const sendSuccess = <T>(reply: FastifyReply, data: T, meta: Record<string, unknown> = {}) => {
  return reply.send({ data, error: null, meta });
};

export const sendError = (
  reply: FastifyReply,
  statusCode: number,
  error: ApiErrorPayload,
  meta: Record<string, unknown> = {}
) => {
  return reply.status(statusCode).send({ data: null, error, meta });
};

export const getRequestUser = (request: FastifyRequest) => {
  if (!request.userContext) {
    throw new Error("Usuário não autenticado");
  }

  return request.userContext;
};
