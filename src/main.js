import Phaser from 'phaser';
import { BootScene, W, H } from './game/BootScene.js';
import { RaceScene } from './game/scenes/RaceScene.js';
import { MATTER } from './game/config.js';
import { installTestApi } from './game/testApi.js';
import { fallsLabel, formatRaceTime } from './logic/clock.js';
import { createHud } from './ui/hud.js';
import { createResults } from './ui/results.js';
import { createTitle } from './ui/title.js';

// The course the title's Play button runs. G3b plays the short test course; G3c swaps this one constant for course 1.
const SOLO_COURSE = 'test-race';

const params = new URLSearchParams(window.location.search);
// Test scenes, reachable only in test mode (?test=1&scene=flat, gallery or race) until the real flow is built. `flow`
// turns on the race flow (countdown, timer, checkpoints, respawn: G3a); the other two are free-run test courses.
const TEST_SCENES = {
  flat: { course: 'test-flat', flow: false },
  gallery: { course: 'test-gallery', flow: false },
  race: { course: 'test-race', flow: true },
};
const testScene = params.get('test') === '1' ? TEST_SCENES[params.get('scene')] : undefined;

// The DOM layer over the canvas (src/ui). The scene gets the HUD through the registry, and tells us what happened with
// game events ('title-shown', 'race-over'), so game code never imports ui.
const ui = document.getElementById('ui');
const hud = createHud(ui);

// The way in and the way round (G3b): the title's Play starts a solo race; the results offer play again and the title.
// Starting 'race' while it is running shuts it down and starts it again, which is what play again is.
const startRace = () => {
  results.hide();
  title.hide();
  if (game.scene.isActive('boot')) game.scene.stop('boot');
  game.scene.start('race');
};
const playSolo = () => {
  game.registry.set('course', SOLO_COURSE);
  game.registry.set('flow', true);
  startRace();
};
const showTitle = () => {
  results.hide();
  if (game.scene.isActive('race')) game.scene.stop('race');
  game.scene.start('boot');
};
const title = createTitle(ui, { onPlay: playSolo });
const results = createResults(ui, { onAgain: startRace, onTitle: showTitle });

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
      // listening from preBoot, before any scene exists, so a 'title-shown' can never be missed (no Play button at all)
      g.events.on('title-shown', () => title.show());
      g.events.on('race-over', ({ time, falls }) => results.show({ time: formatRaceTime(time), falls: fallsLabel(falls) }));
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
