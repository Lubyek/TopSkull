// Точка входа: загрузка, рабочий стол, панель задач, док, режимы и пасхалки.
import { APPS, BRANCHES } from './data.js';
import { wallNow, money, packPrice } from './pricing.js';
import { freeNow } from './availability.js';
import { onStoreEvent, load, save } from './store.js';
import { registerApp, openApp, onWindowsChange, isOpen, cycleWindows, closeAllWindows } from './windows.js';
import { pushLayer, closeLayer, resetLayers } from './nav.js';
import * as S from './sections.js';
import * as C from './community.js';
import { mountBooking } from './booking.js';
import { mountAdmin } from './admin.js';
import { initTerminal } from './terminal.js';
import { renderClassic } from './classic.js';
import { icon } from './icons.js';
import { $, $$, esc, toast, beep, prefersReducedMotion, isMobile, telHref, plural } from './util.js';

const root = document.documentElement;
const osEl = $('#os');
const classicEl = $('#classic');

// ---------- регистрация приложений ----------
const fromPart = (part) => (body) => { body.innerHTML = part.render(); return part.mount?.(body); };
registerApp('home', fromPart(S.home));
registerApp('tariffs', fromPart(S.tariffs));
registerApp('hardware', fromPart(S.hardware));
registerApp('zones', fromPart(S.zones));
registerApp('promo', fromPart(C.promo));
registerApp('branches', fromPart(C.branches));
registerApp('reviews', fromPart(C.reviews));
registerApp('tournament', fromPart(C.tournament));
registerApp('book', mountBooking);
registerApp('admin', mountAdmin);

// ---------- иконки и док ----------
function drawIcons() {
  $('#icons').innerHTML = APPS.map((a) => `
    <button type="button" class="icon" data-open="${a.id}" data-app-btn="${a.id}" aria-label="${esc(a.title)}. Alt и стрелки перемещают значок">
      <span class="icon__img">${icon(a.icon)}</span><span>${esc(a.title)}</span>
    </button>`).join('') + `
    <button type="button" class="icon icon--site" data-mode="classic" aria-label="Обычный сайт">
      <span class="icon__img">${icon('globe')}</span><span>Сайт</span>
    </button>`;
  layoutIcons();
  enableIconDrag();
}

// ---------- главный экран телефона: виджет с главным действием ----------
function drawWidget() {
  const b = BRANCHES[0];
  $('#m-widget').innerHTML = `
    <div class="m-widget__top"><span class="logo">TOP<b>SKILL</b></span><span class="mono muted">Челябинск · 24/7</span></div>
    <p class="m-widget__free"><b id="m-free">--</b><span id="m-free-lbl">мест свободно сейчас</span></p>
    <p class="m-widget__sub">от ${money(packPrice('hall', 'h1', false))} за час. Новичкам 2 часа в подарок.</p>
    <div class="m-widget__row">
      <button type="button" class="btn btn--accent" data-open="book">Забронировать</button>
      <a class="btn btn--ghost" href="${telHref(b.phone)}" aria-label="Позвонить в клуб ${esc(b.phone)}">${icon('phone', 18)} Позвонить</a>
    </div>`;
}

// ---------- иконки на столе: свободное размещение ----------
const ICON_W = 92;
const ICON_H = 100;
const ICON_PAD = 14;
let iconPos = load('icons', {}) || {};

/** Раскладка по умолчанию: колонками сверху вниз, число рядов зависит от высоты стола. */
function defaultIconPos(i, areaH) {
  const rows = Math.max(1, Math.floor((areaH - ICON_PAD) / (ICON_H + 6)));
  return { x: ICON_PAD + Math.floor(i / rows) * (ICON_W + 8), y: ICON_PAD + (i % rows) * (ICON_H + 6) };
}

function clampIcon(p, area) {
  return { x: Math.max(0, Math.min(area.width - ICON_W, p.x)), y: Math.max(0, Math.min(area.height - ICON_H, p.y)) };
}

function layoutIcons(reset = false) {
  const box = $('#icons');
  if (reset) { iconPos = {}; save('icons', iconPos); }
  const mobile = isMobile();
  const area = box.getBoundingClientRect();
  $$('.icon:not(.icon--site)', box).forEach((el, i) => {
    if (mobile || !area.width) { el.style.left = ''; el.style.top = ''; return; }
    const p = clampIcon(iconPos[el.dataset.open] || defaultIconPos(i, area.height), area);
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
  });
}

