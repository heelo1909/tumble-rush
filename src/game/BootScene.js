import Phaser from 'phaser';

export const W = 960;
export const H = 540;

/** H0 hello scene: proves Phaser + Matter render. Replaced by the real menu later. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    this.cameras.main.setBackgroundColor('#2d2a55');
    this.add.text(W / 2, 140, 'Tumble Rush', { fontFamily: 'sans-serif', fontSize: '72px', color: '#ffd23f', fontStyle: 'bold' })
      .setOrigin(0.5).setStroke('#1b1b2f', 10);
    this.add.text(W / 2, 220, 'obstacle race for friends', { fontFamily: 'sans-serif', fontSize: '28px', color: '#ffffff' }).setOrigin(0.5);

    const ground = this.add.rectangle(W / 2, H - 20, W, 40, 0x4ecdc4);
    this.matter.add.gameObject(ground, { isStatic: true });
    // the Matter test box falls beside the title (G3b put the Play button in the middle, where it used to fall)
    const box = this.add.rectangle(W * 0.14, 300, 60, 60, 0xff6b6b).setStrokeStyle(6, 0x1b1b2f);
    this.matter.add.gameObject(box, { restitution: 0.6 });
    this.box = box;

    this.events.emit('tr-ready');
    // main.js shows the Play button (src/ui/title.js) over this scene whenever it says so: game code never imports ui
    this.game.events.emit('title-shown');
    this.registry.set('scene', 'hello');
  }
}
