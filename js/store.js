// Хранилище заявок и настроек. Всё в localStorage с префиксом topskill_, везде try/catch.
// Новые заявки рассылаются в соседние вкладки через BroadcastChannel (с запасным событием storage).
import { STORAGE_PREFIX, BRANCHES } from './data.js';
import { wallNow, ymd, hm, toMinutes } from './pricing.js';

const K = {
  bookings: `${STORAGE_PREFIX}bookings`,
  seq: `${STORAGE_PREFIX}seq`,
  seeded: `${STORAGE_PREFIX}seeded`,
};
const CHANNEL = `${STORAGE_PREFIX}events`;

export const STATUSES = {
  new: { label: 'Новая', tone: 'cyan' },
  confirmed: { label: 'Подтверждена', tone: 'accent' },
  arrived: { label: 'Гость пришёл', tone: 'ok' },
  cancelled: { label: 'Отменена', tone: 'muted' },
  noshow: { label: 'Не пришёл', tone: 'hot' },
};

// ---------- безопасная работа с localStorage / sessionStorage ----------
export function load(key, fallback = null, area = 'localStorage') {
  try {
    const raw = window[area].getItem(STORAGE_PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

export function save(key, value, area = 'localStorage') {
  try { window[area].setItem(STORAGE_PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
}

// Если хранилище недоступно (приватный режим) — держим данные в памяти.
let memory = null;

function readBookings() {
  try {
    const raw = localStorage.getItem(K.bookings);
    if (raw) return JSON.parse(raw);
  } catch { /* упадём в память */ }
  return memory;
}

function writeBookings(list) {
  memory = list;
  try { localStorage.setItem(K.bookings, JSON.stringify(list)); } catch { /* только память */ }
}

function nextCode() {
  let n = 1041;
  try { n = Number(localStorage.getItem(K.seq)) || 1041; } catch { /* по умолчанию */ }
  n += 1;
  try { localStorage.setItem(K.seq, String(n)); } catch { /* пропускаем */ }
  return `TS-${n}`;
}

// ---------- события между вкладками ----------
let channel = null;
try { channel = new BroadcastChannel(CHANNEL); } catch { /* старый браузер */ }
const listeners = new Set();

export function onStoreEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(ev) { listeners.forEach((fn) => fn(ev)); }

if (channel) channel.onmessage = (e) => emit({ ...e.data, remote: true });
window.addEventListener('storage', (e) => {
  if (e.key === K.bookings) emit({ type: 'sync', remote: true });
});

function broadcast(ev) {
  emit(ev);
  try { channel?.postMessage(ev); } catch { /* ничего */ }
}

// ---------- заявки ----------
export function getBookings() {
  ensureSeed();
  return readBookings() || [];
}

export function addBooking(data) {
  const list = getBookings();
  const booking = { ...data, code: nextCode(), createdAt: Date.now(), status: 'new' };
  list.unshift(booking);
  writeBookings(list);
  broadcast({ type: 'new', code: booking.code });
  return booking;
}

export function setStatus(code, status) {
  const list = getBookings();
  const b = list.find((x) => x.code === code);
  if (!b) return;
  b.status = status;
  writeBookings(list);
  broadcast({ type: 'status', code });
}

export function resetBookings() {
  try { localStorage.removeItem(K.bookings); localStorage.removeItem(K.seq); localStorage.removeItem(K.seeded); } catch { /* ничего */ }
  memory = null;
  ensureSeed(true);
  broadcast({ type: 'sync' });
}

export function generateMore(n = 5) {
  const list = getBookings();
  const today = ymd(wallNow());
  for (let i = 0; i < n; i += 1) {
    const s = makeDemo(Math.floor(Math.random() * 100000), today, Math.floor(Math.random() * 3));
    list.unshift({ ...s, code: nextCode(), createdAt: Date.now() - i * 60000, status: 'new' });
  }
  writeBookings(list);
  broadcast({ type: 'sync' });
}

// ---------- демо-данные ----------
const NAMES = [
  'Артём Кузнецов', 'Мария Волкова', 'Даниил Соколов', 'Анастасия Морозова', 'Кирилл Новиков', 'Полина Зайцева',
  'Егор Лебедев', 'Виктория Орлова', 'Никита Павлов', 'Алина Фёдорова', 'Максим Громов', 'Дарья Белова',
];

const ZONE_DEMO = [
  { zoneId: 'hall', packId: 'h3', seats: [4], total: 330, minutes: 180, start: '13:30' },
  { zoneId: 'hall', packId: 'evening', seats: [7, 8], total: 1180, minutes: 330, start: '16:30' },
  { zoneId: 'boot', packId: 'night', seats: [1, 2, 3, 4, 5, 6], total: 3600, minutes: 600, start: '22:00' },
  { zoneId: 'vip75', packId: 'night', seats: [1], total: 1500, minutes: 570, start: '21:30' },
  { zoneId: 'vip65', packId: 'h3', seats: [1], total: 750, minutes: 180, start: '19:00' },
  { zoneId: 'ps5', packId: 'h1', seats: [1], total: 200, minutes: 60, start: '17:00' },
  { zoneId: 'hall', packId: 'h1', seats: [12], total: 130, minutes: 60, start: '10:00' },
  { zoneId: 'hall', packId: 'h5', seats: [15], total: 490, minutes: 300, start: '18:00' },
];

const STATUS_CYCLE = ['new', 'confirmed', 'arrived', 'new', 'confirmed', 'noshow', 'cancelled', 'new', 'confirmed', 'arrived', 'new', 'confirmed'];

/** Одна вымышленная заявка. seed делает набор предсказуемым; dayOffset сдвигает дату от сегодня. */
function makeDemo(seed, today, dayOffset) {
  const z = ZONE_DEMO[seed % ZONE_DEMO.length];
  const start = z.start;
  const [y, m, d] = today.split('-').map(Number);
  const date = ymd(new Date(Date.UTC(y, m - 1, d + dayOffset)));
  const branch = BRANCHES[seed % BRANCHES.length];
  const name = NAMES[seed % NAMES.length];
  const n = String(10 + (seed % 80)).padStart(2, '0');
  const packLabel = { h1: '1 час', h3: '3 часа', h5: '5 часов', evening: 'Вечер 16–22', night: 'Ночь' }[z.packId];
  return {
    name,
    phone: `+7 (900) 000-00-${n}`,
    comment: seed % 5 === 0 ? 'Нужны гарнитуры на всех' : '',
    branchId: branch.id,
    zoneId: z.zoneId,
    seats: z.seats,
    date,
    start,
    packId: z.packId,
    packLabel,
    minutes: z.minutes,
    end: hm(toMinutes(start) + z.minutes),
    total: z.total,
    newGuest: seed % 4 === 0,
    promo: false,
    cashback: 0,
  };
}

function ensureSeed(force = false) {
  if (!force) {
    try { if (localStorage.getItem(K.seeded) === '1') return; } catch { if (memory) return; }
  }
  const today = ymd(wallNow());
  const list = [];
  for (let i = 0; i < 12; i += 1) {
    const b = makeDemo(i, today, i < 7 ? 0 : 1);
    list.push({ ...b, code: `TS-${1030 + i}`, createdAt: Date.now() - (12 - i) * 17 * 60000, status: STATUS_CYCLE[i] });
  }
  list.reverse();
  writeBookings(list);
  try { localStorage.setItem(K.seeded, '1'); localStorage.setItem(K.seq, '1041'); } catch { /* память */ }
}
