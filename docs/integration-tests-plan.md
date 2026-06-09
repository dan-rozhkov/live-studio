# План: интеграционные тесты для live-studio

**Назначение документа:** это самодостаточное ТЗ для исполняющей модели. Задача — построить тестовую сетку, которая (а) фиксирует баги из `docs/code-review-2026-06-10.md` как красные тесты до фикса, (б) даёт страховку для предстоящих рефакторингов (DragControls, bridge.ts, парсеры). Ссылки вида P0.x/P1.x/P2.x ниже указывают на находки из того отчёта.

---

## 0. Что уже есть в проекте (использовать, не изобретать)

- **Раннер:** vitest 4, `npm test` → `vitest run`. Конфиг: `vitest.config.ts` — `environment: 'jsdom'`, алиасы react → preact/compat, `ssr.noExternal: ['zustand']`. Globals **не** включены — импортировать `describe/it/expect/vi` из `'vitest'` явно.
- **Конвенция размещения:** тесты лежат рядом с кодом, `<module>.test.ts(x)`. Примеры-образцы:
  - `src/server/bridge.variant-task.test.ts` — тест серверного класса напрямую, без транспорта;
  - `src/client/bridge/variants-bridge.test.ts` — jsdom-тест с `document.body.innerHTML` и `beforeEach`-очисткой;
  - `src/client/components/PropertiesPanel/inputs/CreateVariableForm.test.tsx` — компонентный тест.
- **Зависимости:** `ws` (реальный WS-сервер для тестов), `zod`, `jsdom`. Для компонентных тестов добавить devDeps: `@testing-library/preact` и `@testing-library/user-event`. Для клиентского WebSocket в jsdom добавить `mock-socket` (jsdom не даёт `WebSocket`).

## 1. Общие правила написания (обязательны для каждого теста)

1. **Тест бага пишется до фикса и обязан падать.** Рабочий цикл: написал тест → `npx vitest run <file>` → убедился, что падает с ожидаемой причиной (а не с ошибкой сетапа) → фикс → зелёный. В коммит-месседже/итоговом отчёте указать для каждого теста: «падал до фикса: да/нет, почему».
2. **Характеризационные тесты перед рефакторингом пишутся на текущее поведение**, даже странное, кроме случаев, где текущее поведение — это баг из отчёта (тогда см. п.1). Не «улучшать» поведение в рефакторинговом PR.
3. **Никаких таймеров по wall-clock.** Debounce/TTL/reconnect — только через `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(...)`. Реальные `setTimeout` в тестах запрещены (кроме WS-handshake ожиданий, см. хелпер ниже).
4. **MutationObserver в jsdom работает, но колбэк приходит микротаской.** После DOM-мутации, прежде чем проверять реакцию observer'а: `await Promise.resolve()` (или `await vi.advanceTimersByTimeAsync(0)` при fake timers + debounce).
5. **jsdom не считает layout.** `getBoundingClientRect()` возвращает нули, `getComputedStyle` не резолвит каскад размеров. Поэтому геометрию (drag-математика, позиции индикаторов, rAF-циклы) в jsdom **не тестировать через DOM** — тестировать как чистые функции (это требует их выноса, см. §6). Не мокать `getBoundingClientRect` ради «интеграционного» теста геометрии — такой тест проверяет мок.
6. **Один тест — одно утверждаемое поведение.** Имя теста — предложение о поведении: `it('drops the frame and keeps the process alive when viewport is missing')`.
7. **Изоляция:** каждый серверный тест создаёт свой `DevToolsBridge`/WSS на **порту 0** (эфемерный) и закрывает его в `afterEach` — включая все клиентские сокеты. Утечка сокета между тестами = зависший vitest.
8. **Не тестировать:** реальный перформанс (P2.4–P2.5 — проверяется профайлером вручную), пиксельную отрисовку, поведение реальных React/Vue на странице (jsdom-приближение допустимо, см. §4.2).

