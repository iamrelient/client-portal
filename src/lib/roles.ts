/**
 * Role helpers.
 *
 * Role tiers:
 *   USER  — standard client. Access is gated by each project's authorizedEmails list.
 *   STAFF — internal viewer. Read-only access to every project (view + download).
 *           Cannot create, edit, upload, or delete anything, and cannot reach /admin.
 *   ADMIN — full access. Bypasses all authorization checks.
 *
 * Always use these helpers at authorization boundaries instead of comparing the
 * string literal directly. It prevents typos and makes intent explicit:
 *   - hasStudioAccess: "is this person on our side of the wall?" (reads/downloads)
 *   - isAdminRole:     "can this person administer?" (writes / admin pages)
 */

export type AppRole = "USER" | "STAFF" | "ADMIN";

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

export function hasStudioAccess(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "STAFF";
}
