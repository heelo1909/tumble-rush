import Phaser from 'phaser';
import { BootScene, W, H } from './game/BootScene.js';
import { RaceScene } from './game/scenes/RaceScene.js';
import { MATTER } from './game/config.js';
import { installTestApi } from './game/testApi.js';
import { createHud } from './ui/hud.js';

const params = new URLSearchParams(window.location.search);
// Test scenes, reachable only in test mode (?test=1&scene=flat, gallery or race) until the real flow is built. `flow`
// turns on the race flow (countdown, timer, checkpoints, respawn: G3a); the other two are free-run test courses.
const TEST_SCENES = {
  flat: { course: 'test-flat', flow: false },
  gallery: { course: 'test-gallery', flow: false },
  race: { course: 'test-race', flow: true },
};
const testScene = params.get('test') === '1' ? TEST_SCENES[params.get('scene')] : undefined;

// The DOM layer over the canvas (src/ui). The scene gets it through the registry, so game code never imports ui.
const hud = createHud(document.getElementById('ui'));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  physics: { default: 'matter', matter: MATTER },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: testScene ? [RaceScene, BootScene] : [BootScene, RaceScene],
  callbacks: {
    preBoot: (g) => {
      g.registry.set('course', testScene?.course);
      g.registry.set('flow', testScene?.flow === true);
      g.registry.set('hud', hud);
    },
  },
});

// The canvas is scaled to fit the window and centred, so in a window that is not 16:9 it has bars beside or above it.
// Keep the HUD layer exactly over the picture, whatever moves it: the window, the parent, the canvas, Phaser's own resize.
game.events.once(Phaser.Core.Events.READY, () => {
  const place = () => hud.place(game.canvas.getBoundingClientRect());
  place();
  new ResizeObserver(place).observe(game.canvas);
  new ResizeObserver(place).observe(document.getElementById('game'));
  game.scale.on(Phaser.Scale.Events.RESIZE, place);
});

installTestApi(game, params);
