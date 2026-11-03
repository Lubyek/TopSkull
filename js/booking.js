// «Бронь.exe»: мастер из 4 шагов, схема зала, сводка заказа, билет.
import { BRANCHES, ZONES, PROMO } from './data.js';
import {
  wallNow,
  ymd,
  startMs,
  hm,
  zoneById,
  availablePacks,
  quote,
  isWeekend,
  isCashbackDay,
  isPromoCode,
  money,
} from './pricing.js';
import { busySeats, nearestFreeSlot, timeSlots } from './availability.js';
import { addBooking, getBookings } from './store.js';
import { renderTicket, bindTicket } from './ticket.js';
import { esc, $, $$, maskPhone, phoneValid, toast, minutesText, dateLabel, plural } from './util.js';
import { icon } from './icons.js';

const STEPS = ['Филиал и зона', 'Дата и время', 'Место', 'Контакты'];
const DAY_NAMES = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** Ближайшая «круглая» получасовка сегодня или заданный час. */
function quickTime(kind, today) {
  const now = wallNow();
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (kind === 'now') return { date: today, start: hm(Math.ceil((nowMin + 5) / 30) * 30 % 1440) };
  const target = kind === 'evening' ? 19 * 60 : 23 * 60;
  const date = nowMin > target ? ymd(new Date(now.getTime() + 864e5)) : today;
  return { date, start: hm(target) };
}

/** Раскладка мест на схеме: размеры и координаты. */
function layout(zone) {
  const cell = 52;
  if (zone.room) return { w: 220, h: 140, seats: [{ n: 1, x: 20, y: 40, w: 180, h: 80 }], tv: true };
  const cols = zone.id === 'hall' || zone.id === 'std' ? 5 : zone.id === 'boot' ? 3 : 2;
  const seats = Array.from({ length: zone.seats }, (_, i) => ({ n: i + 1, x: 12 + (i % cols) * cell, y: 40 + Math.floor(i / cols) * cell, w: 44, h: 44 }));
  return { w: cols * cell + 20, h: Math.ceil(zone.seats / cols) * cell + 52, seats };
}

