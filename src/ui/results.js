import './screens.css';

/**
 * The results screen (G3b) for a solo race: "Finished!", the time, how many times the runner fell, and two buttons.
 * Plain DOM over the picture (src/ui/CLAUDE.md). Places and coins come when there are other runners and a shop
 * (bots, the net, P1). It shows the words it is given (they come from src/logic/clock.js through main.js, like the
 * HUD's); main.js decides what the buttons do.
 * @param {HTMLElement} root the #ui container
 * @param {{onAgain: () => void, onTitle: () => void}} handlers
 */
export function createResults(root, { onAgain, onTitle }) {
  const make = (tag, className, testid, parent) => {
    const e = document.createElement(tag);
    e.className = className;
    if (testid) e.dataset.testid = testid;
    parent.appendChild(e);
    return e;
  };
  const wrap = make('div', 'tr-results', 'results', root);
  wrap.hidden = true;
  const card = make('div', 'tr-card', null, wrap);
  make('div', 'tr-headline', 'results-headline', card).textContent = 'Finished!';
  const time = make('div', 'tr-time', 'results-time', card);
  const falls = make('div', 'tr-falls', 'results-falls', card);
  const actions = make('div', 'tr-actions', null, card);
  const again = make('button', 'tr-btn', 'rematch', actions);
  again.type = 'button';
  again.textContent = 'Play again';
  again.addEventListener('click', () => onAgain());
  const title = make('button', 'tr-btn tr-btn-quiet', 'to-title', actions);
  title.type = 'button';
  title.textContent = 'Title';
  title.addEventListener('click', () => onTitle());

  return {
    /**
     * @param {{time: string, falls: string}} view the time as the timer writes it (logic/clock.js formatRaceTime) and the falls line (fallsLabel)
     */
    show(view) {
      time.textContent = view.time;
      falls.textContent = view.falls;
      wrap.hidden = false;
    },
    hide() {
      wrap.hidden = true;
    },
  };
}
