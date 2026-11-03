// Переключатель приложений (телефон), как на настоящем телефоне: карточки открытых приложений листаются вбок,
// смахиваются вверх или вниз (приложение закрывается), нажатие открывает приложение. Ниже быстрые действия.
// Открывается свайпом вверх от нижней панели главного экрана. В нём живут приложения, свёрнутые свайпом вниз.
import { BRANCHES, APPS } from './data.js';
import { gisRoute } from './community.js';
import { runningApps, closeApp, openApp } from './windows.js';
import { pushLayer, closeLayer } from './nav.js';
import { esc, telHref, isMobile, prefersReducedMotion, $ } from './util.js';
import { icon } from './icons.js';

const root = () => $('#qa');
let layer = null;
let token = 0;

/** Миниатюра приложения: уменьшенная копия содержимого окна (без id, без интерактива, карта — заглушкой). */
function thumb(el, title, W, H, scale) {
  const clone = el.querySelector('.win__body').cloneNode(true);
  clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  clone.querySelectorAll('iframe').forEach((f) => { const d = document.createElement('div'); d.className = 'sw__map'; f.replaceWith(d); });
  clone.setAttribute('inert', '');
  clone.removeAttribute('tabindex');
  const scaled = document.createElement('div');
  scaled.className = 'sw__scaled';
  scaled.style.cssText = `width:${W}px;height:${H}px;transform:scale(${scale})`;
  scaled.innerHTML = `<div class="sw__bar">${esc(title)}</div>`;
  scaled.appendChild(clone);
  return scaled;
}

function cardSize() {
  const banner = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--banner-h'), 10) || 0;
  const W = window.innerWidth;
  const H = window.innerHeight - banner;
  let cw = Math.min(Math.round(W * 0.68), 300);
  const maxH = Math.max(200, H - 300);
  if ((H * cw) / W > maxH) cw = Math.round((maxH * W) / H);
  const scale = cw / W;
  return { W, H, cw, ch: Math.round(H * scale), scale };
}

function render() {
  const el = root();
  const { W, H, cw, ch, scale } = cardSize();
  const apps = runningApps();
  const main = BRANCHES[0];
  el.style.setProperty('--cw', `${cw}px`);
  el.innerHTML = `
    <section class="sw" role="dialog" aria-label="Свёрнутые приложения">
      ${apps.length
        ? `<div class="sw__cards" id="sw-cards">${apps.map((a) => {
          const meta = APPS.find((x) => x.id === a.id);
          return `<article class="sw__card" data-id="${esc(a.id)}" tabindex="0" role="button" aria-label="Открыть: ${esc(meta.title)}. Смахните вверх или вниз, чтобы закрыть">
            <header class="sw__head"><span class="sw__ico">${icon(meta.icon, 18)}</span><b>${esc(meta.title)}</b></header>
            <div class="sw__view" style="width:${cw}px;height:${ch}px"></div>
          </article>`;
        }).join('')}</div>`
        : '<div class="sw__empty"><p><b>Нет свёрнутых приложений</b><br>Смахните открытое приложение вниз, и оно появится здесь. Карточку можно смахнуть вверх или вниз, чтобы закрыть приложение.</p></div>'}
      <div class="sw__foot">
        <div class="qa__tiles">
          <button type="button" class="qa__tile qa__tile--main" data-open="book">${icon('ticket', 24)}<span>Бронь</span></button>
          <a class="qa__tile" href="${telHref(main.phone)}">${icon('phone', 24)}<span>Позвонить</span></a>
          <a class="qa__tile" href="${gisRoute(main)}" target="_blank" rel="noopener noreferrer">${icon('pin', 24)}<span>Маршрут</span></a>
          <button type="button" class="qa__tile" data-mode="classic">${icon('globe', 24)}<span>Сайт</span></button>
        </div>
        ${apps.length ? '<button type="button" class="sw__clear" id="sw-clear">Закрыть все</button>' : ''}
      </div>
    </section>`;
  // Миниатюры вставляем после разметки: это копии настоящих окон.
  apps.forEach((a) => {
    const meta = APPS.find((x) => x.id === a.id);
    $(`.sw__card[data-id="${a.id}"] .sw__view`, el)?.appendChild(thumb(a.el, meta.title, W, H, scale));
  });
  bindCards(el);
}

/** Смахивание карточек вверх или вниз закрывает приложение. */
function bindCards(el) {
  $('#sw-clear', el)?.addEventListener('click', () => {
    runningApps().forEach((a) => closeApp(a.id));
    render();
  });
  el.querySelectorAll('.sw__card').forEach((card) => {
    card.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let dy = 0;
      let on = false;
      const move = (ev) => {
        dy = ev.clientY - sy;
        if (!on) {
          if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(ev.clientX - sx)) return;
          on = true;
          card.dataset.dragged = '1';
        }
        card.style.transition = 'none';
        card.style.transform = `translateY(${dy}px)`;
        card.style.opacity = String(1 - Math.min(0.7, Math.abs(dy) / 320));
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        setTimeout(() => { delete card.dataset.dragged; }, 0);
        card.style.transition = '';
        if (!on || Math.abs(dy) < 90) { card.style.transform = ''; card.style.opacity = ''; return; }
        card.style.transform = `translateY(${dy < 0 ? -120 : 120}%)`;
        card.style.opacity = '0';
        const id = card.dataset.id;
        setTimeout(() => { closeApp(id); render(); }, prefersReducedMotion() ? 0 : 200);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
  });
}

function show() {
  const el = root();
  if (!el || !el.hidden || !isMobile()) return;
  token += 1;
  render();
  el.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));
  layer = pushLayer({ close: hide });
}

function hide() {
  layer = null;
  const el = root();
  if (!el || el.hidden) return;
  const my = ++token;
  el.classList.remove('is-open');
  const done = () => { if (token === my) { el.hidden = true; el.innerHTML = ''; } };
  if (prefersReducedMotion()) done(); else setTimeout(done, 250);
}

/** Закрыть из интерфейса (убирает и запись в истории). */
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

export function initQuickAccess() {
  const el = root();
  if (!el) return;

  el.addEventListener('click', (e) => {
    const card = e.target.closest('.sw__card');
    if (card) {
      if (card.dataset.dragged) return; // это был свайп, а не нажатие
      const id = card.dataset.id;
      close();
      openApp(id);
      return;
    }
    // Нажатие на пустое место или любое действие внутри закрывает переключатель.
    if (!e.target.closest('.sw__head, .sw__clear') && (e.target.closest('[data-open], [data-mode], a') || ['sw', 'sw__cards', 'sw__foot', 'sw__empty'].some((c) => e.target.classList.contains(c)) || e.target === el)) close();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('sw__card')) { e.preventDefault(); e.target.click(); }
  });

  // Открытие: свайп вверх от нижней панели или от полоски над ней (нажатие на полоску тоже).
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
