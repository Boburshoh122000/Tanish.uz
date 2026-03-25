import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/index.js';
import { prisma } from '../index.js';

export async function blockRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  // POST /api/blocks/create
  app.post('/create', async (request, reply) => {
    const userId = (request as any).userId;
    const { blockedUserId } = request.body as { blockedUserId: string };

    if (!blockedUserId) {
      return reply.status(400).send({ success: false, error: 'blockedUserId is required' });
    }

    if (userId === blockedUserId) {
      return reply.status(400).send({ success: false, error: 'Cannot block yourself' });
    }

    // Check if already blocked
    const existing = await prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: blockedUserId } },
    });
    if (existing) {
      return reply.status(409).send({ success: false, error: 'User already blocked' });
    }

    await prisma.block.create({
      data: { blockerId: userId, blockedId: blockedUserId },
    });

    return reply.send({ success: true, message: 'User blocked' });
  });

  // GET /api/blocks — list blocked users
  app.get('/', async (request, reply) => {
    const userId = (request as any).userId;

    const blocks = await prisma.block.findMany({
      where: { blockerId: userId },
      include: {
        blocked: {
          select: { id: true, firstName: true, photos: { take: 1, orderBy: { position: 'asc' } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ success: true, data: blocks });
  });

  // DELETE /api/blocks/:id — unblock
  app.delete('/:id', async (request, reply) => {
    const userId = (request as any).userId;
    const { id } = request.params as { id: string };

    const block = await prisma.block.findUnique({ where: { id } });
    if (!block || block.blockerId !== userId) {
      return reply.status(404).send({ success: false, error: 'Block not found' });
    }

    await prisma.block.delete({ where: { id } });

    return reply.send({ success: true, message: 'User unblocked' });
  });
}
