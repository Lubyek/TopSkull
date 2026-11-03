// Быстрый доступ (телефон): свайп вверх от нижней панели открывает шторку с главными действиями,
// как пункт управления на настоящем телефоне. Закрывает свайп вниз, нажатие на фон или системная «назад».
import { BRANCHES, CLUB } from './data.js';
import { freeNow } from './availability.js';
import { gisRoute } from './community.js';
import { pushLayer, closeLayer } from './nav.js';
import { esc, telHref, isMobile, plural, prefersReducedMotion, $ } from './util.js';
import { icon } from './icons.js';

const root = () => $('#qa');
let layer = null;
let token = 0;

function content() {
  const n = freeNow();
  const main = BRANCHES[0];
  const btn = (attrs, ico, label, cls = '') => `<button type="button" class="qa__tile ${cls}" ${attrs}>${icon(ico, 26)}<span>${label}</span></button>`;
  const link = (attrs, ico, label) => `<a class="qa__tile" ${attrs}>${icon(ico, 26)}<span>${label}</span></a>`;
  return `
    <div class="qa__top" id="qa-top">
      <div class="qa__grab" aria-hidden="true"><i></i></div>
      <header class="qa__head">
        <b>Быстрый доступ</b>
        <span class="mono muted">${n} ${plural(n, ['место свободно', 'места свободно', 'мест свободно'])} · открыто ${esc(CLUB.hours)}</span>
      </header>
    </div>
    <div class="qa__tiles">
      ${btn('data-open="book"', 'ticket', 'Бронь', 'qa__tile--main')}
      ${link(`href="${telHref(main.phone)}"`, 'phone', 'Позвонить')}
      ${link(`href="${gisRoute(main)}" target="_blank" rel="noopener noreferrer"`, 'pin', 'Маршрут')}
      ${btn('data-open="tariffs"', 'coins', 'Тарифы')}
      ${btn('data-open="promo"', 'gift', 'Акции')}
      ${btn('data-open="branches"', 'grid', 'Филиалы')}
      ${link(`href="${esc(CLUB.vk)}" target="_blank" rel="noopener noreferrer"`, 'chat', 'ВКонтакте')}
      ${btn('data-mode="classic"', 'globe', 'Сайт')}
    </div>
    <ul class="qa__branches" aria-label="Филиалы">
      ${BRANCHES.map((b) => `
        <li>
          <div><b>${esc(b.name)}</b><span class="muted small">${esc(b.district)}</span></div>
          <a class="btn btn--ghost btn--sm" href="${telHref(b.phone)}" aria-label="Позвонить: ${esc(b.name)}">${icon('phone', 14)} Позвонить</a>
          <a class="btn btn--ghost btn--sm" href="${gisRoute(b)}" target="_blank" rel="noopener noreferrer">Маршрут</a>
        </li>`).join('')}
    </ul>`;
}

function show() {
  const el = root();
  if (!el || !el.hidden || !isMobile()) return;
  token += 1;
  el.innerHTML = `<div class="qa__scrim"></div><section class="qa__sheet" role="dialog" aria-label="Быстрый доступ">${content()}</section>`;
  el.hidden = false;
  // Кадр на отрисовку «закрытого» вида, затем плавный подъём шторки.
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));
  layer = pushLayer({ close: hide });
  bindSheetDrag(el);
}

function hide() {
  layer = null;
  const el = root();
  if (!el || el.hidden) return;
  const my = ++token;
  el.classList.remove('is-open');
  const done = () => { if (token === my) { el.hidden = true; el.innerHTML = ''; } };
  if (prefersReducedMotion()) done(); else setTimeout(done, 280);
}

/** Закрыть шторку из интерфейса (убирает и запись в истории). */
function close() {
  if (layer) closeLayer(layer); else hide();
}

/** Закрыть сразу, без истории (переход на обычный сайт). */
export function closeQuickNow() {
  layer = null;
  const el = root();
  if (!el) return;
  token += 1;
  el.classList.remove('is-open');
  el.hidden = true;
  el.innerHTML = '';
}

/** Шторка закрывается свайпом вниз за верхнюю часть. */
function bindSheetDrag(el) {
  const sheet = $('.qa__sheet', el);
  const top = $('#qa-top', el);
  let sy = null;
  let dy = 0;
  top.addEventListener('pointerdown', (e) => {
    sy = e.clientY; dy = 0;
    try { top.setPointerCapture(e.pointerId); } catch { /* указатель мог исчезнуть */ }
  });
  top.addEventListener('pointermove', (e) => {
    if (sy === null) return;
    dy = Math.max(0, e.clientY - sy);
    sheet.style.transition = 'none';
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (sy === null) return;
    sy = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 70) close();
  };
  top.addEventListener('pointerup', end);
  top.addEventListener('pointercancel', end);
}

export function initQuickAccess() {
  const el = root();
  if (!el) return;

  // Закрытие: фон, любое действие внутри шторки, Esc.
  el.addEventListener('click', (e) => {
    if (e.target.classList.contains('qa__scrim') || e.target.closest('[data-open], [data-mode], a')) close();
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });

  // Открытие: свайп вверх от нижней панели или от полоски над ней; нажатие на полоску тоже открывает.
  const handle = $('#qa-handle');
  [$('#dock'), handle].forEach((zone) => {
    zone.addEventListener('pointerdown', (e) => {
      const sy = e.clientY;
      // Движение слушаем на окне: палец или курсор быстро уходят за пределы панели.
      const move = (ev) => { if (sy - ev.clientY > 36) { stop(); show(); } };
      const stop = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
        window.removeEventListener('pointercancel', stop);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    });
  });
  handle.addEventListener('click', show);
}
