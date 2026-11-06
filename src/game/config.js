import { matterGravity } from '../logic/tuning.js';

/** Collision categories, defined once (src/game/CLAUDE.md rule 6). */
export const CAT = Object.freeze({
  WORLD: 0x0001,
  LOCAL_RUNNER: 0x0002,
  REMOTE_RUNNER: 0x0004,
  OBSTACLE: 0x0008,
  SENSOR: 0x0010,
});

/**
 * Matter settings for every scene. Phaser 3.90's Matter runner already steps the engine at a fixed delta
 * with a time buffer, so a slow frame cannot make physics jumpy (src/game/CLAUDE.md rule 4); the
 * runner is driven from the engine's own per-step 'beforeupdate' event, never from the frame loop.
 */
export const MATTER = Object.freeze({
  gravity: { x: 0, y: matterGravity(), scale: 0.001 },
  runner: { fps: 60 },
});
