import { api } from "@/lib/api/client";

/**
 * Push for this browser: the service worker, subscribed with the server's key and saved, so
 * announcements, kudos and red alerts arrive even with Janus closed. Quietly does nothing where
 * the browser or the server has no push. Returns whether this browser is now subscribed.
 */
export async function enablePush(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (Notification.permission !== "granted") return false;
  const { publicKey } = await api<{ publicKey: string | null }>("/push/key");
  if (!publicKey) return false;
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  await navigator.serviceWorker.ready;
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
  let subscription = await registration.pushManager.getSubscription();
  // A subscription made with an older server key cannot be used; start again with the current one.
  const current = subscription?.options.applicationServerKey;
  if (subscription && current && new Uint8Array(current).toString() !== key.toString()) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api("/push/subscriptions", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
  return true;
}
