// Расчёт цен и времени. Чистая логика без DOM — её можно проверять в Node.
// Время клуба хранится как «настенное» челябинское время в UTC-полях Date (см. wallNow).
import { PACKS, ZONES, PROMO, CLUB } from './data.js';

const pad = (n) => String(n).padStart(2, '0');

/** Текущее настенное время Челябинска: поля getUTC* дают местные часы. */
export function wallNow(realNow = Date.now()) {
  return new Date(realNow + CLUB.utcOffsetHours * 3600 * 1000);
}

export function ymd(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function hm(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** 'HH:MM' → минуты от полуночи. */
export function toMinutes(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

/** Метка начала в миллисекундах «настенного» времени. */
export function startMs(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, mo - 1, d, 0, toMinutes(timeStr));
}

/** День недели по ISO: 1 = пн … 7 = вс. */
export function isoDay(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const w = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

export const isWeekend = (dateStr) => isoDay(dateStr) >= 6;
export const isCashbackDay = (dateStr) => PROMO.cashbackDays.includes(isoDay(dateStr));
export const zoneById = (id) => ZONES.find((z) => z.id === id);

const packsOf = (zoneId) => PACKS[zoneId] || [];
const priceOf = (p, weekend) => (weekend ? p.we : p.wd) ?? null;

/** Цена одного места (или комнаты) за пакет; null — такого пакета в этот тип дня нет. */
export function packPrice(zoneId, packId, weekend) {
  const p = packsOf(zoneId).find((x) => x.id === packId);
  return p ? priceOf(p, weekend) : null;
}

/** Время старта (в минутах) попадает в окно пакета, которое может переходить через полночь. */
function inWindow(t, from, to) {
  const f = from * 60;
  const e = to * 60;
  return f < e ? t >= f && t < e : t >= f || t < e;
}

/** Сколько минут от старта до конца окна пакета. */
function minutesToEnd(t, endHour) {
  const diff = endHour * 60 - t;
  return diff > 0 ? diff : diff + 1440;
}

/** Длительность пакета в часах (для таблицы тарифов). */
const packHours = (p) => (p.minutes ? p.minutes / 60 : (p.to - p.from + 24) % 24);

/**
 * Пакеты, доступные для старта в startTime ('HH:MM') в день данного типа.
 * Пакет фиксированной длительности с окном (утренний час) доступен, если он целиком укладывается в окно.
 * Пакет по времени суток доступен, если старт в окне и до его конца осталось не меньше часа.
 */
export function availablePacks(zoneId, startTime, weekend = false) {
  const t = toMinutes(startTime);
  const list = [];
  for (const p of packsOf(zoneId)) {
    if (priceOf(p, weekend) == null) continue;
    if (p.minutes) {
      if (p.from != null && !(t >= p.from * 60 && t + p.minutes <= p.to * 60)) continue;
      list.push({ id: p.id, label: p.label, minutes: p.minutes, timePack: p.from != null });
    } else if (inWindow(t, p.from, p.to)) {
      const minutes = minutesToEnd(t, p.to);
      if (minutes >= 60) list.push({ id: p.id, label: p.label, minutes, timePack: true });
    }
  }
  return list;
}

/**
 * Итог по заказу. seats — число мест; для комнат (room) цена за комнату, а не за место.
 * Подарочные часы (новичок, промокод) прибавляются ко времени, а не снижают цену.
 */
export function quote({ zoneId, packId, dateStr, startTime, seats, newGuest, promoOk }) {
  const zone = zoneById(zoneId);
  const weekend = isWeekend(dateStr);
  const pack = availablePacks(zoneId, startTime, weekend).find((p) => p.id === packId);
  if (!pack) return null;
  const unit = packPrice(zoneId, packId, weekend);
  const count = zone.room ? 1 : seats;
  const total = unit * count;
  const giftMinutes = (newGuest ? PROMO.freeHoursNewGuest * 60 : 0) + (promoOk ? PROMO.codeBonusHours * 60 : 0);
  return {
    pack, unit, count, total, weekend, giftMinutes,
    playMinutes: pack.minutes + giftMinutes,
    cashback: isCashbackDay(dateStr) ? PROMO.cashbackPercent : 0,
    end: hm(toMinutes(startTime) + pack.minutes),
  };
}

/** Проверка промокода без учёта регистра. */
export const isPromoCode = (code) => code.trim().toUpperCase() === PROMO.code;

export const money = (n) => `${n.toLocaleString('ru-RU').replace(/ /g, ' ')} ₽`;

/** Таблица пакетов зоны для вкладки «Тарифы»: цена, длительность, цена часа. */
export function packTable(zoneId, weekend) {
  const rows = packsOf(zoneId)
    .filter((p) => priceOf(p, weekend) != null)
    .map((p) => {
      const hours = packHours(p);
      const price = priceOf(p, weekend);
      return { id: p.id, label: p.label, hours, price, timePack: p.from != null, perHour: Math.round(price / hours) };
    });
  // «Выгодно» — самый дешёвый час среди пакетов от трёх часов (утренний час и короткие пакеты не считаются).
  const long = rows.filter((r) => r.hours >= 3);
  const best = long.length ? Math.min(...long.map((r) => r.price / r.hours)) : null;
  rows.forEach((r) => { r.best = best != null && r.hours >= 3 && r.price / r.hours === best; });
  return rows;
}

/**
 * Самая дешёвая комбинация обычных пакетов (без окон и без суток), чтобы покрыть N часов.
 * Возвращает { cost, parts: [{ label, n }] } или null, если подходящих пакетов нет.
 */
export function bestCombo(zoneId, weekend, hours) {
  const packs = packsOf(zoneId)
    .filter((p) => p.minutes && p.from == null && p.minutes < 1440 && priceOf(p, weekend) != null)
    .map((p) => ({ label: p.label, h: p.minutes / 60, price: priceOf(p, weekend) }));
  if (!packs.length) return null;
  const best = Array(hours + 6).fill(null);
  best[0] = { cost: 0, parts: [] };
  for (let t = 1; t < best.length; t += 1) {
    for (const p of packs) {
      const prev = best[Math.max(0, t - p.h)];
      if (!prev) continue;
      const cost = prev.cost + p.price;
      if (!best[t] || cost < best[t].cost) best[t] = { cost, parts: [...prev.parts, p] };
    }
  }
  let pick = null;
  for (let t = hours; t < best.length; t += 1) if (best[t] && (!pick || best[t].cost < pick.cost)) pick = best[t];
  if (!pick) return null;
  const counts = new Map();
  pick.parts.forEach((p) => counts.set(p.label, (counts.get(p.label) || 0) + 1));
  return { cost: pick.cost, parts: [...counts].map(([label, n]) => ({ label, n })) };
}
