import Phaser from 'phaser';

/**
 * Keyboard -> intent {left, right, jump, dive} (HANDOFF 5.1; src/game/CLAUDE.md rule 1).
 * Arrows or A/D run, Up/W/Space jump, Shift dives. The same intent shape is produced by bots and the test autopilot.
 */
export class LocalControl {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.codes = { up: K.UP, w: K.W, space: K.SPACE, shift: K.SHIFT };
    // true = stop the browser scrolling the page on arrows/space
    this.k = scene.input.keyboard.addKeys(
      { left: K.LEFT, a: K.A, right: K.RIGHT, d: K.D, up: K.UP, w: K.W, space: K.SPACE, shift: K.SHIFT },
      true,
    );
    // A press is latched when the key goes down and handed to the next physics step. Phaser clears its own
    // "just pressed" flag when the key comes up, so a tap shorter than a frame (a quick finger, or a test)
    // would otherwise be lost.
    this.latch = { jump: false, dive: false };
    scene.input.keyboard.on('keydown', this.onKeyDown, this);
    /** one object reused every step: no allocation in the loop */
    this.intent = { left: false, right: false, jump: false, dive: false };
  }

  onKeyDown(e) {
    if (e.repeat) return;
    const c = e.keyCode;
    const { up, w, space, shift } = this.codes;
    if (c === up || c === w || c === space) this.latch.jump = true;
    else if (c === shift) this.latch.dive = true;
  }

  /** Read the keys for one physics step. */
  sample() {
    const { k, intent, latch } = this;
    intent.left = k.left.isDown || k.a.isDown;
    intent.right = k.right.isDown || k.d.isDown;
    intent.jump = k.up.isDown || k.w.isDown || k.space.isDown || latch.jump;
    intent.dive = k.shift.isDown || latch.dive;
    latch.jump = false;
    latch.dive = false;
    return intent;
  }
}
