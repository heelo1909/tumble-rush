/**
 * Course data checks (HANDOFF 5.3). A course is JSON, never code; the scene builds only from a course
 * that passes. G1 knows the flat test course (size, spawn, ground blocks). G2/G3 add obstacles,
 * checkpoints, finish and minTime here, and extra fields are allowed until then.
 * @module logic/course
 */

const isInt = (v) => Number.isInteger(v);
const isPosInt = (v) => Number.isInteger(v) && v > 0;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

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

  return errors;
}
