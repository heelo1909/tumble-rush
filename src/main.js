import Phaser from 'phaser';
import { BootScene, W, H } from './game/BootScene.js';
import { RaceScene } from './game/scenes/RaceScene.js';
import { MATTER } from './game/config.js';
import { installTestApi } from './game/testApi.js';

const params = new URLSearchParams(window.location.search);
// Test courses, reachable only in test mode (?test=1&scene=flat or scene=gallery) until G3 builds the real flow.
const TEST_COURSES = { flat: 'test-flat', gallery: 'test-gallery' };
const testCourse = params.get('test') === '1' ? TEST_COURSES[params.get('scene')] : undefined;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  physics: { default: 'matter', matter: MATTER },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: testCourse ? [RaceScene, BootScene] : [BootScene, RaceScene],
  callbacks: { preBoot: (g) => g.registry.set('course', testCourse) },
});

installTestApi(game, params);
