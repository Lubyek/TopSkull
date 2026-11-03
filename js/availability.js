// Занятость мест. Фон «живой» зал строится детерминированно от филиала, зоны, даты и часа,
// поверх него накладываются реальные (демо) заявки из хранилища.
import { ZONES, BRANCHES } from './data.js';
import { startMs, ymd, hm, wallNow, zoneById } from './pricing.js';
import { getBookings } from './store.js';

const HOUR = 3600 * 1000;
const BUSY = new Set(['new', 'confirmed', 'arrived']); // отменённые и неявки места не держат

/** Небольшой детерминированный генератор (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Насколько зал занят в этот час: вечер плотнее, ночь и утро свободнее. */
function load(hour) {
  if (hour >= 17 && hour < 23) return 0.55;
  if (hour >= 12 && hour < 17) return 0.35;
  if (hour >= 23 || hour < 3) return 0.3;
  return 0.15;
}

/**
 * Занятые «фоновые» места. Занятость считается блоками по 3 часа: так гость не «спотыкается»
 * о случайное место на длинных пакетах. Bootcamp занимает команда целиком или не занимает вовсе.
 */
const BLOCK_HOURS = 3;

function backgroundBusy(branchId, zoneId, dateStr, hour) {
  const zone = zoneById(zoneId);
  const block = hour - (hour % BLOCK_HOURS);
  const rand = rng(hashStr(`${branchId}|${zoneId}|${dateStr}|${block}`));
  const busy = new Set();
  const p = load(block) * (zone.id === 'boot' ? 0.45 : zone.room ? 0.4 : 0.7);
  if (zone.id === 'boot') {
    if (rand() < p) for (let seat = 1; seat <= zone.seats; seat += 1) busy.add(seat);
    return busy;
  }
  for (let seat = 1; seat <= zone.seats; seat += 1) if (rand() < p) busy.add(seat);
  return busy;
}

/**
 * Занятые места на отрезке [from, to) (мс «настенного» времени).
 * Возвращает Set номеров мест.
 */
export function busySeats(branchId, zoneId, fromMs, toMs, bookings = getBookings()) {
  const busy = new Set();
  for (let t = Math.floor(fromMs / HOUR) * HOUR; t < toMs; t += HOUR) {
    const d = new Date(t);
    const hour = d.getUTCHours();
    backgroundBusy(branchId, zoneId, ymd(d), hour).forEach((s) => busy.add(s));
  }
  for (const b of bookings) {
    if (!BUSY.has(b.status) || b.branchId !== branchId || b.zoneId !== zoneId) continue;
    const bs = startMs(b.date, b.start);
    const be = bs + b.minutes * 60000;
    if (bs < toMs && be > fromMs) b.seats.forEach((s) => busy.add(s));
  }
  return busy;
}

/** Все выбранные места свободны? */
export function seatsFree(branchId, zoneId, seats, fromMs, toMs) {
  const busy = busySeats(branchId, zoneId, fromMs, toMs);
  return seats.every((s) => !busy.has(s));
}

/**
 * Ближайший слот со сдвигом по 30 минут, когда выбранные места свободны.
 * Возвращает { date, start } или null.
 */
export function nearestFreeSlot(branchId, zoneId, seats, dateStr, startTime, minutes) {
  const from = startMs(dateStr, startTime);
  for (let step = 1; step <= 48; step += 1) {
    const s = from + step * 30 * 60000;
    if (seatsFree(branchId, zoneId, seats, s, s + minutes * 60000)) {
      const d = new Date(s);
      return { date: ymd(d), start: hm(d.getUTCHours() * 60 + d.getUTCMinutes()) };
    }
  }
  return null;
}

/** Сколько мест свободно прямо сейчас во всех зонах филиала (для панели задач). */
export function freeNow(branchId = BRANCHES[0].id) {
  const now = wallNow();
  const from = Math.floor(now.getTime() / HOUR) * HOUR;
  let free = 0;
  for (const z of ZONES.filter((x) => x.bookable !== false)) free += z.seats - busySeats(branchId, z.id, from, from + HOUR).size;
  return free;
}

/** Времена старта по 30 минут для выбранной даты; для сегодняшней даты прошедшие скрываются. */
export function timeSlots(dateStr) {
  const now = wallNow();
  const today = ymd(now);
  const slots = [];
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  for (let m = 0; m < 1440; m += 30) {
    if (dateStr === today && m < nowMin - 15) continue;
    slots.push(hm(m));
  }
  return slots;
}
