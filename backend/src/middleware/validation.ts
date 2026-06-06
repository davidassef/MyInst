import type { FastifyRequest, FastifyReply } from 'fastify';
import { ZodError, type ZodSchema } from 'zod';

export function validar(schema: ZodSchema) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      request.body = schema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dados inválidos',
            status: 400,
            details: err.errors.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        });
      }
      throw err;
    }
  };
}
