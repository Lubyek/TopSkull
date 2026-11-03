// Менеджер окон: открытие «из иконки», фокус, перетаскивание, сворачивание, развёртывание, закрытие.
// На телефоне окна — полноэкранные «приложения» мобильной ОС: открыто одно, сверху кнопка «назад»,
// системная «назад» и свайп вниз по заголовку возвращают на главный экран.
import { APPS } from './data.js';
import { icon } from './icons.js';
import { pushLayer, closeLayer, dropLayer } from './nav.js';
import { esc, isMobile, prefersReducedMotion } from './util.js';

const registry = new Map(); // id → render(body, ctx) → необязательная функция очистки
const wins = new Map(); // id → { el, cleanup, opener }
const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const MIN_W = 320;
const MIN_H = 220;
let z = 10;
let cascade = 0;
const subs = new Set();

export const registerApp = (id, render) => registry.set(id, render);
export const onWindowsChange = (fn) => subs.add(fn);
const notify = () => subs.forEach((fn) => fn(state()));

/** Состояние для дока: какие окна открыты и свёрнуты. */
export function state() {
  const out = {};
  wins.forEach((w, id) => { out[id] = w.el.classList.contains('is-min') || w.el.dataset.min ? 'min' : 'open'; });
  return out;
}

const layer = () => document.getElementById('windows');
const appMeta = (id) => APPS.find((a) => a.id === id);

function activeId() {
  let best = null;
  let bz = -1;
  wins.forEach((w, id) => {
    const zi = Number(w.el.style.zIndex) || 0;
    if (!w.el.classList.contains('is-min') && zi > bz) { bz = zi; best = id; }
  });
  return best;
}

export function focusWindow(id) {
  const w = wins.get(id);
  if (!w) return;
  const wasMin = w.el.classList.contains('is-min');
  w.el.classList.remove('is-min');
  w.el.style.zIndex = String(++z);
  // На телефоне видно только одно приложение, остальные ждут «под ним».
  wins.forEach((x, k) => { x.el.classList.toggle('is-active', k === id); x.el.classList.toggle('is-bg', k !== id && isMobile()); });
  notify();
  if (wasMin) genie(w.el, id, false); // окно «вылетает» из дока
}

/**
 * Анимация сворачивания/возврата: окно сжимается к значку в доке (на телефоне уезжает вниз).
 * toDock = true — сворачивание, false — возврат. done вызывается по окончании.
 */
function genie(el, id, toDock, done) {
  if (prefersReducedMotion() || typeof el.animate !== 'function') { done?.(); return; }
  const r = el.getBoundingClientRect();
  let dx = 0;
  let dy = window.innerHeight - r.top;
  let scale = 1;
  if (!isMobile()) {
    const btn = document.querySelector(`.dock [data-dock="${id}"]`)?.getBoundingClientRect();
    const tx = btn ? btn.left + btn.width / 2 : window.innerWidth / 2;
    const ty = btn ? btn.top + btn.height / 2 : window.innerHeight;
    dx = tx - (r.left + r.width / 2);
    dy = ty - (r.top + r.height / 2);
    scale = 0.1;
  }
  const away = { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 };
  const home = { transform: 'none', opacity: 1 };
  const anim = el.animate(toDock ? [home, away] : [away, home], {
    duration: toDock ? 300 : 340,
    easing: toDock ? 'cubic-bezier(0.55, 0, 0.9, 0.45)' : 'cubic-bezier(0.22, 0.8, 0.3, 1)',
    fill: toDock ? 'forwards' : 'none',
  });
  // Страховка: если вкладка в фоне и анимация не идёт, окно всё равно доходит до конечного состояния.
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    done?.();
    if (toDock) anim.cancel();
  };
  anim.onfinish = finish;
  setTimeout(finish, (toDock ? 300 : 340) + 120);
}

