import { create } from 'zustand';
import type { OnboardingData, PublicProfile, UserProfile, IntroData, InterestWithCategory } from '@tanish/shared';

interface AppState {
  // Auth
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: UserProfile) => void;
  setAuthenticated: (auth: boolean) => void;
  setLoading: (loading: boolean) => void;

  // Onboarding
  onboardingData: Partial<OnboardingData>;
  onboardingStep: number;
  setOnboardingData: (data: Partial<OnboardingData>) => void;
  setOnboardingStep: (step: number) => void;

  // Discovery
  dailyBatch: PublicProfile[];
  batchRemaining: number;
  batchTotal: number;
  setDailyBatch: (batch: PublicProfile[], total?: number) => void;
  removeFromBatch: (profileId: string) => void;

  // Intros
  pendingIntros: IntroData[];
  matchedIntros: IntroData[];
  setPendingIntros: (intros: IntroData[]) => void;
  setMatchedIntros: (intros: IntroData[]) => void;

  // Interests (cached)
  allInterests: InterestWithCategory[];
  groupedInterests: Record<string, InterestWithCategory[]>;
  setInterests: (interests: InterestWithCategory[], grouped: Record<string, InterestWithCategory[]>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Auth
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => set({ user }),
  setAuthenticated: (auth) => set({ isAuthenticated: auth }),
  setLoading: (loading) => set({ isLoading: loading }),

  // Onboarding
  onboardingData: {},
  onboardingStep: 0,
  setOnboardingData: (data) =>
    set((state) => ({
      onboardingData: { ...state.onboardingData, ...data },
    })),
  setOnboardingStep: (step) => set({ onboardingStep: step }),

  // Discovery
  dailyBatch: [],
  batchRemaining: 0,
  batchTotal: 0,
  setDailyBatch: (batch, total) => set({ dailyBatch: batch, batchRemaining: batch.length, batchTotal: total ?? batch.length }),
  removeFromBatch: (profileId) =>
    set((state) => ({
      dailyBatch: state.dailyBatch.filter((p) => p.id !== profileId),
      batchRemaining: state.batchRemaining - 1,
    })),

  // Intros
  pendingIntros: [],
  matchedIntros: [],
  setPendingIntros: (intros) => set({ pendingIntros: intros }),
  setMatchedIntros: (intros) => set({ matchedIntros: intros }),

  // Interests
  allInterests: [],
  groupedInterests: {},
  setInterests: (interests, grouped) => set({ allInterests: interests, groupedInterests: grouped }),
}));