function enableIconDrag() {
  const box = $('#icons');
  let drag = null;
  let justDragged = false;

  box.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.icon');
    if (!el || isMobile() || e.button > 0) return;
    drag = { el, x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop, moved: false };
    try { el.setPointerCapture(e.pointerId); } catch { /* ничего */ }
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return; // иначе это обычный клик
    drag.moved = true;
    drag.el.classList.add('is-dragging');
    const p = clampIcon({ x: drag.l + dx, y: drag.t + dy }, box.getBoundingClientRect());
    drag.el.style.left = `${p.x}px`;
    drag.el.style.top = `${p.y}px`;
  });
  const end = () => {
    if (!drag) return;
    const { el, moved } = drag;
    drag = null;
    el.classList.remove('is-dragging');
    if (!moved) return;
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
    // Лёгкая привязка к сетке 8 px, чтобы значки лежали ровно.
    const p = { x: Math.round(el.offsetLeft / 8) * 8, y: Math.round(el.offsetTop / 8) * 8 };
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    iconPos[el.dataset.open] = p;
    save('icons', iconPos);
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  // После перетаскивания окно приложения открываться не должно.
  box.addEventListener('click', (e) => { if (justDragged) { e.stopPropagation(); e.preventDefault(); } }, true);

  // Клавиатура: Alt + стрелки двигают значок.
  box.addEventListener('keydown', (e) => {
    const el = e.target.closest('.icon');
    if (!el || !e.altKey || !e.key.startsWith('Arrow') || isMobile()) return;
    e.preventDefault();
    const d = e.shiftKey ? 48 : 16;
    const p = clampIcon({
      x: el.offsetLeft + (e.key === 'ArrowRight' ? d : e.key === 'ArrowLeft' ? -d : 0),
      y: el.offsetTop + (e.key === 'ArrowDown' ? d : e.key === 'ArrowUp' ? -d : 0),
    }, box.getBoundingClientRect());
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    iconPos[el.dataset.open] = p;
    save('icons', iconPos);
  });
}

window.addEventListener('resize', () => layoutIcons());

function drawDock(state = {}) {
  const base = APPS.filter((a) => a.dock);
  const extra = APPS.filter((a) => !a.dock && state[a.id]);
  const btn = (a) => `<button type="button" class="dock__btn${state[a.id] === 'open' ? ' is-open' : ''}${state[a.id] === 'min' ? ' is-open is-min' : ''}"
    data-open="${a.id}" data-dock="${a.id}" title="${esc(a.title)}" aria-label="${esc(a.title)}">${icon(a.icon)}<span class="dock__lbl">${esc(a.title)}</span></button>`;
  $('#dock').innerHTML = base.map(btn).join('') + (extra.length ? `<i class="dock__sep"></i>${extra.map(btn).join('')}` : '');
}

// ---------- открытие приложений ----------
// На обычном сайте бронь открывается поверх страницы; остальные приложения живут только в TopskillOS.
const modal = $('#cl-modal');
const modalBody = $('#cl-modal-body');
let modalOpener = null;
let modalLayer = null;

function closeModalNow() {
  modalLayer = null;
  if (modal.hidden) return;
  modal.hidden = true;
  modalBody.innerHTML = '';
  modalOpener?.focus?.({ preventScroll: true });
}

function closeModal() {
  if (modalLayer) closeLayer(modalLayer); else closeModalNow();
}

function openBookingModal(opts = {}) {
  modalOpener = opts.from || document.activeElement;
  modalBody.innerHTML = '';
  modal.hidden = false;
  const ctx = { id: 'book', opts, close: closeModal, open: openSmart };
  mountBooking(modalBody, ctx);
  // На телефоне бронь — слой истории: системная «назад» возвращает на шаг назад или закрывает бронь.
  if (isMobile()) modalLayer = pushLayer({ close: closeModalNow, back: () => !!ctx.onBack?.() });
  modalBody.focus({ preventScroll: true });
}

function openSmart(id, opts = {}) {
  if (!classicEl.hidden) {
    if (id === 'book') { openBookingModal(opts); return; }
    setMode('os');
  }
  openApp(id, opts);
}

$('#cl-modal-x').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
modal.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
  if (e.key !== 'Tab') return;
  // Фокус не выходит за пределы окна брони.
  const items = $$('button:not([disabled]), input:not([disabled]), select, textarea, a[href], [tabindex="0"]', modal).filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

document.addEventListener('click', (e) => {
  const m = e.target.closest('[data-mode]');
  if (m) { setMode(m.dataset.mode, true); return; }
  const t = e.target.closest('[data-open]');
  if (!t) return;
  openSmart(t.dataset.open, { from: t, branch: t.dataset.branch });
});

onWindowsChange(drawDock);

