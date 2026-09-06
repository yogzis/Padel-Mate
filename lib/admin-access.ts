/**
 * ADMIN_EMAIL is the only way to become an admin. There is deliberately no
 * promote-in-UI path, so this env var is the single source of truth and the
 * stored `role` column is just a cache of it for better-auth's own endpoints.
 */
export const ADMIN_ROLE = "admin";

export function isAdminEmail(email: string | null | undefined): boolean {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || !email) return false;
  return email.trim().toLowerCase() === adminEmail.trim().toLowerCase();
}
