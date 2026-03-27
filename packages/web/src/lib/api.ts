import type { DailyBatchData, PublicProfile } from '@tanish/shared';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

let authToken: string | null = null;

export function setAuthToken(token: string) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
      });

      const json = await res.json();

      if (!res.ok) {
        return { success: false, error: json.error || `Error ${res.status}` };
      }

      return json;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }

  return { success: false, error: lastError?.message || 'Network error' };
}

// Auth
export const api = {
  auth: {
    telegram: (initData: string) =>
      request('/auth/telegram', {
        method: 'POST',
        body: JSON.stringify({ initData }),
      }),
  },

  users: {
    me: () => request('/users/me'),
    update: (data: any) =>
      request('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    getPublic: (id: string) => request(`/users/${id}`),
    updateNotifications: (data: any) =>
      request('/users/me/notifications', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    deleteAccount: () =>
      request('/users/me', { method: 'DELETE' }),
  },

  onboarding: {
    complete: (data: any, referralCode?: string | null) =>
      request(`/onboarding/complete${referralCode ? `?ref=${encodeURIComponent(referralCode)}` : ''}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  interests: {
    list: () => request('/interests'),
  },

  discovery: {
    getBatch: () => request<DailyBatchData>('/discovery/batch'),
    action: (profileId: string, isLike: boolean) =>
      request('/discovery/action', {
        method: 'POST',
        body: JSON.stringify({ profileId, action: isLike ? 'like' : 'pass' }),
      }),
    getQuestion: (receiverId: string) =>
      request<{ question: string; category: string }>(
        `/intros/question?receiverId=${encodeURIComponent(receiverId)}`
      ),
  },

  intros: {
    create: (receiverId: string, answer: string) =>
      request('/intros/create', {
        method: 'POST',
        body: JSON.stringify({ receiverId, answer }),
      }),
    respond: (id: string, data: { answer?: string; decline?: boolean }) =>
      request(`/intros/${id}/respond`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    pending: () => request('/intros/pending'),
    matched: () => request('/intros/matched'),
  },

  reports: {
    create: (reportedId: string, reason: string, details?: string) =>
      request('/reports/create', {
        method: 'POST',
        body: JSON.stringify({ reportedId, reason, details }),
      }),
  },

  blocks: {
    create: (blockedUserId: string) =>
      request('/blocks/create', {
        method: 'POST',
        body: JSON.stringify({ blockedUserId }),
      }),
    list: () => request('/blocks'),
    remove: (id: string) =>
      request(`/blocks/${id}`, { method: 'DELETE' }),
  },

  referrals: {
    getLink: () =>
      request<{ code: string; link: string }>('/referrals/link'),
    getStats: () =>
      request<{ totalReferred: number; completedSignups: number; bonusMatchesEarned: number }>('/referrals/stats'),
  },

  premium: {
    status: () =>
      request<{ isPremium: boolean; premiumUntil: string | null; daysRemaining: number }>('/premium/status'),
    createInvoice: (promo?: boolean) =>
      request<{ invoiceUrl: string }>('/premium/create-invoice', {
        method: 'POST',
        body: JSON.stringify({ promo }),
      }),
  },

  verification: {
    submit: async (file: File) => {
      const formData = new FormData();
      formData.append('selfie', file);

      const res = await fetch(`${API_BASE}/verify/submit`, {
        method: 'POST',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        body: formData,
      });

      return res.json();
    },
    status: () =>
      request<{ status: string; rejectionReason?: string; createdAt?: string }>(
        '/verify/status',
      ),
  },

  photos: {
    delete: (id: string) =>
      request(`/photos/${id}`, { method: 'DELETE' }),
    reorder: (photoIds: string[]) =>
      request('/photos/reorder', {
        method: 'PATCH',
        body: JSON.stringify({ photoIds }),
      }),
  },

  admin: {
    getMetrics: (from?: string, to?: string) => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const qs = params.toString();
      return request(`/admin/metrics${qs ? `?${qs}` : ''}`);
    },
    getLiveMetrics: () => request('/admin/stats'),
    getPendingVerifications: (page = 1) =>
      request(`/admin/verifications/pending?page=${page}`),
    reviewVerification: (id: string, data: { approved: boolean; rejectionReason?: string }) =>
      request(`/admin/verifications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    getPendingReports: (page = 1) =>
      request(`/admin/reports?status=PENDING&page=${page}`),
    reviewReport: (id: string, data: { action: 'dismiss' | 'warn' | 'suspend' | 'ban' }) =>
      request(`/admin/reports/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    getUser: (telegramId: string) =>
      request(`/admin/users/${telegramId}`),
    getUsers: (params?: { page?: number; limit?: number; search?: string; status?: string; isPremium?: string }) => {
      const qs = new URLSearchParams(
        Object.entries(params || {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
      ).toString();
      return request(`/admin/users${qs ? `?${qs}` : ''}`);
    },
    getUserDetail: (userId: string) => request(`/admin/users/detail/${userId}`),
    grantPremium: (userId: string, data: { durationDays: number; reason?: string }) =>
      request(`/admin/users/${userId}/grant-premium`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    revokePremium: (userId: string, data?: { reason?: string }) =>
      request(`/admin/users/${userId}/revoke-premium`, {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
    sendMessage: (userId: string, text: string) =>
      request(`/admin/users/${userId}/message`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
    updateUserStatus: (userId: string, status: string) =>
      request(`/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    broadcast: (data: { text: string; confirm: boolean; filter?: { isPremium?: boolean; gender?: string } }) =>
      request('/admin/broadcast', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  upload: {
    photo: async (file: File) => {
      const formData = new FormData();
      formData.append('photo', file);

      const res = await fetch(`${API_BASE}/upload/photo`, {
        method: 'POST',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        body: formData,
      });

      return res.json();
    },
  },
};
