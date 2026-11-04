import Phaser from 'phaser';
import { BootScene, W, H } from './game/BootScene.js';
import { installTestApi } from './game/testApi.js';

const params = new URLSearchParams(window.location.search);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  physics: { default: 'matter', matter: { gravity: { y: 1 } } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene],
});

installTestApi(game, params);
