/**
 * Role catalogue — THE single source of truth for this project.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ REPLACE THE CONTENTS. KEEP THE SHAPE.                                     │
 * │                                                                           │
 * │ The three roles below are scaffolding, not a recommendation. What is NOT  │
 * │ negotiable is that the mapping lives in exactly ONE file that both the    │
 * │ server and the client import.                                             │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * The failure this file prevents is specific and it has happened: a role map
 * duplicated in the frontend and in the backend, drifting apart over months,
 * until the same `role_id` meant `viewer` on one side and `admin` on the other
 * — and authorization decisions differed depending on who was looking. Two maps
 * for one thing is how an authorization bug becomes invisible.
 */

/** The functional roles the product distinguishes. leetCamp has no `editor`
 * tier — an admin manages the question bank, everyone else is a student. */
export type Role = 'admin' | 'student';

/**
 * Role ids exactly as stored in the database column.
 *
 * These are DATABASE NUMBERS, not an invention of this file. Renumbering them
 * here renumbers nothing in Postgres — it only breaks authorization silently.
 */
export const ROLE_ID = {
  ADMIN: 1,
  STUDENT: 2,
} as const;

export type RoleId = (typeof ROLE_ID)[keyof typeof ROLE_ID];

/**
 * `role_id` → functional role.
 *
 * Several ids may legitimately collapse into one role when the product gives
 * them no distinct capability. That is a business decision, and it belongs
 * here — not scattered as raw `role_id` comparisons across handlers.
 */
export const roleIdMap: Readonly<Record<number, Role>> = {
  [ROLE_ID.ADMIN]: 'admin',
  [ROLE_ID.STUDENT]: 'student',
};

/** Display labels for UI and reports. Same key domain as `roleIdMap`. */
export const roleLabel: Readonly<Record<number, string>> = {
  [ROLE_ID.ADMIN]: 'Administrator',
  [ROLE_ID.STUDENT]: 'Student',
};

/**
 * Translate a `role_id` into its functional role, or `undefined` if the id is
 * not in the catalogue.
 *
 * ⚠ RETURNS `undefined` ON PURPOSE, NOT A DEFAULT ROLE.
 *
 * A UI may reasonably fall back to the least-privileged label. The server may
 * not. An unknown `role_id` means the database holds a role this code does not
 * know about, and assigning one by default is inventing an authorization
 * decision. The caller decides what to do with `undefined` — the auth plugin
 * treats it as a rejection.
 */
export function roleForId(roleId: number): Role | undefined {
  return roleIdMap[roleId];
}
