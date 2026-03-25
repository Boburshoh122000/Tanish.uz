import { create } from 'zustand';
import type { OnboardingData } from '@tanish/shared';

interface AppState {
  // Auth
  user: any | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: any) => void;
  setAuthenticated: (auth: boolean) => void;
  setLoading: (loading: boolean) => void;

  // Onboarding
  onboardingData: Partial<OnboardingData>;
  onboardingStep: number;
  setOnboardingData: (data: Partial<OnboardingData>) => void;
  setOnboardingStep: (step: number) => void;

  // Discovery
  dailyBatch: any[];
  batchRemaining: number;
  setDailyBatch: (batch: any[]) => void;
  removeFromBatch: (profileId: string) => void;

  // Intros
  pendingIntros: any[];
  matchedIntros: any[];
  setPendingIntros: (intros: any[]) => void;
  setMatchedIntros: (intros: any[]) => void;

  // Interests (cached)
  allInterests: any[];
  groupedInterests: Record<string, any[]>;
  setInterests: (interests: any[], grouped: Record<string, any[]>) => void;
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
  setDailyBatch: (batch) => set({ dailyBatch: batch, batchRemaining: batch.length }),
  removeFromBatch: (profileId) =>
    set((state) => ({
      dailyBatch: state.dailyBatch.filter((p: any) => p.id !== profileId),
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
