import { describe, it, expect } from 'vitest';
import { getStepLabel, getDevotionalLabel, resolveStepPrefix } from './step-label';

// ---------------------------------------------------------------------------
// resolveStepPrefix
// ---------------------------------------------------------------------------
describe('resolveStepPrefix', () => {
  it('returns the admin-set stepLabelPrefix when provided', () => {
    expect(resolveStepPrefix({ stepLabelPrefix: 'Session', journeyType: 'walk' })).toBe('Session');
  });

  it('trims whitespace from stepLabelPrefix', () => {
    expect(resolveStepPrefix({ stepLabelPrefix: '  Lesson  ', journeyType: 'walk' })).toBe('Lesson');
  });

  it('treats blank/whitespace-only stepLabelPrefix as absent', () => {
    expect(resolveStepPrefix({ stepLabelPrefix: '   ', journeyType: 'walk' })).toBe('Step');
  });

  it('treats null stepLabelPrefix as absent', () => {
    expect(resolveStepPrefix({ stepLabelPrefix: null, journeyType: 'walk' })).toBe('Step');
  });

  it('returns "Day" for daily-rhythm journeyType', () => {
    expect(resolveStepPrefix({ journeyType: 'daily-rhythm' })).toBe('Day');
  });

  it('returns "Step" for any other journeyType', () => {
    expect(resolveStepPrefix({ journeyType: 'walk' })).toBe('Step');
    expect(resolveStepPrefix({ journeyType: 'course' })).toBe('Step');
    expect(resolveStepPrefix({ journeyType: '' })).toBe('Step');
  });

  it('returns "Step" when journey is null or undefined', () => {
    expect(resolveStepPrefix(null)).toBe('Step');
    expect(resolveStepPrefix(undefined)).toBe('Step');
  });
});

// ---------------------------------------------------------------------------
// getStepLabel — 4 key cases from the task spec
// ---------------------------------------------------------------------------
describe('getStepLabel', () => {
  // Case 1: displayLabel present → return it verbatim
  it('returns displayLabel verbatim when it is set and non-empty', () => {
    const step = { day: 3, displayLabel: 'Introduction to Grace' };
    expect(getStepLabel(step, { journeyType: 'walk' })).toBe('Introduction to Grace');
  });

  it('trims whitespace from displayLabel', () => {
    const step = { day: 3, displayLabel: '  Welcome  ' };
    expect(getStepLabel(step, { journeyType: 'walk' })).toBe('Welcome');
  });

  it('falls through to computed label when displayLabel is empty string', () => {
    const step = { day: 5, displayLabel: '' };
    expect(getStepLabel(step, { journeyType: 'walk' })).toBe('Step 5');
  });

  it('falls through to computed label when displayLabel is whitespace-only', () => {
    const step = { day: 2, displayLabel: '   ' };
    expect(getStepLabel(step, { journeyType: 'walk' })).toBe('Step 2');
  });

  it('falls through to computed label when displayLabel is null', () => {
    const step = { day: 4, displayLabel: null };
    expect(getStepLabel(step, { journeyType: 'walk' })).toBe('Step 4');
  });

  // Case 2: stepLabelPrefix set explicitly → uses that prefix + day
  it('uses admin-set stepLabelPrefix over journeyType auto-derivation', () => {
    const step = { day: 7 };
    const journey = { journeyType: 'daily-rhythm', stepLabelPrefix: 'Week' };
    expect(getStepLabel(step, journey)).toBe('Week 7');
  });

  it('uses admin-set stepLabelPrefix for a walk journey', () => {
    const step = { day: 1 };
    const journey = { journeyType: 'walk', stepLabelPrefix: 'Module' };
    expect(getStepLabel(step, journey)).toBe('Module 1');
  });

  // Case 3: journeyType 'daily-rhythm' → auto-derives "Day N"
  it('produces "Day N" for daily-rhythm journeyType with no prefix override', () => {
    const step = { day: 10 };
    const journey = { journeyType: 'daily-rhythm' };
    expect(getStepLabel(step, journey)).toBe('Day 10');
  });

  it('produces "Day N" for daily-rhythm even when stepLabelPrefix is null', () => {
    const step = { day: 1 };
    const journey = { journeyType: 'daily-rhythm', stepLabelPrefix: null };
    expect(getStepLabel(step, journey)).toBe('Day 1');
  });

  // Case 4: any other journeyType → auto-derives "Step N"
  it('produces "Step N" for a walk journeyType', () => {
    const step = { day: 3 };
    const journey = { journeyType: 'walk' };
    expect(getStepLabel(step, journey)).toBe('Step 3');
  });

  it('produces "Step N" when journey is null', () => {
    const step = { day: 6 };
    expect(getStepLabel(step, null)).toBe('Step 6');
  });

  it('produces "Step N" when journey is undefined', () => {
    const step = { day: 2 };
    expect(getStepLabel(step)).toBe('Step 2');
  });

  it('produces "Step N" for an unknown journeyType', () => {
    const step = { day: 9 };
    const journey = { journeyType: 'custom-series' };
    expect(getStepLabel(step, journey)).toBe('Step 9');
  });
});

// ---------------------------------------------------------------------------
// getDevotionalLabel — displayLabel overrides "Day N"
// ---------------------------------------------------------------------------
describe('getDevotionalLabel', () => {
  it('returns "Day N" when no displayLabel is set', () => {
    expect(getDevotionalLabel({ dayNumber: 1 })).toBe('Day 1');
    expect(getDevotionalLabel({ dayNumber: 30 })).toBe('Day 30');
  });

  it('returns displayLabel verbatim when set and non-empty', () => {
    expect(getDevotionalLabel({ dayNumber: 5, displayLabel: 'Easter Sunday' })).toBe('Easter Sunday');
  });

  it('trims whitespace from displayLabel', () => {
    expect(getDevotionalLabel({ dayNumber: 3, displayLabel: '  Palm Sunday  ' })).toBe('Palm Sunday');
  });

  it('falls through to "Day N" when displayLabel is empty string', () => {
    expect(getDevotionalLabel({ dayNumber: 7, displayLabel: '' })).toBe('Day 7');
  });

  it('falls through to "Day N" when displayLabel is whitespace-only', () => {
    expect(getDevotionalLabel({ dayNumber: 7, displayLabel: '  ' })).toBe('Day 7');
  });

  it('falls through to "Day N" when displayLabel is null', () => {
    expect(getDevotionalLabel({ dayNumber: 12, displayLabel: null })).toBe('Day 12');
  });
});
