import { create } from 'zustand';
import WebApp from '@twa-dev/sdk';
import { api } from '@/lib/api';

interface IntroSender {
  id: string;
  firstName: string;
  age: number;
  currentRole: string;
  verified: boolean;
  photos: Array<{ url: string; position: number }>;
  username?: string;
}

interface PendingIntro {
  id: string;
  question: string;
  senderAnswer: string;
  createdAt: string;
  expiresAt: string;
  sender: IntroSender;
}

interface MatchedIntro {
  id: string;
  matchedAt: string;
  chatLink: string | null;
  otherUser: IntroSender;
}

interface IntrosState {
  pendingIntros: PendingIntro[];
  matchedIntros: MatchedIntro[];
  pendingLoading: boolean;
  matchedLoading: boolean;

  loadPending: () => Promise<void>;
  loadMatched: () => Promise<void>;
  respond: (introId: string, answer: string) => Promise<boolean>;
  decline: (introId: string) => Promise<void>;
}

export const useIntrosStore = create<IntrosState>((set, get) => ({
  pendingIntros: [],
  matchedIntros: [],
  pendingLoading: false,
  matchedLoading: false,

  loadPending: async () => {
    set({ pendingLoading: true });
    const res = (await api.intros.pending()) as {
      success: boolean;
      data?: PendingIntro[];
    };
    if (res.success && res.data) {
      set({ pendingIntros: res.data });
    }
    set({ pendingLoading: false });
  },

  loadMatched: async () => {
    set({ matchedLoading: true });
    const res = (await api.intros.matched()) as {
      success: boolean;
      data?: MatchedIntro[];
    };
    if (res.success && res.data) {
      set({
        matchedIntros: [...res.data].sort(
          (a, b) => new Date(b.matchedAt).getTime() - new Date(a.matchedAt).getTime()
        ),
      });
    }
    set({ matchedLoading: false });
  },

  respond: async (introId, answer) => {
    const res = (await api.intros.respond(introId, { answer })) as {
      success: boolean;
      data?: MatchedIntro;
    };
    if (res.success) {
      const { pendingIntros, matchedIntros } = get();
      set({
        pendingIntros: pendingIntros.filter((i) => i.id !== introId),
      });
      // If the API returns the new match, prepend it
      if (res.data) {
        set({ matchedIntros: [res.data, ...matchedIntros] });
      }
      try {
        WebApp.HapticFeedback.notificationOccurred('success');
      } catch {
        // Haptic not available outside Telegram
      }
      return true;
    }
    return false;
  },

  decline: async (introId) => {
    // Optimistic removal
    const { pendingIntros } = get();
    set({ pendingIntros: pendingIntros.filter((i) => i.id !== introId) });
    await api.intros.respond(introId, { decline: true });
    try {
      WebApp.HapticFeedback.impactOccurred('light');
    } catch {
      // Haptic not available outside Telegram
    }
  },
}));
