import axios from 'axios';
import { User as Auth0UserModel } from '@auth0/auth0-spa-js';

import { getData, setData } from '@/utils';
import { type AuthModel } from './_models';

const AUTH_LOCAL_STORAGE_KEY = `${import.meta.env.VITE_APP_NAME}-auth-v${
  import.meta.env.VITE_APP_VERSION
}`;

const AUTH_SESSION_STORAGE_KEY = `${AUTH_LOCAL_STORAGE_KEY}-session`;
const AUTH_SESSION_SYNC_REQUEST_KEY = `${AUTH_LOCAL_STORAGE_KEY}-sync-request`;
const AUTH_SESSION_SYNC_RESPONSE_KEY = `${AUTH_LOCAL_STORAGE_KEY}-sync-response`;
const AUTH_LOGOUT_BROADCAST_KEY = `${AUTH_LOCAL_STORAGE_KEY}-logout`;
const AUTH_SESSION_SYNC_TIMEOUT_MS = 400;
const SESSION_SYNC_KEYS = [
  AUTH_SESSION_STORAGE_KEY,
  'token',
  'currentUser',
  'rbac',
  'PrimaryRole',
  'username',
  'userID'
] as const;

const getStorageValue = (storage: Storage | undefined, key: string): string | null => {
  if (!storage) return null;

  try {
    return storage.getItem(key);
  } catch (error) {
    console.error(`AUTH STORAGE READ ERROR (${key})`, error);
    return null;
  }
};

const setStorageValue = (storage: Storage | undefined, key: string, value: string): void => {
  if (!storage) return;

  try {
    storage.setItem(key, value);
  } catch (error) {
    console.error(`AUTH STORAGE WRITE ERROR (${key})`, error);
  }
};

const removeStorageValue = (storage: Storage | undefined, key: string): void => {
  if (!storage) return;

  try {
    storage.removeItem(key);
  } catch (error) {
    console.error(`AUTH STORAGE REMOVE ERROR (${key})`, error);
  }
};

const parseStoredJson = <T>(raw: string | null): T | undefined => {
  if (!raw) return undefined;

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error('AUTH STORAGE PARSE ERROR', error);
    return undefined;
  }
};

const getWindowStorage = (kind: 'local' | 'session'): Storage | undefined => {
  if (typeof window === 'undefined') return undefined;
  return kind === 'local' ? window.localStorage : window.sessionStorage;
};

const buildSessionSnapshot = (): Record<string, string> => {
  const sessionStorage = getWindowStorage('session');
  const snapshot: Record<string, string> = {};

  SESSION_SYNC_KEYS.forEach((key) => {
    const value = getStorageValue(sessionStorage, key);
    if (value !== null) {
      snapshot[key] = value;
    }
  });

  return snapshot;
};

const restoreSessionSnapshot = (snapshot: Record<string, string>) => {
  const sessionStorage = getWindowStorage('session');
  if (!sessionStorage) return;

  Object.entries(snapshot).forEach(([key, value]) => {
    setStorageValue(sessionStorage, key, value);
  });
};

const getAuth = (): AuthModel | undefined => {
  try {
    const sessionAuth = parseStoredJson<AuthModel>(
      getStorageValue(getWindowStorage('session'), AUTH_SESSION_STORAGE_KEY)
    );
    if (sessionAuth) {
      return sessionAuth;
    }

    const auth = getData(AUTH_LOCAL_STORAGE_KEY) as AuthModel | undefined;

    if (auth) {
      return auth;
    } else {
      return undefined;
    }
  } catch (error) {
    console.error('AUTH LOCAL STORAGE PARSE ERROR', error);
  }
};

const isSessionAuthActive = (): boolean => {
  const sessionStorage = getWindowStorage('session');
  return !!getStorageValue(sessionStorage, AUTH_SESSION_STORAGE_KEY);
};

const getAuthStorage = (): Storage | undefined => {
  if (isSessionAuthActive()) {
    return getWindowStorage('session');
  }

  return getWindowStorage('local');
};

const getAuthStorageKey = (): string => {
  return isSessionAuthActive() ? AUTH_SESSION_STORAGE_KEY : AUTH_LOCAL_STORAGE_KEY;
};

const getAuthSessionItem = (key: string): string | null => {
  const sessionValue = getStorageValue(getWindowStorage('session'), key);
  if (sessionValue !== null) return sessionValue;

  return getStorageValue(getWindowStorage('local'), key);
};

