const API_BASE = '/api';

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
    complete: (data: any) =>
      request('/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  interests: {
    list: () => request('/interests'),
  },

  discovery: {
    getBatch: () => request('/discovery/batch'),
    action: (profileId: string, isLike: boolean) =>
      request('/discovery/action', {
        method: 'POST',
        body: JSON.stringify({ profileId, isLike }),
      }),
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
