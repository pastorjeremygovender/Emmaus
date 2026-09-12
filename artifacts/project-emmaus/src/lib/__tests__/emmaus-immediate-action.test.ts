import { describe, expect, it } from 'vitest';
import {
  executeValidatedEmmausAction,
  getImmediateEmmausAction,
  type EmmausMetadata,
} from '../emmaus-client';

function metadata(overrides: Partial<EmmausMetadata>): EmmausMetadata {
  return {
    requestedIntent: 'OPEN',
    scripture: null,
    nextStep: null,
    nextSteps: [],
    recommendations: [],
    followUpPrompts: [],
    handoffType: null,
    ...overrides,
  };
}

describe('Ask Emmaus immediate actions', () => {
  it('executes the validated Jarvis target for an imperative response', () => {
    const route = getImmediateEmmausAction(metadata({
      jarvis: {
        contractVersion: 'jarvis.v1',
        intent: 'CONTINUE',
        pastoralText: 'Opening Walk B.',
        scriptureReferences: [],
        contentReferences: [],
        suggestedNextAction: {
          kind: 'OPEN',
          targetType: 'resource',
          targetId: 'walk-b',
          label: 'Open Walk B',
          route: '/journey/walk-b/day/2',
          resourceType: 'walk',
        },
        actions: [],
        handoffType: null,
        retrievalFailures: [],
      },
    }));
    const navigated: string[] = [];

    expect(executeValidatedEmmausAction(route, (path) => navigated.push(path))).toBe(true);
    expect(navigated).toEqual(['/journey/walk-b/day/2']);
  });

  it('does not execute a route for an ambiguous imperative', () => {
    expect(getImmediateEmmausAction(metadata({
      requestedIntent: 'OPEN',
      answer: 'Which Walk would you like to open?',
    }))).toBeNull();
  });

  it('does not execute actions attached to ordinary questions', () => {
    expect(getImmediateEmmausAction(metadata({
      requestedIntent: 'ASK',
      nextStep: {
        action: 'Open Walk B',
        primaryButtonText: 'Open Walk B',
        path: '/journey/walk-b/day/2',
      },
    }))).toBeNull();
  });
});