const setAuthSessionItem = (key: string, value: string, persistent = false) => {
  const targetStorage = getWindowStorage(persistent ? 'local' : 'session');
  const otherStorage = getWindowStorage(persistent ? 'session' : 'local');

  setStorageValue(targetStorage, key, value);
  removeStorageValue(otherStorage, key);
};

const removeAuthSessionItem = (key: string) => {
  removeStorageValue(getWindowStorage('local'), key);
  removeStorageValue(getWindowStorage('session'), key);
};

const setAuth = (auth: AuthModel | Auth0UserModel, persistent = false) => {
  removeStorageValue(getWindowStorage('local'), AUTH_LOCAL_STORAGE_KEY);
  removeStorageValue(getWindowStorage('session'), AUTH_SESSION_STORAGE_KEY);

  if (persistent) {
    setData(AUTH_LOCAL_STORAGE_KEY, auth);
    return;
  }

  setStorageValue(getWindowStorage('session'), AUTH_SESSION_STORAGE_KEY, JSON.stringify(auth));
};

const removeAuth = () => {
  removeStorageValue(getWindowStorage('local'), AUTH_LOCAL_STORAGE_KEY);
  removeStorageValue(getWindowStorage('session'), AUTH_SESSION_STORAGE_KEY);
};

const broadcastLogout = () => {
  if (typeof window === 'undefined') return;

  const payload = JSON.stringify({ ts: Date.now() });
  window.localStorage.setItem(AUTH_LOGOUT_BROADCAST_KEY, payload);
  window.localStorage.removeItem(AUTH_LOGOUT_BROADCAST_KEY);
};

const requestSessionAuthFromPeer = (): Promise<boolean> => {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }

  if (getData(AUTH_LOCAL_STORAGE_KEY)) {
    return Promise.resolve(false);
  }

  if (isSessionAuthActive()) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('storage', onStorage);
      window.clearTimeout(timeoutId);
      resolve(value);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_SESSION_SYNC_RESPONSE_KEY || !event.newValue || isSessionAuthActive()) {
        return;
      }

      const snapshot = parseStoredJson<Record<string, string>>(event.newValue);
      if (!snapshot || Object.keys(snapshot).length === 0) {
        return;
      }

      restoreSessionSnapshot(snapshot);
      finish(true);
    };

    const timeoutId = window.setTimeout(() => finish(false), AUTH_SESSION_SYNC_TIMEOUT_MS);
    window.addEventListener('storage', onStorage);

    const requestToken = JSON.stringify({ ts: Date.now() });
    window.localStorage.setItem(AUTH_SESSION_SYNC_REQUEST_KEY, requestToken);
    window.localStorage.removeItem(AUTH_SESSION_SYNC_REQUEST_KEY);
  });
};

const setupSessionSync = (): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== AUTH_SESSION_SYNC_REQUEST_KEY || !event.newValue) {
      return;
    }

    if (!isSessionAuthActive()) {
      return;
    }

    const snapshot = buildSessionSnapshot();
    if (Object.keys(snapshot).length === 0) {
      return;
    }

    window.localStorage.setItem(AUTH_SESSION_SYNC_RESPONSE_KEY, JSON.stringify(snapshot));
    window.setTimeout(() => {
      window.localStorage.removeItem(AUTH_SESSION_SYNC_RESPONSE_KEY);
    }, 0);
  };

  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener('storage', onStorage);
  };
};

export function setupAxios(axios: any) {
  axios.defaults.headers.Accept = 'application/json';
  axios.interceptors.request.use(
    (config: { headers: { Authorization: string } }) => {
      const auth = getAuth();

      if (auth?.access_token) {
        config.headers.Authorization = `Bearer ${auth.access_token}`;
      }

      return config;
    },
    async (err: any) => await Promise.reject(err)
  );
}

// client/src/auth/_helpers.ts
axios.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  const auth = getAuth();
  if (auth?.access_token && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${auth.access_token}`;
  }
  const userId = getAuthSessionItem('userID');
  if (userId && !config.headers['X-User-Id']) {
    config.headers['X-User-Id'] = userId;
  }
  config.headers['x-session-id'] = localStorage.getItem('sessionId') ?? '';
  return config;
});



export {
  AUTH_LOCAL_STORAGE_KEY,
  AUTH_LOGOUT_BROADCAST_KEY,
  AUTH_SESSION_STORAGE_KEY,
  broadcastLogout,
  getAuth,
  getAuthSessionItem,
  getAuthStorage,
  getAuthStorageKey,
  removeAuth,
  removeAuthSessionItem,
  requestSessionAuthFromPeer,
  setAuth,
  setAuthSessionItem,
  setupSessionSync
};
