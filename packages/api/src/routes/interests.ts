import type { FastifyInstance } from 'fastify';
import { prisma } from '../index.js';

export async function interestRoutes(app: FastifyInstance) {
  // GET /api/interests — public endpoint, no auth required
  app.get('/', async (_request, reply) => {
    const interests = await prisma.interest.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    // Group by category
    const grouped = interests.reduce(
      (acc, interest) => {
        if (!acc[interest.category]) acc[interest.category] = [];
        acc[interest.category].push(interest);
        return acc;
      },
      {} as Record<string, typeof interests>
    );

    return reply.send({ success: true, data: { interests, grouped } });
  });
}
