// Разделы: Акции (с «Колесом удачи»), Филиалы (карта), Отзывы (чат), Турнир (отсчёт и заявка команды).
import { CLUB, BRANCHES, PROMO_LIST, WHEEL_PRIZES, REVIEWS, TOURNAMENT, PROMO, NEWS, FAQ } from './data.js';
import { wallNow, ymd, isoDay } from './pricing.js';
import { esc, $, $$, toast, maskPhone, phoneValid, telHref, plural, prefersReducedMotion } from './util.js';
import { load, save } from './store.js';
import { icon } from './icons.js';

// ---------- Акции ----------
const DAYS = [['Пн', 1], ['Вт', 2], ['Ср', 3], ['Чт', 4], ['Пт', 5], ['Сб', 6], ['Вс', 7]];
const DAY_FULL = { 1: 'понедельник', 2: 'вторник', 3: 'среду', 4: 'четверг', 5: 'пятницу', 6: 'субботу', 7: 'воскресенье' };
const WHEEL_COLORS = ['#9d5cff', '#9b8cff', '#ff5cc8', '#a78bfa'];

/** Ближайший день кешбэка после сегодняшнего: «в среду», «в понедельник»… */
function nextCashbackDay(today) {
  for (let i = 1; i <= 7; i += 1) {
    const d = ((today + i - 1) % 7) + 1;
    if (PROMO.cashbackDays.includes(d)) return DAY_FULL[d];
  }
  return DAY_FULL[PROMO.cashbackDays[0]];
}

