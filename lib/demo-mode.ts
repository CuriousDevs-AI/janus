import "@/lib/demo-clock";

/** Demo records are opt-in and never inferred from NODE_ENV. */
export const demoMode = process.env.NEXT_PUBLIC_JANUS_DEMO_MODE === "true";
