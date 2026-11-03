// Разделы сайта: Главная, Тарифы, Железо, Зоны.
// Каждый раздел — { render() → html, mount(root) → очистка }. Один и тот же раздел
// показывается и в окне «ОС», и в «обычном виде», поэтому контент не дублируется.
import { CLUB, BRANCHES, ZONES, EXTRA_ZONES, HARDWARE } from './data.js';
import { packTable, bestCombo, packPrice, wallNow, ymd, isWeekend, money } from './pricing.js';
import { esc, $, $$, countUp, plural } from './util.js';
import { icon } from './icons.js';

// ---------- Главная ----------
export const home = {
  render: () => `
    <div class="pad home">
      <p class="mono muted">ДОБРО ПОЖАЛОВАТЬ В TOPSKILLOS</p>
      <h2 class="h-xl">Играй по-крупному.<br><span class="accent">Платишь как за кофе.</span></h2>
      <p class="lead">Открыто 24/7. Даже когда ты думал, что уже поздно. Новичкам два часа в подарок.</p>
      <ul class="stats" aria-label="Клуб в цифрах">
        <li><b class="stat__n"><span data-count="24">24</span>/7</b><span>круглосуточно</span></li>
        <li><b class="stat__n"><span data-count="${CLUB.rating}" data-dec="1">${CLUB.rating}</span> ★</b><span>рейтинг в 2ГИС, ${CLUB.ratingCount.toLocaleString('ru-RU')} оценок</span></li>
        <li><b class="stat__n"><span data-count="${BRANCHES.length}">${BRANCHES.length}</span></b><span>${plural(BRANCHES.length, ['филиал', 'филиала', 'филиалов'])} в сети</span></li>
      </ul>
      <div class="row">
        <button type="button" class="btn btn--accent" data-open="book">Забронировать место</button>
        <button type="button" class="btn btn--ghost" data-open="tariffs">Смотреть тарифы</button>
      </div>
      <p class="mono muted small">Формат нового клуба: игровые ПК, кибершкола с тренерами, лаунж-зоны с PS5, кинозал и VR.</p>
    </div>`,
  mount(root) {
    $$('[data-count]', root).forEach((el) => countUp(el, Number(el.dataset.count), { decimals: Number(el.dataset.dec || 0) }));
  },
};

// ---------- Тарифы ----------
const tariffZones = ZONES;

