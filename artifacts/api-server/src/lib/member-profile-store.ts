import { pool } from "@workspace/db";
import { logPastoralAudit } from "./pastoral-store.js";

export type IccMembership = "yes" | "no" | "unsure";

export interface MemberProfile {
  preferredName: string;
  email: string;
  contactNumber: string | null;
  physicalAddress: string | null;
  dateOfBirth: string | null;
  iccMembership: IccMembership | null;
}

export interface MemberProfilePatch {
  preferredName?: string;
  contactNumber?: string | null;
  physicalAddress?: string | null;
  dateOfBirth?: string | null;
  iccMembership?: IccMembership | null;
}

export async function getMemberProfile(userId: string): Promise<MemberProfile | null> {
  const result = await pool.query<{
    preferred_name: string;
    email: string | null;
    contact_number: string | null;
    physical_address: string | null;
    date_of_birth: string | null;
    icc_membership: string | null;
  }>(
    `SELECT
       up.preferred_name,
       COALESCE(u.email, up.email) AS email,
       up.contact_number,
       up.physical_address,
       up.date_of_birth::text,
       up.icc_membership
     FROM user_profiles up
     LEFT JOIN users u ON u.id = up.auth_subject
     WHERE up.auth_subject = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row || !row.email) return null;
  return rowToMemberProfile(row);
}

export async function updateMemberProfile(
  userId: string,
  patch: MemberProfilePatch,
): Promise<MemberProfile | null> {
  const current = await getMemberProfile(userId);
  if (!current) return null;

  const columns: Record<keyof MemberProfilePatch, string> = {
    preferredName: "preferred_name",
    contactNumber: "contact_number",
    physicalAddress: "physical_address",
    dateOfBirth: "date_of_birth",
    iccMembership: "icc_membership",
  };
  const currentValues: Record<keyof MemberProfilePatch, string | null> = {
    preferredName: current.preferredName,
    contactNumber: current.contactNumber,
    physicalAddress: current.physicalAddress,
    dateOfBirth: current.dateOfBirth,
    iccMembership: current.iccMembership,
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  const changedFields: string[] = [];

  for (const key of Object.keys(columns) as Array<keyof MemberProfilePatch>) {
    if (!(key in patch)) continue;
    const value = patch[key] ?? null;
    if (value === currentValues[key]) continue;
    sets.push(`${columns[key]} = $${values.length + 1}`);
    values.push(value);
    changedFields.push(key);
  }
  if (sets.length > 0) {
    values.push(userId);
    await pool.query(
      `UPDATE user_profiles
          SET ${sets.join(", ")}, updated_at = NOW()
        WHERE auth_subject = $${values.length}`,
      values,
    );
    await logPastoralAudit({
      entityType: "member_profile",
      entityId: userId,
      action: "self_service_update",
      personId: userId,
      previousValue: { fields: changedFields },
      newValue: { fields: changedFields },
      changedBy: userId,
      reason: "Member updated personal details.",
    });
  }
  return getMemberProfile(userId);
}

function rowToMemberProfile(row: {
  preferred_name: string;
  email: string | null;
  contact_number: string | null;
  physical_address: string | null;
  date_of_birth: string | null;
  icc_membership: string | null;
}): MemberProfile {
  return {
    preferredName: row.preferred_name ?? "",
    email: row.email ?? "",
    contactNumber: row.contact_number,
    physicalAddress: row.physical_address,
    dateOfBirth: row.date_of_birth ? row.date_of_birth.slice(0, 10) : null,
    iccMembership: row.icc_membership === "yes" ||
      row.icc_membership === "no" ||
      row.icc_membership === "unsure"
      ? row.icc_membership
      : null,
  };
}