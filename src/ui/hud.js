import './hud.css';

/**
 * The race HUD (G3a): a big countdown, the race timer and a short message ("Checkpoint!"), as plain DOM over the
 * canvas (src/ui/CLAUDE.md). It only shows what it is given: text comes from src/logic/clock.js through the scene,
 * main.js hands this object to the scene, and nothing here knows the game. Every element has a data-testid.
 * @param {HTMLElement} root the #ui container
 */
export function createHud(root) {
  const make = (testid, className) => {
    const e = document.createElement('div');
    e.className = className;
    e.dataset.testid = testid;
    root.appendChild(e);
    return e;
  };
  const countdown = make('countdown', 'tr-countdown');
  const timer = make('timer', 'tr-timer');
  const toast = make('toast', 'tr-toast');
  timer.hidden = true;
  let label = '';
  let time = '';

  /** Restart a CSS animation on an element. */
  const replay = (e, cls) => {
    e.classList.remove(cls);
    void e.offsetWidth; // a reflow, so the browser sees the class come off before it goes on
    e.classList.add(cls);
  };

  return {
    /**
     * Lay the HUD exactly over the game's picture. The canvas is scaled to fit the window and centred, so on a window
     * that is not 16:9 it has bars beside or above it, and a HUD pinned to the window would sit on the bars. main.js
     * calls this with the canvas rectangle whenever it changes. Sizes scale with it, so every window shows the same layout.
     * @param {{left: number, top: number, width: number, height: number}} rect the canvas rectangle in window pixels
     */
    place(rect) {
      const s = root.style;
      s.right = 'auto';
      s.bottom = 'auto';
      s.left = `${rect.left}px`;
      s.top = `${rect.top}px`;
      s.width = `${rect.width}px`;
      s.height = `${rect.height}px`;
      // 1 at a 1280 px wide picture (a 13" laptop); never so small that the countdown drops under 96 px
      s.setProperty('--u', String(Math.max(rect.width / 1280, 0.75)));
    },
    /**
     * @param {{countdown: string, time: string}} view the countdown word ('' = none) and the timer text
     */
    update(view) {
      if (view.countdown !== label) {
        label = view.countdown;
        countdown.textContent = label;
        if (label) replay(countdown, 'pop');
      }
      if (view.time !== time) {
        time = view.time;
        timer.textContent = time;
        timer.hidden = false;
      }
    },
    /** A short message at the top that fades out (about 1.2 s). */
    toast(text) {
      toast.textContent = text;
      replay(toast, 'show');
    },
    /** Take everything off the screen (the race scene is going away). */
    clear() {
      label = '';
      time = '';
      countdown.textContent = '';
      timer.hidden = true;
      toast.textContent = '';
      toast.classList.remove('show');
    },
  };
}