export const promo = {
  render() {
    const today = isoDay(ymd(wallNow()));
    const cb = PROMO.cashbackDays;
    const vk = PROMO_LIST.find((p) => p.id === 'vk');
    return `
    <div class="pad pr">
      <article class="pr-card pr-new">
        <div class="pr-big"><b>${PROMO.freeHoursNewGuest}</b><span>${plural(PROMO.freeHoursNewGuest, ['час', 'часа', 'часов'])}<br>в подарок</span></div>
        <div class="pr-grow">
          <p class="mono pr-tag">Новым гостям</p>
          <h3 class="h-md">Регистрация, пополнение от 100 ₽ и два часа игры бесплатно</h3>
          <button type="button" class="btn btn--accent" data-open="book">Забронировать</button>
        </div>
      </article>

      <article class="pr-card pr-cash">
        <div class="pr-big"><b>${PROMO.cashbackPercent}%</b><span>кешбэк<br>на баланс</span></div>
        <div class="pr-cash__week">
          <p class="mono pr-tag pr-tag--cyan">Пн, вт и ср</p>
          <h3 class="h-md">Возвращаем всю сумму брони на баланс клуба</h3>
          <ol class="pr-week" aria-label="Дни недели, в которые действует кешбэк">
            ${DAYS.map(([n, d]) => `<li class="${cb.includes(d) ? 'is-on' : ''}${d === today ? ' is-today' : ''}"><span>${n}</span>${cb.includes(d) ? '<b aria-label="кешбэк действует">✓</b>' : '<i aria-hidden="true"></i>'}</li>`).join('')}
          </ol>
          <p class="muted small pr-cash__note">${cb.includes(today) ? 'Сегодня кешбэк действует: бронь вернётся на баланс.' : `Сегодня кешбэка нет. Ближайший — в ${esc(nextCashbackDay(today))}.`} Это не скидка: потратить кешбэк можно на следующие игры.</p>
        </div>
      </article>

      <div class="pr-pair">
      <article class="pr-card pr-code">
        <p class="mono pr-tag pr-tag--hot">Промокод</p>
        <h3 class="h-md">${esc(PROMO.codeText[0].toUpperCase() + PROMO.codeText.slice(1))}</h3>
        <div class="pr-codebox"><span id="pr-code">${esc(PROMO.code)}</span><button type="button" class="btn btn--ghost btn--sm" id="pr-copy">${icon('copy', 14)} Копировать</button></div>
        <p class="muted small">Введите код на последнем шаге брони. Демо-код для витрины.</p>
      </article>

      <article class="pr-card pr-vk">
        <p class="mono pr-tag">Баллы в VK</p>
        <h3 class="h-md">${esc(vk?.title || 'Баллы активности')}</h3>
        <ol class="pr-steps">
          <li><b>1</b>Лайки и репосты в сообществе</li>
          <li><b>2</b>Участие в розыгрышах и конкурсах</li>
          <li><b>3</b>Баллы меняем на часы игры</li>
        </ol>
      </article>
      </div>

      <article class="pr-card pr-wheel" aria-labelledby="wheel-t">
        <div class="pr-wheelbox">
          <svg class="pr-wheelsvg" id="wheel-svg" viewBox="-104 -104 208 208" aria-hidden="true"></svg>
          <i class="pr-pin" aria-hidden="true"></i>
        </div>
        <div class="pr-grow">
          <p class="mono pr-tag pr-tag--cyan">Колесо удачи</p>
          <h3 class="h-md" id="wheel-t">Крутите колесо при пополнении от ${PROMO.wheelMin} ₽</h3>
          <p class="muted small">Одно вращение в день. В демо колесо крутится бесплатно.</p>
          <button type="button" class="btn btn--accent" id="wheel-go">Крутить</button>
          <p class="pr-result" id="wheel-res" aria-live="polite"></p>
          <details class="pr-prizes" open>
            <summary>Все призы колеса (${WHEEL_PRIZES.length})</summary>
            <ol class="pr-legend">${WHEEL_PRIZES.map((p, i) => `<li><i style="--c:${WHEEL_COLORS[i % WHEEL_COLORS.length]}">${i + 1}</i>${esc(p)}</li>`).join('')}</ol>
          </details>
        </div>
      </article>
    </div>`;
  },
  mount(root) {
    const svg = $('#wheel-svg', root);
    const n = WHEEL_PRIZES.length;
    const p = (a, r) => `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
    svg.innerHTML = `<circle r="102" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="2"/><g id="wheel-g">${WHEEL_PRIZES.map((_, i) => {
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
      const mid = (a0 + a1) / 2;
      const col = WHEEL_COLORS[i % WHEEL_COLORS.length];
      const tx = Math.cos(mid) * 68;
      const ty = Math.sin(mid) * 68;
      return `<path d="M0,0 L${p(a0, 98)} A98,98 0 0 1 ${p(a1, 98)} Z" fill="${col}" fill-opacity=".22" stroke="${col}" stroke-opacity=".7" stroke-width="1.5"/>
        <text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="#fff" font-size="16" font-weight="800" font-family="Unbounded, sans-serif" text-anchor="middle" dominant-baseline="central" transform="rotate(${((mid * 180) / Math.PI + 90).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})">${i + 1}</text>`;
    }).join('')}</g><circle r="14" fill="#07050d" stroke="#9d5cff" stroke-width="3"/>`;
    const g = $('#wheel-g', root);
    const res = $('#wheel-res', root);
    const today = ymd(wallNow());
    const done = load('wheel');
    if (done?.date === today) res.innerHTML = `Сегодня уже выпало: <b>${esc(done.prize)}</b>`;
    let angle = 0;
    let busy = false;
    $('#wheel-go', root).addEventListener('click', () => {
      if (busy) return;
      busy = true;
      res.textContent = '';
      const idx = Math.floor(Math.random() * n);
      // Указатель сверху: сектор idx должен остановиться под ним.
      angle += 360 * 5 + (360 - ((idx + 0.5) / n) * 360) - (angle % 360);
      g.style.transition = prefersReducedMotion() ? 'none' : 'transform 3.4s cubic-bezier(.12,.7,.1,1)';
      g.style.transform = `rotate(${angle}deg)`;
      setTimeout(() => {
        busy = false;
        save('wheel', { date: today, prize: WHEEL_PRIZES[idx] });
        res.innerHTML = `Выпал сектор ${idx + 1}: <b>${esc(WHEEL_PRIZES[idx])}</b>`;
        toast(`<b>Колесо удачи</b><br>${esc(WHEEL_PRIZES[idx])}`);
      }, prefersReducedMotion() ? 0 : 3500);
    });
    // На телефоне список призов свёрнут: колесо и кнопка важнее.
    if (window.matchMedia('(max-width: 760px)').matches) $('.pr-prizes', root)?.removeAttribute('open');
    $('#pr-copy', root).addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(PROMO.code); toast(`<b>Скопировано</b><br>${esc(PROMO.code)}`); } catch { toast('Не удалось скопировать', 'hot'); }
    });
  },
};

// ---------- Филиалы (с картой 2ГИС) ----------
const gisFirm = (b) => `https://2gis.ru/chelyabinsk/firm/${b.gis.id}`;
const gisRoute = (b) => `https://2gis.ru/chelyabinsk/routeSearch/rsType/car/to/${b.gis.lon},${b.gis.lat}`;
/** Виджет карты 2ГИС: центр и метка на выбранном филиале. */
const gisWidget = (b) => `https://widgets.2gis.com/widget?type=firmsonmap&options=${encodeURIComponent(JSON.stringify({
  pos: { lat: b.gis.lat, lon: b.gis.lon, zoom: 16 }, opt: { city: 'chelyabinsk' }, org: b.gis.id,
}))}`;
const rateText = (n) => String(n).replace('.', ',');

export const branches = {
  render: () => `
    <div class="pad branches">
      <figure class="map">
        <div class="map__live" id="map-live">
          <button type="button" class="btn btn--ghost map__show" id="map-show">Показать карту</button>
          <iframe id="map-frame" title="Карта филиалов в 2ГИС" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>
        </div>
        <figcaption class="map__bar">
          <span class="mono muted small" id="map-cap"></span>
          <a class="btn btn--accent btn--sm" href="${CLUB.gis.url}" target="_blank" rel="noopener noreferrer">Открыть в 2ГИС</a>
        </figcaption>
      </figure>
      <ul class="branch-list">
        ${BRANCHES.map((b, i) => `
          <li class="card branch" data-b="${b.id}">
            <span class="mono accent">0${i + 1}</span>
            <h3 class="h-sm">${esc(b.address)}</h3>
            <p class="muted">${esc(b.district)}</p>
            <p class="gis"><span class="gis__rate">★ ${rateText(b.gis.rating)}</span><span class="muted">${b.gis.count.toLocaleString('ru-RU')} ${plural(b.gis.count, ['оценка', 'оценки', 'оценок'])} в 2ГИС</span></p>
            <p><b>Как найти:</b> ${esc(b.hint)}</p>
            <p class="row">
              <a class="btn btn--ghost btn--sm" href="${telHref(b.phone)}">${icon('phone', 14)} ${esc(b.phone)}</a>
              <button type="button" class="btn btn--accent btn--sm" data-open="book" data-branch="${b.id}">Забронировать здесь</button>
            </p>
            <p class="row">
              <a class="btn btn--ghost btn--sm" href="${gisFirm(b)}" target="_blank" rel="noopener noreferrer">Открыть в 2ГИС</a>
              <a class="btn btn--ghost btn--sm" href="${gisRoute(b)}" target="_blank" rel="noopener noreferrer">Маршрут</a>
            </p>
          </li>`).join('')}
      </ul>
      <p class="mono muted small">${esc(CLUB.email)} · <a href="${esc(CLUB.vk)}" target="_blank" rel="noopener">ВКонтакте</a> · <a href="${esc(CLUB.telegram)}" target="_blank" rel="noopener">Telegram</a> · ${CLUB.hours}</p>
    </div>`,
  mount(root) {
    const frame = $('#map-frame', root);
    const cap = $('#map-cap', root);
    let current = BRANCHES[0];
    const phone = window.matchMedia('(max-width: 760px)').matches;
    // На телефоне карта грузится по нажатию: она тяжёлая, а список филиалов и маршрут уже есть ниже.
    const showBtn = $('#map-show', root);
    const setMapVisible = (on) => { frame.hidden = !on; showBtn.hidden = on; if (on) load2gis(current); };
    const load2gis = (b) => {
      const url = gisWidget(b);
      if (frame.dataset.src !== url) { frame.dataset.src = url; frame.src = url; }
    };
    showBtn.addEventListener('click', () => setMapVisible(true));
    const show = (b) => {
      current = b;
      if (!frame.hidden) load2gis(b);
      cap.textContent = b.address;
      $$('.branch', root).forEach((p) => p.classList.toggle('is-on', p.dataset.b === b.id));
    };
    $$('.branch', root).forEach((p) => {
      const pick = () => show(BRANCHES.find((x) => x.id === p.dataset.b));
      p.addEventListener('mouseenter', pick);
      p.addEventListener('focusin', pick);
    });
    setMapVisible(!phone);
    show(BRANCHES[0]);
  },
};

// ---------- Отзывы: мессенджер ----------
const stars = (n) => `<span class="stars" role="img" aria-label="Рейтинг ${n} из 5">${Array.from({ length: 5 }, () => icon('star', 14)).join('')}</span>`;
const reviewDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export const reviews = {
  render: () => `
    <div class="chat">
      <header class="chat__head">
        <div><b class="h-sm">Чат гостей</b><br><span class="mono muted small">Отзывы с сайта клуба</span></div>
        <div class="chat__rate"><b>${rateText(CLUB.rating)}</b>${stars(5)}<span class="mono muted small">${CLUB.ratingCount.toLocaleString('ru-RU')} ${plural(CLUB.ratingCount, ['оценка', 'оценки', 'оценок'])} в 2ГИС</span></div>
      </header>
      <ol class="chat__list">
        ${REVIEWS.map((r, i) => `
          <li class="msg${i % 3 === 2 ? ' msg--alt' : ''}">
            <span class="msg__av" aria-hidden="true">${esc(r.name[0].toUpperCase())}</span>
            <div class="msg__b"><b class="mono">${esc(r.name)}</b><p>${esc(r.text)}</p>
              <span class="mono muted small"><time datetime="${esc(r.date)}">${esc(reviewDate(r.date))}</time>${r.score ? ` · <span class="msg__score">${esc(r.score)}</span>` : ''}</span></div>
          </li>`).join('')}
      </ol>
      <button type="button" class="btn btn--ghost chat__more" id="chat-more">Показать все отзывы (${REVIEWS.length})</button>
      <p class="chat__foot mono muted small">Настоящие отзывы гостей с сайта клуба (2020 год), имена сокращены. Свежие отзывы из 2ГИС появятся здесь.</p>
    </div>`,
  mount(root) {
    const list = $('.chat__list', root);
    const more = $('#chat-more', root);
    more.addEventListener('click', () => { list.classList.add('is-all'); more.hidden = true; });
  },
};

// ---------- Турнир ----------
function tournamentTarget() {
  const now = wallNow();
  let t = Date.UTC(now.getUTCFullYear(), TOURNAMENT.month - 1, TOURNAMENT.day, TOURNAMENT.hour);
  if (t < now.getTime()) t = Date.UTC(now.getUTCFullYear() + 1, TOURNAMENT.month - 1, TOURNAMENT.day, TOURNAMENT.hour);
  return t;
}

export const tournament = {
  render: () => `
    <div class="pad tour">
      <div class="tour__banner">
        <p class="mono accent">ТУРНИР · ${esc(TOURNAMENT.title)}</p>
        <h2 class="h-xl">3 ноября, ${String(TOURNAMENT.hour).padStart(2, '0')}:00</h2>
        <div class="count" id="t-count" role="timer" aria-label="До начала турнира"></div>
      </div>
      <ul class="prizes">${TOURNAMENT.prizes.map(([k, v, bonus]) => `<li><span class="mono muted">${esc(k)}</span><b>${esc(v)}</b>${bonus ? `<em class="small muted">+ ${esc(bonus)} на баланс</em>` : ''}</li>`).join('')}</ul>
      <form class="form" id="t-form" novalidate>
        <h3 class="h-sm">Записать команду (демо)</h3>
        <label class="field"><span>Название команды</span><input name="team" required autocomplete="off"><em class="err" aria-live="polite"></em></label>
        <label class="field"><span>Капитан</span><input name="captain" required autocomplete="name"><em class="err" aria-live="polite"></em></label>
        <label class="field"><span>Телефон</span><input name="phone" required inputmode="tel" autocomplete="tel" placeholder="+7 (___) ___-__-__"><em class="err" aria-live="polite"></em></label>
        <button class="btn btn--accent" type="submit">Записать команду</button>
        <p class="ok" id="t-ok" aria-live="polite"></p>
      </form>
    </div>`,
  mount(root) {
    const target = tournamentTarget();
    const box = $('#t-count', root);
    const tick = () => {
      const left = Math.max(0, target - wallNow().getTime());
      const d = Math.floor(left / 864e5);
      const h = Math.floor((left % 864e5) / 36e5);
      const m = Math.floor((left % 36e5) / 6e4);
      const s = Math.floor((left % 6e4) / 1e3);
      const cell = (n, w) => `<span><b>${String(n).padStart(2, '0')}</b><i>${w}</i></span>`;
      box.innerHTML = cell(d, 'дн') + cell(h, 'ч') + cell(m, 'мин') + cell(s, 'сек');
    };
    tick();
    const timer = setInterval(tick, 1000);

    const form = $('#t-form', root);
    const phone = form.elements.phone;
    phone.addEventListener('input', () => { phone.value = maskPhone(phone.value); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let ok = true;
      for (const name of ['team', 'captain', 'phone']) {
        const input = form.elements[name];
        const bad = name === 'phone' ? !phoneValid(input.value) : !input.value.trim();
        input.closest('.field').classList.toggle('is-bad', bad);
        input.setAttribute('aria-invalid', bad);
        input.nextElementSibling.textContent = bad ? (name === 'phone' ? 'Введите номер полностью' : 'Заполните поле') : '';
        if (bad && ok) { input.focus(); ok = false; }
      }
      if (!ok) return;
      const teams = load('teams', []);
      teams.push({ team: form.elements.team.value.trim(), captain: form.elements.captain.value.trim(), phone: phone.value, at: Date.now() });
      save('teams', teams);
      $('#t-ok', root).textContent = `Команда «${form.elements.team.value.trim()}» записана. Это демо: данные остались только в вашем браузере.`;
      toast(`<b>Команда записана</b><br>${esc(form.elements.team.value.trim())}`);
      form.reset();
    });
    return () => clearInterval(timer);
  },
};

// ---------- Новости: карусель ----------
const newsDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export const news = {
  render: () => `
    <div class="pad news" role="region" aria-roledescription="карусель" aria-label="Новости клуба">
      <div class="news__top">
        <span class="mono muted" id="news-pos" aria-live="polite"></span>
        <div class="news__ctl">
          <button type="button" class="news__btn" id="news-prev" aria-label="Предыдущие новости">${icon('back', 20)}</button>
          <button type="button" class="news__btn" id="news-next" aria-label="Следующие новости">${icon('next', 20)}</button>
        </div>
      </div>
      <div class="news__track" id="news-track" tabindex="0" aria-label="Список новостей. Листайте стрелками, колесом или перетаскиванием">
        ${NEWS.map((n) => `
          <article class="card news__item">
            <div class="news__meta"><span class="badge">${esc(n.tag)}</span><time class="mono muted" datetime="${esc(n.date)}">${esc(newsDate(n.date))}</time></div>
            <h3 class="h-md">${esc(n.title)}</h3>
            <p>${esc(n.text)}</p>
          </article>`).join('')}
      </div>
      <div class="news__bar" aria-hidden="true"><i id="news-fill"></i></div>
    </div>`,
  mount(root) {
    const track = $('#news-track', root);
    const prev = $('#news-prev', root);
    const next = $('#news-next', root);
    const pos = $('#news-pos', root);
    const fill = $('#news-fill', root);
    const items = $$('.news__item', root);
    const gap = () => parseFloat(getComputedStyle(track).columnGap) || 14;
    const step = () => (items[0]?.offsetWidth || 300) + gap();
    const update = () => {
      const w = track.clientWidth;
      if (!w) return; // блок скрыт
      const first = Math.min(items.length, Math.round(track.scrollLeft / step()) + 1);
      const shown = Math.max(1, Math.floor((w + gap()) / step()));
      const last = Math.min(items.length, first + shown - 1);
      pos.textContent = `${first}–${last} из ${items.length}`;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft + w >= track.scrollWidth - 2;
      fill.style.width = `${Math.min(100, ((track.scrollLeft + w) / track.scrollWidth) * 100)}%`;
    };
    const go = (dir) => track.scrollBy({ left: dir * step() * Math.max(1, Math.floor(track.clientWidth / step())), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    prev.addEventListener('click', () => go(-1));
    next.addEventListener('click', () => go(1));
    track.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(update).observe(track);

    // Перетаскивание мышью (на сенсорных экранах работает обычная прокрутка).
    let drag = null;
    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button > 0) return;
      drag = { x: e.clientX, left: track.scrollLeft, moved: false };
    });
    track.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 5) return;
      drag.moved = true;
      track.classList.add('is-drag');
      track.scrollLeft = drag.left - dx;
    });
    const end = () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      track.classList.remove('is-drag');
      if (moved) { // после перетаскивания докручиваем до ближайшей карточки
        const target = Math.round(track.scrollLeft / step()) * step();
        track.scrollTo({ left: target, behavior: 'smooth' });
      }
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointerleave', end);
    update();
  },
};

// ---------- Частые вопросы ----------
export const faq = {
  render: () => `
    <div class="pad faq">
      ${FAQ.map((f, i) => `
        <details class="faq__item" name="faq"${i === 0 ? ' open' : ''}>
          <summary>${esc(f.q)}</summary>
          <p>${esc(f.a)}</p>
        </details>`).join('')}
      <p class="mono muted small">Не нашли ответ? Позвоните: <a href="${telHref(BRANCHES[0].phone)}">${esc(BRANCHES[0].phone)}</a>, круглосуточно.</p>
    </div>`,
  mount(root) {
    // Запасной вариант для браузеров без name у <details>: открыт только один вопрос.
    const items = $$('.faq__item', root);
    // На телефоне первый вопрос тоже свёрнут: так виден весь список.
    if (window.matchMedia('(max-width: 760px)').matches) items.forEach((d) => d.removeAttribute('open'));
    items.forEach((d) => d.addEventListener('toggle', () => { if (d.open) items.forEach((o) => { if (o !== d) o.open = false; }); }));
  },
};
