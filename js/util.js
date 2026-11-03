// Мелкие помощники, общие для всех модулей.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Экранирование пользовательского текста перед вставкой в innerHTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Создать элемент из HTML-строки. */
export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Телефон: узкий экран или телефон на боку (низкий сенсорный экран). То же условие стоит в styles/mobile.css. */
export const PHONE_QUERY = '(max-width: 760px), (max-height: 500px) and (pointer: coarse)';
export const isMobile = () => window.matchMedia(PHONE_QUERY).matches;

/** Плавный счётчик числа (для цифр на главной). */
export function countUp(el, to, { decimals = 0, ms = 900 } = {}) {
  if (prefersReducedMotion()) { el.textContent = to.toFixed(decimals); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = (to * (1 - (1 - k) ** 3)).toFixed(decimals);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Маска телефона +7 (___) ___-__-__ */
export function maskPhone(value) {
  let d = value.replace(/\D/g, '');
  if (d.startsWith('7') || d.startsWith('8')) d = d.slice(1);
  d = d.slice(0, 10);
  let out = '+7';
  if (d.length) out += ` (${d.slice(0, 3)}`;
  if (d.length >= 3) out += ')';
  if (d.length > 3) out += ` ${d.slice(3, 6)}`;
  if (d.length > 6) out += `-${d.slice(6, 8)}`;
  if (d.length > 8) out += `-${d.slice(8, 10)}`;
  return out;
}

export const phoneValid = (v) => v.replace(/\D/g, '').length === 11;

/** Цифры телефона для ссылки tel: */
export const telHref = (phone) => `tel:+${phone.replace(/\D/g, '')}`;

/** Русские окончания: plural(5, ['место','места','мест']) */
export function plural(n, forms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  return b === 1 ? forms[0] : forms[2];
}

export function minutesText(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const parts = [];
  if (h) parts.push(`${h} ${plural(h, ['час', 'часа', 'часов'])}`);
  if (m) parts.push(`${m} мин`);
  return parts.join(' ') || '0 мин';
}

export const dateLabel = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'UTC' });
};

/** Всплывающее уведомление в правом верхнем углу. tone: 'accent' | 'hot'. */
export function toast(htmlText, tone = 'accent', ms = 5000) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = `toast${tone === 'hot' ? ' toast--hot' : ''}`;
  t.innerHTML = htmlText;
  box.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/** Короткий звуковой сигнал без файлов (Web Audio). Молча пропускается, если звук недоступен. */
export function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.12);
    setTimeout(() => ctx.close(), 300);
  } catch { /* звук необязателен */ }
}
