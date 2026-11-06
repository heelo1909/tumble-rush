import { emptyState } from '../logic/testState.js';

/** Installs window.__TR only when the URL has ?test=1 (HANDOFF 4.3, src/game/CLAUDE.md "testApi.js"). */
export function installTestApi(game, params) {
  if (params.get('test') !== '1') return;
  /** the race scene, once it has built its runner */
  const race = () => {
    const s = game.scene.getScene('race');
    return s && s.runner ? s : null;
  };
  window.__TR = {
    state() {
      const s = emptyState(game.registry.get('scene') || 'boot');
      const r = race();
      if (r) {
        s.raceTime = r.raceTime();
        s.runners = [r.runner.snapshot()];
      }
      return s;
    },
    autopilot() {},
    seed() {},
    fps: () => Math.round(game.loop.actualFps),
    events: () => {
      const r = race();
      return r ? r.events_.slice() : [];
    },
    /**
     * G1 only: stands in for a hammer or spinning bar until G2 builds them. It calls the very same
     * Runner.hit() the obstacles will call, so the tumble and spring-up it shows are the real ones.
     */
    hit(dir = 1) {
      const r = race();
      if (!r) throw new Error('hit() needs the race scene');
      r.runner.hit(dir < 0 ? -1 : 1);
    },
  };
}
