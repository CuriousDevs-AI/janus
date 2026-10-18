// Run only against a disposable local workspace with a verified test account.
import assert from "node:assert/strict";
const origin = process.env.JANUS_WEB_ORIGIN || "http://127.0.0.1:3000";
assert(
  ["127.0.0.1", "localhost"].includes(new URL(origin).hostname),
  "Use a local test instance",
);
const email = process.env.JANUS_TEST_EMAIL;
const password = process.env.JANUS_TEST_PASSWORD;
assert(
  email && password,
  "Set JANUS_TEST_EMAIL and JANUS_TEST_PASSWORD for a verified test account",
);
const cookies = new Map();
async function request(path, options = {}) {
  const response = await fetch(origin + "/api/backend" + path, {
    ...options,
    headers: {
      Origin: origin,
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(";")[0];
    const index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
    assert(/httponly/i.test(value), "Session cookies must be HttpOnly");
  }
  if (new URL(origin).protocol === "https:") {
    for (const value of response.headers.getSetCookie())
      assert(/;\s*secure/i.test(value), "HTTPS session cookies must be Secure");
  }
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}
let result = await request("/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
  headers: { Origin: "https://untrusted.example" },
});
assert.equal(
  result.response.status,
  403,
  "Cross-origin login must be rejected",
);
result = await request("/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});
assert.equal(result.response.status, 200, "Login failed");
assert(
  !result.body.access_token && !result.body.refresh_token,
  "Tokens must not reach browser JavaScript",
);
assert(cookies.get("janus_access") && cookies.get("janus_refresh"));
result = await request("/me");
assert.equal(result.response.status, 200);
assert(result.body.user.email_verified_at, "Use a verified test account");
const oldRefresh = cookies.get("janus_refresh");
result = await request("/auth/refresh", { method: "POST" });
assert.equal(result.response.status, 200);
assert.notEqual(
  cookies.get("janus_refresh"),
  oldRefresh,
  "Refresh token must rotate",
);
result = await request("/sources", {
  method: "POST",
  body: JSON.stringify({
    name: "Web integration check",
    connectionKind: "csv",
  }),
});
assert.equal(result.response.status, 201);
const sourceId = result.body.id;
const key = crypto.randomUUID();
const upload = {
  method: "POST",
  headers: { "Content-Type": "text/csv", "Idempotency-Key": key },
  body: "name,phone,email\nWeb check,9876543210,\nInvalid,123,\n",
};
result = await request(
  `/sources/${sourceId}/imports?fileName=web-check.csv`,
  upload,
);
assert.equal(result.response.status, 202);
const importId = result.body.id;
assert.equal(result.body.totalRows, 2);
result = await request(
  `/sources/${sourceId}/imports?fileName=web-check.csv`,
  upload,
);
assert.equal(result.body.duplicate, true);
for (let attempt = 0; attempt < 30; attempt++) {
  result = await request(`/sources/${sourceId}/imports/${importId}`);
  if (!result.body.pendingRows) break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.equal(
  result.body.processedRows,
  1,
  "Worker did not process the valid lead",
);
assert.equal(result.body.failedRows, 1);
result = await request(`/sources/${sourceId}/imports/${importId}/rows`);
const leadId = result.body.find((row) => row.status === "processed").leadId;
result = await request(`/leads/${leadId}`);
assert.equal(result.response.status, 200);
const contactId = result.body.customerId;
result = await request(`/contacts/${contactId}`);
assert.equal(result.body.phone, "+919876543210");
result = await request(`/leads/${leadId}/deal`, {
  method: "POST",
  body: JSON.stringify({ name: "Pilot flow check", amount: "12500.25" }),
});
assert.equal(result.response.status, 200);
const dealId = result.body.id;
result = await request(`/deals/${dealId}`, {
  method: "PUT",
  body: JSON.stringify({
    name: "Pilot flow check",
    amount: "12500.25",
    stage: "qualified",
    version: result.body.version,
  }),
});
assert.equal(result.response.status, 200);
assert.equal((await request(`/deals/${dealId}`)).body.stage, "qualified");
assert.equal((await request(`/leads/${leadId}`)).body.stage, "qualified");
assert.equal((await request(`/deals/${dealId}/events`)).body.length, 2);
result = await request("/auth/logout", { method: "POST" });
assert.equal(result.response.status, 200);
assert(!cookies.get("janus_access") && !cookies.get("janus_refresh"));
assert.equal((await request("/me")).response.status, 401);
console.log(
  "Passed: cookie sessions, CSRF, refresh, CSV idempotency, worker results, real lead/contact, saved deal/stage/history, logout.",
);
