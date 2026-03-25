import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '../../store';
import { api } from '../../lib/api';

interface StepProps { onNext: () => void; }

export default function StepInterests({ onNext }: StepProps) {
  const { onboardingData, setOnboardingData, allInterests, groupedInterests, setInterests } = useAppStore();
  const [search, setSearch] = useState('');
  const selected = onboardingData.interestIds || [];

  useEffect(() => {
    if (allInterests.length === 0) {
      loadInterests();
    }
  }, []);

  async function loadInterests() {
    const res = await api.interests.list() as any;
    if (res.success && res.data) {
      setInterests(res.data.interests, res.data.grouped);
    }
  }

  const toggleInterest = (interestId: string) => {
    const current = [...selected];
    const index = current.indexOf(interestId);
    if (index >= 0) {
      current.splice(index, 1);
    } else if (current.length < 8) {
      current.push(interestId);
    }
    setOnboardingData({ interestIds: current });
  };

  const categoryEmojis: Record<string, string> = {
    TECH: '💻', BUSINESS: '💼', CREATIVE: '🎨',
    SPORTS: '⚽', LIFESTYLE: '✨', ACADEMIC: '📚',
  };

  const categoryNames: Record<string, string> = {
    TECH: 'Tech', BUSINESS: 'Business', CREATIVE: 'Creative',
    SPORTS: 'Sports', LIFESTYLE: 'Lifestyle', ACADEMIC: 'Academic',
  };

  const filteredGrouped = Object.entries(groupedInterests).reduce(
    (acc, [category, interests]) => {
      const filtered = (interests as any[]).filter((i) =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.nameRu.toLowerCase().includes(search.toLowerCase()) ||
        i.nameUz.toLowerCase().includes(search.toLowerCase())
      );
      if (filtered.length > 0) acc[category] = filtered;
      return acc;
    },
    {} as Record<string, any[]>
  );

  return (
    <div className="space-y-5 pt-4 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-tg-text">What are you into? ✨</h1>
        <p className="text-tg-hint mt-1">Pick 5-8 interests</p>
      </div>

      {/* Counter */}
      <div className={`text-center font-semibold text-sm px-4 py-2 rounded-full inline-block 
        ${selected.length >= 5 ? 'bg-green-100 text-green-700' : 'bg-tg-secondary-bg text-tg-hint'}`}>
        {selected.length}/8 selected {selected.length >= 5 ? '✓' : `(min 5)`}
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Search interests..."
        className="input-field"
      />

      {/* Interest grid */}
      {Object.entries(filteredGrouped).map(([category, interests]) => (
        <div key={category} className="space-y-2">
          <h3 className="text-sm font-semibold text-tg-section-header flex items-center gap-1.5">
            {categoryEmojis[category]} {categoryNames[category]}
          </h3>
          <div className="flex flex-wrap gap-2">
            {(interests as any[]).map((interest: any) => {
              const isSelected = selected.includes(interest.id);
              return (
                <motion.button
                  key={interest.id}
                  onClick={() => toggleInterest(interest.id)}
                  whileTap={{ scale: 0.95 }}
                  animate={isSelected ? { scale: [1, 1.1, 1] } : {}}
                  className={`chip ${isSelected ? 'chip-selected' : 'chip-unselected'}`}
                >
                  {interest.icon && <span>{interest.icon}</span>}
                  {interest.name}
                </motion.button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
