import { scoped } from "@/lib/company";

export type AppearancePrefs = {
  accentColor?: string;
  sidebarBg?: string;
  fontScale?: string;
  borderRadius?: string;
  fontFamily?: string;
  reduceMotion?: boolean;
  highContrast?: boolean;
  themeMode?: string;
  [key: string]: unknown;
};

function luminance(hex: string) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ensureContrast(color: string, dark: boolean): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const bg = dark ? 0.0 : 1.0;
  const fg = luminance(color);
  const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  if (ratio >= 3) return color;
  const c = color.replace("#", "");
  let r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const step = dark ? 15 : -15;
  for (let i = 0; i < 12; i++) {
    r = Math.max(0, Math.min(255, r + step));
    g = Math.max(0, Math.min(255, g + step));
    b = Math.max(0, Math.min(255, b + step));
    const adj = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    const lr = luminance(adj);
    const cr = (Math.max(lr, bg) + 0.05) / (Math.min(lr, bg) + 0.05);
    if (cr >= 3) return adj;
  }
  return color;
}

export function applyAppearance(prefs: AppearancePrefs) {
  const root = document.documentElement;

  // Theme mode: light / dark / system
  if (prefs.themeMode === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
  } else if (prefs.themeMode === "light") {
    root.classList.add("light");
    root.classList.remove("dark");
  } else {
    root.classList.remove("dark", "light");
  }

  if (prefs.accentColor) {
    const safe = ensureContrast(prefs.accentColor, root.classList.contains("dark"));
    root.style.setProperty("--accent", safe);
  } else root.style.removeProperty("--accent");

  if (prefs.sidebarBg) root.style.setProperty("--sidebar-bg", prefs.sidebarBg);
  else root.style.removeProperty("--sidebar-bg");

  if (prefs.borderRadius) root.style.setProperty("--radius", prefs.borderRadius);
  else root.style.removeProperty("--radius");

  if (prefs.fontScale && prefs.fontScale !== "100") {
    root.style.fontSize = `${Number(prefs.fontScale)}%`;
  } else {
    root.style.removeProperty("font-size");
  }

  if (prefs.fontFamily === "system")
    root.style.setProperty("--font-sans", "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif");
  else if (prefs.fontFamily === "mono")
    root.style.setProperty("--font-sans", "'JetBrains Mono', monospace");
  else root.style.removeProperty("--font-sans");

  if (prefs.reduceMotion) root.classList.add("reduce-motion");
  else root.classList.remove("reduce-motion");

  if (prefs.highContrast) root.classList.add("high-contrast");
  else root.classList.remove("high-contrast");
}

export function clearAppearance() {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.style.removeProperty("--accent");
  root.style.removeProperty("--sidebar-bg");
  root.style.removeProperty("--radius");
  root.style.removeProperty("font-size");
  root.style.removeProperty("--font-sans");
  root.classList.remove("reduce-motion", "high-contrast");
}

export function loadAndApplyAppearance(workspaceId: string) {
  try {
    const acctRaw = window.localStorage.getItem(scoped("janus.account.appearance"));
    const acctPrefs: AppearancePrefs = acctRaw ? JSON.parse(acctRaw) : {};

    const wsRaw = window.localStorage.getItem(scoped(`janus.ws.${workspaceId}.appearance`));
    const wsPrefs: AppearancePrefs | null = wsRaw ? JSON.parse(wsRaw) : null;

    const merged: AppearancePrefs = { ...acctPrefs };
    if (wsPrefs) {
      for (const [k, v] of Object.entries(wsPrefs)) {
        if (v !== undefined && v !== null && v !== "") merged[k] = v;
      }
    }
    applyAppearance(merged);
  } catch {
    // localStorage unavailable or corrupt — keep defaults
  }
}
