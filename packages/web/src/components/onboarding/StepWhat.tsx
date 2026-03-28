import { useAppStore } from '../../store';
import { CITIES, UNIVERSITIES } from '@tanish/shared';
import ComboInput from '../ComboInput';

interface StepProps { onNext: () => void; }

export default function StepWhat({ onNext }: StepProps) {
  const { onboardingData, setOnboardingData } = useAppStore();

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-bold text-tg-text">What do you do? 💼</h1>
        <p className="text-tg-hint mt-1">Tell us about yourself</p>
      </div>

      {/* City */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-tg-section-header uppercase tracking-wide">
          City
        </label>
        <ComboInput
          value={onboardingData.city || 'Tashkent'}
          onChange={(v) => setOnboardingData({ city: v })}
          suggestions={CITIES}
          placeholder="e.g. Tashkent"
        />
      </div>

      {/* Birth Date */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-tg-section-header uppercase tracking-wide">
          Birth Date
        </label>
        <input
          type="date"
          value={onboardingData.birthDate || ''}
          onChange={(e) => setOnboardingData({ birthDate: e.target.value })}
          max={new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
          min={new Date(Date.now() - 35 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
          className="input-field"
        />
        <p className="text-xs text-tg-hint">You must be 18-35 years old</p>
      </div>

      {/* Current Role */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-tg-section-header uppercase tracking-wide">
          What do you do?
        </label>
        <input
          type="text"
          value={onboardingData.currentRole || ''}
          onChange={(e) => setOnboardingData({ currentRole: e.target.value.slice(0, 100) })}
          placeholder='e.g. "Student at WIUT" or "Designer at Uzum"'
          className="input-field"
          maxLength={100}
        />
        <p className="text-xs text-tg-hint">
          {(onboardingData.currentRole || '').length}/100 — This is your most visible field!
        </p>
      </div>

      {/* University (optional) */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-tg-section-header uppercase tracking-wide">
          University <span className="text-tg-hint font-normal">(optional)</span>
        </label>
        <ComboInput
          value={onboardingData.university || ''}
          onChange={(v) => setOnboardingData({ university: v })}
          suggestions={UNIVERSITIES}
          placeholder="Type or select your university"
        />
      </div>
    </div>
  );
}
