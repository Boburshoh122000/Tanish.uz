import { getRedis } from './redis.js';

const REDIS_KEY_PREFIX = 'icebreaker:used:';
const USED_QUESTIONS_EXPIRY_SEC = 30 * 24 * 60 * 60; // 30 days

// ===== Types =====

export interface InterestInput {
  interestId: string;
  category: string;
}

export interface IcebreakerResult {
  question: string;
  category: string;
}

// ===== Question Pools (61 total, organized by InterestCategory) =====

const questionPools: Record<string, string[]> = {
  TECH: [
    "What's the most interesting tech product you've seen lately?",
    "If you could build any app, what would it solve?",
    "What's one tech skill you're trying to learn right now?",
    "What tech trend are you most excited about?",
    "What was the first thing you ever coded or designed?",
    "What's your favorite developer tool and why?",
    "If you could automate one thing in your daily life, what would it be?",
    "What's a tech problem in Uzbekistan you'd love to solve?",
    "What tech community or meetup in Tashkent would you recommend?",
  ],
  BUSINESS: [
    "What's a business idea you'd start if money wasn't an issue?",
    "Who's a business person you admire and why?",
    "What's the best career advice you've ever received?",
    "What industry do you think will grow the most in Uzbekistan?",
    "If you could have coffee with any CEO, who would it be?",
    "What's a skill you think every professional should have?",
    "What's the most valuable lesson you've learned at work?",
    "What local brand or startup in Uzbekistan inspires you?",
    "What's your dream side project or business?",
  ],
  CREATIVE: [
    "What's a creative project you're proud of?",
    "If you could master any creative skill overnight, what would it be?",
    "What inspires your creative work the most?",
    "What's the last creative work (film, book, art) that moved you?",
    "If you could collaborate with any artist, who would it be?",
    "What creative tool or medium do you wish more people knew about?",
    "What's a song or album that changed your perspective?",
    "If you could design anything — a building, a product, an experience — what would it be?",
  ],
  SPORTS: [
    "What sport do you wish more people played in Uzbekistan?",
    "What's your go-to workout or activity to stay active?",
    "What's the most memorable sports moment you've witnessed?",
    "If you could try any extreme sport, what would it be?",
    "What's your pre-game ritual or warm-up routine?",
    "Team sports or solo — which do you prefer and why?",
    "What's a fitness goal you're currently working toward?",
    "What outdoor activity do you enjoy most in Tashkent?",
  ],
  LIFESTYLE: [
    "Where's the best place you've traveled to and why?",
    "What's one habit that changed your life?",
    "What's your favorite spot in Tashkent?",
    "What's a hobby you've picked up recently?",
    "What's the best meal you've ever had?",
    "If you could live anywhere for a year, where would it be?",
    "What's your Sunday morning routine?",
    "What's a local hidden gem in Tashkent most people don't know about?",
    "What's one thing on your bucket list for this year?",
  ],
  ACADEMIC: [
    "What topic could you give a TED talk about?",
    "What's the most interesting thing you've learned recently?",
    "What's a question you wish more people asked?",
    "If you could study under any professor or expert, who would it be?",
    "What's a book that changed how you see the world?",
    "What research topic would you love to dive deep into?",
    "What subject in school surprised you by being interesting?",
    "If you could attend any university in the world, which would it be?",
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
    "What's one word your friends would use to describe you?",
    "What's the most spontaneous thing you've ever done?",
  ],
};

// ===== Main Function =====

/**
 * Generate an icebreaker question based on shared interests between two users.
 *
 * 1. Find shared interests (by interestId)
 * 2. Pick a random shared interest's category (or fallback to GENERAL)
 * 3. Select an unused question from that category's pool
 * 4. Track the question in Redis SET to avoid repeats within 30 days
 */
export async function generateQuestion(
  userInterests: InterestInput[],
  candidateInterests: InterestInput[],
  userId: string,
): Promise<IcebreakerResult> {
  // Find shared interests by interestId, weight category by frequency
  const candidateIds = new Set(candidateInterests.map((i) => i.interestId));
  const shared = userInterests.filter((i) => candidateIds.has(i.interestId));

  let category: string;
  if (shared.length > 0) {
    // Group by category → pick proportionally (5 TECH + 1 LIFESTYLE ≈ 83% TECH)
    const counts = new Map<string, number>();
    for (const s of shared) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    let roll = Math.random() * shared.length;
    category = shared[0].category; // fallback
    for (const [cat, n] of counts) { roll -= n; if (roll <= 0) { category = cat; break; } }
  } else {
    category = 'GENERAL';
  }

  const pool = questionPools[category] ?? questionPools.GENERAL;

  // Check Redis for previously used questions
  let usedQuestions = new Set<string>();
  const redisKey = `${REDIS_KEY_PREFIX}${userId}`;
  try {
    const redis = getRedis();
    const members = await redis.smembers(redisKey);
    usedQuestions = new Set(members);
  } catch {
    // Redis unavailable — skip dedup
  }

  // Filter out used questions; reset pool if all exhausted
  const available = pool.filter((q) => !usedQuestions.has(q));
  const finalPool = available.length > 0 ? available : pool;
  const question = finalPool[Math.floor(Math.random() * finalPool.length)];

  // Track used question in Redis SET (expire after 30 days)
  try {
    const redis = getRedis();
    await redis.sadd(redisKey, question);
    await redis.expire(redisKey, USED_QUESTIONS_EXPIRY_SEC);
  } catch {
    // Redis unavailable — skip tracking
  }

  return { question, category };
}
