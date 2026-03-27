import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, Reorder } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import WebApp from '@twa-dev/sdk';
import { useAppStore } from '@/store';
import { api } from '@/lib/api';
import {
  LIMITS,
  CITIES,
  UNIVERSITIES,
  LookingFor,
  Gender,
  Language,
  type InterestWithCategory,
  type UserProfile,
} from '@tanish/shared';

const LOOKING_FOR_OPTIONS: { value: LookingFor; emoji: string; key: string }[] = [
  { value: LookingFor.NETWORKING, emoji: '💼', key: 'networking' },
  { value: LookingFor.FRIENDSHIP, emoji: '🤝', key: 'friendship' },
  { value: LookingFor.RELATIONSHIP, emoji: '💕', key: 'relationship' },
];

const GENDER_OPTIONS: { value: Gender; key: string }[] = [
  { value: Gender.MALE, key: 'male' },
  { value: Gender.FEMALE, key: 'female' },
];

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: Language.UZBEK, label: "O'zbek" },
  { value: Language.RUSSIAN, label: 'Русский' },
  { value: Language.ENGLISH, label: 'English' },
];

const PHOTO_SLOTS = 5;

export default function ProfileEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, setUser, allInterests, groupedInterests, setInterests } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadSlot, setUploadSlot] = useState<number | null>(null);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [bio, setBio] = useState('');
  const [currentRole, setCurrentRole] = useState('');
  const [university, setUniversity] = useState('');
  const [city, setCity] = useState('');
  const [lookingFor, setLookingFor] = useState<LookingFor[]>([]);
  const [showMe, setShowMe] = useState<Gender | 'BOTH'>('BOTH');
  const [ageMin, setAgeMin] = useState<number>(LIMITS.DEFAULT_MIN_AGE);
  const [ageMax, setAgeMax] = useState<number>(LIMITS.DEFAULT_MAX_AGE);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [photos, setPhotos] = useState<{ id: string; url: string; position: number }[]>([]);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [longPressId, setLongPressId] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load current data
  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? '');
    setBio(user.bio ?? '');
    setCurrentRole(user.currentRole ?? '');
    setUniversity(user.university ?? '');
    setCity(user.city ?? '');
    setLookingFor(user.lookingFor ?? []);
    setLanguages(user.languages ?? []);
    setPhotos(
      (user.photos ?? []).map((p: { id: string; url: string; position: number }) => ({
        id: p.id,
        url: p.url,
        position: p.position,
      })),
    );
    setSelectedInterests(
      user.interests?.map((i) => i.id) ?? [],
    );
    // Preferences
    if (user.showMeGender) setShowMe(user.showMeGender);
    if (user.ageRangeMin) setAgeMin(user.ageRangeMin);
    if (user.ageRangeMax) setAgeMax(user.ageRangeMax);
  }, [user]);

  // Load interests list
  useEffect(() => {
    if (allInterests.length === 0) {
      api.interests.list().then((res: unknown) => {
        const data = res as { success: boolean; data?: { interests: InterestWithCategory[]; grouped: Record<string, InterestWithCategory[]> } };
        if (data.success && data.data) {
          setInterests(data.data.interests, data.data.grouped);
        }
      });
    }
  }, [allInterests.length, setInterests]);

  // Telegram BackButton
  useEffect(() => {
    WebApp.BackButton.show();
    const goBack = () => navigate('/profile');
    WebApp.BackButton.onClick(goBack);
    return () => {
      WebApp.BackButton.hide();
      WebApp.BackButton.offClick(goBack);
    };
  }, [navigate]);

  // Photo upload
  const handlePhotoUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      const res = (await api.upload.photo(file)) as {
        success: boolean;
        data?: { photo: { id: string; url: string; position: number } };
      };
      if (res.success && res.data) {
        setPhotos((prev) => [...prev, res.data!.photo]);
      }
      setUploading(false);
      setUploadSlot(null);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [],
  );

  // Photo delete (long-press)
  const handlePhotoDelete = useCallback(async (photoId: string) => {
    WebApp.showConfirm(t('profile.deletePhotoConfirm'), async (confirmed) => {
      if (!confirmed) return;
      await api.photos.delete(photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      setLongPressId(null);
    });
  }, [t]);

  const startLongPress = useCallback((photoId: string) => {
    longPressTimer.current = setTimeout(() => setLongPressId(photoId), 500);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }, []);

  // Photo reorder — optimistic with rollback
  const handlePhotoReorder = useCallback((newOrder: typeof photos) => {
    const prev = photos;
    setPhotos(newOrder);
    api.photos.reorder(newOrder.map((p) => p.id)).then((res) => {
      const typed = res as { success: boolean };
      if (!typed.success) {
        setPhotos(prev);
        WebApp.HapticFeedback.notificationOccurred('error');
      }
    });
  }, [photos]);

  // Toggle interest
  const toggleInterest = useCallback((id: string) => {
    setSelectedInterests((prev) => {
      if (prev.includes(id)) return prev.filter((i) => i !== id);
      if (prev.length >= LIMITS.MAX_INTERESTS) return prev;
      return [...prev, id];
    });
  }, []);

  // Toggle lookingFor
  const toggleLookingFor = useCallback((value: LookingFor) => {
    setLookingFor((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }, []);

  // Toggle language
  const toggleLanguage = useCallback((value: Language) => {
    setLanguages((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }, []);

  // Save
  const handleSave = useCallback(async () => {
    setSaving(true);
    const res = (await api.users.update({
      firstName,
      bio: bio || null,
      currentRole: currentRole || null,
      university: university || null,
      city,
      lookingFor,
      interestIds: selectedInterests,
      languages,
      showMeGender: showMe,
      ageRangeMin: ageMin,
      ageRangeMax: ageMax,
    })) as { success: boolean; data?: UserProfile };
    if (res.success && res.data) {
      setUser(res.data);
      navigate('/profile');
    }
    setSaving(false);
  }, [
    firstName, bio, currentRole, university, city, lookingFor,
    selectedInterests, languages, showMe, ageMin, ageMax,
    setUser, navigate,
  ]);

  // Completeness
  const completeness = calculateCompleteness({
    firstName,
    photos,
    bio,
    currentRole,
    interests: selectedInterests,
  });

  const categoryEmojis: Record<string, string> = {
    TECH: '💻', BUSINESS: '💼', CREATIVE: '🎨',
    SPORTS: '⚽', LIFESTYLE: '✨', ACADEMIC: '📚',
  };

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="sticky top-0 bg-tg-bg/95 backdrop-blur-sm z-30 px-5 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-tg-text">{t('profile.edit')}</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-tg-button font-semibold text-sm"
        >
          {saving ? t('common.loading') : t('common.save')}
        </button>
      </div>

      {/* Completeness bar */}
      <div className="px-5 mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-tg-hint">
            {t('profile.completeness', { percent: completeness })}
          </span>
          <span className="text-xs font-semibold text-brand-600">{completeness}%</span>
        </div>
        <div className="w-full h-2 bg-tg-secondary-bg rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${completeness}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      <div className="px-4 space-y-5">
        {/* ─── Photos Section ─── */}
        <Section title={t('profile.photos')}>
          <div className="grid grid-cols-3 gap-2">
            {/* Draggable existing photos */}
            <Reorder.Group
              axis="x"
              values={photos}
              onReorder={handlePhotoReorder}
              className="contents"
            >
              {photos.map((photo, i) => (
                <Reorder.Item
                  key={photo.id}
                  value={photo}
                  className="relative aspect-[4/5] rounded-xl bg-tg-secondary-bg overflow-hidden cursor-grab active:cursor-grabbing"
                  whileDrag={{ scale: 1.05, zIndex: 10 }}
                >
                  <img
                    src={photo.url}
                    alt=""
                    className="w-full h-full object-cover"
                    onPointerDown={() => startLongPress(photo.id)}
                    onPointerUp={cancelLongPress}
                    onPointerLeave={cancelLongPress}
                    draggable={false}
                  />
                  {i === 0 && (
                    <span className="absolute top-1.5 left-1.5 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                      {t('profile.mainPhoto')}
                    </span>
                  )}
                  {/* Delete overlay on long-press */}
                  {longPressId === photo.id && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 bg-black/50 flex items-center justify-center"
                    >
                      <button
                        onClick={() => handlePhotoDelete(photo.id)}
                        className="bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full"
                      >
                        {t('common.delete')}
                      </button>
                    </motion.div>
                  )}
                </Reorder.Item>
              ))}
            </Reorder.Group>

            {/* Empty upload slots */}
            {Array.from({ length: PHOTO_SLOTS - photos.length }).map((_, i) => (
              <div
                key={`slot-${i}`}
                className="relative aspect-[4/5] rounded-xl bg-tg-secondary-bg overflow-hidden"
              >
                <button
                  onClick={() => {
                    setUploadSlot(photos.length + i);
                    fileInputRef.current?.click();
                  }}
                  disabled={uploading}
                  className="w-full h-full flex flex-col items-center justify-center text-tg-hint gap-1"
                >
                  {uploading && uploadSlot === photos.length + i ? (
                    <div className="w-6 h-6 border-2 border-tg-button border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span className="text-2xl">+</span>
                      <span className="text-[10px]">{t('profile.addPhoto')}</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            className="hidden"
          />
        </Section>

        {/* ─── Basic Info ─── */}
        <Section title={t('profile.basicInfo')}>
          <div className="space-y-3">
            <Field label={t('profile.name')}>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value.slice(0, LIMITS.NAME_MAX_LENGTH))}
                className="input-field"
              />
            </Field>
            <Field label={t('profile.city')}>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="input-field appearance-none"
              >
                {CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        {/* ─── About ─── */}
        <Section title={t('profile.about')}>
          <div className="space-y-3">
            <Field label={t('profile.currentRole')}>
              <input
                type="text"
                value={currentRole}
                onChange={(e) => setCurrentRole(e.target.value.slice(0, LIMITS.ROLE_MAX_LENGTH))}
                placeholder={t('onboarding.step2.rolePlaceholder')}
                className="input-field"
              />
            </Field>
            <Field label={t('profile.bio')}>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, LIMITS.BIO_MAX_LENGTH))}
                className="input-field min-h-[80px] resize-none"
                rows={3}
              />
              <span className="text-[10px] text-tg-hint">
                {bio.length}/{LIMITS.BIO_MAX_LENGTH}
              </span>
            </Field>
            <Field label={t('profile.university')}>
              <select
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
                className="input-field appearance-none"
              >
                <option value="">{t('common.optional')}</option>
                {UNIVERSITIES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        {/* ─── Interests ─── */}
        <Section
          title={t('profile.interests')}
          subtitle={`${selectedInterests.length}/${LIMITS.MAX_INTERESTS} ${t('common.selected', { count: selectedInterests.length })}`}
        >
          {Object.entries(groupedInterests).map(([category, interests]) => (
            <div key={category} className="space-y-2 mb-3">
              <h4 className="text-xs font-semibold text-tg-section-header flex items-center gap-1">
                {categoryEmojis[category]} {t(`onboarding.step3.categories.${category}`)}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {(interests as InterestWithCategory[]).map((interest) => {
                  const isSelected = selectedInterests.includes(interest.id);
                  return (
                    <motion.button
                      key={interest.id}
                      onClick={() => toggleInterest(interest.id)}
                      whileTap={{ scale: 0.95 }}
                      className={`chip text-xs ${isSelected ? 'chip-selected' : 'chip-unselected'}`}
                    >
                      {interest.icon && <span>{interest.icon}</span>}
                      {interest.name}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          ))}
        </Section>

        {/* ─── Preferences ─── */}
        <Section title={t('profile.preferences')}>
          <div className="space-y-4">
            {/* Looking for */}
            <Field label={t('profile.lookingFor')}>
              <div className="flex flex-wrap gap-2">
                {LOOKING_FOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => toggleLookingFor(opt.value)}
                    className={`chip text-xs ${
                      lookingFor.includes(opt.value) ? 'chip-selected' : 'chip-unselected'
                    }`}
                  >
                    {opt.emoji} {t(`onboarding.step1.${opt.key}`)}
                  </button>
                ))}
              </div>
            </Field>

            {/* Show me */}
            <Field label={t('profile.showMe')}>
              <div className="flex gap-2">
                {GENDER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setShowMe(opt.value)}
                    className={`chip text-xs ${
                      showMe === opt.value ? 'chip-selected' : 'chip-unselected'
                    }`}
                  >
                    {t(`onboarding.step1.${opt.key}`)}
                  </button>
                ))}
                <button
                  onClick={() => setShowMe('BOTH')}
                  className={`chip text-xs ${showMe === 'BOTH' ? 'chip-selected' : 'chip-unselected'}`}
                >
                  {t('profile.both')}
                </button>
              </div>
            </Field>

            {/* Age range */}
            <Field label={`${t('profile.ageRange')}: ${ageMin}–${ageMax}`}>
              <div className="flex items-center gap-3">
                <span className="text-xs text-tg-hint">{LIMITS.MIN_AGE}</span>
                <input
                  type="range"
                  min={LIMITS.MIN_AGE}
                  max={LIMITS.MAX_AGE}
                  value={ageMin}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setAgeMin(Math.min(val, ageMax - 1));
                  }}
                  className="flex-1 accent-[var(--tg-theme-button-color,#2481cc)]"
                />
                <input
                  type="range"
                  min={LIMITS.MIN_AGE}
                  max={LIMITS.MAX_AGE}
                  value={ageMax}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setAgeMax(Math.max(val, ageMin + 1));
                  }}
                  className="flex-1 accent-[var(--tg-theme-button-color,#2481cc)]"
                />
                <span className="text-xs text-tg-hint">{LIMITS.MAX_AGE}</span>
              </div>
            </Field>

            {/* Languages */}
            <Field label={t('profile.languages')}>
              <div className="flex flex-wrap gap-2">
                {LANGUAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => toggleLanguage(opt.value)}
                    className={`chip text-xs ${
                      languages.includes(opt.value) ? 'chip-selected' : 'chip-unselected'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </Section>
      </div>
    </div>
  );
}

/** Section wrapper */
function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-tg-section-header">{title}</h3>
        {subtitle && <span className="text-xs text-tg-hint">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

/** Labeled field */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-tg-hint font-medium">{label}</label>
      {children}
    </div>
  );
}

function calculateCompleteness(data: {
  firstName: string;
  photos: { id: string }[];
  bio: string;
  currentRole: string;
  interests: string[];
}): number {
  let score = 0;
  if (data.firstName) score += 10;
  if (data.photos.length > 0) score += 25;
  if (data.bio) score += 15;
  if (data.currentRole) score += 15;
  if (data.interests.length >= 5) score += 20;
  if (data.photos.length >= 2) score += 15;
  return score;
}
