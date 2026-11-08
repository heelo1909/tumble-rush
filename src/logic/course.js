/**
 * Course data checks (HANDOFF 5.3). A course is JSON, never code; the scene builds only from a course
 * that passes. It knows size, spawn, ground blocks (G1), the race-clock obstacles and checkpoints (G2a), the
 * contact obstacles (G2b) and the finish line with its minTime (G3b). Other extra fields are allowed.
 * @module logic/course
 */
import { validateObstacle, OBSTACLE_TYPES } from './obstacles.js';
import { CONTACT_TYPES, validateContactObstacle, contactBounds, seesawHitsGround } from './contact.js';

const isInt = (v) => Number.isInteger(v);
const isPosInt = (v) => Number.isInteger(v) && v > 0;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The pits of a course: each run of columns that no ground block stands on, lying between two columns that one does
 * (the empty columns before the first ground or after the last are not pits). A column is covered if any block stands on
 * it, whatever its row, so a raised block over the floor changes nothing. Used by the test player and the smoke check,
 * and by B1's bots to know where to jump. Never throws: nonsense gives no pits.
 * @param {unknown} c the parsed course JSON
 * @returns {{from: number, to: number, width: number}[]} left to right; `from` is the first empty column and `to` the
 *   first column of ground after it, so `width = to - from`
 */
export function groundGaps(c) {
  const list = isObject(c) && Array.isArray(/** @type {any} */ (c).ground) ? /** @type {any} */ (c).ground : [];
  const spans = list.filter((g) => isObject(g) && isInt(g.col) && isPosInt(g.w)).map((g) => [g.col, g.col + g.w]).sort((a, b) => a[0] - b[0]);
  if (spans.length === 0) return [];
  const gaps = [];
  let reach = spans[0][1]; // the first column nothing so far stands on
  for (const [from, to] of spans.slice(1)) {
    if (from > reach) gaps.push({ from: reach, to: from, width: from - reach });
    if (to > reach) reach = to;
  }
  return gaps;
}

/**
 * @param {unknown} c the parsed course JSON
 * @returns {string[]} one plain sentence per problem; empty means the course is valid
 */
