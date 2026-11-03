// «Обычный сайт»: современный одностраничник из тех же данных, что и окна.
// Первый экран: слева заголовок и кнопки, справа фото зоны. Вкладки зон меняют фото и цветовую тему.
import { CLUB, BRANCHES, FAQ } from './data.js';
import * as S from './sections.js';
import * as C from './community.js';
import { money, packPrice } from './pricing.js';
import { esc, telHref, prefersReducedMotion, countUp } from './util.js';
import { icon } from './icons.js';

const PARTS = [
  ['tariffs', 'Тарифы', S.tariffs],
  ['zones', 'Зоны', S.zones],
  ['hardware', 'Железо', S.hardware],
  ['promo', 'Акции', C.promo],
  ['news', 'Новости', C.news],
  ['tournament', 'Турнир', C.tournament],
  ['branches', 'Филиалы', C.branches],
  ['reviews', 'Отзывы', C.reviews],
  ['faq', 'Вопросы', C.faq],
];

// Зоны на первом экране: тема, фото (вырезано без фона, см. tools/cutout.sh) и подпись.
const SLIDES = [
  { zone: 'hall', theme: 'lime', name: 'Общий зал', img: 'assets/pc.webp', alt: 'Игровой компьютер в белом корпусе', cls: 'pc', text: 'Игровые ПК в открытом зале. Для одиночной игры и компании до 6 человек.' },
  { zone: 'boot', theme: 'cyan', name: 'Bootcamp', img: 'assets/head.webp', alt: 'Беспроводная игровая гарнитура', cls: 'head', text: 'Закрытый зал на 6 мест. Можно арендовать целиком для команды или компании.' },
  { zone: 'vip75', theme: 'hot', name: 'VIP PS5', img: 'assets/pad.webp', alt: 'Белый геймпад', cls: 'pad', text: 'Своя комната, PS5 и телевизор 75". Диваны, звук, дверь на замок.' },
];

let built = false;

function heroHtml() {
  return `
  <section class="hero" id="cl-top" data-theme="lime" aria-label="Компьютерный клуб TOPSKILL">
    <div class="hero__bg" aria-hidden="true"></div>
    <div class="hero__grid">
      <div class="hero__copy">
        <p class="hero__eyebrow mono">Челябинск · открыто ${CLUB.hours}</p>
        <h1 class="hero__h1" aria-label="Играй на максимуме"><span class="ln" aria-hidden="true"><span>Играй на</span></span> <span class="ln" aria-hidden="true"><span class="grad">максимуме</span></span></h1>
        <p class="hero__lead">Мощные ПК, PS5 и Bootcamp для команд в центре города. Новичкам два часа в подарок.</p>
        <div class="hero__cta">
          <button type="button" class="btn btn--accent" data-open="book">Забронировать место</button>
          <a class="btn btn--ghost" href="#cl-tariffs">Смотреть тарифы</a>
          <button type="button" class="btn btn--ghost hero__os" data-mode="os">${icon('grid', 18)} Открыть как приложение TopskillOS</button>
        </div>
        <div class="hero__zone" aria-live="polite">
          <b class="hero__name" id="hero-name"></b>
          <p class="hero__text" id="hero-text"></p>
          <p class="hero__price" id="hero-price"></p>
        </div>
        <p class="hero__hint mono" aria-hidden="true">листайте, чтобы сменить зону</p>
        <div class="hero__tabs" role="tablist" aria-label="Зоны клуба">
          ${SLIDES.map((s, i) => `<button type="button" role="tab" class="hero__tab" id="hero-tab-${i}" data-go="${i}" aria-selected="${i === 0}" aria-controls="hero-shot-${i}" tabindex="${i === 0 ? 0 : -1}">${esc(s.name)}</button>`).join('')}
        </div>
      </div>
      <div class="hero__stage">
        <div class="hero__glow" aria-hidden="true"></div>
        ${SLIDES.map((s, i) => `<figure class="shot shot--${s.cls}${i === 0 ? ' is-on' : ''}" id="hero-shot-${i}" role="tabpanel" aria-labelledby="hero-tab-${i}" ${i === 0 ? '' : 'aria-hidden="true"'}><div class="shot__tilt"><img src="${s.img}" alt="${esc(s.alt)}" decoding="async"></div></figure>`).join('')}
      </div>
    </div>
  </section>`;
}