export const tariffs = {
  render() {
    const weekend = isWeekend(ymd(wallNow()));
    return `
    <div class="pad tariffs">
      <div class="row row--between">
        <div role="tablist" aria-label="Зоны" class="tabs" id="t-zones">
          ${tariffZones.map((z, i) => `<button type="button" role="tab" class="tab" id="tz-${z.id}" data-zone="${z.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(z.short)}</button>`).join('')}
        </div>
        <div class="seg" role="group" aria-label="Тип дня">
          <button type="button" class="seg__b" data-day="week" aria-pressed="${!weekend}">Будни</button>
          <button type="button" class="seg__b" data-day="weekend" aria-pressed="${weekend}">Выходные</button>
        </div>
      </div>
      <div id="t-panel" role="tabpanel" aria-live="polite"></div>
      <section class="calc" aria-labelledby="calc-t">
        <h3 id="calc-t" class="h-sm">Сколько часов хочу играть</h3>
        <label class="range"><input type="range" id="calc-h" min="1" max="12" value="4" aria-describedby="calc-out"><span class="mono"><b id="calc-hv">4</b> ч</span></label>
        <p id="calc-out" class="calc__out" aria-live="polite"></p>
      </section>
    </div>`;
  },
  mount(root) {
    let zone = tariffZones[0].id;
    let weekend = isWeekend(ymd(wallNow()));
    const panel = $('#t-panel', root);
    const draw = () => {
      const z = tariffZones.find((x) => x.id === zone);
      const rows = packTable(zone, weekend);
      panel.setAttribute('aria-labelledby', `tz-${zone}`);
      panel.innerHTML = `
        ${weekend ? `<p class="badge badge--hot">Тариф выходного дня</p>` : ''}
        ${rows.length ? `<div class="packs">${rows.map((r) => `
          <div class="pack${r.best ? ' pack--best' : ''}">
            ${r.best ? '<span class="pack__flag">выгодно</span>' : ''}
            <span class="pack__name">${esc(r.label)}</span>
            <b class="pack__price">${money(r.price)}</b>
            <span class="mono muted">${r.perHour} ₽/час</span>
          </div>`).join('')}
        </div>` : '<p class="muted pack__empty">На выбранный тип дня цены для этой зоны не указаны.</p>'}
        <p class="mono muted small">${esc(z.name)}. Цена за место${z.room ? ' (за комнату)' : ''}.${z.note ? ` ${esc(z.note)}` : ''}</p>`;
      calc();
    };
    const calc = () => {
      const h = Number($('#calc-h', root).value);
      $('#calc-hv', root).textContent = h;
      const res = bestCombo(zone, weekend, h);
      $('#calc-out', root).innerHTML = res
        ? `<b>${money(res.cost)}</b> <span class="muted">— выгоднее всего взять ${esc(res.parts.map((p) => `${p.n} × ${p.label}`).join(' + '))}</span>`
        : '<span class="muted">Для этой зоны и типа дня обычных пакетов нет.</span>';
    };
    const tabs = $$('[role=tab]', root);
    const pick = (btn) => {
      zone = btn.dataset.zone;
      tabs.forEach((t) => { const on = t === btn; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
      draw();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => pick(t));
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const nxt = tabs[(i + d + tabs.length) % tabs.length];
        nxt.focus();
        pick(nxt);
      });
    });
    $$('[data-day]', root).forEach((b) => b.addEventListener('click', () => {
      weekend = b.dataset.day === 'weekend';
      $$('[data-day]', root).forEach((x) => x.setAttribute('aria-pressed', x === b));
      draw();
    }));
    $('#calc-h', root).addEventListener('input', calc);
    draw();
  },
};

// ---------- Железо ----------
const HW_IMG = 'assets/pc.webp'; // фото без фона, см. tools/cutout.sh
export const hardware = {
  render: () => `
    <div class="pad hw">
      <figure class="hw__img"><img src="${HW_IMG}" alt="Игровой компьютер в белом корпусе" decoding="async"></figure>
      <div>
        <p class="badge badge--cyan">${esc(HARDWARE.note)}</p>
        <h2 class="h-lg">Железо, на котором не лагает</h2>
        <dl class="spec">
          ${HARDWARE.items.map(([k, v, demo]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}${demo ? ' <em class="muted">(демо)</em>' : ''}</dd></div>`).join('')}
        </dl>
        <p class="mono muted small">Видеокарты — по данным клуба. Остальное — заглушки до уточнения.</p>
      </div>
    </div>`,
};

// ---------- Зоны ----------
/** Схема зоны: сетка квадратов-мест. */
function plan(n, room) {
  const cols = room ? 1 : Math.min(n, n > 10 ? 7 : 6);
  const rows = Math.ceil(n / cols);
  const cells = Array.from({ length: n }, (_, i) => `<rect x="${(i % cols) * 14}" y="${Math.floor(i / cols) * 14}" width="10" height="10" rx="2"/>`).join('');
  const w = cols * 14;
  const h = rows * 14;
  return `<svg class="plan" viewBox="0 0 ${Math.max(w, 24)} ${Math.max(h, 24)}" role="img" aria-label="Схема: ${n} ${plural(n, ['место', 'места', 'мест'])}">${cells}</svg>`;
}

export const zones = {
  render: () => `
    <div class="pad zones">
      ${ZONES.map((z) => `
        <article class="card">
          ${plan(z.seats, z.room)}
          <h3 class="h-sm">${esc(z.name)}</h3>
          <p>${esc(z.desc)}</p>
          <p class="mono muted">${z.seats} ${plural(z.seats, ['место', 'места', 'мест'])} · от ${money(packPrice(z.id, 'h1', false))}/час${z.wholeHall ? ' · можно арендовать целиком' : ''}</p>
        </article>`).join('')}
      ${EXTRA_ZONES.map((z) => `
        <article class="card card--extra">
          <span class="card__ico">${icon(z.id === 'cinema' ? 'film' : z.id === 'vr' ? 'vr' : z.id === 'school' ? 'school' : 'grid', 28)}</span>
          <h3 class="h-sm">${esc(z.name)}</h3>
          <p>${esc(z.desc)}</p>
        </article>`).join('')}
    </div>`,
};
