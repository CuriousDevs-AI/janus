import { NextRequest, NextResponse } from "next/server";

const accessCookie = "janus_access";
const refreshCookie = "janus_refresh";
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
const publicAuth = new Set(["auth/signup", "auth/login", "auth/forgot-password", "auth/reset-password", "auth/verify-email", "auth/resend-verification"]);

function error(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

async function bridge(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  // Store keys look like janus.finance.v1, so a segment may also carry dots when it starts with "janus.".
  if (path.some(segment => !/^[A-Za-z0-9_-]+$/.test(segment) && !/^janus\.[a-z0-9.-]+$/.test(segment))) return error("not_found", "Endpoint not found.", 404);
  const route = path.join("/");
  const allowed = /^(auth\/(signup|login|refresh|logout|logout-all|forgot-password|reset-password|verify-email|resend-verification)|me|business\/(setup|reports\/summary|intelligence\/ask|agents(\/[A-Za-z0-9_-]+(\/test)?)?|automation-catalog|automation-templates|automation-folders(\/\d+)?|runs\/\d+(\/(retry|cancel))?|automations(\/executions(\/\d+\/approve)?|\/\d+(\/(run|draft|publish|test|on|off|archive|runs|versions|enrollment-preview)(\/\d+)?)?)?)|workspaces(\/\d+(\/members(\/\d+)?)?)?|sources(\/presets|\/\d+(\/(events|embed|rotate-secret|keys(\/\d+)?|imports(\/\d+(\/rows)?)?))?)?|leads(\/\d+(\/deal)?)?|deals(\/\d+(\/events)?)?|contacts\/\d+|whatsapp\/(connection|templates|conversations(\/\d+(\/messages)?)?)|invitations\/[A-Za-z0-9_-]+(\/accept)?|workspace-state\/janus\.[a-z0-9.-]+|vendor-bank-accounts(\/\d+\/(approve|reject))?|project-timelines(\/[A-Za-z0-9_-]+(\/(entries|members(\/\d+)?|archive|stream))?)?|project-records(\/[A-Za-z0-9_-]+(\/(milestones(\/[A-Za-z0-9_-]+\/status)?|tasks(\/[A-Za-z0-9_-]+\/status)?|hours|allocations|changes(\/\d+\/decision)?))?)?|finance\/budget-lines(\/[A-Za-z0-9_-]+\/(draws|releases|allocations))?)$/;
  if (!allowed.test(route)) return error("not_found", "Endpoint not found.", 404);
  const mutating = !["GET", "HEAD"].includes(request.method);
  if (mutating && request.headers.get("origin") !== (process.env.JANUS_APP_ORIGIN || new URL(request.url).origin)) {
    return error("invalid_origin", "Reload Janus and try again.", 403);
  }
  const access = request.cookies.get(accessCookie)?.value;
  const publicRoute = publicAuth.has(route) || route.startsWith("invitations/");
  if (!access && !publicRoute && route !== "auth/refresh") return error("unauthorized", "Sign in to continue.", 401);
  try {
    const origin = process.env.JANUS_API_URL || "http://127.0.0.1:8000";
    const target = new URL(`/v1/${route}${new URL(request.url).search}`, origin);
    const headers = new Headers({ "User-Agent": (request.headers.get("user-agent") || "Janus web").slice(0, 512) });
    if (access) headers.set("Authorization", `Bearer ${access}`);
    for (const name of ["content-type", "idempotency-key", "last-event-id"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    let body: ArrayBuffer | string | undefined;
    if (route === "auth/refresh") {
      const token = request.cookies.get(refreshCookie)?.value;
      if (!token) return error("unauthorized", "Sign in to continue.", 401);
      headers.set("Content-Type", "application/json");
      body = JSON.stringify({ refresh_token: token });
    } else if (mutating && request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 5 * 1024 * 1024) {
          await reader.cancel();
          return error("payload_too_large", "Upload no more than 5 MB.", 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      body = bytes.buffer;
    }
    // A live stream stays open until the browser leaves; it is not buffered or subject to the request timeout.
    const streaming = route.endsWith("/stream") && request.method === "GET";
    const upstream = await fetch(target, { method: request.method, headers, body, cache: "no-store", redirect: "error", signal: streaming ? request.signal : AbortSignal.timeout(45000) });
    if (streaming && upstream.ok) {
      return new Response(upstream.body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
    }
    const data = upstream.status === 204 ? undefined : await upstream.json();
    const issuesTokens = route === "auth/login" || route === "auth/refresh" || route.endsWith("/accept");
    if (upstream.ok && issuesTokens) {
      if (typeof data?.access_token !== "string" || typeof data?.refresh_token !== "string") return error("backend_error", "Invalid session response.", 502);
      const response = NextResponse.json({ message: "Signed in." }, { headers: { "Cache-Control": "no-store" } });
      response.cookies.set(accessCookie, data.access_token, { ...cookieOptions, maxAge: data.expires_in });
      response.cookies.set(refreshCookie, data.refresh_token, { ...cookieOptions, maxAge: 30 * 86400 });
      return response;
    }
    // Public ingestion URLs belong to the API origin, not this authenticated web bridge.
    if (upstream.ok && route.startsWith("sources")) {
      for (const row of Array.isArray(data) ? data : [data]) {
        for (const field of ["ingestUrl", "webhookUrl"]) {
          if (typeof row?.[field] === "string" && row[field].startsWith("/v1/ingest/")) {
            row[field] = new URL(row[field], process.env.JANUS_PUBLIC_API_URL || origin).toString();
          }
        }
      }
    }
    const response = data === undefined
      ? new NextResponse(null, { status: upstream.status })
      : NextResponse.json(data, { status: upstream.status });
    response.headers.set("Cache-Control", "no-store");
    if ((upstream.ok && ["auth/logout", "auth/logout-all"].includes(route)) || (route === "auth/refresh" && [401, 403].includes(upstream.status))) {
      response.cookies.set(accessCookie, "", { ...cookieOptions, maxAge: 0 });
      response.cookies.set(refreshCookie, "", { ...cookieOptions, maxAge: 0 });
    }
    return response;
  } catch {
    return error("backend_unavailable", "Janus could not reach the API. Please try again.", 503);
  }
}

export { bridge as GET, bridge as POST, bridge as PUT, bridge as PATCH, bridge as DELETE };
