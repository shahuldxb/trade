import axios from 'axios';

const ACTION_TTL_MS = 5000;

let installed = false;
let activeActionId: string | null = null;
let activeUntil = 0;

function newActionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `action-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function beginAction() {
  activeActionId = newActionId();
  activeUntil = Date.now() + ACTION_TTL_MS;
}

function getActionId(): string | null {
  if (!activeActionId) return null;
  if (Date.now() > activeUntil) {
    activeActionId = null;
    activeUntil = 0;
    return null;
  }
  return activeActionId;
}

function bindUserActionEvents() {
  const markAction = (event: Event) => {
    if ('isTrusted' in event && !event.isTrusted) return;
    beginAction();
  };

  window.addEventListener('pointerdown', markAction, true);
  window.addEventListener('submit', markAction, true);
  window.addEventListener('change', markAction, true);
}

function withActionHeader(headersLike: unknown) {
  const actionId = getActionId();
  const headers = new Headers(headersLike as HeadersInit | undefined);

  if (actionId && !headers.has('x-action-id')) {
    headers.set('x-action-id', actionId);
  }

  return headers;
}

function installFetchTracking() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = withActionHeader(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    return originalFetch(input, { ...init, headers });
  };
}

function setAxiosHeader(headers: any, actionId: string) {
  if (!headers) return { 'x-action-id': actionId };
  if (typeof headers.set === 'function') {
    if (!headers.has?.('x-action-id')) headers.set('x-action-id', actionId);
    return headers;
  }
  if (!headers['x-action-id']) headers['x-action-id'] = actionId;
  return headers;
}

function attachAxiosTracking(instance: any) {
  instance.interceptors.request.use((config: any) => {
    const actionId = getActionId();
    if (actionId) {
      config.headers = setAxiosHeader(config.headers, actionId);
    }
    return config;
  });
}

function installAxiosTracking() {
  attachAxiosTracking(axios);

  const originalCreate = axios.create.bind(axios);
  axios.create = (...args: any[]) => {
    const instance = originalCreate(...args);
    attachAxiosTracking(instance);
    return instance;
  };
}

export function installRequestActionTracking() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  bindUserActionEvents();
  installFetchTracking();
  installAxiosTracking();
}

installRequestActionTracking();
