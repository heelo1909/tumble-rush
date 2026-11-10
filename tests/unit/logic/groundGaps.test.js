import { describe, it, expect } from 'vitest';
import { groundGaps, pitsToJump } from '../../../src/logic/course.js';
import testRace from '../../../src/game/courses/test-race.json';
import course1 from '../../../src/game/courses/course1.json';

const course = (ground, obstacles) => ({ id: 'x', tile: 48, cols: 100, rows: 12, spawn: { col: 1, row: 8 }, ground, obstacles });

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

  it('drops an entry that is not a block with a whole col and a positive whole w, so it cannot split a pit or open a phantom one', () => {
    const floor = [{ col: 0, row: 10, w: 10, h: 2 }, { col: 15, row: 10, w: 10, h: 2 }];
    const clean = groundGaps(course(floor));
    expect(clean).toEqual([{ from: 10, to: 15, width: 5 }]);
    // each of these on its own, and all of them together, must leave the answer as it was
    const garbage = [null, 7, 'ground', [], {}, { col: 12, w: 0 }, { col: 12, w: -3 }, { col: 10.5, w: 2 }, { col: 11, w: 1.5 }, { col: '12', w: 2 }];
    for (const g of garbage) expect(groundGaps(course([...floor, g])), JSON.stringify(g)).toEqual(clean);
    expect(groundGaps(course([null, ...floor, ...garbage]))).toEqual(clean);
  });

  it('finds the pits of the opening of course 1: the two to jump and the one the falling tiles cover', () => {
    // course 1 goes on after its opening (G3d): the first three gaps are still the opening's
    expect(groundGaps(course1).slice(0, 3)).toEqual([
      { from: 18, to: 21, width: 3 },
      { from: 36, to: 39, width: 3 },
      { from: 62, to: 70, width: 8 },
    ]);
  });
});

describe('pitsToJump', () => {
  const floor = [{ col: 0, row: 10, w: 10, h: 2 }, { col: 14, row: 10, w: 20, h: 2 }];
  const pit = { from: 10, to: 14, width: 4 };

  it('is every gap when there are no falling tiles, and never throws on nonsense', () => {
    expect(pitsToJump(course(floor))).toEqual([pit]);
    expect(pitsToJump(course(floor, []))).toEqual([pit]);
    expect(pitsToJump({})).toEqual([]);
    expect(pitsToJump(null)).toEqual([]);
    expect(pitsToJump(course(floor, 'tiles'))).toEqual([pit]);
  });

  it('leaves out a pit that one row of falling tiles covers end to end', () => {
    expect(pitsToJump(course(floor, [{ type: 'falling-tiles', col: 12, row: 10.25, count: 4 }]))).toEqual([]);
    expect(pitsToJump(course(floor, [{ type: 'falling-tiles', col: 12, row: 10.25, count: 6 }]))).toEqual([]); // reaching onto the ground is fine
  });

  it('keeps a pit that a row covers only in part: the rest is open, so it is still a jump', () => {
    expect(pitsToJump(course(floor, [{ type: 'falling-tiles', col: 11, row: 10.25, count: 2 }]))).toEqual([pit]);
    expect(pitsToJump(course(floor, [{ type: 'falling-tiles', col: 12, row: 10.25, count: 3 }]))).toEqual([pit]);
  });

  it('ignores other obstacles and rows with no usable numbers', () => {
    expect(pitsToJump(course(floor, [{ type: 'conveyor', col: 12, row: 10, w: 4, dir: 1 }, { type: 'falling-tiles', col: 'x', count: 4 }, null]))).toEqual([pit]);
  });

  it('gives the pits of course 1 to jump, and not the rows of tiles that bridge a pit', () => {
    const froms = pitsToJump(course1).map((p) => p.from);
    expect(froms.slice(0, 2), 'the opening: the two pits, and not the tile row at 62').toEqual([18, 36]);
    expect(froms).not.toContain(62);
    // every gap of the course is either a pit to jump or one that a row of tiles covers end to end
    const rows = course1.obstacles.filter((o) => o.type === 'falling-tiles');
    expect(froms.length + rows.length).toBe(groundGaps(course1).length);
  });
});
