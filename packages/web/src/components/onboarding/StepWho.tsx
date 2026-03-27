import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store';
import { changeLanguage } from '../../i18n';

const LANGUAGES = [
  { code: 'uz' as const, label: "O'zbek" },
  { code: 'ru' as const, label: 'Русский' },
  { code: 'en' as const, label: 'English' },
];

interface StepProps { onNext: () => void; }

export default function StepWho({ onNext }: StepProps) {
  const { t, i18n } = useTranslation();
  const { onboardingData, setOnboardingData } = useAppStore();
  const selectedGender = onboardingData.gender;
  const selectedLookingFor = onboardingData.lookingFor || [];

  const genderOptions = [
    { value: 'MALE', label: `👨 ${t('onboarding.step1.male')}` },
    { value: 'FEMALE', label: `👩 ${t('onboarding.step1.female')}` },
  ];

  const lookingForOptions = [
    { value: 'NETWORKING', emoji: '💼', label: t('onboarding.step1.networking') },
    { value: 'FRIENDSHIP', emoji: '🤝', label: t('onboarding.step1.friendship') },
    { value: 'RELATIONSHIP', emoji: '💕', label: t('onboarding.step1.relationship') },
  ];

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

  const handleLanguageChange = (lang: 'uz' | 'ru' | 'en') => {
    changeLanguage(lang);
    setOnboardingData({ preferredLanguage: lang });
  };

  return (
    <div className="space-y-8 pt-4">
      {/* Language selector */}
      <div className="flex gap-1.5 justify-center">
        {LANGUAGES.map(({ code, label }) => (
          <button
            key={code}
            onClick={() => handleLanguageChange(code)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              i18n.language === code
                ? 'bg-tg-button text-tg-button-text'
                : 'bg-tg-secondary-bg text-tg-hint'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div>
        <h1 className="text-2xl font-bold text-tg-text">{t('onboarding.step1.title')} 👋</h1>
        <p className="text-tg-hint mt-1">{t('onboarding.step1.subtitle')}</p>
      </div>

      {/* Gender */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-tg-section-header uppercase tracking-wide">
          {t('onboarding.step1.gender')}
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
          {t('onboarding.step1.lookingFor')}
        </label>
        <p className="text-xs text-tg-hint">{t('onboarding.step1.selectOne')}</p>
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
              <span className="font-medium">{opt.label}</span>
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
