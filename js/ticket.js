// Билет-ваучер после брони: QR-заглушка, .ics для календаря, копирование и звонок.
import { CLUB, BRANCHES } from './data.js';
import { zoneById, startMs, money } from './pricing.js';
import { esc, toast, telHref, minutesText, dateLabel } from './util.js';
import { icon } from './icons.js';

/** QR-заглушка: детерминированный узор от кода брони (это не настоящий QR). */
function qr(code) {
  let h = 2166136261;
  for (const ch of code) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const N = 21;
  let cells = '';
  let x = h || 1;
  const finder = (cx, cy) => `<rect x="${cx}" y="${cy}" width="7" height="7" fill="#07050d"/><rect x="${cx + 1}" y="${cy + 1}" width="5" height="5" fill="#fff"/><rect x="${cx + 2}" y="${cy + 2}" width="3" height="3" fill="#07050d"/>`;
  const inFinder = (i, j) => (i < 8 && j < 8) || (i > N - 9 && j < 8) || (i < 8 && j > N - 9);
  for (let j = 0; j < N; j += 1) {
    for (let i = 0; i < N; i += 1) {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
      if (!inFinder(i, j) && x % 3 === 0) cells += `<rect x="${i}" y="${j}" width="1" height="1" fill="#07050d"/>`;
    }
  }
  return `<svg class="qr" viewBox="-1 -1 ${N + 2} ${N + 2}" role="img" aria-label="QR-код брони (заглушка)"><rect x="-1" y="-1" width="${N + 2}" height="${N + 2}" fill="#fff"/>${cells}${finder(0, 0)}${finder(N - 7, 0)}${finder(0, N - 7)}</svg>`;
}

const icsStamp = (ms) => {
  // Время клуба хранится как «настенное» челябинское; для файла переводим в UTC.
  const d = new Date(ms - CLUB.utcOffsetHours * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`;
};

export function buildIcs(b) {
  const branch = BRANCHES.find((x) => x.id === b.branchId);
  const from = startMs(b.date, b.start);
  const to = from + b.minutes * 60000;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TOPSKILL//Demo//RU', 'BEGIN:VEVENT',
    `UID:${b.code}@topskill.demo`, `DTSTAMP:${icsStamp(Date.now() + CLUB.utcOffsetHours * 3600 * 1000)}`,
    `DTSTART:${icsStamp(from)}`, `DTEND:${icsStamp(to)}`,
    `SUMMARY:TOPSKILL: ${zoneById(b.zoneId).name}`,
    `LOCATION:${CLUB.city}\\, ${branch.address}`,
    `DESCRIPTION:Бронь ${b.code}. Места: ${b.seats.join('\\, ')}. Бронь держим ${CLUB.holdMinutes} минут после начала.`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

function ticketText(b) {
  const branch = BRANCHES.find((x) => x.id === b.branchId);
  return `TOPSKILL · бронь ${b.code}\n${zoneById(b.zoneId).name}, места: ${b.seats.join(', ')}\n${dateLabel(b.date)}, ${b.start}–${b.end}\n${branch.address}\n${money(b.total)}`;
}

export function renderTicket(b) {
  const branch = BRANCHES.find((x) => x.id === b.branchId);
  const zone = zoneById(b.zoneId);
  return `
    <div class="ticket-wrap">
      <div class="printer" aria-hidden="true"><i></i></div>
      <article class="ticket" aria-labelledby="tk-code">
        <header class="ticket__head">
          <span class="logo">TOP<b>SKILL</b></span>
          <span class="mono muted">ВАУЧЕР · ДЕМО</span>
        </header>
        <p class="mono muted">КОД БРОНИ</p>
        <h2 class="ticket__code" id="tk-code" tabindex="-1">${esc(b.code)}</h2>
        <div class="ticket__grid">
          <div><span class="mono muted">ЗОНА</span><b>${esc(zone.name)}</b></div>
          <div><span class="mono muted">МЕСТА</span><b>${b.seats.map((s) => (zone.room ? 'комната' : '№' + s)).join(', ')}</b></div>
          <div><span class="mono muted">ДАТА</span><b>${esc(dateLabel(b.date))}</b></div>
          <div><span class="mono muted">ВРЕМЯ</span><b>${esc(b.start)}–${esc(b.end)}</b></div>
          <div><span class="mono muted">ИГРА</span><b>${esc(minutesText(b.minutes))}</b></div>
          <div><span class="mono muted">СУММА</span><b>${money(b.total)}</b></div>
          ${b.gift ? `<div class="wide"><span class="mono muted">В ПОДАРОК</span><b>+${esc(minutesText(b.gift))} на баланс</b></div>` : ''}
          <div class="wide"><span class="mono muted">ФИЛИАЛ</span><b>${esc(branch.address)}</b></div>
        </div>
        <div class="ticket__tear" aria-hidden="true"></div>
        <div class="ticket__foot">
          ${qr(b.code)}
          <p>Бронь держим ${CLUB.holdMinutes} минут после начала времени. Покажите код администратору.</p>
        </div>
      </article>
      <div class="row ticket__actions">
        <button type="button" class="btn btn--accent" id="tk-ics">${icon('cal', 16)} В календарь</button>
        <button type="button" class="btn btn--ghost" id="tk-copy">${icon('copy', 16)} Скопировать</button>
        <a class="btn btn--ghost" href="${telHref(branch.phone)}">${icon('phone', 16)} Позвонить в клуб</a>
        <button type="button" class="btn btn--ghost" id="tk-new">Новая бронь</button>
      </div>
    </div>`;
}

export function bindTicket(root, b, onNew) {
  root.querySelector('#tk-ics').addEventListener('click', () => {
    const blob = new Blob([buildIcs(b)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${b.code}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  root.querySelector('#tk-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(ticketText(b)); toast('<b>Скопировано</b><br>Данные брони в буфере'); } catch { toast('Не удалось скопировать', 'hot'); }
  });
  root.querySelector('#tk-new').addEventListener('click', onNew);
  root.querySelector('#tk-code').focus?.();
}
