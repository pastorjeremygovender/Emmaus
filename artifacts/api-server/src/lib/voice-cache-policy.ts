/**
 * Cache policy for optional server-generated Voice audio.
 *
 * Normal Voice uses device speech and therefore has no audio cache. This
 * policy is for future/admin-generated fixed resources only and fails closed
 * for anything personalized, restricted, or not explicitly versioned.
 */

export type VoiceCacheResource =
  | 'published-journey-step'
  | 'published-sermon'
  | 'published-devotional';

export interface VoiceCacheRequest {
  tenantId: string;
  resource: VoiceCacheResource | 'personalized-answer' | 'bible-passage';
  resourceId: string;
  contentVersion: string;
  published: boolean;
  restricted?: boolean;
}

export interface VoiceCacheDecision {
  cacheable: boolean;
  cacheKey: string | null;
  cacheControl: 'public, max-age=31536000, immutable' | 'private, no-store';
}

export function getVoiceCacheDecision(input: VoiceCacheRequest): VoiceCacheDecision {
  const fixedResource =
    input.resource === 'published-journey-step'
    || input.resource === 'published-sermon'
    || input.resource === 'published-devotional';
  const cacheable = Boolean(
    input.tenantId.trim()
    && input.resourceId.trim()
    && input.contentVersion.trim()
    && fixedResource
    && input.published
    && !input.restricted,
  );
  if (!cacheable) {
    return { cacheable: false, cacheKey: null, cacheControl: 'private, no-store' };
  }
  const safePart = (value: string) => encodeURIComponent(value.trim());
  return {
    cacheable: true,
    cacheKey: [
      'emmaus-voice',
      safePart(input.tenantId),
      safePart(input.resource),
      safePart(input.resourceId),
      safePart(input.contentVersion),
    ].join(':'),
    cacheControl: 'public, max-age=31536000, immutable',
  };
}