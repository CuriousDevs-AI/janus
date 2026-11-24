/**
 * Portfolio company logos — stored server-side via /portfolio/companies/:id/logo.
 * A local cache in localStorage avoids a network round-trip on every render; the cache is
 * refreshed when a logo is saved or removed.
 */

const KEY = "janus.portfolio.logos";
const EVENT = "janus-portfolio-logos";

function readCache(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeCache(logos: Record<string, string>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(logos));
  } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVENT));
}

export function readPortfolioLogo(companyId: string): string | undefined {
  return readCache()[companyId];
}

export async function savePortfolioLogo(companyId: string, dataUrl: string | undefined) {
  if (dataUrl) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const body = new FormData();
    body.append("file", blob, "logo.png");
    await fetch(`/api/v1/portfolio/companies/${companyId}/logo`, { method: "PUT", body });
    const cache = readCache();
    cache[companyId] = dataUrl;
    writeCache(cache);
  } else {
    await fetch(`/api/v1/portfolio/companies/${companyId}/logo`, { method: "DELETE" });
    const cache = readCache();
    delete cache[companyId];
    writeCache(cache);
  }
}

export async function fetchPortfolioLogo(companyId: string): Promise<string | undefined> {
  try {
    const res = await fetch(`/api/v1/portfolio/companies/${companyId}/logo`);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

export function subscribePortfolioLogos(callback: () => void): () => void {
  const listener = () => callback();
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
