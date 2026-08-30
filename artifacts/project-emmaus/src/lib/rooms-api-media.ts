/**
 * rooms-api-media.ts — API helpers for Group Discussion media sharing and presentation.
 * Kept separate from rooms-api.ts to avoid the file growing too large.
 */

import { roomsFetch } from '@/lib/rooms-api';
import { getApiUrl } from '@/lib/api';
import type { MediaAttachment, PresentationState, RoomMediaItem, SharedPanelState } from '@/lib/rooms-types';

// ─── Upload ───────────────────────────────────────────────────────────────────

export interface UploadUrlResponse {
  uploadUrl: string;
  objectPath: string;
  attachmentType: string;
}

/** Request a presigned PUT URL from the server. Any room member may call this. */
export async function apiRequestRoomUploadUrl(
  userId: string,
  roomId: string,
  filename: string,
  contentType: string,
  size: number,
): Promise<UploadUrlResponse> {
  return roomsFetch<UploadUrlResponse>(
    `/api/rooms/${roomId}/messages/upload-url`,
    userId,
    {
      method: 'POST',
      body: JSON.stringify({ filename, contentType, size }),
    },
  );
}

/**
 * Upload a file directly to the presigned GCS URL.
 * The browser PUTs the bytes; the server is not in the data path.
 */
export async function uploadFileToStorage(
  uploadUrl: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type);
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Upload failed — network error.'));
    xhr.send(file);
  });
}

/** Derive the URL to display/stream a stored object. */
export function getMediaUrl(objectPath: string): string {
  // objectPath is like "/objects/uploads/<uuid>"
  // The server serves it at "/storage/objects/uploads/<uuid>"
  return getApiUrl('/api/storage' + objectPath);
}

// ─── Media list ───────────────────────────────────────────────────────────────

export async function apiGetRoomMedia(
  userId: string,
  roomId: string,
): Promise<RoomMediaItem[]> {
  const data = await roomsFetch<{ media: RoomMediaItem[] }>(
    `/api/rooms/${roomId}/media`,
    userId,
  );
  return data.media;
}

export async function apiRemoveRoomMedia(
  userId: string,
  roomId: string,
  messageId: string,
): Promise<{ ok: boolean; alreadyRemoved?: boolean; presentationStopped?: boolean }> {
  return roomsFetch(
    `/api/rooms/${roomId}/media/${messageId}`,
    userId,
    { method: 'DELETE' },
  );
}

export async function apiAddPreparedRoomMedia(
  userId: string,
  roomId: string,
  attachment: MediaAttachment,
): Promise<void> {
  await roomsFetch(
    `/api/rooms/${roomId}/media`,
    userId,
    { method: 'POST', body: JSON.stringify({ attachment }) },
  );
}

export async function apiSetRoomMediaVisibility(
  userId: string,
  roomId: string,
  messageId: string,
  shared: boolean,
): Promise<void> {
  await roomsFetch(
    `/api/rooms/${roomId}/media/${messageId}/visibility`,
    userId,
    { method: 'PATCH', body: JSON.stringify({ shared }) },
  );
}

export async function apiSetAllRoomMediaVisibility(
  userId: string,
  roomId: string,
  shared: boolean,
): Promise<void> {
  await roomsFetch(
    `/api/rooms/${roomId}/media/visibility`,
    userId,
    { method: 'PATCH', body: JSON.stringify({ shared }) },
  );
}

// ─── Presentation ─────────────────────────────────────────────────────────────

export async function apiGetActivePresentation(
  userId: string,
  roomId: string,
): Promise<PresentationState | null> {
  const data = await roomsFetch<{ presentation: PresentationState | null; sessionId: string | null; sharedPanel: SharedPanelState }>(
    `/api/rooms/${roomId}/session/presentation`,
    userId,
  );
  return data.presentation && data.sessionId
    ? { ...data.presentation, sessionId: data.sessionId, sharedPanel: data.sharedPanel }
    : data.presentation;
}

export async function apiStartPresentation(
  userId: string,
  roomId: string,
  params: {
    messageId: string | null;
    filename: string;
    mediaType: string;
    objectPath: string;
    sessionId: string;
    pageCount?: number | null;
  },
): Promise<PresentationState> {
  const data = await roomsFetch<{ presentation: PresentationState; sessionId: string; sharedPanel: SharedPanelState }>(
    `/api/rooms/${roomId}/session/presentation`,
    userId,
    { method: 'POST', body: JSON.stringify(params) },
  );
  return { ...data.presentation, sessionId: data.sessionId, sharedPanel: data.sharedPanel };
}

export async function apiChangePresentationPage(
  userId: string,
  roomId: string,
  sessionId: string,
  presentationId: string,
  page: number,
): Promise<PresentationState> {
  const data = await roomsFetch<{ presentation: PresentationState; sessionId: string; sharedPanel: SharedPanelState }>(
    `/api/rooms/${roomId}/session/presentation/page`,
    userId,
    { method: 'PATCH', body: JSON.stringify({ sessionId, presentationId, page }) },
  );
  return { ...data.presentation, sessionId: data.sessionId, sharedPanel: data.sharedPanel };
}

export async function apiStopPresentation(
  userId: string,
  roomId: string,
  sessionId: string,
  presentationId: string,
): Promise<{ sessionId: string }> {
  return roomsFetch<{ sessionId: string }>(
    `/api/rooms/${roomId}/session/presentation`,
    userId,
    { method: 'DELETE', body: JSON.stringify({ sessionId, presentationId }) },
  );
}

export async function apiSetAllowMemberPresent(
  userId: string,
  roomId: string,
  allow: boolean,
): Promise<void> {
  await roomsFetch(
    `/api/rooms/${roomId}/allow-member-present`,
    userId,
    { method: 'PATCH', body: JSON.stringify({ allow }) },
  );
}
