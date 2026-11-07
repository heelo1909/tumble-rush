import { describe, it, expect } from 'vitest';
import { countdownLabel, formatRaceTime, raceTenth } from '../../../src/logic/clock.js';
import { TUNING, STEP } from '../../../src/logic/tuning.js';

describe('countdownLabel (HANDOFF 5.4: a 3-2-1 countdown, then GO)', () => {
  it('counts 3, 2, 1 across the three seconds before the start', () => {
    expect(countdownLabel(-3)).toBe('3');
    expect(countdownLabel(-2.5)).toBe('3');
    expect(countdownLabel(-2.01)).toBe('3');
    expect(countdownLabel(-2)).toBe('2');
    expect(countdownLabel(-1.2)).toBe('2');
    expect(countdownLabel(-1)).toBe('1');
    expect(countdownLabel(-0.01)).toBe('1');
  });

  it('says GO at the start for a moment, then nothing', () => {
    expect(countdownLabel(0)).toBe('GO!');
    expect(countdownLabel(0.5)).toBe('GO!');
    expect(countdownLabel(TUNING.goShown - 0.01)).toBe('GO!');
    expect(countdownLabel(TUNING.goShown)).toBe('');
    expect(countdownLabel(30)).toBe('');
  });

  it('follows TUNING.countdown instead of a fixed 3', () => {
    const five = { ...TUNING, countdown: 5 };
    expect(countdownLabel(-5, five)).toBe('5');
    expect(countdownLabel(-4.5, five)).toBe('5');
    expect(countdownLabel(-3, five)).toBe('3');
    expect(countdownLabel(-0.5, five)).toBe('1');
  });

  it('shows nothing for a time that is not a number', () => {
    expect(countdownLabel(NaN)).toBe('');
    expect(countdownLabel(undefined)).toBe('');
  });
});

describe('formatRaceTime (the HUD timer)', () => {
  it('shows minutes, seconds and tenths', () => {
    expect(formatRaceTime(0)).toBe('0:00.0');
    expect(formatRaceTime(5.04)).toBe('0:05.0');
    expect(formatRaceTime(5.1)).toBe('0:05.1');
    expect(formatRaceTime(61.5)).toBe('1:01.5');
    expect(formatRaceTime(600)).toBe('10:00.0');
  });

  it('never shows a time ahead of the real one: tenths are cut, not rounded up', () => {
    expect(formatRaceTime(59.96)).toBe('0:59.9');
    expect(formatRaceTime(59.99999)).toBe('0:59.9');
    expect(formatRaceTime(60)).toBe('1:00.0');
  });

  it('shows zero during the countdown and for bad input', () => {
    expect(formatRaceTime(-2)).toBe('0:00.0');
    expect(formatRaceTime(NaN)).toBe('0:00.0');
    expect(formatRaceTime(undefined)).toBe('0:00.0');
    expect(formatRaceTime(Infinity)).toBe('0:00.0');
  });
});

describe('raceTenth (when the HUD has to be redrawn)', () => {
  it('is the tenth of a second a time falls in, with the same cut the timer text uses', () => {
    expect(raceTenth(0)).toBe(0);
    expect(raceTenth(0.09)).toBe(0);
    expect(raceTenth(0.1)).toBe(1);
    expect(raceTenth(59.96)).toBe(599);
    expect(raceTenth(1 - 1e-12), 'a hair under a tenth boundary counts as on it, like formatRaceTime').toBe(10);
    expect(formatRaceTime(1 - 1e-12)).toBe('0:01.0');
  });

  it('changes at every step where the countdown word or the timer text changes, so a HUD redrawn only on a new tenth is never late', () => {
    // the clock exactly as stepRace builds it: -3 plus one step at a time, so float noise is in it
    let t = -TUNING.countdown;
    let prev = null;
    let changes = 0;
    for (let i = 0; i < 60 * 12; i++) {
      const now = { word: countdownLabel(t), text: formatRaceTime(t), tenth: raceTenth(t) };
      if (prev && (now.word !== prev.word || now.text !== prev.text)) {
        changes += 1;
        expect(now.tenth, `step ${i}, t = ${t}: the word or the text changed but the tenth did not`).not.toBe(prev.tenth);
      }
      prev = now;
      t += STEP;
    }
    // the words 3, 2, 1, GO! and the empty word after it (5), and a new timer text every tenth of the 9 racing seconds (90)
    expect(changes, 'the loop really walked through the countdown and the race').toBeGreaterThanOrEqual(90);
  });
});
