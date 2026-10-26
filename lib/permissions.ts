/** The Owner holds "*", which stands for every permission. Always ask through this, never with a bare includes(). */
export const can = (session: { permissions: string[] }, permission: string) => session.permissions.includes("*") || session.permissions.includes(permission);