Хелпер для WS-тестов — создать `src/server/test-utils.ts`:

```ts
import { WebSocket } from 'ws';

export function connect(port: number, opts?: { origin?: string }): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: opts?.origin ? { origin: opts.origin } : {} });
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

export function nextMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => ws.once('message', (d) => resolve(JSON.parse(String(d)))));
}
```

---

## 2. Приоритет 1: серверный WS-протокол (реальный сервер + реальный `ws`-клиент)

**Файл:** `src/server/bridge.ws.test.ts`. Это главные интеграционные тесты проекта: поднимаем настоящий `DevToolsBridge` (порт 0, прочитать фактический порт из `wss.address()`; если сейчас порт нельзя инжектировать/прочитать — это первый необходимый тестовый шов, добавить), подключаемся настоящим `ws`-клиентом, гоняем протокол по проводу.

| Тест | Фиксирует | Сценарий |
|---|---|---|
| малформед-фрейм не убивает процесс | P0.2 | отправить `not json`, `{"type":"page-info"}` (без viewport), `{"type":"style-update","changes":1}`; затем валидный `page-info` — сервер жив и отвечает. Падение процесса в vitest проявится как unhandled error — тест обязан это ловить |
| origin-check | P0.1 | после фикса: коннект с `origin: 'https://evil.example'` отклоняется (ожидать `error`/close 4xx), без origin или с разрешённым — принимается |
| auth-токен | P0.1 | коннект без токена / с неверным токеном отклоняется; сообщения от неаутентифицированного клиента не попадают в `pendingUserMessages` |
| lost-update гонка | P1.2 | клиент шлёт `style-update` №1 → агентский поток получает снапшот (вызвать `waitForUpdate`) → **до** `consumeChanges()` клиент шлёт `style-update` №2 → consume → следующий `waitForUpdate`/опрос обязан вернуть батч №2. Сейчас красный |
| конкурентные геты не дублируют | P1.2 | два параллельных `waitForUpdate` + один `style-update`: суммарно изменения выданы ровно один раз |
| TTL зависшей variant task | P1.4 | `startVariantTask` → `consumeVariantTask` → fake timers вперёд за TTL → `startVariantTask` снова — успех, broadcast `variant-cancelled` ушёл клиенту |
| кап очередей | P2.6 | без подключённого агента отправить N+k `style-update`; размер `pendingChanges` ≤ N |
| `stop()` закрывает клиентов | P2.6 | подключить 2 клиентов → `bridge.stop()` → оба получают `close`; повторный `new DevToolsBridge()` на том же порту стартует без EADDRINUSE-ретрая |
| пустой ответ ≠ таймаут | P1.14 | `waitForAnswer` + клиент шлёт `{type:'question-answer', answer:''}` → резолв `''`, не таймаут |

**Файл:** `src/server/serve.mcp.test.ts` — MCP-слой через `InMemoryTransport` из `@modelcontextprotocol/sdk` (есть в SDK: `InMemoryTransport.createLinkedPair()`): сервер из `serve.ts` соединить с тестовым `Client` из SDK, проверить: `notification`-фейл после закрытия транспорта не роняет процесс (P1.1 — сейчас красный), инструменты возвращают `errorResult` на таймаутах вместо исключений. Если `serve.ts` сейчас не экспортирует фабрику сервера отдельно от `connect(stdio)` — выделить `createServer(bridge)` (тестовый шов, поведение не менять).

