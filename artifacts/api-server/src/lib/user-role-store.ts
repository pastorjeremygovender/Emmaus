import { db, userProfilesTable, type UserRole } from "@workspace/db";
import { eq } from "drizzle-orm";

export type { UserRole };

export async function getUserProfileBySubject(userId: string) {
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.authSubject, userId));
  return profile ?? null;
}

/** Return the database-backed role for a verified OIDC subject. */
export async function getUserRole(userId: string): Promise<UserRole> {
  const profile = await getUserProfileBySubject(userId);
  return profile?.appRole ?? "user";
}

/**
 * Persist a role for an already-verified identity.
 * Callers must enforce super-admin authorization before invoking this helper.
 */
export async function setUserRole(
  userId: string,
  role: UserRole,
): Promise<void> {
  const [updated] = await db
    .update(userProfilesTable)
    .set({ appRole: role, roleAssignedAt: new Date(), updatedAt: new Date() })
    .where(eq(userProfilesTable.authSubject, userId))
    .returning({ email: userProfilesTable.email });

  if (!updated) {
    throw new Error("Cannot assign a role before the identity is verified");
  }
}

export async function isAdmin(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  return role === "admin" || role === "superAdmin";
}