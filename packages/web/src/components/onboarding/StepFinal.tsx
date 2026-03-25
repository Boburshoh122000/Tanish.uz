import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store';

const bioPlaceholders = [
  'Building an app to help tour agencies...',
  'Studying international law at TSUL...',
  'Learning video editing for my YouTube channel...',
  'Working on a fintech startup in Tashkent...',
  'Preparing for IELTS and planning to study abroad...',
];

interface StepProps { onNext: () => void; }

export default function StepFinal({ onNext }: StepProps) {
  const { onboardingData, setOnboardingData } = useAppStore();
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rotate placeholders
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % bioPlaceholders.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 3 - photos.length);
    if (files.length === 0) return;

    const newPhotos = [...photos, ...files].slice(0, 3);
    setPhotos(newPhotos);

    // Generate previews
    const newPreviews = newPhotos.map((file) => URL.createObjectURL(file));
    setPreviews(newPreviews);
  };

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setPhotos(newPhotos);
    setPreviews(newPreviews);
  };

  return (
    <div className="space-y-6 pt-4 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-tg-text">One more thing ✍️</h1>
        <p className="text-tg-hint mt-1">Add a bio and photos</p>
      </div>

      {/* Bio */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-tg-section-header uppercase tracking-wide">
          What's one thing you're working on right now?
        </label>
        <textarea
          value={onboardingData.bio || ''}
          onChange={(e) => setOnboardingData({ bio: e.target.value.slice(0, 300) })}
          placeholder={bioPlaceholders[placeholderIndex]}
          className="input-field min-h-[100px] resize-none"
          maxLength={300}
          rows={4}
        />
        <p className="text-xs text-tg-hint text-right">
          {(onboardingData.bio || '').length}/300
        </p>
      </div>

      {/* Photo Upload */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-tg-section-header uppercase tracking-wide">
          Photos <span className="text-tg-hint font-normal">(1-3)</span>
        </label>

        <div className="grid grid-cols-3 gap-3">
          {/* Photo previews */}
          {previews.map((preview, index) => (
            <div key={index} className="relative aspect-[4/5] rounded-xl overflow-hidden bg-tg-secondary-bg">
              <img src={preview} alt="" className="w-full h-full object-cover" />
              {index === 0 && (
                <span className="absolute top-2 left-2 text-[10px] font-bold bg-tg-button text-tg-button-text px-2 py-0.5 rounded-full">
                  Main
                </span>
              )}
              <button
                onClick={() => removePhoto(index)}
                className="absolute top-2 right-2 w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center text-sm"
              >
                ×
              </button>
            </div>
          ))}

          {/* Add photo button */}
          {previews.length < 3 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="aspect-[4/5] rounded-xl border-2 border-dashed border-tg-hint/30 
                         flex flex-col items-center justify-center gap-1 text-tg-hint
                         hover:border-tg-button/50 hover:text-tg-button transition-colors"
            >
              <span className="text-2xl">📷</span>
              <span className="text-xs">Add photo</span>
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handlePhotoUpload}
          className="hidden"
          multiple
        />
      </div>

      {/* Language */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-tg-section-header uppercase tracking-wide">
          Languages you speak
        </label>
        <div className="flex gap-2">
          {['UZBEK', 'RUSSIAN', 'ENGLISH'].map((lang) => {
            const labels: Record<string, string> = { UZBEK: '🇺🇿 O\'zbek', RUSSIAN: '🇷🇺 Русский', ENGLISH: '🇬🇧 English' };
            const current = onboardingData.languages || ['RUSSIAN'];
            const isSelected = (current as string[]).includes(lang);
            return (
              <button
                key={lang}
                onClick={() => {
                  if (isSelected && current.length > 1) {
                    setOnboardingData({ languages: current.filter((l) => l !== lang) as any });
                  } else if (!isSelected) {
                    setOnboardingData({ languages: [...current, lang] as any });
                  }
                }}
                className={`chip flex-1 justify-center ${isSelected ? 'chip-selected' : 'chip-unselected'}`}
              >
                {labels[lang]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
