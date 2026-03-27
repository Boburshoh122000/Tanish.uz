import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    telegramId: bigint;
  }
}
