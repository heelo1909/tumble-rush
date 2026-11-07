/**
 * Pure shape of the state exposed to tests via window.__TR.state() (HANDOFF 4.3). `race` is null until a scene runs
 * the race flow (countdown, checkpoints, respawn: G3a); then it is the logic/race.js state plus what the HUD says.
 */
export function emptyState(scene = 'boot') {
  return { scene, room: null, seats: [], raceTime: 0, runners: [], obstacles: [], race: null };
}