function statsHtml() {
  return `
  <section class="cl-stats" aria-label="Клуб в цифрах">
    <div><b><span data-count="24">24</span>/7</b><span>круглосуточно</span></div>
    <div><b><span data-count="${CLUB.rating}" data-dec="1">${CLUB.rating}</span> ★</b><span>рейтинг в 2ГИС, ${CLUB.ratingCount.toLocaleString('ru-RU')} оценок</span></div>
    <div><b><span data-count="${BRANCHES.length}">${BRANCHES.length}</span></b><span>филиала в Челябинске</span></div>
    <div><b>2 ч</b><span>в подарок новичкам</span></div>
  </section>`;
}

/** Вкладки зон: стрелки ← → переключают, как в обычном tablist. */
function setupHero(root) {
  const hero = root.querySelector('.hero');
  const tabs = [...root.querySelectorAll('.hero__tab')];
  const shots = [...root.querySelectorAll('.shot')];
  let current = -1;
  const show = (i, focus = false) => {
    // Повторный клик по уже выбранной зоне ничего не перезапускает (ни фото, ни анимацию текста).
    if (i === current) { if (focus) tabs[i].focus(); return; }
    current = i;
    const s = SLIDES[i];
    hero.dataset.theme = s.theme;
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
    shots.forEach((el, k) => { el.classList.toggle('is-on', k === i); el.setAttribute('aria-hidden', String(k !== i)); });
    root.querySelector('#hero-name').textContent = s.name;
    root.querySelector('#hero-text').textContent = s.text;
    root.querySelector('#hero-price').innerHTML = `от <b>${money(packPrice(s.zone, 'h1', false))}</b> за час`;
    const zone = root.querySelector('.hero__zone');
    zone.classList.remove('swap');
    void zone.offsetWidth; // перезапуск CSS-анимации
    zone.classList.add('swap');
    if (focus) tabs[i].focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(i));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      show((i + d + tabs.length) % tabs.length, true);
    });
  });
  show(0);

  // Телефон: зоны листаются свайпом по первому экрану (вертикальная прокрутка страницы остаётся).
  let tx = 0;
  let ty = 0;
  let tracking = false;
  hero.addEventListener('touchstart', (e) => {
    tracking = e.touches.length === 1;
    if (tracking) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }
  }, { passive: true });
  hero.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    show((current + (dx < 0 ? 1 : -1) + SLIDES.length) % SLIDES.length);
  }, { passive: true });

  // Фото наклоняется к курсору, свет за ним следует за указателем (только с мышью).
  if (!prefersReducedMotion() && window.matchMedia('(hover: hover)').matches) {
    const stage = root.querySelector('.hero__stage');
    let raf = 0;
    stage.addEventListener('pointermove', (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const r = stage.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        stage.style.setProperty('--ry', `${(nx * 16).toFixed(2)}deg`);
        stage.style.setProperty('--rx', `${(-ny * 12).toFixed(2)}deg`);
        stage.style.setProperty('--gx', `${(50 + nx * 30).toFixed(1)}%`);
        stage.style.setProperty('--gy', `${(52 + ny * 30).toFixed(1)}%`);
        raf = 0;
      });
    });
    stage.addEventListener('pointerleave', () => {
      ['--ry', '--rx'].forEach((k) => stage.style.setProperty(k, '0deg'));
      stage.style.setProperty('--gx', '50%');
      stage.style.setProperty('--gy', '52%');
    });
  }
}

