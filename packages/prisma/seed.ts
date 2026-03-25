import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const interests = [
  // TECH
  { name: 'Programming', nameUz: 'Dasturlash', nameRu: 'Программирование', category: 'TECH' as const, icon: '💻' },
  { name: 'AI/ML', nameUz: 'Sun\'iy intellekt', nameRu: 'ИИ/ML', category: 'TECH' as const, icon: '🤖' },
  { name: 'Startups', nameUz: 'Startaplar', nameRu: 'Стартапы', category: 'TECH' as const, icon: '🚀' },
  { name: 'Product Design', nameUz: 'Mahsulot dizayni', nameRu: 'Продуктовый дизайн', category: 'TECH' as const, icon: '🎨' },
  { name: 'Data Science', nameUz: 'Ma\'lumotlar fani', nameRu: 'Data Science', category: 'TECH' as const, icon: '📊' },
  { name: 'Cybersecurity', nameUz: 'Kiberxavfsizlik', nameRu: 'Кибербезопасность', category: 'TECH' as const, icon: '🔒' },
  { name: 'Mobile Development', nameUz: 'Mobil dasturlash', nameRu: 'Мобильная разработка', category: 'TECH' as const, icon: '📱' },

  // BUSINESS
  { name: 'Marketing', nameUz: 'Marketing', nameRu: 'Маркетинг', category: 'BUSINESS' as const, icon: '📈' },
  { name: 'Finance', nameUz: 'Moliya', nameRu: 'Финансы', category: 'BUSINESS' as const, icon: '💰' },
  { name: 'Entrepreneurship', nameUz: 'Tadbirkorlik', nameRu: 'Предпринимательство', category: 'BUSINESS' as const, icon: '💼' },
  { name: 'E-commerce', nameUz: 'Elektron tijorat', nameRu: 'Электронная коммерция', category: 'BUSINESS' as const, icon: '🛒' },
  { name: 'Consulting', nameUz: 'Konsalting', nameRu: 'Консалтинг', category: 'BUSINESS' as const, icon: '🤝' },
  { name: 'Real Estate', nameUz: 'Ko\'chmas mulk', nameRu: 'Недвижимость', category: 'BUSINESS' as const, icon: '🏠' },
  { name: 'Investing', nameUz: 'Investitsiya', nameRu: 'Инвестирование', category: 'BUSINESS' as const, icon: '📉' },

  // CREATIVE
  { name: 'Photography', nameUz: 'Fotografiya', nameRu: 'Фотография', category: 'CREATIVE' as const, icon: '📷' },
  { name: 'Writing', nameUz: 'Yozish', nameRu: 'Писательство', category: 'CREATIVE' as const, icon: '✍️' },
  { name: 'Music', nameUz: 'Musiqa', nameRu: 'Музыка', category: 'CREATIVE' as const, icon: '🎵' },
  { name: 'Film', nameUz: 'Kino', nameRu: 'Кино', category: 'CREATIVE' as const, icon: '🎬' },
  { name: 'Graphic Design', nameUz: 'Grafik dizayn', nameRu: 'Графический дизайн', category: 'CREATIVE' as const, icon: '🖌️' },
  { name: 'Content Creation', nameUz: 'Kontent yaratish', nameRu: 'Создание контента', category: 'CREATIVE' as const, icon: '🎥' },
  { name: 'Art', nameUz: 'San\'at', nameRu: 'Искусство', category: 'CREATIVE' as const, icon: '🎭' },

  // SPORTS
  { name: 'Football', nameUz: 'Futbol', nameRu: 'Футбол', category: 'SPORTS' as const, icon: '⚽' },
  { name: 'Basketball', nameUz: 'Basketbol', nameRu: 'Баскетбол', category: 'SPORTS' as const, icon: '🏀' },
  { name: 'Tennis', nameUz: 'Tennis', nameRu: 'Теннис', category: 'SPORTS' as const, icon: '🎾' },
  { name: 'Gym & Fitness', nameUz: 'Sport zal', nameRu: 'Тренажёрный зал', category: 'SPORTS' as const, icon: '💪' },
  { name: 'Running', nameUz: 'Yugurish', nameRu: 'Бег', category: 'SPORTS' as const, icon: '🏃' },
  { name: 'Swimming', nameUz: 'Suzish', nameRu: 'Плавание', category: 'SPORTS' as const, icon: '🏊' },
  { name: 'Martial Arts', nameUz: 'Jang san\'ati', nameRu: 'Единоборства', category: 'SPORTS' as const, icon: '🥋' },

  // LIFESTYLE
  { name: 'Travel', nameUz: 'Sayohat', nameRu: 'Путешествия', category: 'LIFESTYLE' as const, icon: '✈️' },
  { name: 'Cooking', nameUz: 'Pazandachilik', nameRu: 'Кулинария', category: 'LIFESTYLE' as const, icon: '🍳' },
  { name: 'Fashion', nameUz: 'Moda', nameRu: 'Мода', category: 'LIFESTYLE' as const, icon: '👗' },
  { name: 'Languages', nameUz: 'Tillar', nameRu: 'Языки', category: 'LIFESTYLE' as const, icon: '🌍' },
  { name: 'Volunteering', nameUz: 'Volontyorlik', nameRu: 'Волонтёрство', category: 'LIFESTYLE' as const, icon: '🤲' },
  { name: 'Gaming', nameUz: 'O\'yinlar', nameRu: 'Гейминг', category: 'LIFESTYLE' as const, icon: '🎮' },
  { name: 'Reading', nameUz: 'Kitob o\'qish', nameRu: 'Чтение', category: 'LIFESTYLE' as const, icon: '📚' },

  // ACADEMIC
  { name: 'Law', nameUz: 'Huquq', nameRu: 'Право', category: 'ACADEMIC' as const, icon: '⚖️' },
  { name: 'Medicine', nameUz: 'Tibbiyot', nameRu: 'Медицина', category: 'ACADEMIC' as const, icon: '🩺' },
  { name: 'Engineering', nameUz: 'Muhandislik', nameRu: 'Инженерия', category: 'ACADEMIC' as const, icon: '⚙️' },
  { name: 'Architecture', nameUz: 'Arxitektura', nameRu: 'Архитектура', category: 'ACADEMIC' as const, icon: '🏛️' },
  { name: 'Economics', nameUz: 'Iqtisodiyot', nameRu: 'Экономика', category: 'ACADEMIC' as const, icon: '📊' },
  { name: 'Psychology', nameUz: 'Psixologiya', nameRu: 'Психология', category: 'ACADEMIC' as const, icon: '🧠' },
];

async function main() {
  console.log('🌱 Seeding interests...');

  for (const interest of interests) {
    await prisma.interest.upsert({
      where: { name: interest.name },
      update: interest,
      create: interest,
    });
  }

  console.log(`✅ Seeded ${interests.length} interests`);
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
