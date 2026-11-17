/** Scope a localStorage key by the logged-in user so personal data doesn't leak between accounts. */
export function userScoped(key: string): string {
  if (typeof window === "undefined") return key;
  try {
    const uid = window.localStorage.getItem("janus.login");
    return uid ? `${key}.${uid}` : key;
  } catch { return key; }
}
