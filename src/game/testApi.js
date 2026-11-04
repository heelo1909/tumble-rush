import { emptyState } from '../logic/testState.js';

/** Installs window.__TR only when the URL has ?test=1 (HANDOFF 4.3). */
export function installTestApi(game, params) {
  if (params.get('test') !== '1') return;
  window.__TR = {
    state() {
      const s = emptyState(game.registry.get('scene') || 'boot');
      return s;
    },
    autopilot() {},
    seed() {},
    fps: () => Math.round(game.loop.actualFps),
    events: () => [],
  };
}
