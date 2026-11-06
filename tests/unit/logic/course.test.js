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