/** Прокрутка: полоса прогресса, шапка меняет вид, фото первого экрана уезжает медленнее текста. */
function setupScroll(root) {
  const nav = root.querySelector('#cl-nav');
  const bar = root.querySelector('#cl-progress');
  const hero = root.querySelector('.hero');
  const chips = root.querySelector('#cl-chips');
  const secs = [...root.querySelectorAll('.cl-sec')];
  let activeSec = '';
  let raf = 0;
  const update = () => {
    raf = 0;
    // Подсветка раздела в ленте чипов: последний, чей верх уже поднялся выше 40% экрана.
    let cur = '';
    secs.forEach((s) => { if (s.getBoundingClientRect().top < root.clientHeight * 0.4) cur = s.id; });
    if (cur !== activeSec) {
      activeSec = cur;
      chips.querySelectorAll('.cl-chip').forEach((c) => {
        const on = c.dataset.sec === cur;
        c.classList.toggle('is-on', on);
        if (on) {
          c.setAttribute('aria-current', 'true');
          if (chips.scrollWidth > chips.clientWidth) chips.scrollTo({ left: c.offsetLeft - (chips.clientWidth - c.offsetWidth) / 2, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        } else c.removeAttribute('aria-current');
      });
    }
    const max = root.scrollHeight - root.clientHeight;
    const y = root.scrollTop;
    bar.style.transform = `scaleX(${max > 0 ? (y / max).toFixed(4) : 0})`;
    nav.classList.toggle('is-scrolled', y > 24);
    if (!prefersReducedMotion() && y < hero.offsetHeight) hero.style.setProperty('--sy', `${(y * 0.14).toFixed(1)}px`);
  };
  root.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  update();
}

/** Подсветка карточек под курсором («прожектор»). */
function setupSpotlight(root) {
  if (!window.matchMedia('(hover: hover)').matches) return;
  root.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('.card, .pack, .pr-card, .msg__b, .prizes li');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
}

/**
 * Подгонка заголовка: если слово шире колонки (например, после загрузки шрифта), размер уменьшается,
 * чтобы строка помещалась целиком и последняя буква не обрезалась и не переносилась.
 */
function fitHeadline(root) {
  const h1 = root.querySelector('.hero__h1');
  const copy = root.querySelector('.hero__copy');
  if (!h1 || !copy) return;
  const fit = () => {
    if (!h1.offsetWidth) return; // блок скрыт, измерять нечего
    h1.style.fontSize = '';
    let fs = parseFloat(getComputedStyle(h1).fontSize);
    const lines = [...h1.querySelectorAll('.ln')];
    for (let n = 0; n < 16 && !lines.every((l) => l.firstElementChild.offsetWidth <= l.clientWidth); n += 1) {
      fs *= 0.95;
      h1.style.fontSize = `${fs.toFixed(2)}px`;
    }
  };
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(copy);
  document.fonts?.ready.then(fit);
  fit();
}

/** Разметка FAQPage для поисковиков из тех же данных, что и раздел «Вопросы». */
function addFaqSchema() {
  if (document.getElementById('faq-schema')) return;
  const el = document.createElement('script');
  el.type = 'application/ld+json';
  el.id = 'faq-schema';
  el.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  });
  document.head.appendChild(el);
}

/** Плавное появление секций при прокрутке. */
function setupReveal(root) {
  const items = [...root.querySelectorAll('.reveal')];
  // Элементы внутри секции появляются по очереди.
  items.forEach((sec) => sec.querySelectorAll('.card, .pack, .pr-card, .msg, .prizes li, .spec > div, .cl-stats > div, .branch').forEach((el, i) => el.style.setProperty('--i', String(Math.min(i, 12)))));
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) { items.forEach((x) => x.classList.add('is-in')); return; }
  root.classList.add('js-reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      e.target.querySelectorAll('[data-count]').forEach((el) => countUp(el, Number(el.dataset.count), { decimals: Number(el.dataset.dec || 0) }));
      io.unobserve(e.target);
    });
  }, { root, threshold: 0.12 });
  items.forEach((x) => io.observe(x));
}

/** Меню-оверлей со ссылками на разделы. */
function setupMenu(root) {
  const btn = root.querySelector('#cl-menu');
  const panel = root.querySelector('#cl-panel');
  const set = (open) => { panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', () => { set(panel.hidden); if (!panel.hidden) panel.querySelector('a').focus(); });
  panel.addEventListener('click', (e) => { if (e.target.closest('a, [data-mode]')) set(false); });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { set(false); btn.focus(); } });
}

/** Переходы по якорям без записей в истории: иначе «назад» на телефоне листала бы разделы, а не возвращала со страницы. */
function setupAnchors(root) {
  root.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#cl-"]');
    if (!a) return;
    const target = root.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  });
}

