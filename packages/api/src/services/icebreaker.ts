import { prisma } from '../index.js';

// Icebreaker question pools by interest category
const questionPools: Record<string, string[]> = {
  TECH: [
    "What's the most interesting tech product you've seen lately?",
    "If you could build any app, what would it solve?",
    "What's one tech skill you're trying to learn right now?",
    "What tech trend are you most excited about?",
    "What was the first thing you ever coded or designed?",
    "What's your favorite developer tool and why?",
    "If you could automate one thing in your daily life, what would it be?",
  ],
  BUSINESS: [
    "What's a business idea you'd start if money wasn't an issue?",
    "Who's a business person you admire and why?",
    "What's the best career advice you've ever received?",
    "What industry do you think will grow the most in Uzbekistan?",
    "If you could have coffee with any CEO, who would it be?",
    "What's a skill you think every professional should have?",
    "What's the most valuable lesson you've learned at work?",
  ],
  CREATIVE: [
    "What's a creative project you're proud of?",
    "If you could master any creative skill overnight, what would it be?",
    "What inspires your creative work the most?",
    "What's the last creative work (film, book, art) that moved you?",
    "If you could collaborate with any artist, who would it be?",
    "What creative tool or medium do you wish more people knew about?",
  ],
  SPORTS: [
    "What sport do you wish more people played in Uzbekistan?",
    "What's your go-to workout or activity to stay active?",
    "What's the most memorable sports moment you've witnessed?",
    "If you could try any extreme sport, what would it be?",
    "What's your pre-game ritual or warm-up routine?",
    "Team sports or solo — which do you prefer and why?",
  ],
  LIFESTYLE: [
    "Where's the best place you've traveled to and why?",
    "What's one habit that changed your life?",
    "What's your favorite spot in Tashkent?",
    "What's a hobby you've picked up recently?",
    "What's the best meal you've ever had?",
    "If you could live anywhere for a year, where would it be?",
    "What's your Sunday morning routine?",
  ],
  ACADEMIC: [
    "What topic could you give a TED talk about?",
    "What's the most interesting thing you've learned recently?",
    "What's a question you wish more people asked?",
    "If you could study under any professor or expert, who would it be?",
    "What's a book that changed how you see the world?",
    "What research topic would you love to dive deep into?",
  ],
  GENERAL: [
    "What's one thing most people don't know about you?",
    "What's your ideal weekend in Tashkent?",
    "What's something you're passionate about that surprises people?",
    "If you could have dinner with anyone, living or dead, who would it be?",
    "What's the best conversation you've had recently?",
    "What's a small thing that makes your day better?",
    "What's something you've always wanted to try but haven't yet?",
    "If you could learn any language fluently, which would it be?",
  ],
};

export async function generateIcebreaker(senderId: string, receiverId: string): Promise<string> {
  // Get both users' interests
  const [senderInterests, receiverInterests] = await Promise.all([
    prisma.userInterest.findMany({
      where: { userId: senderId },
      include: { interest: true },
    }),
    prisma.userInterest.findMany({
      where: { userId: receiverId },
      include: { interest: true },
    }),
  ]);

  // Find shared interests
  const receiverInterestIds = new Set(receiverInterests.map((i) => i.interestId));
  const sharedInterests = senderInterests.filter((i) => receiverInterestIds.has(i.interestId));

  let category: string;
  if (sharedInterests.length > 0) {
    // Pick a random shared interest's category
    const randomShared = sharedInterests[Math.floor(Math.random() * sharedInterests.length)];
    category = randomShared.interest.category;
  } else {
    category = 'GENERAL';
  }

  const pool = questionPools[category] || questionPools.GENERAL;

  // Get recently used questions for this sender (last 30 days)
  const recentIntros = await prisma.intro.findMany({
    where: {
      senderId,
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    select: { question: true },
  });
  const recentQuestions = new Set(recentIntros.map((i) => i.question));

  // Filter out recently used questions
  const available = pool.filter((q) => !recentQuestions.has(q));
  const finalPool = available.length > 0 ? available : pool;

  return finalPool[Math.floor(Math.random() * finalPool.length)];
}
