import { emptyState } from '../logic/testState.js';
import { countdownLabel } from '../logic/clock.js';

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
        const me = r.runner.snapshot();
        s.obstacles = r.obstacles.snapshots();
        if (r.flow) {
          // the race flow (G3a): phase, the race clock, the countdown word the HUD shows, the last checkpoint passed
          // (-1 = only the start), falls so far, and seconds until a fallen runner is put back (null = not fallen)
          const { phase, t, checkpoint, falls, out } = r.race;
          s.race = { phase, t, countdown: countdownLabel(t), checkpoint, checkpoints: (r.course.checkpoints ?? []).length, falls, respawnIn: out ? out.left : null };
          me.checkpoint = checkpoint;
        }
        s.runners = [me];
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
    /** Obstacle tests only: stand the runner on checkpoint i of the course (src/game/CLAUDE.md "testApi.js"). */
    teleport(i) {
      const r = race();
      if (!r) throw new Error('teleport() needs the race scene');
      r.teleport(i);
    },
    /**
     * Obstacle tests only: set the race clock to t seconds; paused = true holds it there, so a screenshot is
     * "at t = 1 s" exactly. While held, obstacles stand still and contacts do not hit.
     */
    clock(t, paused = false) {
      const r = race();
      if (!r) throw new Error('clock() needs the race scene');
      r.setClock(t, paused);
    },
    /**
     * The shortcut from G1, from before there were obstacles: it calls the very same Runner.hit() that a bar's or
     * hammer's contact calls. Obstacle tests do not use it: there a hit has to come from a real contact.
     */
    hit(dir = 1) {
      const r = race();
      if (!r) throw new Error('hit() needs the race scene');
      r.runner.hit(dir < 0 ? -1 : 1);
    },
  };
}