**Файл:** `src/server/project-root.test.ts` — P1.3: смоделировать Windows-корень нельзя на macOS напрямую, поэтому вынести цикл в чистую функцию `findUp(start, exists, dirname)` с инжектированными fs-функциями и проверить терминацию на входах `C:\` (parent === dir) и `/`. Красный до фикса (таймаут теста).

**Файл:** `src/server/install.test.ts` — P1.5: во временной директории (`fs.mkdtemp`) — (а) существующий `.mcp.json` с trailing comma → install обязан **не** перезаписать файл и выйти с ошибкой; (б) валидный конфиг с чужими серверами → чужие сохранены; (в) записанный путь не абсолютный.

## 3. Приоритет 2: round-trip тесты парсеров (писать ДО фикса парсеров)

Это формально юнит-тесты, но они — обязательное условие фиксов P0.7–P0.9 и рефакторинга P3.3. Сначала вынести парсеры в чистые модули (`src/client/utils/gradient.ts`, `color.ts`, `transform.ts`), перенеся код **без изменений**, затем тесты, затем фиксы.

**`gradient.test.ts`** — таблично (`it.each`), две группы:
- *Round-trip:* `serialize(parse(s))` эквивалентен `s` для: `linear-gradient(red, blue)`, `linear-gradient(-45deg, red 0%, blue 100%)`, `linear-gradient(0.5turn, …)`, `radial-gradient(circle at 30% 30%, …)`, `conic-gradient(from 45deg, red 0deg, blue 180deg)`, `repeating-linear-gradient(red 0px, blue 20px)`, double-position `red 0% 50%`, смешанные юниты `red 0%, blue 100px`.
- *Не-градиенты и слои:* `isGradientValue` обязан вернуть false (или парсер — выделить только слой) для `linear-gradient(red, blue), url(x.png)` (P0.8), `none`, `var(--g)`.

**`color.test.ts`** — P1.14/M3: named colors (`red`, `transparent`), `#abc`/`#aabbcc`/`#aabbccdd`, `rgb(100%, 0%, 0%)`, `rgb(1 2 3 / 0.5)`, `hsl(120deg 50% 50%)`; незаякоренность: `color-mix(in srgb, rgb(1,2,3) 50%, white)` НЕ парсится как `rgb(1,2,3)`. Плюс round-trip HSV↔RGB↔HEX на граничных значениях (0, 255, h=360).

**`transform.test.ts`** — P0.9: `compose(parse(t), изменение одного значения)` сохраняет порядок функций для `rotate(45deg) translateX(10px)`, `perspective(500px) rotateY(30deg)`, `matrix(...)`.

**`number-commit.test.ts`** — P0.7: вынести из NumberInput чистую функцию `commitText(raw, currentUnit, {min,max,step})` и проверить: `('auto','px')` → не коммитит/keyword, `('2rem','px')` → `2rem`, `('abc')` → no-op, шаг стрелкой от `auto` → не NaN, фокус+блюр без правки на `12.5px` → no-op (не `13px`).

## 4. Приоритет 3: клиентские интеграционные тесты в jsdom

### 4.1 dom-bridge + store (selector-пайплайн)

**Файл:** `src/client/bridge/dom-bridge.integration.test.ts`
- **P0.4 (главный):** построить DOM → `fetchDomTree()` → конвертировать в store-форму (как `use-page-bridge`) → `getElementInfoById(storeTree, id)` → селектор **не** содержит `"undefined"`, валиден (`document.querySelector(sel)` находит тот самый элемент). Прогнать для: элемент с id, с classами (включая требующие `CSS.escape`: `md:flex`), без атрибутов (nth-of-type-путь), `data-testid`.
- **P1.14/finding 12:** добавить в DOM узел `data-ls-visual-control` и панель `live-studio-panel` → `fetchDomTree()` их не включает.
- **P2.2:** `fetchDomTree` → удалить поддерево из DOM → `purgeDetachedElements()` → `getElementById` для удалённых возвращает null; после `resetRegistry()` (появится при фиксе) реестр пуст.

### 4.2 variants-bridge (расширить существующий `variants-bridge.test.ts`)

