import { describe, it, expect } from 'vitest';
import { newRace, stepRace, controlsLive } from '../../../src/logic/race.js';
import { countdownLabel } from '../../../src/logic/clock.js';
import { TUNING, STEP } from '../../../src/logic/tuning.js';

const course = () => ({
  cols: 60,
  rows: 12,
  spawn: { col: 2, row: 9 },
  checkpoints: [{ col: 10, row: 9 }, { col: 30, row: 9 }, { col: 50, row: 9 }],
});
const ON_GROUND = { x: 3.5, y: 9.45 }; // a runner standing near the spawn, in tiles
const FALLEN = { x: 20, y: 12.2 }; // below the bottom edge of the course

/** Run the race for `seconds` of fixed steps with the runner held at a spot; returns the final state and every event. */
function run(state, seconds, runner = ON_GROUND, c = course(), T = TUNING) {
  const events = [];
  let s = state;
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    const r = stepRace(s, runner, c, STEP, T);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}
/** A race that is already running (the countdown is over). */
const racing = () => run(newRace(), TUNING.countdown + 0.1).state;
const ofType = (events, type) => events.filter((e) => e.type === type);

describe('newRace', () => {
  it('starts in the countdown, three seconds before the start, at the spawn, with nothing counted yet', () => {
    expect(newRace()).toEqual({ phase: 'countdown', t: -TUNING.countdown, checkpoint: -1, falls: 0, out: null });
  });

  it('is plain JSON all the way through a race (it is broadcast and logged)', () => {
    const { state } = run(newRace(), 8, FALLEN);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe('the countdown', () => {
  it('holds still for three seconds, then goes, once', () => {
    const early = run(newRace(), TUNING.countdown - 0.1);
    expect(early.state.phase).toBe('countdown');
    expect(early.state.t).toBeLessThan(0);
    expect(early.events).toEqual([]);

    const done = run(early.state, 0.3);
    expect(done.state.phase).toBe('racing');
    expect(ofType(done.events, 'go')).toHaveLength(1);
    expect(done.state.t).toBeGreaterThanOrEqual(0);
    expect(done.state.t).toBeLessThan(0.3);

    expect(ofType(run(done.state, 2).events, 'go')).toHaveLength(0);
  });

  it('starts the race clock at 0 when the countdown ends, whatever the step size', () => {
    let s = newRace();
    let seconds = 0;
    for (const dt of [1, 1, 0.5, 0.5]) {
      s = stepRace(s, ON_GROUND, course(), dt).state;
      seconds += dt;
    }
    expect(seconds).toBe(3);
    expect(s.phase).toBe('racing');
    expect(s.t).toBeCloseTo(0, 9);
  });

  it('ends on exactly 0 with the word GO!, even though 180 steps of 1/60 do not add up to exactly 3', () => {
    let s = newRace();
    for (let i = 0; i < 179; i++) s = stepRace(s, ON_GROUND, course()).state;
    expect(s.phase).toBe('countdown');
    expect(countdownLabel(s.t)).toBe('1');
    const r = stepRace(s, ON_GROUND, course());
    expect(r.state.phase).toBe('racing');
    expect(r.events).toEqual([{ type: 'go' }]);
    expect(r.state.t, 'a hair under 0 would show "1" at GO').toBe(0);
    expect(countdownLabel(r.state.t)).toBe('GO!');
  });

  it('counts no checkpoints and no falls while it counts down', () => {
    const { state, events } = run(newRace(), TUNING.countdown - 0.1, { x: 40, y: 15 });
    expect(events).toEqual([]);
    expect(state.checkpoint).toBe(-1);
    expect(state.falls).toBe(0);
  });

  it('follows TUNING.countdown', () => {
    const T = { ...TUNING, countdown: 1 };
    expect(newRace(T).t).toBe(-1);
    expect(run(newRace(T), 1.1, ON_GROUND, course(), T).state.phase).toBe('racing');
  });

  it('keeps the race clock running while racing', () => {
    expect(run(racing(), 10).state.t).toBeCloseTo(racing().t + 10, 6);
  });
});

describe('controlsLive: may the runner steer?', () => {
  it('not in the countdown, yes while racing, not while waiting to respawn', () => {
    expect(controlsLive(newRace())).toBe(false);
    expect(controlsLive(racing())).toBe(true);
    const fell = run(racing(), STEP, FALLEN).state;
    expect(fell.out).not.toBeNull();
    expect(controlsLive(fell)).toBe(false);
  });
});

describe('checkpoints', () => {
  it('are passed from left to right, each once, when the runner gets to them', () => {
    let s = racing();
    let r = run(s, STEP, { x: 9.9, y: 9.45 });
    expect(r.events).toEqual([]);
    expect(r.state.checkpoint).toBe(-1);

    // the flag in column 10 counts at the MIDDLE of its tile (10.5), not at its left edge
    r = run(r.state, STEP, { x: 10.2, y: 9.45 });
    expect(r.events).toEqual([]);
    expect(r.state.checkpoint).toBe(-1);

    r = run(r.state, STEP, { x: 10.5, y: 9.45 });
    expect(r.events).toEqual([{ type: 'checkpoint', index: 0 }]);
    expect(r.state.checkpoint).toBe(0);

    r = run(r.state, 1, { x: 10.9, y: 9.45 });
    expect(r.events).toEqual([]);
    s = r.state;

    r = run(s, STEP, { x: 30.5, y: 9.45 });
    expect(r.events).toEqual([{ type: 'checkpoint', index: 1 }]);
    expect(r.state.checkpoint).toBe(1);
  });

  it('are not lost when the runner flies over several in one step: each is passed, in order', () => {
    const r = run(racing(), STEP, { x: 51, y: 5 });
    expect(r.events).toEqual([
      { type: 'checkpoint', index: 0 },
      { type: 'checkpoint', index: 1 },
      { type: 'checkpoint', index: 2 },
    ]);
    expect(r.state.checkpoint).toBe(2);
  });

  it('are never un-passed by running back', () => {
    let r = run(racing(), STEP, { x: 31, y: 9.45 });
    expect(r.state.checkpoint).toBe(1);
    r = run(r.state, 1, { x: 2, y: 9.45 });
    expect(r.state.checkpoint).toBe(1);
    expect(ofType(r.events, 'checkpoint')).toHaveLength(0);
  });

  it('a course with no checkpoints is fine: there is only the start', () => {
    const c = { ...course(), checkpoints: undefined };
    const r = run(racing(), 1, { x: 40, y: 9.45 }, c);
    expect(r.state.checkpoint).toBe(-1);
    expect(r.events).toEqual([]);
  });
});

describe('falling off the course', () => {
  it('is noticed once, when the runner is below the bottom edge', () => {
    const edge = { x: 5, y: course().rows - 0.01 };
    expect(run(racing(), 1, edge).events).toEqual([]);
    const r = run(racing(), STEP, { x: 5, y: course().rows + 0.01 });
    expect(r.events).toEqual([{ type: 'fall' }]);
    expect(r.state.falls).toBe(1);
    expect(r.state.out).toEqual({ left: TUNING.respawnDelay });
  });

  it('brings the runner back to the start after TUNING.respawnDelay when no checkpoint was passed', () => {
    const fell = run(racing(), STEP, FALLEN); // the step in which the fall is noticed
    const early = run(fell.state, TUNING.respawnDelay - 2 * STEP, FALLEN);
    expect(early.events).toEqual([]);
    expect(early.state.out).not.toBeNull();

    const back = run(early.state, 2 * STEP, FALLEN); // the respawnDelay-th step after the fall: exactly the one that puts it back
    expect(back.events).toEqual([{ type: 'respawn', checkpoint: -1, col: 2, row: 9 }]);
    expect(back.state.out).toBeNull();
    expect(controlsLive(back.state)).toBe(true);
  });

  it('brings the runner back to the LAST checkpoint passed, not the first and not the start', () => {
    const at = run(racing(), STEP, { x: 31, y: 9.45 }).state;
    expect(at.checkpoint).toBe(1);
    const fell = run(at, STEP, FALLEN).state;
    const back = run(fell, TUNING.respawnDelay, FALLEN);
    expect(ofType(back.events, 'respawn')).toEqual([{ type: 'respawn', checkpoint: 1, col: 30, row: 9 }]);
    expect(back.state.checkpoint).toBe(1);
  });

  it('counts no checkpoint and no second fall while the runner waits to be put back', () => {
    const r = run(racing(), TUNING.respawnDelay - 0.2, { x: 51, y: 20 });
    expect(ofType(r.events, 'fall')).toHaveLength(1);
    expect(ofType(r.events, 'checkpoint')).toHaveLength(0);
    expect(r.state.checkpoint).toBe(-1);
    expect(r.state.falls).toBe(1);
  });

  it('can happen again and again, each time back at the same place', () => {
    let s = racing();
    const events = [];
    for (let i = 0; i < 3; i++) {
      const down = run(s, STEP, FALLEN);
      const up = run(down.state, TUNING.respawnDelay, FALLEN); // ends on the step that puts the runner back
      s = run(up.state, STEP, ON_GROUND).state;
      events.push(...down.events, ...up.events);
    }
    expect(ofType(events, 'fall')).toHaveLength(3);
    expect(ofType(events, 'respawn')).toHaveLength(3);
    expect(s.falls).toBe(3);
  });

  it('keeps the race clock running while the runner waits', () => {
    const fell = run(racing(), STEP, FALLEN).state;
    const t0 = fell.t;
    expect(run(fell, 0.5, FALLEN).state.t).toBeCloseTo(t0 + 0.5, 6);
  });

  it('follows TUNING.respawnDelay instead of a fixed 1 s', () => {
    const slow = { ...TUNING, respawnDelay: 2 };
    const fell = run(racing(), STEP, FALLEN, course(), slow).state;
    expect(fell.out).toEqual({ left: 2 });
    expect(ofType(run(fell, 1.9, FALLEN, course(), slow).events, 'respawn')).toHaveLength(0);
    expect(ofType(run(fell, 2, FALLEN, course(), slow).events, 'respawn')).toHaveLength(1);
  });

  it('leaves room under the 1.5 s feel target (src/game/CLAUDE.md) for the fall itself: the wait is at most 1 s', () => {
    expect(TUNING.respawnDelay).toBeLessThanOrEqual(1);
  });
});

describe('the finish line (G3b)', () => {
  const withFinish = () => ({ ...course(), finish: { col: 55 }, minTime: 5 });
  const NEAR = { x: 54.9, y: 9.45 };
  const OVER = { x: 55, y: 9.45 };

  it('is crossed when the runner reaches the left edge of its tile: one finish event with the race time, and the race is finished', () => {
    const c = withFinish();
    const before = run(racing(), STEP, NEAR, c);
    expect(ofType(before.events, 'finish')).toHaveLength(0);
    expect(before.state.phase).toBe('racing');

    const r = run(before.state, STEP, OVER, c);
    expect(ofType(r.events, 'finish')).toEqual([{ type: 'finish', time: r.state.t }]);
    expect(r.state.phase).toBe('finished');
    expect(r.state.t, 'the time is the race clock at the line, after the countdown').toBeGreaterThan(0);
  });

  it('stops the clock at the line: the time stays what it was, and nothing more happens', () => {
    const c = withFinish();
    const done = run(racing(), STEP, OVER, c).state;
    const later = run(done, 5, OVER, c);
    expect(later.events).toEqual([]);
    expect(later.state.t).toBe(done.t);
    expect(later.state.phase).toBe('finished');
    // not even a fall or a flag changes anything once the race is over
    const down = run(done, 3, FALLEN, c);
    expect(down.events).toEqual([]);
    expect(down.state).toEqual(done);
  });

  it('takes the controls away: a runner who has finished may not steer', () => {
    const c = withFinish();
    const done = run(racing(), STEP, OVER, c).state;
    expect(controlsLive(done)).toBe(false);
  });

  it('does not count a finish for a runner who is below the course, or who is still waiting to be put back', () => {
    const c = withFinish();
    const r = run(racing(), STEP, { x: 60, y: course().rows + 1 }, c);
    expect(ofType(r.events, 'finish')).toHaveLength(0);
    expect(r.state.phase).toBe('racing');
    expect(r.state.out).not.toBeNull();
    // still waiting, with the body now beyond the line
    const waiting = run(r.state, 0.5, OVER, c);
    expect(ofType(waiting.events, 'finish')).toHaveLength(0);
    expect(waiting.state.phase).toBe('racing');
  });

  it('does not finish in the countdown, even for a runner standing beyond the line', () => {
    const r = run(newRace(), TUNING.countdown - 0.1, OVER, withFinish());
    expect(r.events).toEqual([]);
    expect(r.state.phase).toBe('countdown');
  });

  it('passes the last flag first when both come in one step: the flag event, then the finish', () => {
    const r = run(racing(), STEP, { x: 56, y: 5 }, withFinish());
    expect(r.events.map((e) => e.type)).toEqual(['checkpoint', 'checkpoint', 'checkpoint', 'finish']);
    expect(r.state.checkpoint).toBe(2);
  });

  it('does nothing about a finish on a course that has none (the free-run and G3a test courses)', () => {
    const r = run(racing(), 1, { x: 59, y: 9.45 });
    expect(ofType(r.events, 'finish')).toHaveLength(0);
    expect(r.state.phase).toBe('racing');
  });

  it('keeps the falls and the last checkpoint in the finished state, and stays plain JSON', () => {
    const c = withFinish();
    const down = run(racing(), STEP, FALLEN, c).state;
    const up = run(down, TUNING.respawnDelay, FALLEN, c).state;
    const done = run(up, STEP, OVER, c).state;
    expect(done.phase).toBe('finished');
    expect(done.falls).toBe(1);
    expect(done.checkpoint).toBe(2);
    expect(JSON.parse(JSON.stringify(done))).toEqual(done);
  });

  it('is not changed by what it is given, like every other step', () => {
    const c = withFinish();
    const done = run(racing(), STEP, OVER, c).state;
    const before = JSON.stringify(done);
    stepRace(done, OVER, c);
    expect(JSON.stringify(done)).toBe(before);
  });
});

describe('stepRace does not touch what it is given', () => {
  it('returns a new state and leaves the old one and the course alone', () => {
    const s = racing();
    const before = JSON.stringify(s);
    const c = course();
    const cBefore = JSON.stringify(c);
    stepRace(s, FALLEN, c);
    stepRace(s, { x: 51, y: 9 }, c);
    expect(JSON.stringify(s)).toBe(before);
    expect(JSON.stringify(c)).toBe(cBefore);
  });
});