export function mountBooking(body, ctx) {
  const now = wallNow();
  const today = ymd(now);
  const s = {
    step: 1,
    branchId: ctx.opts?.branch || BRANCHES[0].id,
    zoneId: 'hall',
    date: today,
    start: quickTime('now', today).start,
    packId: 'h3',
    seats: [],
    name: '', phone: '', comment: '', newGuest: false, code: '', promoOk: false, agree: false,
  };
  if (timeSlots(today).indexOf(s.start) < 0) s.start = timeSlots(today)[0] || '12:00';


  const zone = () => zoneById(s.zoneId);
  const packs = () => availablePacks(s.zoneId, s.start, isWeekend(s.date));
  const pack = () => packs().find((p) => p.id === s.packId);
  const range = () => {
    const from = startMs(s.date, s.start);
    return [from, from + (pack()?.minutes || 60) * 60000];
  };
  const q = () => quote({ ...s, seats: Math.max(1, s.seats.length), dateStr: s.date, startTime: s.start, promoOk: s.promoOk });

  /** Согласовать выбор с доступным: пакет и места после смены зоны/времени. */
  function normalize() {
    if (!pack()) s.packId = (packs().find((p) => p.id === 'h3') || packs()[0])?.id ?? null; // на этот день/время пакетов может не быть
    const [from, to] = range();
    const busy = busySeats(s.branchId, s.zoneId, from, to);
    s.seats = s.seats.filter((n) => n <= zone().seats && !busy.has(n));
  }
  normalize();

  body.innerHTML = `
    <div class="book">
      <ol class="steps" aria-label="Шаги брони"></ol>
      <div class="book__main">
        <div id="b-step" class="book__step"></div>
        <div class="book__nav">
          <button type="button" class="btn btn--ghost" id="b-back">${icon('back', 16)} Назад</button>
          <button type="button" class="btn btn--accent" id="b-next">Далее ${icon('next', 16)}</button>
        </div>
      </div>
      <aside class="book__sum" id="b-sum" aria-label="Сводка заказа"></aside>
    </div>`;
  const stepBox = $('#b-step', body);
  let ticketShown = false;

  // ---------- сводка ----------
  function drawSummary() {
    const z = zone();
    const r = q();
    const branch = BRANCHES.find((b) => b.id === s.branchId);
    const lines = [
      ['Филиал', branch.name],
      ['Зона', z.name],
      ['Места', s.seats.length ? (z.room ? 'комната целиком' : s.seats.map((n) => `№${n}`).join(', ')) : '—'],
      ['Дата', dateLabel(s.date)],
      ['Время', r ? `${s.start}–${r.end}` : s.start],
      ['Пакет', r ? r.pack.label : '—'],
    ];
    if (r?.giftMinutes) lines.push(['В подарок', `+${minutesText(r.giftMinutes)} на баланс`]);
    $('#b-sum', body).innerHTML = `
      <h3 class="mono muted">СВОДКА ЗАКАЗА</h3>
      <dl>${lines.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${r?.weekend ? '<p class="badge badge--hot">тариф выходного дня</p>' : ''}
      <div class="sum__total"><span class="mono muted">ИТОГО</span><b>${r && s.seats.length ? money(r.total) : '—'}</b></div>
      ${r && s.seats.length && r.cashback ? `<p class="sum__cb">Вернём ${r.cashback} % на баланс клуба. Это не скидка, а кешбэк.</p>` : ''}
      ${isCashbackDay(s.date) && !s.seats.length ? '<p class="sum__cb">В этот день кешбэк 100 % на баланс.</p>' : ''}`;
  }

  function drawSteps() {
    $('.steps', body).innerHTML = STEPS.map((t, i) => `<li class="${i + 1 === s.step ? 'is-now' : i + 1 < s.step ? 'is-done' : ''}" ${i + 1 === s.step ? 'aria-current="step"' : ''}><span class="mono">${i + 1}</span><em>${t}</em></li>`).join('');
    $('#b-back', body).disabled = s.step === 1;
    $('#b-next', body).hidden = s.step === 4;
  }

  // ---------- шаг 1 ----------
  function step1() {
    return `
      <h2 class="h-md" id="s1">Куда придёте?</h2>
      <div class="opts" role="radiogroup" aria-labelledby="s1">
        ${BRANCHES.map((b) => `<button type="button" role="radio" class="opt" aria-checked="${b.id === s.branchId}" data-k="br-${b.id}" data-branch="${b.id}">
          <b>${esc(b.name)}</b><span class="muted">${esc(b.district)}</span><span class="mono muted small">${esc(b.phone)}</span></button>`).join('')}
      </div>
      <h2 class="h-md" id="s1z">Какая зона?</h2>
      <div class="opts" role="radiogroup" aria-labelledby="s1z">
        ${ZONES.filter((z) => z.bookable !== false).map((z) => `<button type="button" role="radio" class="opt" aria-checked="${z.id === s.zoneId}" data-k="z-${z.id}" data-zone="${z.id}">
          <b>${esc(z.name)}</b><span class="mono muted small">${z.seats} ${plural(z.seats, ['место', 'места', 'мест'])}${z.room ? ' · комната' : ''}</span></button>`).join('')}
      </div>`;
  }

  // ---------- шаг 2 ----------
  function step2() {
    const dates = Array.from({ length: 15 }, (_, i) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i));
      return { str: ymd(d), day: d.getUTCDate(), name: i === 0 ? 'сегодня' : DAY_NAMES[d.getUTCDay()], we: d.getUTCDay() === 0 || d.getUTCDay() === 6 };
    });
    const r = q();
    return `
      <h2 class="h-md" id="s2">Когда?</h2>
      <div class="chips" role="group" aria-label="Быстрый выбор">
        ${[['now', 'Сейчас'], ['evening', 'Вечером'], ['night', 'Ночью']].map(([k, l]) => `<button type="button" class="chip" data-quick="${k}" data-k="q-${k}">${l}</button>`).join('')}
      </div>
      <div class="dates" role="radiogroup" aria-label="Дата">
        ${dates.map((d) => `<button type="button" role="radio" class="date${d.we ? ' is-we' : ''}" aria-checked="${d.str === s.date}" data-k="d-${d.str}" data-date="${d.str}"><span class="mono">${d.name}</span><b>${d.day}</b></button>`).join('')}
      </div>
      ${isWeekend(s.date) ? '<p class="badge badge--hot">тариф выходного дня</p>' : ''}
      <p class="mono muted" id="s2t">Начало</p>
      <div class="slots" role="radiogroup" aria-labelledby="s2t">
        ${timeSlots(s.date).map((t) => `<button type="button" role="radio" class="slot" aria-checked="${t === s.start}" data-k="t-${t}" data-time="${t}">${t}</button>`).join('')}
      </div>
      <p class="mono muted" id="s2d">Длительность</p>
      <div class="opts opts--sm" role="radiogroup" aria-labelledby="s2d">
        ${packs().map((p) => `<button type="button" role="radio" class="opt" aria-checked="${p.id === s.packId}" data-k="p-${p.id}" data-pack="${p.id}">
          <b>${esc(p.label)}</b><span class="mono muted small">${minutesText(p.minutes)}</span></button>`).join('')}
      </div>
      ${r ? '' : '<p class="err">Выберите время начала</p>'}`;
  }

  // ---------- шаг 3 ----------
  function step3() {
    const z = zone();
    const L = layout(z);
    const [from, to] = range();
    const busy = busySeats(s.branchId, s.zoneId, from, to);
    const free = z.seats - busy.size;
    const seatsSvg = L.seats.map((p) => {
      const isBusy = busy.has(p.n);
      const on = s.seats.includes(p.n);
      const label = z.room ? 'Комната целиком' : `Место ${p.n}`;
      return `<g class="seat ${isBusy ? 'seat--busy' : on ? 'seat--sel' : 'seat--free'}" role="button" tabindex="0" data-seat="${p.n}" data-k="s-${p.n}"
        aria-pressed="${on}" aria-label="${label}, ${isBusy ? 'занято' : on ? 'выбрано' : 'свободно'}">
        <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${z.room ? 14 : 9}"/>
        <text x="${p.x + p.w / 2}" y="${p.y + p.h / 2}" text-anchor="middle" dominant-baseline="central">${z.room ? 'КОМНАТА ЦЕЛИКОМ' : p.n}</text></g>`;
    }).join('');
    return `
      <div class="row row--between">
        <h2 class="h-md" id="s3">Выберите ${z.room ? 'комнату' : 'место'}</h2>
        <span class="mono muted">${free} из ${z.seats} свободно</span>
      </div>
      <ul class="legend mono small"><li><i class="lg lg--free"></i>свободно</li><li><i class="lg lg--busy"></i>занято</li><li><i class="lg lg--sel"></i>выбрано</li></ul>
      <div class="plan-wrap">
        <svg class="hallmap" viewBox="0 0 ${L.w} ${L.h}" role="group" aria-labelledby="s3">
          <text x="${L.w / 2}" y="22" text-anchor="middle" class="hallmap__lbl">${L.tv ? 'ТВ' : 'ВХОД · ЗАЛ'}</text>
          ${seatsSvg}
        </svg>
      </div>
      <p class="tip" id="b-tip" role="alert" aria-live="assertive"></p>
      <div class="row">
        ${z.wholeHall ? '<button type="button" class="btn btn--ghost" id="b-whole">Забронировать весь зал</button>' : ''}
        <span class="muted small">${z.room ? 'Цена за комнату, до 6 человек.' : `Можно выбрать до ${z.max} ${plural(z.max, ['место', 'места', 'мест'])} для компании.`}</span>
      </div>`;
  }

  // ---------- шаг 4 ----------
  function step4() {
    return `
      <h2 class="h-md" id="s4">Кто придёт?</h2>
      <form class="form" id="b-form" novalidate>
        <label class="field"><span>Имя *</span><input name="name" autocomplete="name" value="${esc(s.name)}" data-k="f-name"><em class="err" aria-live="polite"></em></label>
        <label class="field"><span>Телефон *</span><input name="phone" inputmode="tel" autocomplete="tel" placeholder="+7 (___) ___-__-__" value="${esc(s.phone)}" data-k="f-phone"><em class="err" aria-live="polite"></em></label>
        <label class="field"><span>Комментарий</span><textarea name="comment" rows="2" data-k="f-comment">${esc(s.comment)}</textarea></label>
        <label class="check"><input type="checkbox" name="newGuest" ${s.newGuest ? 'checked' : ''}><span>Я новый гость (${PROMO.freeHoursNewGuest} часа в подарок)</span></label>
        <div class="field field--promo">
          <label for="b-code"><span>Промокод</span></label>
          <div class="row"><input id="b-code" name="code" autocomplete="off" value="${esc(s.code)}" placeholder="TOPSKILL15"><button type="button" class="btn btn--ghost" id="b-apply">Применить</button></div>
          <em class="err ${s.promoOk ? 'ok' : ''}" id="b-code-msg" aria-live="polite">${s.promoOk ? `Промокод принят: ${'+1 час к пакету'}` : ''}</em>
        </div>
        <label class="check"><input type="checkbox" name="agree" ${s.agree ? 'checked' : ''}><span>Согласен на обработку данных (демо: данные остаются в вашем браузере) *</span></label>
        <em class="err" id="b-agree-msg" aria-live="polite"></em>
        <div class="conflict" id="b-conflict" role="alert" hidden></div>
        <button type="submit" class="btn btn--accent btn--lg" id="b-submit">Забронировать</button>
      </form>`;
  }

  // ---------- отрисовка шага с сохранением фокуса ----------
  function render() {
    const key = document.activeElement?.dataset?.k;
    stepBox.innerHTML = [step1, step2, step3, step4][s.step - 1]();
    drawSteps();
    drawSummary();
    if (key) $(`[data-k="${key}"]`, stepBox)?.focus({ preventScroll: true });
    if (s.step === 2) $('[aria-checked="true"].slot', stepBox)?.scrollIntoView?.({ block: 'nearest' });
  }

  const tip = (msg) => { const t = $('#b-tip', body); if (t) { t.textContent = msg; t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake'); } };

  function toggleSeat(n) {
    const z = zone();
    const [from, to] = range();
    if (busySeats(s.branchId, s.zoneId, from, to).has(n)) { tip('Это место уже занято на выбранное время. Выберите другое или поменяйте время.'); return; }
    if (z.room) { s.seats = [1]; }
    else if (s.seats.includes(n)) s.seats = s.seats.filter((x) => x !== n);
    else if (s.seats.length >= z.max) { tip(`Можно выбрать не больше ${z.max} мест.`); return; }
    else s.seats = [...s.seats, n].sort((a, b) => a - b);
    render();
  }

  // ---------- события шагов ----------
  stepBox.addEventListener('click', (e) => {
    const t = e.target.closest('[data-branch],[data-zone],[data-quick],[data-date],[data-time],[data-pack],[data-seat],#b-whole,#b-apply');
    if (!t) return;
    if (t.dataset.branch) s.branchId = t.dataset.branch;
    else if (t.dataset.zone) { s.zoneId = t.dataset.zone; s.seats = []; }
    else if (t.dataset.quick) Object.assign(s, quickTime(t.dataset.quick, today));
    else if (t.dataset.date) { s.date = t.dataset.date; if (!timeSlots(s.date).includes(s.start)) s.start = timeSlots(s.date)[0]; }
    else if (t.dataset.time) s.start = t.dataset.time;
    else if (t.dataset.pack) s.packId = t.dataset.pack;
    else if (t.dataset.seat) { toggleSeat(Number(t.dataset.seat)); return; }
    else if (t.id === 'b-whole') {
      const [from, to] = range();
      const busy = busySeats(s.branchId, s.zoneId, from, to);
      if (busy.size) { tip('Часть мест уже занята. Весь зал на это время недоступен, выберите другое время.'); return; }
      s.seats = Array.from({ length: zone().seats }, (_, i) => i + 1);
      render(); return;
    } else if (t.id === 'b-apply') { applyCode(); return; }
    normalize();
    render();
  });

  stepBox.addEventListener('keydown', (e) => {
    const seat = e.target.closest?.('[data-seat]');
    if (seat && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleSeat(Number(seat.dataset.seat)); return; }
    // Стрелки внутри группы radio — как в стандартном радио.
    if (e.target.getAttribute?.('role') === 'radio' && ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
      const group = [...e.target.parentElement.querySelectorAll('[role=radio]')];
      const i = group.indexOf(e.target);
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      const next = group[(i + d + group.length) % group.length];
      e.preventDefault();
      next.focus();
      next.click();
    }
  });

  // Форма: значения хранятся в состоянии, но шаг не перерисовываем при вводе.
  stepBox.addEventListener('input', (e) => {
    const f = e.target;
    if (f.name === 'phone') { f.value = maskPhone(f.value); s.phone = f.value; }
    else if (f.name === 'name') s.name = f.value;
    else if (f.name === 'comment') s.comment = f.value;
    else if (f.name === 'code') { s.code = f.value; s.promoOk = false; $('#b-code-msg', stepBox).textContent = ''; drawSummary(); }
    else if (f.name === 'newGuest') { s.newGuest = f.checked; drawSummary(); }
    else if (f.name === 'agree') s.agree = f.checked;
  });

  function applyCode() {
    const msg = $('#b-code-msg', stepBox);
    if (!s.code.trim()) { msg.className = 'err'; msg.textContent = 'Введите промокод'; return false; }
    if (isPromoCode(s.code)) { s.promoOk = true; msg.className = 'err ok'; msg.textContent = 'Промокод принят: +1 час к пакету'; drawSummary(); return true; }
    s.promoOk = false; msg.className = 'err';
    msg.textContent = `Промокод «${s.code.trim()}» не найден. Проверьте написание, например TOPSKILL15.`;
    drawSummary();
    return false;
  }

  function fail(input, text) {
    const f = input.closest('.field');
    f?.classList.add('is-bad');
    input.setAttribute('aria-invalid', 'true');
    const em = f?.querySelector('.err');
    if (em) em.textContent = text;
  }

  // Пересечение с другой активной бронью того же телефона.
  const ownOverlap = (from, to) => getBookings().some((b) => b.phone === s.phone && ['new', 'confirmed'].includes(b.status)
    && startMs(b.date, b.start) < to && startMs(b.date, b.start) + b.minutes * 60000 > from);

  stepBox.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    $$('.field', form).forEach((f) => {
      f.classList.remove('is-bad');
      const em = f.querySelector('.err');
      if (em && em.id !== 'b-code-msg') em.textContent = ''; // сообщение о промокоде живёт своей жизнью
    });
    $('#b-agree-msg', form).textContent = '';
    let first = null;
    if (!s.name.trim()) { fail(form.elements.name, 'Укажите имя, чтобы администратор знал, как к вам обращаться'); first = first || form.elements.name; }
    if (!phoneValid(s.phone)) { fail(form.elements.phone, 'Введите номер полностью: +7 (900) 000-00-00'); first = first || form.elements.phone; }
    if (s.code.trim() && !s.promoOk && !applyCode()) first = first || form.elements.code;
    if (!s.agree) { $('#b-agree-msg', form).textContent = 'Нужно согласие, чтобы оформить бронь'; first = first || form.elements.agree; }
    if (first) { first.focus(); return; }

    const r = q();
    const from = startMs(s.date, s.start);
    const to = from + r.pack.minutes * 60000; // подарочные часы идут на баланс, бронь не удлиняют
    const busy = busySeats(s.branchId, s.zoneId, from, to);
    const taken = s.seats.filter((n) => busy.has(n));
    const own = ownOverlap(from, to);
    if (taken.length || own) {
      const slot = nearestFreeSlot(s.branchId, s.zoneId, s.seats, s.date, s.start, r.pack.minutes);
      const box = $('#b-conflict', form);
      box.hidden = false;
      box.innerHTML = `<b>${own ? 'У вас уже есть бронь на это время.' : `Место ${taken.join(', ')} уже занято.`}</b>
        ${slot ? `<p>Ближайшее свободное время: <b>${esc(dateLabel(slot.date))}, ${slot.start}</b>.</p><button type="button" class="btn btn--accent btn--sm" id="b-slot">Перенести на ${slot.start}</button>` : '<p>Свободных слотов поблизости нет. Выберите другое время.</p>'}`;
      $('#b-slot', box)?.addEventListener('click', () => { s.date = slot.date; s.start = slot.start; normalize(); s.step = 2; render(); toast(`<b>Время обновлено</b><br>${slot.start}`); });
      toast('Нужно выбрать другое время', 'hot');
      return;
    }

    const booking = addBooking({
      name: s.name.trim(), phone: s.phone, comment: s.comment.trim(),
      branchId: s.branchId, zoneId: s.zoneId, seats: s.seats, date: s.date, start: s.start,
      packId: s.packId, packLabel: r.pack.label, minutes: r.pack.minutes, end: r.end, gift: r.giftMinutes,
      total: r.total, newGuest: s.newGuest, promo: s.promoOk, cashback: r.cashback,
    });
    ticketShown = true;
    body.innerHTML = renderTicket(booking);
    bindTicket(body, booking, () => { body.innerHTML = ''; ctx.close(); ctx.open('book'); });
    toast(`<b>Бронь ${esc(booking.code)}</b><br>Ждём вас в ${esc(booking.start)}`);
  });

  // ---------- навигация ----------
  function canGo() {
    if (s.step === 2 && !pack()) return 'Выберите время и длительность';
    if (s.step === 3 && !s.seats.length) return zone().room ? 'Выберите комнату' : 'Выберите хотя бы одно свободное место';
    return '';
  }
  $('#b-next', body).addEventListener('click', () => {
    const problem = canGo();
    if (problem) { tip(problem); toast(esc(problem), 'hot', 3000); return; }
    s.step = Math.min(4, s.step + 1);
    normalize();
    render();
    stepBox.querySelector('h2')?.setAttribute('tabindex', '-1');
    stepBox.querySelector('h2')?.focus({ preventScroll: true });
  });
  $('#b-back', body).addEventListener('click', () => { s.step = Math.max(1, s.step - 1); render(); });

  // Системная «назад» на телефоне: шаг назад вместо закрытия брони (окно закрывается только с первого шага или с билета).
  ctx.onBack = () => {
    if (ticketShown || s.step <= 1) return false;
    s.step -= 1;
    render();
    return true;
  };

  render();
}
