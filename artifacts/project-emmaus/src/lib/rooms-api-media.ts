/**
 * rooms-api-media.ts — API helpers for Group Discussion media sharing and presentation.
 * Kept separate from rooms-api.ts to avoid the file growing too large.
 */

import { roomsFetch } from '@/lib/rooms-api';
import { getApiUrl } from '@/lib/api';
import type { MediaAttachment, PresentationState, RoomMediaItem } from '@/lib/rooms-types';

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

// ─── Presentation ─────────────────────────────────────────────────────────────

export async function apiGetActivePresentation(
  userId: string,
  roomId: string,
): Promise<PresentationState | null> {
  const data = await roomsFetch<{ presentation: PresentationState | null }>(
    `/api/rooms/${roomId}/session/presentation`,
    userId,
  );
  return data.presentation;
}

export async function apiStartPresentation(
  userId: string,
  roomId: string,
  params: {
    messageId: string | null;
    filename: string;
    mediaType: string;
    objectPath: string;
    sessionId?: string | null;
    pageCount?: number | null;
  },
): Promise<PresentationState> {
  const data = await roomsFetch<{ presentation: PresentationState }>(
    `/api/rooms/${roomId}/session/presentation`,
    userId,
    { method: 'POST', body: JSON.stringify(params) },
  );
  return data.presentation;
}

export async function apiChangePresentationPage(
  userId: string,
  roomId: string,
  page: number,
): Promise<void> {
  await roomsFetch(
    `/api/rooms/${roomId}/session/presentation/page`,
    userId,
    { method: 'PATCH', body: JSON.stringify({ page }) },
  );
}

export async function apiStopPresentation(
  userId: string,
  roomId: string,
): Promise<void> {
  await roomsFetch(
    `/api/rooms/${roomId}/session/presentation`,
    userId,
    { method: 'DELETE' },
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
