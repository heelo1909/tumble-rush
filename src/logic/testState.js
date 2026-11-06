/** Pure shape of the state exposed to tests via window.__TR.state() (HANDOFF 4.3). */
export function emptyState(scene = 'boot') {
  return { scene, room: null, seats: [], raceTime: 0, runners: [], obstacles: [] };
}
