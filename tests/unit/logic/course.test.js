import { describe, it, expect } from 'vitest';
import { validateCourse } from '../../../src/logic/course.js';

const good = () => ({
  id: 'test-flat',
  tile: 48,
  cols: 40,
  rows: 12,
  spawn: { col: 3, row: 8 },
  ground: [{ col: 0, row: 9, w: 40, h: 3 }],
});

describe('validateCourse', () => {
  it('accepts a well-formed flat course', () => {
    expect(validateCourse(good())).toEqual([]);
  });

  it('accepts extra fields so later stages can add obstacles and checkpoints', () => {
    expect(validateCourse({ ...good(), obstacles: [], checkpoints: [] })).toEqual([]);
  });

  it('checks every obstacle with the obstacle rules and names the one that is wrong', () => {
    const bar = { type: 'spinning-bar', col: 5, row: 7, length: 3.6, rps: 0.5 };
    expect(validateCourse({ ...good(), obstacles: [bar] })).toEqual([]);
    const errors = validateCourse({ ...good(), obstacles: [bar, { ...bar, length: 0 }, { ...bar, type: 'lava' }] });
    expect(errors.some((e) => e.startsWith('obstacles[1]') && e.includes('length'))).toBe(true);
    expect(errors.some((e) => e.startsWith('obstacles[2]') && e.includes('type'))).toBe(true);
    expect(errors.some((e) => e.startsWith('obstacles[0]'))).toBe(false);
    expect(validateCourse({ ...good(), obstacles: 'bars' })).toContain('obstacles must be an array');
  });

  it('needs an obstacle to sit inside the course', () => {
    const bar = { type: 'spinning-bar', col: 99, row: 7, length: 3.6, rps: 0.5 };
    expect(validateCourse({ ...good(), obstacles: [bar] })).toContainEqual(expect.stringMatching(/^obstacles\[0\].*inside the course/));
  });

  it('needs a sliding obstacle to stay inside the course for its whole trip, not just to start inside it', () => {
    const platform = { type: 'moving-platform', col: 30, row: 6, w: 3, h: 0.5, dx: 12, dy: 0, period: 6 };
    expect(validateCourse({ ...good(), obstacles: [{ ...platform, dx: 5 }] })).toEqual([]);
    expect(validateCourse({ ...good(), obstacles: [platform] })).toContain('obstacles[0] must stay inside the course for its whole trip');
    expect(validateCourse({ ...good(), obstacles: [{ ...platform, col: 3, dx: -5 }] })).toContain('obstacles[0] must stay inside the course for its whole trip');
  });

  it('checks checkpoints: whole col and row, inside the course, not inside solid ground', () => {
    expect(validateCourse({ ...good(), checkpoints: [{ col: 3, row: 8 }, { col: 20, row: 8 }] })).toEqual([]);
    expect(validateCourse({ ...good(), checkpoints: 'here' })).toContain('checkpoints must be an array');
    expect(validateCourse({ ...good(), checkpoints: [{ col: 1.5, row: 8 }] })).toContain('checkpoints[0] must be {col, row} with whole numbers');
    expect(validateCourse({ ...good(), checkpoints: [{ col: 99, row: 8 }] })).toContain('checkpoints[0] is outside the course');
    expect(validateCourse({ ...good(), checkpoints: [{ col: 3, row: 10 }] })).toContain('checkpoints[0] is inside solid ground');
  });

  it('needs checkpoints to run from left to right, so "the last one passed" is well defined (G3a)', () => {
    const at = (...cols) => cols.map((col) => ({ col, row: 8 }));
    expect(validateCourse({ ...good(), checkpoints: at(3, 10, 20) })).toEqual([]);
    expect(validateCourse({ ...good(), checkpoints: at(10, 10) })).toContain('checkpoints[1] must be to the right of checkpoints[0]');
    expect(validateCourse({ ...good(), checkpoints: at(3, 20, 10) })).toContain('checkpoints[2] must be to the right of checkpoints[1]');
    expect(validateCourse({ ...good(), checkpoints: at(20, 3) }).some((e) => e.startsWith('checkpoints[1] must be to the right'))).toBe(true);
  });

  describe('the finish line and minTime (G3b)', () => {
    const withFinish = (extra = {}) => ({ ...good(), checkpoints: [{ col: 10, row: 8 }], finish: { col: 34 }, minTime: 4, ...extra });

    it('accepts a finish with a minTime, and a course with neither (the free-run test courses)', () => {
      expect(validateCourse(withFinish())).toEqual([]);
      expect(validateCourse(good())).toEqual([]);
    });

    it('needs the finish to be {col} with a whole number inside the course', () => {
      expect(validateCourse(withFinish({ finish: 34 }))).toContain('finish must be {col} with a whole number');
      expect(validateCourse(withFinish({ finish: { col: 34.5 } }))).toContain('finish must be {col} with a whole number');
      expect(validateCourse(withFinish({ finish: {} }))).toContain('finish must be {col} with a whole number');
      expect(validateCourse(withFinish({ finish: { col: 40 } }))).toContain('finish is outside the course');
      expect(validateCourse(withFinish({ finish: { col: -1 } }))).toContain('finish is outside the course');
    });

    it('needs the finish to the right of the spawn and of the last checkpoint, so a race has something to run and every flag comes first', () => {
      expect(validateCourse(withFinish({ finish: { col: 3 } }))).toContain('finish must be to the right of the spawn');
      expect(validateCourse(withFinish({ finish: { col: 10 } }))).toContain('finish must be to the right of the last checkpoint');
      expect(validateCourse(withFinish({ finish: { col: 5 } }))).toContain('finish must be to the right of the last checkpoint');
      expect(validateCourse(withFinish({ finish: { col: 11 } }))).toEqual([]);
    });

    it('needs ground from the finish line to the end of the course, so a runner who has finished cannot fall away', () => {
      const pit = { ground: [{ col: 0, row: 9, w: 36, h: 3 }, { col: 38, row: 9, w: 2, h: 3 }] };
      expect(validateCourse(withFinish(pit))).toContain('ground must run from the finish to the end of the course');
      const short = { ground: [{ col: 0, row: 9, w: 36, h: 3 }] };
      expect(validateCourse(withFinish(short))).toContain('ground must run from the finish to the end of the course');
      // two blocks that touch are as good as one
      const joined = { ground: [{ col: 0, row: 9, w: 36, h: 3 }, { col: 36, row: 9, w: 4, h: 3 }] };
      expect(validateCourse(withFinish(joined))).toEqual([]);
    });

    it('needs a minTime that is a positive number whenever there is a finish, and no minTime without one', () => {
      expect(validateCourse(withFinish({ minTime: undefined }))).toContain('a course with a finish needs a minTime');
      for (const bad of [0, -3, NaN, Infinity, '4']) {
        expect(validateCourse(withFinish({ minTime: bad })), `minTime ${String(bad)}`).toContain('minTime must be a positive number');
      }
      expect(validateCourse({ ...good(), minTime: 4 })).toContain('minTime needs a finish');
    });
  });

  it('rejects things that are not objects', () => {
    for (const bad of [null, undefined, 5, 'course', []]) expect(validateCourse(bad).length).toBeGreaterThan(0);
  });

  it('needs an id, a positive whole tile size and a positive whole size in tiles', () => {
    expect(validateCourse({ ...good(), id: '' })).toContain('id must be a non-empty string');
    expect(validateCourse({ ...good(), tile: 0 })).toContain('tile must be a positive integer');
    expect(validateCourse({ ...good(), cols: 1.5 })).toContain('cols must be a positive integer');
    expect(validateCourse({ ...good(), rows: -2 })).toContain('rows must be a positive integer');
  });

  it('needs the spawn inside the course and not inside solid ground', () => {
    expect(validateCourse({ ...good(), spawn: { col: 99, row: 8 } })).toContain('spawn is outside the course');
    expect(validateCourse({ ...good(), spawn: { col: 3, row: 10 } })).toContain('spawn is inside solid ground');
    expect(validateCourse({ ...good(), spawn: undefined })).toContain('spawn must be {col, row}');
  });

  it('needs at least one ground block, each whole and inside the course', () => {
    expect(validateCourse({ ...good(), ground: [] })).toContain('ground must be a non-empty array');
    expect(validateCourse({ ...good(), ground: [{ col: 30, row: 9, w: 20, h: 3 }] })).toContain('ground[0] is outside the course');
    expect(validateCourse({ ...good(), ground: [{ col: 0, row: 9, w: 0, h: 3 }] })).toContain('ground[0] needs whole col, row, w, h with w and h above 0');
  });

  it('reports every problem at once, not just the first', () => {
    const errors = validateCourse({ id: '', tile: 0, cols: 0, rows: 0 });
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });
});
