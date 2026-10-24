"use client";

export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}

let refreshing: Promise<void> | undefined;
let refreshFailure: { at: number; error: unknown } | undefined;
const REFRESH_RETRY_MS = 30_000;
async function refreshSession() {
  // After a failed refresh, fail fast instead of re-running /me + /auth/refresh
  // for every queued request, so screens can show their offline state at once.
  if (refreshFailure && Date.now() - refreshFailure.at < REFRESH_RETRY_MS)
    throw refreshFailure.error;
  if (!refreshing) {
    const refresh = async () => {
      const check = await fetch("/api/backend/me", { cache: "no-store" });
      if (check.ok) return; // Another tab may already have rotated the cookie.
      if (check.status !== 401) throw await responseError(check);
      const response = await fetch("/api/backend/auth/refresh", {
        method: "POST",
      });
      if (!response.ok) throw await responseError(response);
    };
    const run = async () => {
      if (navigator.locks)
        await navigator.locks.request("janus-session", refresh);
      else await refresh();
    };
    refreshing = run()
      .then(() => {
        refreshFailure = undefined;
      })
      .catch((error) => {
        refreshFailure = { at: Date.now(), error };
        throw error;
      })
      .finally(() => {
        refreshing = undefined;
      });
  }
  return refreshing;
}

async function responseError(response: Response) {
  const data = await response.json().catch(() => null);
  return new APIError(
    data?.error?.message || "Request failed. Please try again.",
    response.status,
    data?.error?.code || "request_failed",
  );
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const send = () =>
    fetch(`/api/backend${path}`, {
      ...init,
      headers,
      cache: "no-store",
      credentials: "same-origin",
    });
  let response = await send();
  if (
    response.status === 401 &&
    (!path.startsWith("/auth/") || path.startsWith("/auth/logout")) &&
    !path.startsWith("/invitations/")
  ) {
    await refreshSession();
    response = await send();
  }
  if (!response.ok) throw await responseError(response);
  return response.status === 204 ? (undefined as T) : response.json();
}

export function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