/** Открыть приложение или вернуть его на передний план. */
export function openApp(id, opts = {}) {
  const meta = appMeta(id);
  if (!meta || !registry.has(id)) return null;
  let existing = wins.get(id);
  if (existing?.closing) { closeNow(id, true); existing = null; } // окно ещё закрывается: открываем заново
  if (existing) {
    focusWindow(id);
    existing.el.querySelector('.win__body')?.focus({ preventScroll: true });
    return existing.el;
  }

  const L = layer();
  const mobile = isMobile();
  const lw = L.clientWidth;
  const lh = L.clientHeight;
  const w = Math.min(meta.w, lw - 24);
  const h = Math.min(meta.h, lh - 24);
  const n = cascade++ % 6;
  const left = Math.max(8, Math.min(lw - w - 8, (lw - w) / 2 + 40 + n * 28 - 60));
  const top = Math.max(8, Math.min(lh - h - 8, (lh - h) / 2 + n * 24 - 20));

  const el = document.createElement('section');
  el.className = 'win';
  el.dataset.app = id;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', meta.file);
  el.style.cssText = `left:${left}px;top:${top}px;width:${w}px;height:${h}px;z-index:${++z}`;

  // Анимация «из иконки»: смещение от иконки/кнопки, с которой открыли.
  const from = opts.from || document.querySelector(`[data-app-btn="${id}"]`);
  if (from && !mobile && !prefersReducedMotion()) {
    const r = from.getBoundingClientRect();
    const lr = L.getBoundingClientRect();
    el.style.setProperty('--from-x', `${r.left + r.width / 2 - lr.left - (left + w / 2)}px`);
    el.style.setProperty('--from-y', `${r.top + r.height / 2 - lr.top - (top + h / 2)}px`);
  }

  el.innerHTML = `
    <header class="win__bar" tabindex="0" aria-label="Заголовок окна ${esc(meta.title)}. Стрелки двигают окно, Esc закрывает">
      <button type="button" class="win__back icon-btn" data-act="back" aria-label="Назад">${icon('back', 22)}</button>
      <span class="win__title"><span class="win__file">${esc(meta.file)}</span><span class="win__name">${esc(meta.title)}</span></span>
      ${id === 'book' ? '' : `<button type="button" class="win__book" data-open="book">Забронировать</button>`}
      <span class="win__ctl">
        <button type="button" class="icon-btn" data-act="min" aria-label="Свернуть">${icon('min', 16)}</button>
        <button type="button" class="icon-btn hide-sm" data-act="max" aria-label="Развернуть на весь экран">${icon('max', 16)}</button>
        <button type="button" class="icon-btn" data-act="close" aria-label="Закрыть">${icon('close', 16)}</button>
      </span>
    </header>
    <div class="win__body" tabindex="-1"></div>
    ${RESIZE_DIRS.map((d) => `<i class="win__rs win__rs--${d}" data-dir="${d}" aria-hidden="true"></i>`).join('')}`;
  L.appendChild(el);

  const body = el.querySelector('.win__body');
  const ctx = { id, el, body, open: openApp, close: () => closeWindow(id), opts };
  const cleanup = registry.get(id)(body, ctx);
  const entry = { el, cleanup, opener: document.activeElement, ctx, layer: null, closing: false };
  wins.set(id, entry);
  // На телефоне приложение — слой истории: системная «назад» закрывает его (или шаг внутри него).
  if (mobile) attachLayer(id, entry);
  wire(el, id);
  focusWindow(id);
  body.focus({ preventScroll: true });
  return el;
}

function attachLayer(id, entry) {
  entry.layer = pushLayer({ close: () => closeNow(id), back: () => !!entry.ctx.onBack?.() });
}

/** Свайп вниз: приложение уезжает вниз и закрывается. */
function swipeAway(id) {
  const w = wins.get(id);
  if (!w || w.closing) return;
  if (prefersReducedMotion()) { closeWindow(id); return; }
  w.skipAnim = true; // окно уже уехало вниз, анимацию закрытия не повторяем
  w.el.style.transition = 'transform 0.2s var(--ease), opacity 0.2s';
  w.el.style.transform = 'translateY(100%)';
  w.el.style.opacity = '0';
  setTimeout(() => closeWindow(id), 190);
}

export function closeWindow(id) {
  const w = wins.get(id);
  if (!w || w.closing) return;
  if (w.layer) { closeLayer(w.layer); return; } // слой сам вызовет closeNow
  closeNow(id);
}

/** «Назад» в приложении: сначала шаг внутри него (например, шаг брони), иначе закрыть. */
function goBack(id) {
  const w = wins.get(id);
  if (!w || w.closing) return;
  if (w.ctx.onBack?.()) return;
  closeWindow(id);
}

/** Закрыть все приложения сразу (при переходе на обычный сайт). */
export function closeAllWindows() {
  [...wins.keys()].forEach((id) => closeNow(id, true));
}

