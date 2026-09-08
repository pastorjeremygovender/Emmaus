import { getApiUrl } from "./api";

export type IccMembership = "yes" | "no" | "unsure";

export interface MemberProfile {
  preferredName: string;
  email: string;
  contactNumber: string | null;
  physicalAddress: string | null;
  dateOfBirth: string | null;
  iccMembership: IccMembership | null;
}

export type MemberProfilePatch = Partial<{
  preferredName: string;
  contactNumber: string | null;
  physicalAddress: string | null;
  dateOfBirth: string | null;
  iccMembership: IccMembership | null;
}>;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(getApiUrl(path), {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "We could not complete that request.");
  }
  return response.json() as Promise<T>;
}

export const getMemberProfile = () => request<MemberProfile>("/api/member/profile");

export const updateMemberProfile = (patch: MemberProfilePatch) =>
  request<MemberProfile>("/api/member/profile", {
    method: "PUT",
    body: JSON.stringify(patch),
  });