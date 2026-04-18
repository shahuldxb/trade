type ClientErrorLogPayload = {
  module_name: string;
  function_name?: string | null;
  error_code?: string | null;
  error_message: string;
  error_type?: string | null;
  severity?: string | null;
  asset_id?: string | null;
  request_payload?: string | null;
  response_payload?: string | null;
  remarks?: string | null;
};

let loggingInstalled = false;
let forwardingConsoleError = false;

function cleanText(value: unknown, maxLength = 4000): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function safeJson(value: unknown, maxLength = 12000): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return cleanText(text, maxLength);
  } catch {
    return cleanText(String(value), maxLength);
  }
}

function getCurrentUserId(): string | null {
  try {
    const direct = cleanText(localStorage.getItem('userID'), 50);
    if (direct) return direct;

    const raw = localStorage.getItem('currentUser');
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { UserID?: string | number; id?: string | number };
    return cleanText(parsed.UserID ?? parsed.id, 50);
  } catch {
    return null;
  }
}

function getContextPayload() {
  return safeJson({
    href: window.location.href,
    pathname: window.location.pathname,
    search: window.location.search,
    sessionId: localStorage.getItem('sessionId') ?? null,
  });
}

export async function sendClientErrorLog(payload: ClientErrorLogPayload): Promise<void> {
  try {
    await fetch('/api/framework/error-logs', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-User-Id': getCurrentUserId() ?? '' },
      body: JSON.stringify({
        user_id: getCurrentUserId(),
        module_name: cleanText(payload.module_name, 100),
        function_name: cleanText(payload.function_name, 100),
        error_code: cleanText(payload.error_code, 50),
        error_message: cleanText(payload.error_message, 32000),
        error_type: cleanText(payload.error_type, 50),
        severity: cleanText(payload.severity ?? 'HIGH', 20),
        asset_id: cleanText(payload.asset_id, 100),
        request_payload: payload.request_payload ?? getContextPayload(),
        response_payload: cleanText(payload.response_payload, 32000),
        status: 'OPEN',
        remarks: cleanText(payload.remarks, 32000),
      }),
    });
  } catch {
    // Swallow logging errors to avoid loops in the browser.
  }
}

export function installGlobalErrorLogging() {
  if (loggingInstalled || typeof window === 'undefined') {
    return;
  }

  loggingInstalled = true;

  const originalConsoleError = console.error.bind(console);

  console.error = (...args: unknown[]) => {
    originalConsoleError(...args);

    if (forwardingConsoleError) {
      return;
    }

    forwardingConsoleError = true;
    queueMicrotask(() => {
      const [first, ...rest] = args;
      void sendClientErrorLog({
        module_name: 'frontend-console',
        function_name: cleanText(window.location.pathname, 100),
        error_message: cleanText(first, 32000) ?? 'console.error',
        error_type: typeof first,
        severity: 'MEDIUM',
        remarks: safeJson(rest, 32000),
      }).finally(() => {
        forwardingConsoleError = false;
      });
    });
  };

  window.addEventListener('error', (event) => {
    void sendClientErrorLog({
      module_name: 'frontend-runtime',
      function_name: cleanText(event.filename || window.location.pathname, 100),
      error_code: event.error?.name,
      error_message: event.message || 'Unhandled window error',
      error_type: event.error?.name || 'ErrorEvent',
      severity: 'HIGH',
      remarks: cleanText(event.error?.stack, 32000),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    void sendClientErrorLog({
      module_name: 'frontend-promise',
      function_name: cleanText(window.location.pathname, 100),
      error_code: cleanText(reason?.code, 50),
      error_message: cleanText(reason?.message ?? reason, 32000) ?? 'Unhandled promise rejection',
      error_type: cleanText(reason?.name ?? typeof reason, 50),
      severity: 'HIGH',
      remarks: cleanText(reason?.stack, 32000),
    });
  });
}