export function renderClassic(root) {
  if (built) return;
  built = true;
  const main = BRANCHES[0];
  root.innerHTML = `
    <header class="cl-nav" id="cl-nav">
      <button type="button" class="cl-menu" id="cl-menu" aria-expanded="false" aria-controls="cl-panel"><i></i><span>Меню</span></button>
      <a class="logo cl-logo" href="#cl-top" aria-label="TOPSKILL, наверх">TOP<b>SKILL</b><span class="cursor">▮</span></a>
      <span class="cl-nav__r">
        <button type="button" class="btn btn--ghost btn--sm" id="cl-os" data-mode="os">Режим TopskillOS</button>
        <button type="button" class="cl-os-pill" data-mode="os" aria-label="Открыть как приложение: TopskillOS">${icon('grid', 18)}<span>OS</span></button>
        <button type="button" class="btn btn--accent btn--sm" data-open="book" aria-label="Забронировать"><span class="bk-long">Забронировать</span><span class="bk-short">Бронь</span></button>
      </span>
      <span class="cl-progress" id="cl-progress" aria-hidden="true"></span>
    </header>
    <nav class="cl-chips" id="cl-chips" aria-label="Быстрый переход по разделам">
      ${PARTS.map(([id, t]) => `<a class="cl-chip" href="#cl-${id}" data-sec="cl-${id}">${t}</a>`).join('')}
    </nav>
    <nav class="cl-panel" id="cl-panel" aria-label="Разделы" hidden>
      ${PARTS.map(([id, t], n) => `<a href="#cl-${id}"><span class="mono">0${n + 1}</span>${t}</a>`).join('')}
      <button type="button" class="cl-panel__os" data-mode="os">${icon('grid', 20)} Открыть как приложение: TopskillOS</button>
      <p class="mono muted">${esc(main.address)}<br><a href="${telHref(main.phone)}">${esc(main.phone)}</a> · ${CLUB.hours}</p>
    </nav>
    <main>
      ${heroHtml()}
      <div class="reveal">${statsHtml()}</div>
      <div id="cl-parts"></div>
    </main>
    <div class="cl-bar" id="cl-bar">
      <button type="button" class="btn btn--accent" data-open="book">Забронировать</button>
      <a class="btn btn--ghost" href="${telHref(main.phone)}" aria-label="Позвонить в клуб ${esc(main.phone)}">${icon('phone', 18)} Позвонить</a>
    </div>
    <footer class="cl-foot">
      <div class="cl-foot__word" aria-hidden="true">TOPSKILL</div>
      <div class="cl-foot__row">
        <p><b>${esc(main.address)}</b><br><a href="${telHref(main.phone)}">${esc(main.phone)}</a><br><a href="mailto:${esc(CLUB.email)}">${esc(CLUB.email)}</a></p>
        <p class="muted">Открыто ${CLUB.hours}. Ещё два филиала: ${BRANCHES.slice(1).map((b) => esc(b.address)).join('; ')}.</p>
        <button type="button" class="btn btn--accent" data-open="book">Забронировать место</button>
      </div>
      <p class="mono muted small">ДЕМО-ВЕРСИЯ: заявки не отправляются, данные хранятся только в вашем браузере.</p>
    </footer>`;

  const holder = root.querySelector('#cl-parts');
  PARTS.forEach(([id, title, part], n) => {
    const sec = document.createElement('section');
    sec.className = 'cl-sec reveal';
    sec.id = `cl-${id}`;
    sec.setAttribute('aria-labelledby', `cl-${id}-t`);
    sec.innerHTML = `<h2 class="cl-h2" id="cl-${id}-t"><span class="mono">0${n + 1} /</span> ${title}</h2><div class="cl-body">${part.render()}</div>`;
    holder.appendChild(sec);
    part.mount?.(sec);
  });

  setupAnchors(root);
  setupHero(root);
  fitHeadline(root);
  addFaqSchema();
  setupMenu(root);
  setupReveal(root);
  setupScroll(root);
  setupSpotlight(root);
  // Вход первого экрана: класс ставится после отрисовки, чтобы сработали CSS-анимации.
  setTimeout(() => root.querySelector('.hero').classList.add('is-in'), 60);
}
