import { useAppStore } from '../../store';

const genderOptions = [
  { value: 'MALE', label: '👨 Male', labelUz: '👨 Erkak', labelRu: '👨 Мужчина' },
  { value: 'FEMALE', label: '👩 Female', labelUz: '👩 Ayol', labelRu: '👩 Женщина' },
];

const lookingForOptions = [
  { value: 'NETWORKING', label: '💼 Networking', emoji: '💼' },
  { value: 'FRIENDSHIP', label: '🤝 Friendship', emoji: '🤝' },
  { value: 'RELATIONSHIP', label: '💕 Relationship', emoji: '💕' },
];

interface StepProps { onNext: () => void; }

export default function StepWho({ onNext }: StepProps) {
  const { onboardingData, setOnboardingData } = useAppStore();
  const selectedGender = onboardingData.gender;
  const selectedLookingFor = onboardingData.lookingFor || [];

  const toggleLookingFor = (value: string) => {
    const current = [...selectedLookingFor] as string[];
    const index = current.indexOf(value);
    if (index >= 0) {
      current.splice(index, 1);
    } else {
      current.push(value);
    }
    setOnboardingData({ lookingFor: current as any });
  };

  return (
    <div className="space-y-8 pt-4">
      <div>
        <h1 className="text-2xl font-bold text-tg-text">Who are you? 👋</h1>
        <p className="text-tg-hint mt-1">Let's get to know you</p>
      </div>

      {/* Gender */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-tg-section-header uppercase tracking-wide">
          I am
        </label>
        <div className="grid grid-cols-2 gap-3">
          {genderOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setOnboardingData({ gender: opt.value as any })}
              className={`py-4 rounded-xl text-base font-semibold transition-all duration-200 
                ${selectedGender === opt.value
                  ? 'bg-tg-button text-tg-button-text shadow-lg scale-[1.02]'
                  : 'bg-tg-secondary-bg text-tg-text hover:scale-[1.01]'
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Looking For */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-tg-section-header uppercase tracking-wide">
          What are you looking for?
        </label>
        <p className="text-xs text-tg-hint">Select at least one</p>
        <div className="flex flex-col gap-2">
          {lookingForOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggleLookingFor(opt.value)}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all duration-200
                ${selectedLookingFor.includes(opt.value as any)
                  ? 'bg-tg-button text-tg-button-text shadow-sm'
                  : 'bg-tg-secondary-bg text-tg-text'
                }`}
            >
              <span className="text-xl">{opt.emoji}</span>
              <span className="font-medium">{opt.label.split(' ').slice(1).join(' ')}</span>
              {selectedLookingFor.includes(opt.value as any) && (
                <span className="ml-auto">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
