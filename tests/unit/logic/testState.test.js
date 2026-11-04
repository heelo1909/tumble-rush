import { describe, it, expect } from 'vitest';
import { emptyState } from '../../../src/logic/testState.js';

describe('emptyState', () => {
  it('has the shape the e2e tests rely on', () => {
    expect(emptyState('lobby')).toEqual({ scene: 'lobby', room: null, seats: [], raceTime: 0, runners: [] });
  });
});
