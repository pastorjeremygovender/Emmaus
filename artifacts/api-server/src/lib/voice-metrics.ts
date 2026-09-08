/**
 * Privacy-safe, process-local Voice usage metrics.
 *
 * This deliberately stores aggregates only: no transcript, audio, user id, or
 * content cache key is retained. A process restart resets the counters.
 */

export type VoiceMetricProvider = 'openai' | 'elevenlabs' | 'device';
export type VoiceMetricOperation = 'transcription' | 'tts';

export interface VoiceUsageSnapshot {
  operation: VoiceMetricOperation;
  provider: VoiceMetricProvider;
  requests: number;
  failures: number;
  totalLatencyMs: number;
  totalDurationMs: number;
  totalCharacters: number;
  cacheReuses: number;
  estimatedCostUsd: number;
  elevenLabsCalls: number;
}

const metrics = new Map<string, VoiceUsageSnapshot>();

export function recordVoiceUsage(input: {
  operation: VoiceMetricOperation;
  provider: VoiceMetricProvider;
  latencyMs: number;
  durationMs?: number;
  characters?: number;
  cacheReuse?: boolean;
  estimatedCostUsd?: number;
  failed?: boolean;
}): void {
  const key = `${input.operation}:${input.provider}`;
  const existing = metrics.get(key) ?? {
    operation: input.operation,
    provider: input.provider,
    requests: 0,
    failures: 0,
    totalLatencyMs: 0,
    totalDurationMs: 0,
    totalCharacters: 0,
    cacheReuses: 0,
    estimatedCostUsd: 0,
    elevenLabsCalls: 0,
  };
  existing.requests += 1;
  existing.failures += input.failed ? 1 : 0;
  existing.totalLatencyMs += Math.max(0, input.latencyMs);
  existing.totalDurationMs += Math.max(0, input.durationMs ?? 0);
  existing.totalCharacters += Math.max(0, input.characters ?? 0);
  existing.cacheReuses += input.cacheReuse ? 1 : 0;
  existing.estimatedCostUsd += Math.max(0, input.estimatedCostUsd ?? 0);
  existing.elevenLabsCalls += input.provider === 'elevenlabs' ? 1 : 0;
  metrics.set(key, existing);
}

export function getVoiceUsageSnapshot(): VoiceUsageSnapshot[] {
  return [...metrics.values()].map((metric) => ({ ...metric }));
}

export function resetVoiceUsageMetrics(): void {
  metrics.clear();
}

/** Current published list price approximation for internal budgeting only. */
export function estimateOpenAiTranscriptionCost(durationMs: number): number {
  return Math.max(0, durationMs / 60_000) * 0.003;
}

/** Current published list price approximation for internal budgeting only. */
export function estimateOpenAiTtsCost(characters: number): number {
  return Math.max(0, characters) / 1000 * 0.015;
}