- **P0.6 (красный до фикса):** `const target = document.createElement('button'); let clicked = false; target.addEventListener('click', () => clicked = true);` → inject → `cancelVariantPreview()` → элемент в DOM === исходный `target` (проверять `===`, не равенство HTML), клик по нему срабатывает.
- **P1.7 (красный до фикса):** повесить MutationObserver на body (имитация use-page-bridge), выполнить swap внутри «подавления» → `await Promise.resolve()` → проверить, что флаг подавления ещё виден коду observer-колбэка (после фикса — через generation/`takeRecords`). Тест формулировать против публичного API (`isVariantSwapInProgress` в момент доставки колбэка).
- **Scoped CSS:** после inject `<style>` варианта не матчит элементы вне wrapper'а (после фикса скоупинга).

### 4.3 style-bridge

**Файл:** `src/client/bridge/style-bridge.test.ts` — P1.12: вставить `<style>` с правилом внутри `@media (min-width: 1px)` и `@supports (display: block)` → `fetchMatchedRules(el)` находит их. jsdom парсит grouping-правила и отдаёт `cssRules` — работает; `@layer` jsdom может не поддерживать, тогда этот кейс пометить `it.skip` с комментарием-причиной, не эмулировать.

### 4.4 Клавиатура и undo (компонентные, @testing-library/preact)

**Файл:** `src/client/hooks/use-keyboard.integration.test.tsx`. Смонтировать минимальный харнесс: store + `useKeyboard` + (до фикса P0.3) `useDomOperations` — так, как их монтирует `InPagePanel`.
- **P0.3 (красные до фикса):** выделить узел → `await user.keyboard('{Meta>}d{/Meta}')` → в дереве ровно одна копия; сфокусировать `<input>` внутри панели → `Delete` → выделенный элемент страницы жив.
- **P1.9 (красный):** правка стиля → Escape → Cmd+Z → правка откатилась (undo-стек не очищен).
- **P1.14 Cmd+C:** при выделенном элементе и непустом `window.getSelection()` буфер не перезаписывается (мокнуть `navigator.clipboard.writeText` через `vi.stubGlobal`).
- **Undo-батчинг (M7, красный):** дёрнуть compact-margin onChange (L+R) → один Cmd+Z возвращает обе стороны.

### 4.5 Click-guard / inline-edit / picker (порядок capture-листенеров)

**Файл:** `src/client/hooks/use-selected-click-guard.integration.test.tsx` — P1.6 (красные): смонтировать guard + inline-edit в том же порядке, что `InPagePanel`; (а) dblclick по выделенному элементу с текстом → элемент стал `contenteditable`; (б) при `isPickingElement: true` клик по потомку выделенного вызывает выбор потомка. После выхода из inline-edit: в DOM нет атрибута `contenteditable` и исходный inline-`outline` восстановлен (P1.14).

### 4.6 WS-клиент `use-mcp-direct` (mock-socket)

**Файл:** `src/client/hooks/use-mcp-direct.test.tsx`. Использовать `mock-socket` (`Server` + подмена `global.WebSocket`), fake timers для reconnect/backoff.
- **P1.8 (красные):** (а) unmount пока сокет CONNECTING → после «открытия» сокет закрыт, `page-info` не отправлен; (б) `reconnect()` во время CONNECTING не создаёт второй сокет (у mock-socket `server.clients()` — проверить длину); (в) закрытие устаревшего сокета не зануляет ref живого: открыть, спровоцировать reconnect, закрыть старый — статус остаётся `connected`, лишнего reconnect-таймера нет.
- **Протокол:** невалидный JSON и валидный JSON неизвестного типа не ломают обработку следующего сообщения; исключение внутри одного хендлера (мокнуть store-метод, кидающий throw) не глотается молча после фикса P3.1 — как минимум логируется (`vi.spyOn(console, 'error')`).

### 4.7 PropertiesPanel-инпуты (компонентные)

