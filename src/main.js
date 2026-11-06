import Phaser from 'phaser';
import { BootScene, W, H } from './game/BootScene.js';
import { RaceScene } from './game/scenes/RaceScene.js';
import { MATTER } from './game/config.js';
import { installTestApi } from './game/testApi.js';

const params = new URLSearchParams(window.location.search);
// G1: the flat test course, reachable only in test mode (?test=1&scene=flat) until G3 builds the real flow.
const flat = params.get('test') === '1' && params.get('scene') === 'flat';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  physics: { default: 'matter', matter: MATTER },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: flat ? [RaceScene, BootScene] : [BootScene, RaceScene],
});

installTestApi(game, params);
