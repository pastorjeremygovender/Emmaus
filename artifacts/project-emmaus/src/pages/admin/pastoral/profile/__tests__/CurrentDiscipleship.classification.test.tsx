import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CurrentDiscipleship from '../CurrentDiscipleship';
import type { DiscipleshipSummary } from '@/lib/pastoral-api';

const baseSummary = (): Extract<DiscipleshipSummary, { available: true }> => ({
  available: true,
  userId: 'wesley-user',
  journeys: [],
  rooms: [],
  devotionals: [],
  sermonCompanions: [],
});

function section(label: string) {
  const header = document.querySelector(`[data-discipleship-section="${label}"]`);
  if (!header?.parentElement) throw new Error(`Missing section: ${label}`);
  return within(header.parentElement);
}

describe('CurrentDiscipleship source-backed allocation', () => {
  it('renders Daily Rhythm only from a daily-rhythm journey type', () => {
    const summary = baseSummary();
    summary.journeys = [{
      journeyId: '15-minutes-with-jesus',
      title: '10 Minutes with Jesus',
      journeyType: 'daily-rhythm',
      collectionId: null,
      currentDay: 7,
      totalDays: 30,
      completedDays: 7,
      status: 'active',
      startedAt: null,
      updatedAt: null,
    }];

    render(<CurrentDiscipleship discipleship={summary} />);

    expect(section('Daily Rhythm').getByText('10 Minutes with Jesus')).toBeInTheDocument();
    expect(screen.queryByText('Walks in Progress')).not.toBeInTheDocument();
    expect(screen.queryByText('Journeys in Progress')).not.toBeInTheDocument();
  });

  it('renders Daily Devotionals only from devotional progress records', () => {
    const summary = baseSummary();
    summary.devotionals = [{
      seriesId: 'psalms-series',
      title: 'Psalms Daily Devotional',
      currentDay: 237,
      completedCount: 236,
      status: 'active',
      startedAt: null,
      updatedAt: null,
    }];

    render(<CurrentDiscipleship discipleship={summary} />);

    expect(section('Daily Devotionals').getByText('Psalms Daily Devotional')).toBeInTheDocument();
    expect(screen.queryByText('Daily Rhythm')).not.toBeInTheDocument();
  });

  it('renders Ready to Serve Walk progress under Walks in Progress', () => {
    const summary = baseSummary();
    summary.journeys = [{
      journeyId: 'ready-to-serve',
      title: 'Ready to Serve',
      journeyType: 'walk',
      collectionId: null,
      currentDay: 3,
      totalDays: 5,
      completedDays: 2,
      status: 'active',
      startedAt: null,
      updatedAt: null,
    }];

    render(<CurrentDiscipleship discipleship={summary} />);

    expect(section('Walks in Progress').getByText('Ready to Serve')).toBeInTheDocument();
    expect(screen.queryByText('Groups')).not.toBeInTheDocument();
  });

  it('renders a non-Walk journey under Journeys in Progress', () => {
    const summary = baseSummary();
    summary.journeys = [{
      journeyId: 'journey-1',
      title: 'A Journey of Trust',
      journeyType: 'journey',
      collectionId: null,
      currentDay: 2,
      totalDays: 5,
      completedDays: 1,
      status: 'active',
      startedAt: null,
      updatedAt: null,
    }];

    render(<CurrentDiscipleship discipleship={summary} />);

    expect(section('Journeys in Progress').getByText('A Journey of Trust')).toBeInTheDocument();
    expect(screen.queryByText('Walks in Progress')).not.toBeInTheDocument();
  });

  it('uses collection identity when a legacy journey type says walk', () => {
    const summary = baseSummary();
    summary.journeys = [{
      journeyId: 'collection-journey-1',
      title: 'A Collection Journey',
      journeyType: 'walk',
      collectionId: 'collection-1',
      currentDay: 2,
      totalDays: 5,
      completedDays: 1,
      status: 'active',
      startedAt: null,
      updatedAt: null,
    }];

    render(<CurrentDiscipleship discipleship={summary} />);

    expect(section('Journeys in Progress').getByText('A Collection Journey')).toBeInTheDocument();
    expect(screen.queryByText('Walks in Progress')).not.toBeInTheDocument();
  });

  it('does not create a Group entry from a Walk title alone', () => {
    const summary = baseSummary();
    summary.journeys = [{
      journeyId: 'walk-ready',
      title: 'Ready to Serve',
      journeyType: 'walk',
      collectionId: null,
      currentDay: 1,
      totalDays: 5,
      completedDays: 0,
      status: 'active',
      startedAt: null,
      updatedAt: null,
    }];

    render(<CurrentDiscipleship discipleship={summary} />);

    expect(screen.queryByText('Groups')).not.toBeInTheDocument();
  });

  it('renders Groups only from supplied joined group membership rows', () => {
    const summary = baseSummary();
    summary.rooms = [{
      roomId: 'room-ready',
      roomName: 'Ready to Serve',
      role: 'owner',
      joinedAt: null,
    }];

    render(<CurrentDiscipleship discipleship={summary} />);

    expect(section('Groups').getByText('Ready to Serve')).toBeInTheDocument();
    expect(screen.queryByText('Walks in Progress')).not.toBeInTheDocument();
  });

  it('keeps identically named Walk and genuine Group records separate', () => {
    const summary = baseSummary();
    summary.journeys = [{
      journeyId: 'walk-ready',
      title: 'Ready to Serve',
      journeyType: 'walk',
      collectionId: null,
      currentDay: 3,
      totalDays: 5,
      completedDays: 2,
      status: 'active',
      startedAt: null,
      updatedAt: null,
    }];
    summary.rooms = [{
      roomId: 'room-ready',
      roomName: 'Ready to Serve',
      role: 'owner',
      joinedAt: null,
    }];

    render(<CurrentDiscipleship discipleship={summary} />);

    expect(section('Walks in Progress').getByText('Ready to Serve')).toBeInTheDocument();
    expect(section('Groups').getByText('Ready to Serve')).toBeInTheDocument();
    expect(screen.getAllByText('Ready to Serve')).toHaveLength(2);
  });

  it('keeps empty categories hidden', () => {
    const summary = baseSummary();
    summary.sermonCompanions = [{
      companionId: 'companion-1',
      title: 'A Sermon Companion',
      currentDay: 1,
      totalDays: 5,
      completedCount: 0,
      startedAt: null,
      updatedAt: null,
    }];

    render(<CurrentDiscipleship discipleship={summary} />);

    expect(screen.getByText('Sermon Companions')).toBeInTheDocument();
    expect(screen.queryByText('Daily Rhythm')).not.toBeInTheDocument();
    expect(screen.queryByText('Daily Devotionals')).not.toBeInTheDocument();
    expect(screen.queryByText('Walks in Progress')).not.toBeInTheDocument();
    expect(screen.queryByText('Journeys in Progress')).not.toBeInTheDocument();
    expect(screen.queryByText('Groups')).not.toBeInTheDocument();
  });

  it('does not surface paused or completed journeys as in-progress resources', () => {
    const summary = baseSummary();
    summary.journeys = [
      {
        journeyId: 'paused-walk',
        title: 'Paused Walk',
        journeyType: 'walk',
        collectionId: null,
        currentDay: 2,
        totalDays: 5,
        completedDays: 1,
        status: 'paused',
        startedAt: null,
        updatedAt: null,
      },
      {
        journeyId: 'done-walk',
        title: 'Done Walk',
        journeyType: 'walk',
        collectionId: null,
        currentDay: 5,
        totalDays: 5,
        completedDays: 5,
        status: 'completed',
        startedAt: null,
        updatedAt: null,
      },
    ];

    render(<CurrentDiscipleship discipleship={summary} />);

    expect(screen.queryByText('Walks in Progress')).not.toBeInTheDocument();
    expect(screen.getByText('Completed Walks')).toBeInTheDocument();
    expect(screen.getByText('Done Walk')).toBeInTheDocument();
    expect(screen.queryByText('Paused Walk')).not.toBeInTheDocument();
  });
});