function closeNow(id, instant = false) {
  const w = wins.get(id);
  if (!w || (w.closing && !instant)) return;
  w.closing = true;
  if (w.layer) { dropLayer(w.layer); w.layer = null; }
  const done = () => {
    if (w.finished) return; // окно уже убрано (например, досрочно при повторном открытии)
    w.finished = true;
    try { w.cleanup?.(); } catch { /* окно закрывается в любом случае */ }
    w.el.remove();
    if (wins.get(id) === w) wins.delete(id);
    syncMax();
    const next = activeId();
    if (next) focusWindow(next);
    notify();
    if (w.opener && document.contains(w.opener)) w.opener.focus?.({ preventScroll: true });
  };
  if (instant || w.skipAnim || prefersReducedMotion()) { done(); return; }
  w.el.classList.add('is-closing');
  setTimeout(done, 170);
}

function toggleMin(id) {
  const w = wins.get(id);
  if (!w) return;
  const el = w.el;
  if (el.classList.contains('is-min')) { focusWindow(id); return; }
  if (el.dataset.min) return; // уже сворачивается
  el.dataset.min = '1'; // чтобы док успел показать значок, к которому окно полетит
  notify();
  genie(el, id, true, () => {
    el.classList.add('is-min');
    delete el.dataset.min;
    const next = activeId();
    if (next) focusWindow(next);
    else wins.forEach((x) => x.el.classList.remove('is-active'));
    notify();
  });
}

/** Пока есть развёрнутое окно, стол не создаёт слой, и окно ложится поверх панели задач и дока. */
function syncMax() {
  document.getElementById('os')?.classList.toggle('has-max', !!document.querySelector('.win.is-max'));
}

/** Разворачивание на весь экран и возврат: плавный переход от прежних размеров к новым (приём FLIP). */
function toggleMax(el) {
  const first = el.getBoundingClientRect();
  el.classList.toggle('is-max');
  syncMax();
  if (prefersReducedMotion() || typeof el.animate !== 'function') return;
  const last = el.getBoundingClientRect();
  if (!last.width || !last.height) return;
  el.animate([
    { transformOrigin: '0 0', transform: `translate(${first.left - last.left}px, ${first.top - last.top}px) scale(${first.width / last.width}, ${first.height / last.height})` },
    { transformOrigin: '0 0', transform: 'none' },
  ], { duration: 340, easing: 'cubic-bezier(0.22, 0.8, 0.3, 1)' });
}

function wire(el, id) {
  el.addEventListener('pointerdown', () => focusWindow(id), true);
  el.querySelector('.win__ctl').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'min') toggleMin(id);
    if (act === 'max') toggleMax(el);
    if (act === 'close') closeWindow(id);
  });
  el.querySelector('.win__back').addEventListener('click', () => goBack(id));
  enablePullDown(el, id);
  const bar = el.querySelector('.win__bar');
  bar.addEventListener('dblclick', (e) => { if (!e.target.closest('button') && !isMobile()) toggleMax(el); });
  enableDrag(el, bar, id);
  enableResize(el);

  // Клавиатура: Esc закрывает, стрелки на заголовке двигают окно.
  el.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === 'Escape' && !typing && !e.defaultPrevented) { closeWindow(id); return; }
    if (e.target === bar && e.altKey && e.key.startsWith('Arrow') && !isMobile() && !el.classList.contains('is-max')) {
      e.preventDefault();
      const d = e.shiftKey ? 60 : 20;
      resizeTo(el, el.offsetLeft, el.offsetTop,
        el.offsetWidth + (e.key === 'ArrowRight' ? d : e.key === 'ArrowLeft' ? -d : 0),
        el.offsetHeight + (e.key === 'ArrowDown' ? d : e.key === 'ArrowUp' ? -d : 0));
      return;
    }
    if (e.target === bar && e.key.startsWith('Arrow') && !isMobile() && !el.classList.contains('is-max')) {
      e.preventDefault();
      const d = e.shiftKey ? 40 : 12;
      const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
      const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
      moveBy(el, dx, dy);
    }
  });
}

