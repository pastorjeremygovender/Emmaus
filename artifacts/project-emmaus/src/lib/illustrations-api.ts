import { getApiUrl } from './api';

export type Illustration = {
  id: string;
  contentType: string;
  contentId: string;
  stepId?: string | null;
  illustrationType: string;
  templateType?: string | null;
  sourceSvg?: string | null;
  displayObjectPath?: string | null;
  caption?: string | null;
  alternativeText: string;
  placement: string;
  paragraphPosition?: number | null;
  status: string;
  structuredData?: Record<string, unknown>;
  generationInstruction?: string | null;
  adminNote?: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(getApiUrl(path), {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Illustration request failed');
  return response.status === 204 ? (undefined as T) : response.json();
}

export function listAdminIllustrations() { return request<Illustration[]>('/api/illustrations/admin'); }
export function listApprovedIllustrations(contentType: string, contentId: string, stepId?: string) {
  const query = new URLSearchParams({ contentType, contentId });
  if (stepId) query.set('stepId', stepId);
  return request<Illustration[]>(`/api/illustrations?${query}`);
}
export function createIllustration(body: Record<string, unknown>) {
  return request<Illustration>('/api/illustrations', { method: 'POST', body: JSON.stringify(body) });
}
export function updateIllustration(id: string, body: Record<string, unknown>) {
  return request<Illustration>(`/api/illustrations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export function approveIllustration(id: string) { return request<Illustration>(`/api/illustrations/${encodeURIComponent(id)}/approve`, { method: 'POST', body: '{}' }); }
export function unapproveIllustration(id: string) { return request<Illustration>(`/api/illustrations/${encodeURIComponent(id)}/unapprove`, { method: 'POST', body: '{}' }); }
export function removeIllustration(id: string) { return request<void>(`/api/illustrations/${encodeURIComponent(id)}`, { method: 'DELETE' }); }