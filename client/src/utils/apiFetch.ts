// // client/src/utils/apiFetch.ts
// import {
//   broadcastLogout,
//   getAuth,
//   getAuthSessionItem,
//   removeAuth,
//   removeAuthSessionItem
// } from '@/auth/_helpers';

// function headerSafe(value: string | null | undefined, maxLen = 128): string {
//   return String(value ?? '')
//     .replace(/[\r\n]/g, '')
//     .replace(/[^\w\s.@:-]/g, '')
//     .trim()
//     .slice(0, maxLen);
// }

// function getStoredUserId(): string {
//   const directUserId = headerSafe(getAuthSessionItem('userID'), 32);
//   if (directUserId) return directUserId;

//   try {
//     const raw = getAuthSessionItem('currentUser');
//     if (!raw) return '';
//     const parsed = JSON.parse(raw) as { UserID?: number | string; id?: number | string };
//     return headerSafe(String(parsed?.UserID ?? parsed?.id ?? ''), 32);
//   } catch {
//     return '';
//   }
// }

// export async function apiFetch(input: RequestInfo, init: RequestInit = {}) {
//   const headers = new Headers(init.headers || {});
//   const authToken = String(getAuth()?.access_token ?? '').trim();
//   const localToken = String(getAuthSessionItem('token') ?? '').trim();
//   const token = authToken || localToken;
//   const sessionId = headerSafe(getAuthSessionItem('sessionId'), 128);
//   const userId = getStoredUserId();
//   const tbmlApiKey = headerSafe(import.meta.env.VITE_TBML_API_KEY, 256);

//   if (token && !headers.has('Authorization')) {
//     headers.set('Authorization', `Bearer ${token}`);
//   }
//   if (userId && !headers.has('X-User-Id')) {
//     headers.set('X-User-Id', userId);
//   }
//   if (tbmlApiKey && !headers.has('X-API-Key')) {
//     headers.set('X-API-Key', tbmlApiKey);
//   }
//   if (sessionId) headers.set('x-session-id', sessionId);

//   const response = await fetch(input, {
//     ...init,
//     credentials: init.credentials ?? 'same-origin',
//     headers
//   });

//   if (response.status === 401 || response.status === 403) {
//     removeAuth();
//     removeAuthSessionItem('rbac');
//     removeAuthSessionItem('currentUser');
//     removeAuthSessionItem('PrimaryRole');
//     removeAuthSessionItem('username');
//     removeAuthSessionItem('userID');
//     removeAuthSessionItem('token');
//     broadcastLogout();

//     if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth/')) {
//       localStorage.setItem('lastPath', window.location.pathname);
//       sessionStorage.setItem('auth_error_message', 'Session expired. Please login again.');
//       window.location.assign('/auth/classic/login');
//     }
//   }

//   return response;
// }
// client/src/utils/apiFetch.ts
function headerSafe(value: string | null | undefined, maxLen = 128): string {
  return String(value ?? '')
    .replace(/[\r\n]/g, '')
    .replace(/[^\w\s.@:-]/g, '')
    .trim()
    .slice(0, maxLen);
}

function getStoredUserId(): string {
  const directUserId = headerSafe(localStorage.getItem('userID'), 32);
  if (directUserId) return directUserId;

  try {
    const raw = localStorage.getItem('currentUser');
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { UserID?: number | string; id?: number | string };
    return headerSafe(String(parsed?.UserID ?? parsed?.id ?? ''), 32);
  } catch {
    return '';
  }
}

export type ApiFetchInit = RequestInit & {
  actionId?: string;
};

export function createActionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `action-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function apiFetch(input: RequestInfo, init: ApiFetchInit = {}) {
  const { actionId: rawActionId, ...requestInit } = init;
  const headers = new Headers(requestInit.headers || {});
  const token = String(localStorage.getItem('token') ?? '').trim();
  const sessionId = headerSafe(localStorage.getItem('sessionId'), 128);
  const userId = getStoredUserId();
  const actionId = headerSafe(rawActionId, 128);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (userId && !headers.has('X-User-Id')) {
    headers.set('X-User-Id', userId);
  }
  if (sessionId) headers.set('x-session-id', sessionId);
  if (actionId && !headers.has('x-action-id')) headers.set('x-action-id', actionId);

  return fetch(input, {
    ...requestInit,
    credentials: requestInit.credentials ?? 'same-origin',
    headers
  });
}
