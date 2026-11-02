import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Each run starts a new group of companies, with new addresses. Set JANUS_E2E_RESUME=1 to keep the last one. */
export default async function globalSetup() {
  const dir = path.join(__dirname, ".state");
  const file = path.join(dir, "run.json");
  if (process.env.JANUS_E2E_RESUME && fs.existsSync(file)) return;
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(4, 12);
  fs.writeFileSync(file, JSON.stringify({ stamp, password: `E2e-${randomBytes(6).toString("hex")}!7`, companies: {}, channels: {}, notes: {} }, null, 1));
}
