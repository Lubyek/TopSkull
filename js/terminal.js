// Мини-терминал (клавиша ~): help, price, book, promo, address и пара служебных команд.
import { CLUB, BRANCHES, PROMO, PROMO_LIST } from './data.js';
import { packPrice, money } from './pricing.js';
import { prefersReducedMotion } from './util.js';

export function initTerminal({ open, onRgb, onResetIcons }) {
  const box = document.getElementById('term');
  const out = document.getElementById('term-out');
  const input = document.getElementById('term-in');
  const history = [];
  let hi = 0;
  let typing = Promise.resolve();

  const COMMANDS = {
    help: () => 'Команды:\n  help     список команд\n  price    цены (будни)\n  book     открыть бронь\n  promo    акции и промокод\n  address  адреса и телефоны\n  rgb      режим RGB\n  icons    расставить значки заново\n  clear    очистить\n  exit     закрыть',
    price: () => `Общий зал: 1 ч ${money(packPrice('hall', 'h1', false))}, 3 ч ${money(packPrice('hall', 'h3', false))}, 5 ч ${money(packPrice('hall', 'h5', false))}\nBootcamp:   1 ч ${money(packPrice('boot', 'h1', false))}, 3 ч ${money(packPrice('boot', 'h3', false))}, 5 ч ${money(packPrice('boot', 'h5', false))}\nСтандарт:   1 ч ${money(packPrice('std', 'h1', false))}, 2 ч ${money(packPrice('std', 'h2', false))}, 4 ч ${money(packPrice('std', 'h4', false))}\nPS5:        1 ч ${money(packPrice('ps5', 'h1', false))}, 3 ч ${money(packPrice('ps5', 'h3', false))}, ночь ${money(packPrice('ps5', 'night', false))}\nЦены будней. Выходные и пакеты — в «Тарифах».`,
    book: () => { open('book'); return 'Открываю «Бронь.exe»…'; },
    promo: () => `${PROMO_LIST.map((p) => `• ${p.title}`).join('\n')}\nПромокод: ${PROMO.code} (${PROMO.codeText})`,
    address: () => `${BRANCHES.map((b) => `${b.address}\n  ${b.phone}`).join('\n')}\n${CLUB.hours} · ${CLUB.email}`,
    rgb: () => { onRgb(); return 'Режим RGB переключён.'; },
    icons: () => { onResetIcons(); return 'Значки на рабочем столе расставлены заново.'; },
    clear: () => { out.textContent = ''; return ''; },
    exit: () => { hide(); return ''; },
  };

  /** «Печатающийся» вывод; при reduced-motion выводится сразу. */
  function print(text, cls = '') {
    const line = document.createElement('div');
    if (cls) line.className = cls;
    out.appendChild(line);
    if (prefersReducedMotion() || text.length > 400) { line.textContent = text; out.scrollTop = out.scrollHeight; return Promise.resolve(); }
    return new Promise((resolve) => {
      let i = 0;
      const step = () => {
        line.textContent = text.slice(0, i += 3);
        out.scrollTop = out.scrollHeight;
        if (i < text.length) setTimeout(step, 12); else resolve();
      };
      step();
    });
  }

  function run(raw) {
    const cmd = raw.trim().toLowerCase();
    if (!cmd) return;
    history.push(cmd);
    hi = history.length;
    print(`> ${raw}`, 'cmd');
    const fn = COMMANDS[cmd];
    const text = fn ? fn() : `Команда «${cmd}» не найдена. Введите help.`;
    if (text) typing = typing.then(() => print(text));
  }

  function show() {
    box.hidden = false;
    if (!out.textContent) print('TOPSKILL TERMINAL v26.11. Введите help.');
    input.focus();
  }
  function hide() { box.hidden = true; }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { run(input.value); input.value = ''; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(0, hi - 1); input.value = history[hi] || ''; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(history.length, hi + 1); input.value = history[hi] || ''; }
    else if (e.key === 'Escape') hide();
  });
  document.getElementById('term-close').addEventListener('click', hide);

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t !== input;
    if ((e.key === '~' || e.key === '`' || e.code === 'Backquote') && !inField) {
      e.preventDefault();
      if (box.hidden) show(); else hide();
    }
  });

  return { show, hide };
}
