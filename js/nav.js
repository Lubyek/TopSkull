// Системная кнопка «назад» на телефоне: приложения и окно брони живут как «слои» истории браузера.
// Жест «назад» или аппаратная кнопка закрывает верхний слой (или шаг брони), а не уводит с сайта.
const layers = []; // { close(), back?() }: close закрывает слой, back возвращает true, если «назад» обработан внутри
let ignore = 0; // сколько popstate вызвано нами самими и должно быть пропущено
let pendingPush = 0; // записи истории, которые ждут окончания нашего возврата назад
let failSafe = 0;

function safe(fn) { try { fn(); } catch { /* история может быть недоступна (iframe, песочница) */ } }
const pushEntry = () => safe(() => history.pushState({ tsk: layers.length }, ''));

/** Наш возврат по истории закончился: теперь можно добавлять отложенные записи. */
function settled() {
  clearTimeout(failSafe);
  ignore = 0;
  for (; pendingPush > 0; pendingPush -= 1) pushEntry();
}

/** Возврат по истории выполняется асинхронно; пока он идёт, pushState делать нельзя (записи перепутаются). */
function traverse(fn) {
  ignore += 1;
  clearTimeout(failSafe);
  failSafe = setTimeout(settled, 600); // страховка, если popstate не придёт
  safe(fn);
}

/** Открыть слой: добавляет запись в историю. */
export function pushLayer(layer) {
  layers.push(layer);
  if (ignore > 0) pendingPush += 1; else pushEntry();
  return layer;
}

/** Закрыть слой из интерфейса: окно закрывается сразу, запись истории убирается следом. */
export function closeLayer(layer) {
  const i = layers.indexOf(layer);
  if (i < 0) return;
  layers.splice(i, 1);
  if (pendingPush > 0) pendingPush -= 1; // его запись ещё не создана: просто отменяем
  else if (i === layers.length) traverse(() => history.back()); // был верхним: убираем его запись из истории
  layer.close();
}

/** Убрать слой без закрытия окна (окно уже закрыто другим способом). */
export function dropLayer(layer) {
  const i = layers.indexOf(layer);
  if (i >= 0) layers.splice(i, 1);
}

/** Забыть все слои (при переходе на обычный сайт или сворачивании на главный экран), вернув историю на место. Окна не закрываются. */
export function resetLayers() {
  const n = layers.length - pendingPush;
  layers.length = 0;
  pendingPush = 0;
  if (n > 0) traverse(() => history.go(-n));
}

window.addEventListener('popstate', () => {
  if (ignore > 0) { ignore -= 1; if (ignore === 0) settled(); return; }
  const top = layers[layers.length - 1];
  if (!top) return;
  if (top.back?.()) { pushEntry(); return; } // «назад» обработано внутри (например, шаг брони)
  layers.pop();
  top.close();
});