**Файл:** дописать в существующие/новые `*.test.tsx` рядом с инпутами:
- **P1.13 attr-cancel (красный):** ввести имя+значение нового атрибута → кликнуть Cancel → `onChange`/queueEdit не вызван, атрибут не применён.
- **P1.13 popover-toggle (красный):** открыть ColorInput кликом по свотчу → кликнуть свотч снова → попап закрыт (не «закрылся-и-открылся»; проверять после `await user.click(...)`).
- **FillSection per-element state (M4, красный):** скрыть fill при выделенном A → переключить selectedNodeId на B → иконка «глаз» отражает состояние B, restore-цвет A не применяется к B.
- **Sync-guard (M9):** для TextInput — начать набор → внешнее обновление `value`-пропа → введённый текст не затёрт (после внедрения `useCommittedInput` — общий тест хука, отдельные инпуты — smoke).

## 5. Приоритет 4: характеризационные тесты перед рефакторингами

Писать непосредственно перед соответствующим рефакторингом, не заранее.

- **Перед P3.1 (типизация протокола):** snapshot-тест словаря сообщений — собрать все исходящие `broadcast({type})` сервера и все обрабатываемые `msg.type` клиента; тест фиксирует список типов и обязательные поля. Любое расхождение клиент/сервер после рефакторинга — красный тест.
- **Перед P3.2 (DragControls):** геометрию НЕ тестировать в jsdom. Вместо этого: вынести `computeMarginPositions`/`computePaddingPositions`/`computeGapPositions`/`computeResizePositions` и commit-логику (формирование `Change`) в чистые функции с явными входами (rect, computedStyle-объект) и зафиксировать таблицей вход→выход на текущем поведении. Туда же красные тесты P1.11 (сброс `prev*Key` — тестировать через выделенный state-модуль) и gap-пары (P1.14).
- **Перед P3.6 (bridge.ts):** существующий `bridge.variant-task.test.ts` + тесты §2 и есть страховка; перед выносом file-watching добавить тест на `readDesignMd`/watcher через временный каталог и реальную запись файла (rename-over кейс P2.6 — красный).

## 6. Необходимые тестовые швы (минимальные изменения прод-кода, разрешены)

1. `DevToolsBridge`: принимать `port: 0` и экспонировать фактический порт (`get port()` из `wss.address()`).
2. `serve.ts`: экспорт `createServer(bridge)` отдельно от подключения stdio-транспорта.
3. `project-root.ts`: инжектируемые `exists`/`dirname` (дефолты — реальные).
4. Вынос чистых функций: парсеры (§3), commit-логика NumberInput, геометрия DragControls (§5). Правило: перенос кода 1:1, фикс — отдельным коммитом после красного теста.
5. `dom-bridge`: экспорт `resetRegistry()` (нужен и для фикса P2.2, и для изоляции тестов).

Швы не меняют поведение. Если для теста хочется изменить поведение — это фикс, он идёт после красного теста.

## 7. Порядок выполнения и критерии готовности

1. devDeps: `@testing-library/preact`, `@testing-library/user-event`, `mock-socket`. Проверить, что существующие тесты зелёные: `npm test`.
2. §2 (серверный WS) — самостоятельная ценность + страховка для фиксов P0.1–P0.2.
3. §3 (парсеры) — блокер для фиксов P0.7–P0.9.
4. §4 в порядке: 4.1 → 4.2 → 4.4 → 4.6 → 4.3/4.5/4.7.
5. §5 — по мере подхода к соответствующему рефакторингу.

**Definition of done для всего плана:**
- `npm test` зелёный, ни один тест не использует реальные таймауты/sleep;
- каждый баг-тест в итоговом отчёте помечен «был красным до фикса» с текстом ошибки;
- ни один тест не читает приватное состояние через `as any` — только публичные API и наблюдаемое поведение (DOM, сообщения по проводу, вызовы store);
- suite укладывается в разумное время (< 30 с локально): WS-тесты на эфемерных портах, без межтестовых утечек сокетов (vitest не «висит» после прогона).

**Чего сознательно нет в этом плане:** e2e в реальном браузере (Playwright) — отдельное решение после стабилизации; перф-тесты (P2.4–P2.5 проверяются профайлером вручную); визуальная регрессия.
