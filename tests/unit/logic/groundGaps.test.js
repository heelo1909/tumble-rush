import { describe, it, expect } from 'vitest';
import { groundGaps, validateCourse } from '../../../src/logic/course.js';
import testRace from '../../../src/game/courses/test-race.json';

const course = (ground) => ({ id: 'x', tile: 48, cols: 100, rows: 12, spawn: { col: 1, row: 8 }, ground });

describe('groundGaps', () => {
  it('lists each run of columns with no ground between two stretches of ground, with where it starts and ends', () => {
    expect(groundGaps(testRace)).toEqual([
      { from: 16, to: 19, width: 3 },
      { from: 40, to: 43, width: 3 },
    ]);
  });

  it('is empty for ground that touches, overlaps or is stacked in one stretch', () => {
    expect(groundGaps(course([{ col: 0, row: 10, w: 10, h: 2 }, { col: 10, row: 10, w: 10, h: 2 }]))).toEqual([]);
    expect(groundGaps(course([{ col: 0, row: 10, w: 10, h: 2 }, { col: 5, row: 10, w: 15, h: 2 }]))).toEqual([]);
    // a raised block over the floor changes nothing: a column is covered if any block stands on it
    expect(groundGaps(course([{ col: 0, row: 10, w: 20, h: 2 }, { col: 4, row: 6, w: 3, h: 1 }]))).toEqual([]);
  });

  it('does not count the empty columns before the first ground or after the last as gaps', () => {
    expect(groundGaps(course([{ col: 5, row: 10, w: 10, h: 2 }, { col: 18, row: 10, w: 10, h: 2 }]))).toEqual([{ from: 15, to: 18, width: 3 }]);
  });

  it('finds gaps whatever order the blocks are written in, and returns them left to right', () => {
    const blocks = [{ col: 40, row: 10, w: 5, h: 2 }, { col: 0, row: 10, w: 10, h: 2 }, { col: 20, row: 10, w: 10, h: 2 }];
    expect(groundGaps(course(blocks))).toEqual([{ from: 10, to: 20, width: 10 }, { from: 30, to: 40, width: 10 }]);
  });

  it('gives nothing for a course with no ground, and never throws on nonsense', () => {
    expect(groundGaps(course([]))).toEqual([]);
    expect(groundGaps({})).toEqual([]);
    expect(groundGaps(null)).toEqual([]);
    expect(groundGaps({ ground: 'floor' })).toEqual([]);
  });

  it('agrees with the validator about the real courses it is used on', () => {
    expect(validateCourse(testRace)).toEqual([]);
  });
});
