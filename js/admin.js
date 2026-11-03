// «Заявки.exe»: демо-панель администратора. Заявки приходят из «Бронь.exe» и из соседней вкладки.
import { BRANCHES, ZONES, CLUB } from './data.js';
import { wallNow, ymd, startMs, zoneById, money } from './pricing.js';
import { busySeats } from './availability.js';
import { getBookings, setStatus, resetBookings, generateMore, onStoreEvent, STATUSES, load, save } from './store.js';
import { esc, $, telHref, dateLabel, minutesText } from './util.js';
import { icon } from './icons.js';

const ACTIVE = ['new', 'confirmed', 'arrived'];
const NEXT = { new: 'confirmed', confirmed: 'arrived' }; // клик по бейджу двигает заявку вперёд
const branchName = (id) => BRANCHES.find((b) => b.id === id)?.name || id;

const badge = (b) => `<button type="button" class="st st--${STATUSES[b.status].tone}" data-adv="${esc(b.code)}" aria-label="Статус: ${STATUSES[b.status].label}${NEXT[b.status] ? '. Нажмите, чтобы перевести дальше' : ''}">${STATUSES[b.status].label}</button>`;

/** Показатели для верхней панели. */
function metrics(list) {
  const today = ymd(wallNow());
  const todays = list.filter((b) => b.date === today);
  const revenue = list.filter((b) => ACTIVE.includes(b.status)).reduce((a, b) => a + b.total, 0);
  const slotCount = {};
  list.forEach((b) => { slotCount[b.start] = (slotCount[b.start] || 0) + 1; });
  const top = Object.entries(slotCount).sort((a, b) => b[1] - a[1])[0];
  // Загрузка зон показываем на 20:00 сегодня: фоновая занятость плюс реальные заявки.
  const from = startMs(today, '20:00');
  const loads = ZONES.filter((z) => z.bookable !== false).map((z) => {
    const busy = busySeats(BRANCHES[0].id, z.id, from, from + 3600000).size;
    return { z, pct: Math.round((busy / z.seats) * 100) };
  });
  return { todays: todays.length, revenue, top, loads };
}