export function validateCourse(c) {
  if (!isObject(c)) return ['course must be an object'];
  const course = /** @type {Record<string, any>} */ (c);
  const errors = [];

  if (typeof course.id !== 'string' || course.id.length === 0) errors.push('id must be a non-empty string');
  if (!isPosInt(course.tile)) errors.push('tile must be a positive integer');
  if (!isPosInt(course.cols)) errors.push('cols must be a positive integer');
  if (!isPosInt(course.rows)) errors.push('rows must be a positive integer');
  const sized = isPosInt(course.cols) && isPosInt(course.rows);

  const inside = (col, row, w = 1, h = 1) => col >= 0 && row >= 0 && col + w <= course.cols && row + h <= course.rows;

  const ground = [];
  if (!Array.isArray(course.ground) || course.ground.length === 0) {
    errors.push('ground must be a non-empty array');
  } else {
    course.ground.forEach((g, i) => {
      const ok = isObject(g) && isInt(g.col) && isInt(g.row) && isPosInt(g.w) && isPosInt(g.h);
      if (!ok) {
        errors.push(`ground[${i}] needs whole col, row, w, h with w and h above 0`);
      } else if (sized && !inside(g.col, g.row, g.w, g.h)) {
        errors.push(`ground[${i}] is outside the course`);
      } else {
        ground.push(g);
      }
    });
  }

  const s = course.spawn;
  if (!isObject(s) || !isInt(s.col) || !isInt(s.row)) {
    errors.push('spawn must be {col, row}');
  } else if (sized && !inside(s.col, s.row)) {
    errors.push('spawn is outside the course');
  } else if (ground.some((g) => s.col >= g.col && s.col < g.col + g.w && s.row >= g.row && s.row < g.row + g.h)) {
    errors.push('spawn is inside solid ground');
  }

  const solid = (col, row) => ground.some((g) => col >= g.col && col < g.col + g.w && row >= g.row && row < g.row + g.h);

  if (course.obstacles !== undefined) {
    if (!Array.isArray(course.obstacles)) {
      errors.push('obstacles must be an array');
    } else {
      course.obstacles.forEach((o, i) => {
        const type = isObject(o) ? o.type : undefined;
        const contact = CONTACT_TYPES.includes(type);
        const known = contact || OBSTACLE_TYPES.includes(type);
        const problems = !known && isObject(o)
          ? [`type must be one of: ${[...OBSTACLE_TYPES, ...CONTACT_TYPES].join(', ')}`]
          : (contact ? validateContactObstacle(o) : validateObstacle(o));
        for (const p of problems) errors.push(`obstacles[${i}] ${p}`);
        if (problems.length === 0 && sized) {
          const within = (x, y) => x >= 0 && y >= 0 && x <= course.cols && y <= course.rows;
          if (contact) {
            const b = contactBounds(o.type, o);
            if (b.x0 < 0 || b.y0 < 0 || b.x1 > course.cols || b.y1 > course.rows) errors.push(`obstacles[${i}] must be inside the course`);
            else if (o.type === 'seesaw' && seesawHitsGround(o, ground)) errors.push(`obstacles[${i}] would tip into solid ground (lift the pivot, or cut a notch in the ground under the ends)`);
          } else if (!within(o.col, o.row)) errors.push(`obstacles[${i}] centre must be inside the course`);
          else if (typeof o.dx === 'number' && !within(o.col + o.dx, o.row + o.dy)) errors.push(`obstacles[${i}] must stay inside the course for its whole trip`);
        }
      });
    }
  }

  if (course.checkpoints !== undefined) {
    if (!Array.isArray(course.checkpoints)) {
      errors.push('checkpoints must be an array');
    } else {
      course.checkpoints.forEach((p, i) => {
        if (!isObject(p) || !isInt(p.col) || !isInt(p.row)) errors.push(`checkpoints[${i}] must be {col, row} with whole numbers`);
        else if (sized && !inside(p.col, p.row)) errors.push(`checkpoints[${i}] is outside the course`);
        else if (solid(p.col, p.row)) errors.push(`checkpoints[${i}] is inside solid ground`);
        // "the last checkpoint passed" only means something if they run from left to right (G3a)
        const prev = course.checkpoints[i - 1];
        if (i > 0 && isObject(p) && isObject(prev) && isInt(p.col) && isInt(prev.col) && p.col <= prev.col) {
          errors.push(`checkpoints[${i}] must be to the right of checkpoints[${i - 1}]`);
        }
      });
    }
  }

  // The finish line (G3b): the left edge of tile `col`. A course with one needs a minTime (the fastest anyone could
  // possibly run it, which the host's sanity check on results uses later); a free-run test course has neither.
  if (course.finish !== undefined) {
    const f = course.finish;
    if (!isObject(f) || !isInt(f.col)) {
      errors.push('finish must be {col} with a whole number');
    } else if (sized && (f.col < 0 || f.col >= course.cols)) {
      errors.push('finish is outside the course');
    } else {
      if (isObject(s) && isInt(s.col) && f.col <= s.col) errors.push('finish must be to the right of the spawn');
      const flags = Array.isArray(course.checkpoints) ? course.checkpoints.filter((p) => isObject(p) && isInt(p.col)) : [];
      if (flags.length > 0 && f.col <= Math.max(...flags.map((p) => p.col))) errors.push('finish must be to the right of the last checkpoint');
      // a runner who has crossed the line is still on the course until they stop: no pit between the line and the wall
      const covered = (col) => ground.some((g) => col >= g.col && col < g.col + g.w);
      if (sized) {
        for (let col = f.col; col < course.cols; col++) {
          if (!covered(col)) {
            errors.push('ground must run from the finish to the end of the course');
            break;
          }
        }
      }
    }
    if (course.minTime === undefined) errors.push('a course with a finish needs a minTime');
  } else if (course.minTime !== undefined) {
    errors.push('minTime needs a finish');
  }
  if (course.minTime !== undefined && !(typeof course.minTime === 'number' && Number.isFinite(course.minTime) && course.minTime > 0)) {
    errors.push('minTime must be a positive number');
  }

  return errors;
}
