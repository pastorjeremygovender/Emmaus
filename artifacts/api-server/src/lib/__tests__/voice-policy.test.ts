import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acquireVoiceRequest,
  getVoiceProviderStatus,
  releaseVoiceRequest,
  VOICE_STT_MODEL,
} from '../voice-service.js';
import { getVoiceCacheDecision } from '../voice-cache-policy.js';

describe('Emmaus Voice provider policy', () => {
  it('uses the low-cost OpenAI transcription model and device output by default', () => {
    assert.equal(VOICE_STT_MODEL, 'gpt-4o-mini-transcribe');
    const status = getVoiceProviderStatus();
    assert.equal(status.normalStt.provider, 'openai');
    assert.equal(status.normalStt.model, VOICE_STT_MODEL);
    assert.equal(status.normalTts.provider, 'device');
    assert.equal(status.comparisons.elevenlabs.enabled, false);
  });

  it('fences overlapping billable requests per user', () => {
    assert.equal(acquireVoiceRequest('voice-test-user', 'first'), true);
    assert.equal(acquireVoiceRequest('voice-test-user', 'second'), false);
    releaseVoiceRequest('voice-test-user', 'second');
    assert.equal(acquireVoiceRequest('voice-test-user', 'still-first'), false);
    releaseVoiceRequest('voice-test-user', 'first');
    assert.equal(acquireVoiceRequest('voice-test-user', 'second'), true);
    releaseVoiceRequest('voice-test-user', 'second');
  });
});

describe('fixed Voice audio cache policy', () => {
  it('creates a tenant- and version-scoped immutable key for published fixed content', () => {
    const decision = getVoiceCacheDecision({
      tenantId: 'church-a',
      resource: 'published-sermon',
      resourceId: 'sermon-1',
      contentVersion: 'updated-at-1',
      published: true,
    });
    assert.equal(decision.cacheable, true);
    assert.match(decision.cacheKey ?? '', /church-a/);
    assert.match(decision.cacheKey ?? '', /updated-at-1/);
    assert.match(decision.cacheControl, /immutable/);
  });

  it('never caches personalized answers', () => {
    const decision = getVoiceCacheDecision({
      tenantId: 'church-a',
      resource: 'personalized-answer',
      resourceId: 'resource-1',
      contentVersion: 'v1',
      published: true,
    });
    assert.equal(decision.cacheable, false);
    assert.equal(decision.cacheKey, null);
    assert.equal(decision.cacheControl, 'private, no-store');
  });

  it('never caches Bible passages', () => {
    const decision = getVoiceCacheDecision({
      tenantId: 'church-a',
      resource: 'bible-passage',
      resourceId: 'resource-1',
      contentVersion: 'v1',
      published: true,
    });
    assert.equal(decision.cacheable, false);
    assert.equal(decision.cacheKey, null);
    assert.equal(decision.cacheControl, 'private, no-store');
  });
});