export function mountAdmin(body, ctx) {
  const st = { authed: load('admin', false, 'sessionStorage'), status: '', branch: '', date: '', q: '', sel: null };

  function login() {
    body.innerHTML = `
      <div class="pad login">
        <span class="card__ico">${icon('lock', 32)}</span>
        <h2 class="h-lg">Панель администратора</h2>
        <p class="muted">Здесь видно, как заявки приходят в клуб. Демо-режим: пароль не нужен.</p>
        <button type="button" class="btn btn--accent" id="a-login">Войти как администратор</button>
        <p class="mono muted small">демо-режим · данные хранятся только в этом браузере</p>
      </div>`;
    $('#a-login', body).addEventListener('click', () => { st.authed = true; save('admin', true, 'sessionStorage'); shell(); });
    $('#a-login', body).focus();
  }

  function shell() {
    body.innerHTML = `
      <div class="admin">
        <div class="kpis" id="a-kpis"></div>
        <div class="toolbar">
          <input type="search" id="a-q" placeholder="Поиск: имя или телефон" aria-label="Поиск по имени и телефону" value="${esc(st.q)}">
          <select id="a-status" aria-label="Статус"><option value="">Все статусы</option>${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
          <select id="a-branch" aria-label="Филиал"><option value="">Все филиалы</option>${BRANCHES.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select>
          <input type="date" id="a-date" aria-label="Дата брони">
          <span class="spacer"></span>
          <button type="button" class="btn btn--ghost btn--sm" id="a-gen">+5 заявок</button>
          <button type="button" class="btn btn--ghost btn--sm" id="a-reset">Сбросить демо-данные</button>
        </div>
        <div class="admin__split">
          <div class="tablewrap"><table class="tbl" id="a-tbl"></table></div>
          <aside class="detail" id="a-detail" aria-live="polite"></aside>
        </div>
      </div>`;
    $('#a-q', body).addEventListener('input', (e) => { st.q = e.target.value; table(); });
    $('#a-status', body).addEventListener('change', (e) => { st.status = e.target.value; table(); });
    $('#a-branch', body).addEventListener('change', (e) => { st.branch = e.target.value; table(); });
    $('#a-date', body).addEventListener('change', (e) => { st.date = e.target.value; table(); });
    $('#a-gen', body).addEventListener('click', () => generateMore(5));
    $('#a-reset', body).addEventListener('click', () => { st.sel = null; resetBookings(); });
    $('#a-tbl', body).addEventListener('click', (e) => {
      const adv = e.target.closest('[data-adv]');
      if (adv) {
        const b = getBookings().find((x) => x.code === adv.dataset.adv);
        if (NEXT[b.status]) setStatus(b.code, NEXT[b.status]);
        return;
      }
      const tr = e.target.closest('tr[data-code]');
      if (tr) { st.sel = tr.dataset.code; table(); detail(); }
    });
    $('#a-tbl', body).addEventListener('keydown', (e) => {
      const tr = e.target.closest('tr[data-code]');
      if (tr && e.key === 'Enter' && !e.target.closest('button')) { st.sel = tr.dataset.code; table(); detail(); }
    });
    $('#a-detail', body).addEventListener('click', (e) => {
      const b = e.target.closest('[data-set]');
      if (b) setStatus(st.sel, b.dataset.set);
    });
    refresh();
  }

  function kpis() {
    const m = metrics(getBookings());
    $('#a-kpis', body).innerHTML = `
      <div class="kpi"><span class="mono muted">ЗАЯВОК СЕГОДНЯ</span><b>${m.todays}</b></div>
      <div class="kpi"><span class="mono muted">ВЫРУЧКА ПО БРОНЯМ</span><b>${money(m.revenue)}</b></div>
      <div class="kpi"><span class="mono muted">ПОПУЛЯРНЫЙ СЛОТ</span><b>${m.top ? esc(m.top[0]) : '—'}</b><span class="mono muted small">${m.top ? m.top[1] + ' заявок' : ''}</span></div>
      <div class="kpi kpi--bars"><span class="mono muted">ЗАГРУЗКА ЗОН В 20:00</span>
        <ul class="bars" role="list">${m.loads.map(({ z, pct }) => `<li><span class="small">${esc(z.short)}</span><i style="--w:${pct}%"></i><b class="mono small">${pct}%</b></li>`).join('')}</ul></div>`;
  }

  function filtered() {
    const q = st.q.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return getBookings().filter((b) => (!st.status || b.status === st.status)
      && (!st.branch || b.branchId === st.branch)
      && (!st.date || b.date === st.date)
      && (!q || b.name.toLowerCase().includes(q) || (digits && b.phone.replace(/\D/g, '').includes(digits))));
  }

  function table() {
    const rows = filtered();
    $('#a-tbl', body).innerHTML = `
      <thead><tr><th>Код</th><th>Создана</th><th>Гость</th><th>Телефон</th><th>Филиал</th><th>Зона</th><th>Места</th><th>Дата и время</th><th class="r">Сумма</th><th>Статус</th></tr></thead>
      <tbody>${rows.length ? rows.map((b) => `
        <tr data-code="${esc(b.code)}" tabindex="0" class="${b.code === st.sel ? 'is-sel' : ''}${b.status === 'new' ? ' is-new' : ''}" aria-selected="${b.code === st.sel}">
          <td class="mono">${esc(b.code)}</td>
          <td class="mono muted">${new Date(b.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Yekaterinburg' })}</td>
          <td>${esc(b.name)}</td><td class="mono">${esc(b.phone)}</td>
          <td>${esc(branchName(b.branchId))}</td><td>${esc(zoneById(b.zoneId).short)}</td>
          <td class="mono">${zoneById(b.zoneId).room ? 'комн.' : esc(b.seats.join(', '))}</td>
          <td class="mono">${esc(b.date.slice(5).split('-').reverse().join('.'))} ${esc(b.start)}</td>
          <td class="r mono">${money(b.total)}</td><td>${badge(b)}</td></tr>`).join('') : '<tr><td colspan="10" class="empty">Заявок нет. Сделайте бронь в «Бронь.exe» или нажмите «+5 заявок».</td></tr>'}</tbody>`;
  }

  function detail() {
    const b = getBookings().find((x) => x.code === st.sel);
    const box = $('#a-detail', body);
    if (!b) { box.innerHTML = '<p class="muted pad">Выберите заявку в таблице, чтобы увидеть контакты и сменить статус.</p>'; return; }
    const z = zoneById(b.zoneId);
    box.innerHTML = `
      <p class="mono muted">ЗАЯВКА</p>
      <h3 class="h-md">${esc(b.code)} ${badge(b)}</h3>
      <dl class="kv">
        <div><dt>Гость</dt><dd>${esc(b.name)}</dd></div>
        <div><dt>Телефон</dt><dd class="mono">${esc(b.phone)}</dd></div>
        <div><dt>Филиал</dt><dd>${esc(branchName(b.branchId))}</dd></div>
        <div><dt>Зона</dt><dd>${esc(z.name)}</dd></div>
        <div><dt>Места</dt><dd>${z.room ? 'комната целиком' : esc(b.seats.map((n) => '№' + n).join(', '))}</dd></div>
        <div><dt>Когда</dt><dd>${esc(dateLabel(b.date))}, ${esc(b.start)}–${esc(b.end)} (${minutesText(b.minutes)})</dd></div>
        <div><dt>Сумма</dt><dd>${money(b.total)}${b.cashback ? ` · кешбэк ${b.cashback}%` : ''}</dd></div>
        ${b.newGuest ? '<div><dt>Особое</dt><dd>новый гость, 2 часа в подарок</dd></div>' : ''}
        ${b.comment ? `<div><dt>Комментарий</dt><dd>${esc(b.comment)}</dd></div>` : ''}
      </dl>
      <div class="row">
        <a class="btn btn--ghost btn--sm" href="${telHref(b.phone)}">${icon('phone', 14)} Позвонить</a>
        <a class="btn btn--ghost btn--sm" href="${esc(CLUB.telegram)}" target="_blank" rel="noopener">${icon('send', 14)} Написать в Telegram</a>
      </div>
      <button type="button" class="btn btn--accent" data-set="arrived">${icon('check', 16)} Отметить как пришедшего</button>
      <div class="seg seg--wrap" role="group" aria-label="Сменить статус">
        ${Object.entries(STATUSES).map(([k, v]) => `<button type="button" class="seg__b" data-set="${k}" aria-pressed="${b.status === k}">${v.label}</button>`).join('')}
      </div>`;
  }

  function refresh() { kpis(); table(); detail(); }

  if (st.authed) shell(); else login();

  // Живое обновление: свои изменения и заявки из соседней вкладки.
  const off = onStoreEvent((ev) => {
    if (!st.authed || !$('#a-tbl', body)) return;
    refresh();
    if (ev.type === 'new') {
      const row = $(`tr[data-code="${ev.code}"]`, body);
      row?.classList.add('flash');
    }
  });
  return off;
}