// ---------- панель задач ----------
const pad = (n) => String(n).padStart(2, '0');
function tick() {
  const d = wallNow();
  // На телефоне секунды скрыты стилями: в строке состояния только часы и минуты.
  $('#clock').innerHTML = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}<span class="sec">:${pad(d.getUTCSeconds())}</span>`;
}
const refreshSeats = () => {
  const n = freeNow();
  $('#free-seats').textContent = n;
  $('#m-free').textContent = n;
  $('#m-free-lbl').textContent = plural(n, ['место свободно сейчас', 'места свободно сейчас', 'мест свободно сейчас']);
};

// ---------- режимы: ОС / обычный сайт ----------
// Телефон по умолчанию открывает обычный сайт, остальные устройства — TopskillOS.
// Выбор запоминается только после явного переключения; для телефона и компьютера он свой.
const modeKey = () => (isMobile() ? 'mode_phone' : 'mode');
function startMode() {
  if (location.hash === '#classic') return 'classic';
  if (location.hash === '#os') return 'os';
  const saved = load(modeKey(), null);
  if (saved === 'classic' || saved === 'os') return saved;
  return isMobile() ? 'classic' : 'os';
}

function setMode(mode, persist = false) {
  const classic = mode === 'classic';
  if (classic) {
    // Уходя на сайт, закрываем приложения и слои истории, чтобы «назад» не листала невидимые экраны.
    closeModalNow();
    closeAllWindows();
    resetLayers();
    renderClassic(classicEl);
  }
  osEl.hidden = classic;
  if (!classic) layoutIcons();
  classicEl.hidden = !classic;
  document.body.style.overflow = classic ? 'auto' : 'hidden';
  $('#book-fab').hidden = classic;
  if (persist) save(modeKey(), mode);
}

// ---------- уведомления о новых заявках ----------
onStoreEvent((ev) => {
  if (ev.type !== 'new' || !(ev.remote || isOpen('admin'))) return;
  toast(`<b>Новая заявка ${esc(ev.code)}</b><br>Откройте «Заявки.exe»`);
  beep();
  refreshSeats();
});
onStoreEvent(() => refreshSeats());

// ---------- пасхалки ----------
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let ki = 0;
const toggleRgb = () => {
  const on = osEl.classList.toggle('rgb');
  toast(`<b>Режим RGB</b><br>${on ? 'включён' : 'выключен'}`);
};
document.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  ki = e.key.toLowerCase() === KONAMI[ki].toLowerCase() ? ki + 1 : (e.key === KONAMI[0] ? 1 : 0);
  if (ki === KONAMI.length) { ki = 0; toggleRgb(); }
  if (e.key === 'F6') { e.preventDefault(); cycleWindows(e.shiftKey ? -1 : 1); }
});
initTerminal({
  open: (id) => openSmart(id),
  onRgb: toggleRgb,
  onResetIcons: () => layoutIcons(true),
});

// ---------- загрузочный экран ----------
const BOOT_LINES = [
  'TOPSKILL BIOS v26.11', 'CPU........ OK', 'GPU........ RTX OK', 'RAM........ 32768 MB', 'NET........ 1 Gbit',
  'Ночь....... открыто 24/7', 'Загрузка TopskillOS…',
];

function finishBoot() {
  $('#boot').hidden = true;
  try { sessionStorage.setItem('topskill_booted', '1'); } catch { /* не страшно */ }
  osEl.hidden = false;
  setMode(startMode());
  $('#desktop').focus({ preventScroll: true });
}

function runBoot() {
  const boot = $('#boot');
  boot.hidden = false;
  const log = $('#boot-log');
  const fill = $('#boot-fill');
  let i = 0;
  let done = false;
  const end = () => { if (done) return; done = true; clearInterval(timer); document.removeEventListener('keydown', end); finishBoot(); };
  const timer = setInterval(() => {
    if (i < BOOT_LINES.length) log.textContent += `${BOOT_LINES[i]}\n`;
    fill.style.width = `${Math.min(100, Math.round(((i + 1) / (BOOT_LINES.length + 1)) * 100))}%`;
    i += 1;
    if (i > BOOT_LINES.length) setTimeout(end, 250);
  }, 320);
  boot.addEventListener('click', end);
  $('#boot-skip').addEventListener('click', end);
  document.addEventListener('keydown', end);
}

// ---------- запуск ----------
drawWidget();
drawIcons();
drawDock();
tick();
refreshSeats();
setInterval(tick, 1000);
setInterval(refreshSeats, 30000);
setInterval(() => { $('#ping').textContent = String(7 + Math.floor(Math.random() * 3)); }, 4000);

const banner = (show) => { $('#demo-banner').hidden = !show; root.classList.toggle('has-banner', show); };
$('#demo-close').addEventListener('click', () => { banner(false); try { sessionStorage.setItem('topskill_banner', '1'); } catch { /* ничего */ } });
try { banner(sessionStorage.getItem('topskill_banner') !== '1'); } catch { banner(true); }
$('#logo').addEventListener('click', (e) => e.preventDefault());

let booted = false;
try { booted = sessionStorage.getItem('topskill_booted') === '1'; } catch { /* покажем загрузку */ }
// На телефоне BIOS-заставки нет: человек пришёл забронировать место, а не смотреть загрузку.
if (booted || prefersReducedMotion() || isMobile()) finishBoot(); else runBoot();