function moveBy(el, dx, dy) {
  const L = layer();
  const x = Math.max(-el.offsetWidth + 80, Math.min(L.clientWidth - 80, el.offsetLeft + dx));
  const y = Math.max(0, Math.min(L.clientHeight - 40, el.offsetTop + dy));
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

/** Телефон: потянуть вниз за верх содержимого (когда оно прокручено до начала) тоже закрывает приложение. */
function enablePullDown(el, id) {
  const body = el.querySelector('.win__body');
  let t = null;
  body.addEventListener('touchstart', (e) => {
    t = isMobile() && e.touches.length === 1 && body.scrollTop <= 0 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, on: false, dy: 0 } : null;
  }, { passive: true });
  body.addEventListener('touchmove', (e) => {
    if (!t) return;
    const dx = e.touches[0].clientX - t.x;
    const dy = e.touches[0].clientY - t.y;
    if (!t.on) {
      if (Math.abs(dx) > 14 || dy < -6 || body.scrollTop > 0) { t = null; return; } // горизонтальный жест или прокрутка вверх
      if (dy < 14 || Math.abs(dx) > dy * 0.7) return; // ещё не ясно, вертикальный ли жест
      t.on = true;
    }
    t.dy = Math.max(0, dy - 14);
    el.style.transform = `translateY(${t.dy}px)`;
    el.style.opacity = String(1 - Math.min(0.6, t.dy / 400));
  }, { passive: true });
  const end = () => {
    if (!t) return;
    const { on, dy } = t;
    t = null;
    if (!on) return;
    if (dy > 110) { swipeAway(id); return; }
    el.style.transform = '';
    el.style.opacity = '';
  };
  body.addEventListener('touchend', end, { passive: true });
  body.addEventListener('touchcancel', end, { passive: true });
}

function enableDrag(el, bar, id) {
  let sx = 0; let sy = 0; let ox = 0; let oy = 0; let dragging = false; let swipe = 0;
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    dragging = true;
    sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop; swipe = 0;
    try { bar.setPointerCapture(e.pointerId); } catch { /* указатель мог уже исчезнуть */ }
  });
  bar.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (isMobile()) {
      // Свайп вниз по заголовку закрывает приложение.
      swipe = Math.max(0, e.clientY - sy);
      el.style.transform = `translateY(${swipe}px)`;
      el.style.opacity = String(1 - Math.min(0.6, swipe / 400));
      return;
    }
    if (el.classList.contains('is-max')) return;
    const L = layer();
    el.style.left = `${Math.max(-el.offsetWidth + 80, Math.min(L.clientWidth - 80, ox + e.clientX - sx))}px`;
    el.style.top = `${Math.max(0, Math.min(L.clientHeight - 40, oy + e.clientY - sy))}px`;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    if (isMobile()) {
      if (swipe > 90) { swipeAway(id); return; }
      el.style.transform = '';
      el.style.opacity = '';
    }
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
}

/** Цикл по открытым окнам (F6 / Alt+→). */
export function cycleWindows(dir = 1) {
  const ids = [...wins.keys()].filter((k) => !wins.get(k).el.classList.contains('is-min'));
  if (ids.length < 2) return;
  const cur = ids.indexOf(activeId());
  const id = ids[(cur + dir + ids.length) % ids.length];
  focusWindow(id);
  wins.get(id).el.querySelector('.win__bar').focus();
}

export const isOpen = (id) => wins.has(id);

/** Применяет размер и положение с учётом минимума и границ рабочего стола. */
function resizeTo(el, left, top, width, height) {
  const L = layer();
  const w = Math.max(MIN_W, Math.min(width, L.clientWidth));
  const h = Math.max(MIN_H, Math.min(height, L.clientHeight));
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.left = `${Math.max(-w + 80, Math.min(L.clientWidth - 80, left))}px`;
  el.style.top = `${Math.max(0, Math.min(L.clientHeight - 40, top))}px`;
}

/** Изменение размера за край или угол. Левый/верхний край двигают окно, правый/нижний — только размер. */
function enableResize(el) {
  el.querySelectorAll('.win__rs').forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      if (isMobile() || el.classList.contains('is-max') || e.button > 0) return;
      e.preventDefault();
      e.stopPropagation();
      const dir = handle.dataset.dir;
      const s = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      try { handle.setPointerCapture(e.pointerId); } catch { /* указатель мог исчезнуть */ }
      el.classList.add('is-resizing');
      const move = (ev) => {
        const dx = ev.clientX - s.x;
        const dy = ev.clientY - s.y;
        let { l, t, w, h } = s;
        if (dir.includes('e')) w = s.w + dx;
        if (dir.includes('s')) h = s.h + dy;
        if (dir.includes('w')) { w = s.w - dx; l = s.l + dx; }
        if (dir.includes('n')) { h = s.h - dy; t = s.t + dy; }
        // Левый/верхний край не должен «уезжать», когда окно уже минимального размера.
        if (w < MIN_W) { if (dir.includes('w')) l = s.l + s.w - MIN_W; w = MIN_W; }
        if (h < MIN_H) { if (dir.includes('n')) t = s.t + s.h - MIN_H; h = MIN_H; }
        resizeTo(el, l, t, w, h);
      };
      const stop = () => {
        el.classList.remove('is-resizing');
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', stop);
        handle.removeEventListener('pointercancel', stop);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', stop);
      handle.addEventListener('pointercancel', stop);
    });
  });
}
