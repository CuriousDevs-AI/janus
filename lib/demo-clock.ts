/**
 * The preview's clock. The sample records are dated around one Friday afternoon, so the preview
 * runs as if it were that afternoon and keeps ticking from there. Without this the records age
 * a day for every real day that passes: leave windows close, leads look "overdue" and nothing
 * lines up. Live builds never touch the clock.
 */
export const DEMO_NOW = "2026-10-23T16:30:00+05:30";

declare global { var __janusDemoClock: boolean | undefined }

export function installDemoClock() {
  if (typeof window === "undefined" || globalThis.__janusDemoClock) return;
  if (process.env.NEXT_PUBLIC_JANUS_DEMO_MODE !== "true") return;
  globalThis.__janusDemoClock = true;
  const RealDate = Date;
  const offset = RealDate.parse(DEMO_NOW) - RealDate.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  class DemoDate extends RealDate { constructor(...args: any[]) { if (args.length === 0) super(RealDate.now() + offset); else super(...(args as [number])); } static now() { return RealDate.now() + offset; } static [Symbol.hasInstance](value: unknown) { return value instanceof RealDate; } }
  globalThis.Date = DemoDate as unknown as DateConstructor;
}

installDemoClock();
