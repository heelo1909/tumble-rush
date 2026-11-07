import './screens.css';

/**
 * The title's way in (G3b): a Play button and one line about the keys, as plain DOM over the title scene. The title
 * scene draws the name; this is what a player can click. main.js says when it is on screen (only while the title scene
 * is) and what Play does, so nothing here knows the game.
 * @param {HTMLElement} root the #ui container
 * @param {{onPlay: () => void}} handlers
 */
export function createTitle(root, { onPlay }) {
  const wrap = document.createElement('div');
  wrap.className = 'tr-title';
  wrap.dataset.testid = 'title';
  wrap.hidden = true;

  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'tr-btn tr-btn-play';
  play.dataset.testid = 'play-solo';
  play.textContent = 'Play';
  play.addEventListener('click', () => onPlay());

  const keys = document.createElement('p');
  keys.className = 'tr-keys';
  keys.textContent = 'Arrows or A D to run · Space to jump · Shift to dive';

  wrap.append(play, keys);
  root.appendChild(wrap);

  return {
    /** Show it, with the button focused so Enter or Space starts a race too. */
    show() {
      wrap.hidden = false;
      play.focus({ preventScroll: true });
    },
    hide() {
      wrap.hidden = true;
    },
  };
}
