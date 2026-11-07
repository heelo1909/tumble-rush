import { describe, it, expect } from 'vitest';
import { TUNING, TILE, STEP, matterGravity, jumpApex, jumpAirTime } from '../../../src/logic/tuning.js';

describe('tuning', () => {
  it('is frozen so nothing tweaks the numbers at run time', () => {
    expect(Object.isFrozen(TUNING)).toBe(true);
    expect(() => {
      'use strict';
      TUNING.runSpeed = 99;
    }).toThrow();
  });

  it('has only finite numbers that are not negative (a tuner may set a cooldown or a hop to 0)', () => {
    for (const [k, v] of Object.entries(TUNING)) {
      expect(Number.isFinite(v), k).toBe(true);
      expect(v, k).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps the numbers that must stay above zero above zero', () => {
    for (const k of ['runSpeed', 'runAccel', 'runDecel', 'gravity', 'jumpSpeed', 'diveSpeed', 'diveTime', 'tumbleTime', 'springTime', 'bodyW', 'bodyH', 'countdown', 'respawnDelay', 'goShown']) {
      expect(TUNING[k], k).toBeGreaterThan(0);
    }
  });

  it('has the race-flow numbers HANDOFF gives: a 3-2-1 countdown (5.4), a respawn after 1 s (5.1)', () => {
    expect(TUNING.countdown).toBe(3);
    expect(TUNING.respawnDelay).toBe(1);
    expect(TUNING.goShown, 'a banner fades within 1.5 s (src/ui/CLAUDE.md rule 5)').toBeLessThanOrEqual(1.5);
  });

  it('uses a 60 Hz step and 48 px tiles', () => {
    expect(STEP).toBeCloseTo(1 / 60, 12);
    expect(TILE).toBe(48);
  });

  it('jump numbers match the feel target: about two tiles high, about 0.7 s', () => {
    expect(jumpApex()).toBeCloseTo(2, 1);
    expect(jumpAirTime()).toBeGreaterThan(0.6);
    expect(jumpAirTime()).toBeLessThan(0.8);
  });

  it('converts gravity to the unit Matter expects (px/s^2 / 1000)', () => {
    expect(matterGravity()).toBeCloseTo((TUNING.gravity * TILE) / 1000, 9);
    expect(matterGravity({ ...TUNING, gravity: 20.8333333 })).toBeCloseTo(1, 3);
  });
});
