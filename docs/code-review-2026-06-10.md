# Code Review: live-studio

**Дата:** 2026-06-10
**Объём:** ~17 000 строк TypeScript/TSX (84 файла, без тестов)
**Метод:** 4 параллельных ревью по подсистемам — сервер (`src/server`, `src/vite`), клиентское ядро (`bridge/`, `state/`, `hooks/`, `utils/`), крупные компоненты (Overlays, DomTree, Panel, Toolbar), PropertiesPanel (секции + инпуты). Каждая находка проверена по реальному коду.

---

## Общая картина

Проект функционально богатый, но имеет три системные болезни:

1. **Безопасность не проектировалась.** WebSocket-мост между браузером и MCP-сервером — без аутентификации, без проверки origin, слушает все интерфейсы. Любая страница в браузере пользователя может подключиться к `ws://localhost:9877` и отправлять инструкции агенту, у которого есть доступ на запись файлов проекта.
2. **Тихая порча данных пользователя.** Инструмент, чья работа — точно редактировать CSS, коммитит `NaNpx` и `autopx`, уничтожает многослойные `background`, меняет порядок transform-функций (меняя визуальный результат), а отмена превью варианта подменяет живой элемент инертным клоном без обработчиков фреймворка.
3. **Копипаста как причина багов.** Одни и те же хелперы скопированы по 3–5 раз и разъехались: два конкурирующих обработчика Cmd+D/Delete, два билдера селекторов (один отдаёт агенту селектор `"undefined"`), пять разных проверок «это наш оверлей?». Парсеры цвета/градиента на ~500 строк — без единого теста.

Что хорошо: `Measures.tsx`, `design-md-parse.ts`, ContextMenu — чистые, с корректным cleanup; markdown проходит DOMPurify; чат рендерится текстовыми узлами. Проблемы концентрируются в DragControls, инпутах PropertiesPanel и WS-мосте.

---

## P0 — Критично: безопасность и порча данных

### P0.1. WS-сервер без auth, origin-check и localhost-bind
`src/server/bridge.ts:141` — security, critical

```ts
this.wss = new WebSocketServer({ port: this.port, maxPayload: 10 * 1024 * 1024 });
```

Нет `host` (биндится на `0.0.0.0` — доступен любому хосту в LAN), нет `verifyClient`/проверки `Origin`, нет токена. WebSocket не подчиняется CORS, поэтому **любая открытая в браузере страница** может сделать `new WebSocket("ws://localhost:9877")` и отправить `{type:"user-message", text:"..."}`. Skill (`skill.ts:70`: «treat each message as a direct instruction») заставляет агента исполнять текст атакующего как инструкции с полным доступом на запись в проект — классическая localhost drive-by атака на агентский тулинг. Атакующий также пассивно получает всё, что шлёт `broadcast()`: чат агента, DESIGN.md, HTML вариантов с исходной разметкой.

**Фикс:** `host: "127.0.0.1"`, проверка `Origin` в `verifyClient`, shared-secret токен в хендшейке (клиентская сторона — `use-mcp-direct.ts:87`).

### P0.2. Любой невалидный WS-фрейм убивает MCP-процесс
`src/server/bridge.ts:265–302` — bug + DoS-усилитель для P0.1

`handleMessage` полностью доверяет `msg`: `{"type":"page-info"}` без `viewport` кидает `TypeError` на `vp.width`; `{"type":"style-update","changes":1}` — на spread не-итерируемого. Throw происходит синхронно в листенере `"message"` → `uncaughtException` → **смерть Node-процесса** посреди сессии. Zod уже в зависимостях и используется для MCP-аргументов, но сырой WS-вход не валидируется вообще.

**Фикс:** zod-схемы на каждый `msg.type` (или хотя бы try/catch вокруг `handleMessage`), невалидные фреймы дропать.

### P0.3. Delete удаляет элемент страницы во время набора текста; Cmd+D дублирует дважды
`src/client/components/DomTree/DomOperations.tsx:344–362` + `src/client/hooks/use-keyboard.ts:227–248` — bug, critical

`useDomOperations()` регистрирует собственный `window`-keydown для Cmd+D и Delete/Cmd+Backspace, а `InPagePanel.tsx:107,147–154` параллельно прокидывает те же `domOps.deleteElement`/`duplicateElement` в `useKeyboard`, который регистрирует второй обработчик на те же клавиши. Оба срабатывают на одно событие: Cmd+D дублирует, затем второй обработчик читает свежий стейт и дублирует клон ещё раз. Хуже: у копии в DomOperations **нет `isInputFocused()`-guard** — нажатие Delete (или Cmd+Backspace, «удалить до начала строки» на macOS) во время набора в любом инпуте панели удаляет выделенный элемент страницы.

**Фикс:** удалить keyboard-эффект из `useDomOperations` целиком; `useKeyboard` уже владеет этими шорткатами с guard'ом.

### P0.4. Агент получает селектор `"undefined"` для всех DOM-операций
`src/client/components/DomTree/DomOperations.tsx:195` (также :214, :248, :266, :284, :321, :448–492) → `src/client/bridge/dom-bridge.ts:102–117` — bug, high

`getElementInfoById(useStore.getState().domTree as any, nodeId)` передаёт store-дерево (`DomNode`: `{ id, tag, text, children, attributes }`) в функцию, читающую bridge-форму: `const tag = node.localName;` и `node.className`. У `DomNode` нет ни того, ни другого → `tag === undefined` → селектор — буквальная строка `"undefined"` (или `undefined#someId`). Каждое изменение тега/удаление/добавление/дублирование уходит агенту с бесполезным `element`/`path`. Скрыто одиннадцатью `as any`.

**Фикс:** научить `getPathInfo`/`buildSelector` принимать store-форму (`tag`, `attributes.class`), удалить `as any`.

### P0.5. Inline-правки текста ссылаются на несуществующий атрибут `data-ls-id`
`src/client/components/InPagePanel.tsx:120` — bug, high

`handleInlineEditComplete` ставит `element: `[data-ls-id="${id}"]``, но `id` — ключ in-memory Map в dom-bridge; атрибут `data-ls-id` никто никогда не пишет в DOM (единственное вхождение в репо — эта строка). Агент получает селектор, не матчащий ничего.

**Фикс:** `buildElementSelector(getElementById(id))` — как уже делает variants-флоу (строка 140).

### P0.6. Отмена превью варианта уничтожает оригинальный элемент
`src/client/bridge/variants-bridge.ts:36, 138–145` — bug, high

`injectVariantsMarkup` делает `parent.replaceChild(imported, targetEl)`, где `imported` — санитизированный DOMPurify и перепарсенный клон. Настоящий `targetEl` — с листенерами, React fiber / Vue-привязками — выбрасывается. `cancelVariantPreview` «восстанавливает» санитизированную *копию* Original-варианта, а не оригинальный узел. Отменённое превью (по смыслу no-op) оставляет на странице инертный клон: JS-обработчики страницы пропали, следующий ререндер фреймворка реконсилирует чужой DOM. Бонус: комментарий в `acceptVariantInDom` («they were scoped») ложный — `<style>` вариантов ничем не скоупится и во время превью применяется на всю страницу (`ADD_TAGS: ['style']` в `variants-bridge.ts:21` плюс CSS-эксфильтрация через селекторы атрибутов + `url()`).

**Фикс:** хранить отсоединённый `targetEl` и возвращать его при cancel; реально скоупить или вырезать variant-CSS.

### P0.7. NumberInput коммитит `NaNpx`, `autopx` и округлённые значения по фокус-блюру
`src/client/components/PropertiesPanel/inputs/NumberInput.tsx:228–259`, `PairedNumberInput.tsx:53–79` — bug, high

- `handleStepBy`: `parseFloat(localValue) + step` без NaN-guard (в отличие от `handleStepperPointerDown:291`, где есть `|| 0`). На `width: auto` стрелка вверх коммитит `onChange("NaNpx")` — значение молча отвергается `style.setProperty`, но пишется в store, undo и очередь MCP-правок.
- `commitValue` тупо приклеивает юнит из *пропа*: ввод `auto` в поле со значением `100px` → `autopx`; ввод `2rem` → `2rempx`.
- `displayNumber` округляет px до целых: для computed `width: 12.5px` локальный стейт — `"13"`, и простой фокус+блюр без ввода коммитит `13px` — фантомная правка + undo-запись + MCP-правка.

**Фикс:** finite-check в обоих файлах; парсить введённый текст на собственный юнит/ключевое слово (есть `parseNumericValue`); не коммитить, если ничего не редактировалось.

### P0.8. Парсер градиентов уничтожает многослойные background и стандартный синтаксис
`src/client/components/PropertiesPanel/inputs/GradientInput.tsx:57–171`, `sections/FillSection.tsx:27` — bug, high

- `GRADIENT_RE = /^(repeating-)?(linear|radial|conic)-gradient\(\s*([\s\S]*)\s*\)$/i` — жадный `[\s\S]*` идёт до *последней* `)`. Проверено: `"linear-gradient(red, blue), url(x.png)"` матчится. Первое же действие в пикере сериализует один градиент поверх всего значения — слой с картинкой молча удаляется.
- `"-45deg".match(/^([\d.]+)deg$/)` → `null`: `linear-gradient(-45deg, …)` трактует `-45deg` как цветовой стоп (угол молча становится 180). То же для `0.5turn`, `1rad`, `calc()`, conic `from`.
- Conic-стопы с угловыми позициями (`red 45deg`) и double-position стопы (`red 0% 50%`) парсятся в мусор и пересериализуются поверх CSS пользователя.

~170 строк рукописного парсера, ноль тестов.

**Фикс:** баланс скобок при матчинге, поддержка знака и угловых юнитов, выделить парсер в чистый модуль + round-trip тесты.

> **✅ Частично исправлено (2026-06-14):** многослойные значения теперь отвергаются (баланс скобок: `matchGradient`), поддержаны знак и угловые юниты (deg/grad/rad/turn) для linear и conic. Покрыто `gradient-parser.test.ts`. Conic-стопы с угловыми позициями и double-position (`red 0% 50%`) пока **не** исправлены — помечены `describe.skip` как известное ограничение. Парсер не выносился в отдельный модуль (функции уже экспортируются из `GradientInput.tsx`).

### P0.9. TransformSection молча меняет порядок transform-функций
`src/client/components/PropertiesPanel/sections/TransformSection.tsx:116–129` — bug, high

CSS transform некоммутативен, но `composeTransform` всегда выдаёт фиксированный порядок `translateX translateY rotate scaleX scaleY skewX skewY [other]`. Элемент с `transform: rotate(45deg) translateX(10px)` при правке *любого* поля пересобирается как `translateX(10px) rotate(45deg)` — визуально другой результат. `perspective()` (обязан идти первым) всегда уезжает в конец.

**Фикс:** сохранять исходный порядок функций, заменяя значения на месте.

---

## P1 — Высокий: корректность и стабильность

### Сервер

**P1.1. Unhandled rejection в `sendNotification` — мёртвый try/catch.** `serve.ts:96–108`. `Protocol.notification()` — async (проверено в SDK: `protocol.js:789`), синхронно не кидает; catch не срабатывает никогда, реджект (например «Not connected» при teardown транспорта) необработан → с Node 15 убивает процесс. Срабатывает на каждой правке из браузера. Фикс: `.catch(() => {})`.

**P1.2. Гонка с потерей правок.** `bridge.ts:470–478, 599–601` + `serve.ts:251`. `flushWaitingResolvers` отдаёт агенту *снапшот*, не дренируя очередь; `consumeChanges()` позже делает `this.pendingChanges = []`. Второй батч, пришедший между снапшотом и consume (между ними await-точки), молча уничтожается — правка пользователя теряется. Обратная проблема: конкурентные `get` получают один и тот же снапшот → дублированное применение. Фикс: атомарное потребление (splice при выдаче).

**P1.3. `findProjectRoot` — бесконечный цикл на Windows.** `project-root.ts:5–12`. `while (dir !== "/")` для `C:\` не завершается: `resolve("C:\\", "..") === "C:\\"`. CLI виснет на 100% CPU. Фикс: `const parent = dirname(dir); if (parent === dir) break;`.

**P1.4. Variant task навсегда застревает в `dispatched`.** `bridge.ts:664–710`. Если агент забрал задачу и умер (длинный LLM-ход), очистить её может только браузер; все последующие «generate variants» — `variant-error`. `createdAt` записывается (:683), но не читается — TTL-проверка так и не написана. Фикс: авто-эвикция по TTL в `startVariantTask`.

**P1.5. `install` молча уничтожает чужой `.mcp.json` и пишет абсолютный путь.** `install.ts:8–36`. ENOENT и синтаксическая ошибка JSON неразличимы: trailing comma в конфиге → весь файл перезаписан, остальные MCP-серверы удалены. Плюс в shareable-файл попадает `/Users/<me>/.../node_modules/.bin/live-studio` (ломается у других контрибьюторов и на Windows, где это shell-скрипт). Фикс: различать ENOENT/parse error, писать относительный путь к `dist/cli.mjs` или `npx`-форму.

### Клиент

**P1.6. Click-guard глушит собственные обработчики студии.** `use-selected-click-guard.ts:62–65` vs `use-inline-edit.ts:225–226`, `use-element-picker.ts:100–106`. Guard регистрируется раньше в capture-фазе и зовёт `stopImmediatePropagation()` для событий внутри выделенного элемента. Итог: даблклик-редактирование текста выделенного элемента мертво, пикером нельзя выбрать потомка выделенного. Фикс: bail-out при `isPickingElement`, пропускать `dblclick`.

**P1.7. «Подавление» MutationObserver при свапе вариантов — no-op.** `variants-bridge.ts:81–88` + `use-page-bridge.ts:127`. `suppressDepth` инкрементируется и декрементируется синхронно, а observer-колбэк приходит микротаской — к проверке `isVariantSwapInProgress()` глубина уже 0. Каждый inject/switch/cancel идёт по «stale selection»-пути. Фикс: флаг, очищаемый в `queueMicrotask` после `observer.takeRecords()`.

**P1.8. Гонки жизненного цикла WS-клиента.** `use-mcp-direct.ts:82–141, 285–303, 449–456`. `socketRef` присваивается только в `onopen`: (а) unmount при CONNECTING-сокете → сокет открывается после unmount и живёт вечно; (б) `reconnect()` без guard создаёт параллельный сокет; (в) `onclose` старого сокета безусловно зануляет ref живого и планирует ложный reconnect. Фикс: присваивать ref сразу, `if (socketRef.current !== ws) return;` в onclose/onopen, проверка `activeRef` в onopen.

**P1.9. Escape стирает всю историю undo.** `use-keyboard.ts:152–153`. `clearSelection(); undoClear();` — снятие выделения рутинно, но после него Cmd+Z больше не работает; записи undo несут `nodeId` и от выделения не зависят. Фикс: удалить `undoClear()`.

**P1.10. DragControls: эффект сносится посреди драга собственными style-записями.** `DragControls.tsx:1396` + `use-page-bridge.ts:156`. Эффект зависит от `domTree`, а драг-обработчики пишут inline-стили → MutationObserver → debounce 500 мс → `setDomTree` → ререн эффекта посреди зажатого поинтера: `resetVisualState()`, сброс курсора, потеря baseline в `dragTargetRef`. Фикс: `isDraggingRef` + пропуск teardown во время capture, или ключевать эффект только по `selectedNodeId`.

**P1.11. DragControls: скрытые индикаторы не возвращаются; пулы padding/resize не создаются.** `DragControls.tsx:798–913` — hide-путь не сбрасывает `prev*Key`, поэтому при возврате элемента к прежней геометрии sync-ветка скипается и хэндлы остаются невидимыми до смены выделения. `updatePaddingPositions`/`updateResizePositions` (в отличие от margin/gap) не создают пул в rAF-пути — элемент, выделенный маленьким (<50×50) и затем выросший, никогда не получает padding/resize-хэндлы. Фикс: сбрасывать `prev*Key` в hide-путях, добавить creation-loop.

**P1.12. `fetchMatchedRules` не видит `@media`/`@supports`/`@layer`.** `style-bridge.ts:61–74`. Итерируются только top-level `cssRules`; у grouping-правил нет `selectorText`, их вложенные правила не посещаются — в адаптивном проекте инспектор пуст наполовину. Фикс: рекурсия в `rule.cssRules`.

**P1.13. Cancel-кнопки, которые не могут отменить.** `AttributesSection.tsx:249–266` — blur инпута коммитит атрибут раньше клика по Cancel (X): атрибут применён к DOM, ушёл в MCP и undo, клик — no-op. `ColorInput.tsx:231–241, 756–762` (+ GradientInput, VariablePicker) — попап закрывается по document `pointerdown`, свотч снаружи попапа: pointerdown закрывает, click тут же открывает — закрыть попап кликом по открывшей его кнопке невозможно. Фикс: `onMouseDown`+`preventDefault` на кнопках (паттерн уже есть в VariablePicker/TokenAutocomplete); игнорировать в outside-click события, чей composedPath содержит anchor.

**P1.14. Прочие подтверждённые баги среднего веса:**
- `react-tracer.ts:52–124` — regex-трансформ без понимания строк/комментариев портит строковые литералы с `<tag>` (меняет рантайм-значение строки в dev) и неверно ищет конец тега при `title="a > b"`.
- `esbuild.config.js:17–27` — `onEnd` не проверяет `result.errors`: упавший watch-ребилд дописывает второй `export var __LIVE_STUDIO_CSS__` → `Duplicate export` до чистого ребилда.
- `use-keyboard.ts:160–196` — Cmd+C перехватывается при любом выделенном элементе: нельзя скопировать выделенный текст страницы; Ctrl+Shift+C (inspect) тоже проглатывается.
- `edit-slice.ts:15–38` — `enrichChange` приписывает source выделенного элемента любым правкам без него, включая `createDesignToken` на `:root` — агент уходит править не тот файл.
- `FillSection.tsx:28–77` — `visible`/`prevSolidRef` не ключуются по `selectedNodeId`: «глазик» и спрятанный цвет элемента A применяются к элементу B.
- `GradientInput.tsx:403–480` — драг стопов клампится в 0–100 даже в px-режиме; add-stop игнорирует `stopUnit`; toggle repeating использует магический `size = 20`.
- `ColorInput.tsx:128–165` — `parseCssColor` не знает named colors (`red` → «invalid»), `rgb(% % %)`, `hsl(120deg ...)`; незаякоренные regex'ы «парсят» `color-mix(...)` как вложенный rgb и перезаписывают всё выражение. **✅ Исправлено (2026-06-14):** добавлены named colors (полная таблица), `rgb()`-проценты, угловые юниты у hue; regex заякорены — `color-mix()`/`oklch()` больше не мис-парсятся. Покрыто `color-parser.test.ts`.
- `LayoutSection.tsx:229–294` + `use-undo.ts:67–86` — составные правки (margin L+R, alignment, 4 радиуса) пушатся отдельными undo-записями; Cmd+Z откатывает пол-изменения. `pushBatch` существует, но не используется style-путём.
- `use-keyboard.ts` / `serve.ts:168` — пустой ответ `""` на вопрос агента неотличим от таймаута (falsy-check).
- `use-inline-edit.ts:111–132` — после правки остаётся `contenteditable="false"` в DOM пользователя и затирается исходный inline-`outline`.
- `DragControls.tsx:1141–1167` — gap-драг читает только первое значение пары `row-gap column-gap` и перезаписывает обе оси одним числом.
- `DomTree.tsx:89`, `DomOperations.tsx:398–400` — нарушения rules of hooks (условные хуки / хук после early return); работает на честном слове preact/compat.

---

## P2 — Утечки памяти и перформанс

**P2.1. Стрим захвата экрана никогда не останавливается.** `screenshot.ts:38–83`. `displayStream` хранится на уровне модуля, `track.stop()` не зовёт никто — после одного скриншота вкладка «расшарена» (индикатор + цена компоновки) до конца жизни страницы; cleanup `startStudio` его не трогает. Фикс: `releaseDisplayStream()` в cleanup.

**P2.2. Реестр `elements: Map<number, Element>` пинит весь DOM страницы.** `dom-bridge.ts:28, 317–323` + `index.ts:217–221`. Каждый `fetchDomTree` кладёт в Map каждый элемент документа; чистка только из debounced `handleBodyDirty`. Cleanup `startStudio` Map не очищает — после unmount студии Map навсегда удерживает все когда-либо виденные элементы, включая отсоединённые SPA-поддеревья. Также утекают `#live-studio-variants-styles` в `<head>` и активный variant-wrapper. Фикс: `resetRegistry()` + `cancelVariantPreview()` в cleanup.

**P2.3. MutationObserver без `attributeFilter` + полный ребилд на каждое изменение.** `use-page-bridge.ts:63–74, 156`. `{ childList, subtree, attributes }` без фильтра, каждый батч → `fetchDomTree()` — обход всего документа с React-fiber/Vue-vnode детекцией на элемент. Собственные правки редактора (каждый `style.setProperty`, drag, contentEditable) — это attribute-мутации → редактор сам себе главный потребитель CPU. Фикс: инкрементальный ребилд от `mutation.target` или игнор только-что-записанных style-мутаций.

**P2.4. Два вечных параллельных rAF-цикла на 60 fps с layout-чтениями.** `DragControls.tsx:446–470` + `Overlays.tsx:322–451`. Каждый кадр: `getBoundingClientRect`+`getComputedStyle` (включая per-flex-child в `computeGapPositions` и `getComputedStyle` на каждого предка в `hasAnyTransform`), чередуясь со style-записями — многократный пересчёт layout за кадр, навсегда, пока что-то выделено. Бонус: `Overlays.tsx:125–128` — выброшенный форс-рид `getBoundingClientRect` на предка на кадр (мёртвый код). Фикс: один цикл, батч чтений до записей, дешёвый change-key до дорогих чтений.

**P2.5. Ререндер-штормы.** `DomTree.tsx:83–87` — каждый `TreeNode` подписан на сырые `hoveredNodeId`/`selectedNodeIds`/`expandedNodes`: каждый mouseenter перерисовывает все строки дерева. `PropertiesPanel.tsx:136–191` — панель подписана на весь `computedStyles`, `memo` нет нигде: каждый pointermove слайдера → ререндер всех 9 секций + undo-push + queueEdit. Фикс: селекторные подписки на derived-booleans; `memo` на секции + стабильные коллбэки через `useStore.getState()`.

**P2.6. Серверные утечки ресурсов.**
- `bridge.ts:62, 74, 302` — `pendingChanges`/`pendingUserMessages` растут без ограничений, если панель открыта, а агент не поллит (норма до запуска `/studio`).
- `bridge.ts:775` — `stop()` не закрывает клиентские сокеты (`wss.close()` не трогает установленные соединения), `clients` не чистится.
- `serve.ts:315–323` — нет `transport.onclose`: MCP-хост закрыл stdio → осиротевший процесс вечно держит порт 9877 (retry-костыль на EADDRINUSE в `bridge.ts:159–167` — симптом ровно этого).
- `bridge.ts:403–412` — атомарное сохранение DESIGN.md (rename-over) оставляет `fs.watch` на старом inode навсегда.

**P2.7. Мелкие утечки на клиенте.** Не очищаемые `setTimeout`+setState после unmount: `Toolbar.tsx:196–216`, `DesignMdPanel.tsx:144`, `PropertiesPanel.tsx:151–163`. `Panel.tsx:330–349` — resize-листенеры на document без `setPointerCapture`: отпускание мыши вне окна оставляет их висеть. `ColorInput.tsx:284–322` — ChannelField-scrub без `pointercancel`/`lostpointercapture`: залипший `ew-resize`-курсор на body и навсегда заблокированная синхронизация поля. `DomTree.tsx:453–455` — window-листенеры drag'а дерева висят постоянно, а не только во время драга; `resolveTarget` (:370–378) делает `getBoundingClientRect` на каждую строку на каждый pointermove. `Overlays.tsx:236–260` — ховер-подсветка не следит за скроллом (`position:fixed` от одноразового rect).

---

## P3 — Архитектура и «код джуна»

**P3.1. Общий типизированный WS-протокол.** Сейчас обе стороны — string-switch по `msg.type` на нетипизированном `msg: any`: сервер `bridge.ts:265+`, клиент `use-mcp-direct.ts:147–250` (467-строчный god-hook, где весь диспетчер обёрнут в `catch { /* Ignore malformed messages */ }` — реальные исключения хендлеров глотаются молча). Payload варианта собирается вручную в трёх местах (`serve.ts:181, 256, 305`). Фикс: модуль zod-схем, разделяемый клиентом и сервером (zod уже в deps); `Record<type, handler>` вместо if/else-цепочки; узкий try/catch только вокруг `JSON.parse`. Закрывает класс багов P0.2 навсегда.

**P3.2. Разобрать `DragControls.tsx` (1422 строки).** useEffect на ~1000 строк (400–1396) с 25 вложенными замыканиями — прямая причина P1.10, P1.11 и собственного слабого билдера селекторов (`:61–68` — дубль `dom-bridge.buildSelector`, но без `CSS.escape` и class-fallback: drag-правка элемента без id уходит агенту с селектором `div`). Вынести: пулы индикаторов, drag-state-machine, commit-логику — в тестируемые модули.

**P3.3. Вынести и покрыть тестами парсеры.** `ColorInput.tsx` (815 строк) содержит полную HSV/RGB/HSL-библиотеку, generic-попап, scrub-виджет; `GradientInput.tsx` (842) тянет из него `ColorPickerCore, PopoverPanel, parseCssColor...` — «инпут» де-факто util-библиотека подсистемы. ~500 строк чистого парсинга/конверсий — ноль тестов, при этом P0.7–P0.8 и `parseCssColor`-баги живут именно там. Фикс: `utils/color.ts` / `utils/gradient.ts` с round-trip-тестами, либо `colord`/`culori`; `PopoverPanel` — в shared-компонент.

**P3.4. Один `useCommittedInput` вместо восьми копий.** Паттерн «local state + sync-effect + commit on blur/Enter» переписан 8 раз с расходящейся семантикой: `NumberInput:205`, `PairedNumberInput:46`, `ColorInput:279` и `:455`, `GradientInput:321` и `:346`, `TextInput:33`, `AttributesSection:54`. У TextInput и AttrValueInput **нет** focus-guard — внешний рефреш (`refreshIfSelected`, undo, правка агента) затирает текст во время набора.

**P3.5. Дедупликация хелперов** (прямая причина P0.3, P0.4 и `isOverlay`-бага):
- `findNodeInTree` ×4: `DragControls.tsx:70`, `DomOperations.tsx:29`, `ChatPanel.tsx:9`, `use-keyboard.ts:56`;
- `convertTree` ×2: `use-page-bridge.ts:22`, `DomOperations.tsx:40` (уже разъехались: `rebuildDomTree` не делает reselect/purge);
- проверка «внутри студии» ×5: `dom-bridge.ts:54`, `use-inline-edit.ts:18`, `use-element-picker.ts:18`, `use-selected-click-guard.ts:18`, `screenshot.ts:12` — только одна из них знает про `data-ls-visual-control`, из-за чего драг-хэндлы студии попадают в снапшот DOM-дерева пользователя (`dom-bridge.ts:54–66`);
- билдеры селекторов ×4, `PANEL_TAG` ×5, `TREE_HIDDEN_TAGS`/`PROTECTED_TAGS` ×2;
- копипаста «Copy element info»: `Toolbar.tsx:170–197` vs `use-keyboard.ts:159–197` — уже разъехались (тулбар зовёт `getVueTracerInfo` вместо `getTracerInfo` и теряет React-инфо);
- `ActionBar` в `DomOperations.tsx:446–505` построчно повторяет хендлеры `useDomOperations` (:245–295) с уже наметившимся дрейфом.

Всё — в `utils/dom-tree.ts` (уже существует) и новый `utils/overlay.ts`.

**P3.6. Разгрузить god-модули.** `bridge.ts` (779 строк): транспорт + heartbeat + три механизма очередей/waiter'ов + polling-state + file-watching DESIGN.md + variant-state в одном классе. Вынести file-watching и variant-state, добавить `serializeVariantTask()`.

**P3.7. Прочее.**
- `TokenAutocomplete.tsx` — 155 строк + CSS-модуль мёртвого кода (не импортируется нигде), внутри — посимвольная копия `isColorValue` из `css-value.ts`. Удалить или подключить.
- `store.ts:34–38` — кастомный `set` поддерживает только функциональную форму, но кастуется `as typeof rawSet`; cross-slice вызовы через `(get() as ... ).queueEdit?.(...)` молча no-op'нутся при изменении формы. Перейти на `StateCreator<StoreState, [['zustand/immer', never]], [], Slice>`.
- `styles-slice.ts:80–90` — прямая DOM-мутация внутри стора (`createDesignToken`), единственное такое место.
- `cli.ts:32–52` — `parseInt("80abc")` проходит валидацию; `live-studio isntall` молча запускает сервер.
- `LayoutSection.tsx:302` + `styles-slice.ts:97` — gap-контрол читает `row-gap`, пишет `gap`; store протухает до переселекта.
- Попапы (`ColorInput.tsx:215`, `VariablePicker.tsx:44`) позиционируются от одноразового `anchorRect` — отвязываются при скролле.
- rAF-циклы умирают навсегда при моментальном `!el.isConnected` без пути возобновления (`DragControls.tsx:447`, `Overlays.tsx:323`).

---

## P4 — Замечания, найденные при написании тестов (2026-06-14)

Дополнения, выявленные при добавлении характеризационных тестов (см. `docs/test-coverage-map-2026-06-14.md`). Каждое уже зафиксировано зелёным тестом на **текущее** поведение — то есть фикс обязан сначала обновить соответствующий тест. Низкий вес: это локальные логические огрехи, не порча данных.

**P4.1. `toggleMinMax`: состояние `'both'` — ловушка, ветка `→ null` недостижима.** `ui-slice.ts:74–86`. Цепочка `if/else if` такова, что при `current === 'both'` и `which ∈ {'min','max'}` срабатывает `current !== which` → снова `'both'`. Выйти из `'both'` тем же тогглом нельзя, а финальный `else { = null }` не достигается никогда (`which` всегда `'min'|'max'`). Если UI ожидает циклический выход из «показаны обе стороны» — это баг; если `'both'` сбрасывается где-то ещё — мёртвая ветка. Фикс: при `current === 'both'` гасить нажатую сторону в одиночную (`'min'`/`'max'`) либо в `null`; убрать недостижимый `else`.

**P4.2. `coalesceOrPush`: тихая замена вместо слияния для значений не в форме `"A → B"`.** `edit-slice.ts:71–80`. Слияние/детект цикла работают только когда у обоих изменений `value` имеет вид `"from → to"`. Иначе (`fromValue`/`toValue` === undefined) ветка `else` просто перезаписывает `last.value = change.value` — последовательные правки одного узла/свойства с «простыми» значениями молча затирают друг друга без истории. Фикс: либо привести все style-правки к единому `"A → B"`-формату на входе, либо в fallback-ветке тоже формировать диапазон от исходного значения.

**P4.3. Предикаты `css-value.ts` — префиксные/неполные.** `css-value.ts:6–20`. `isColorValue` проверяет только префикс: `#gg` → `true`, `rgb()` → `true` (любая строка с `#`/`rgb`/`hsl`/… считается цветом). `isNumericValue` (regex на `:20`) не знает `fr` (`2fr` → `false`) и допускает пробел между числом и единицей (`10 px` → `true`). Для предиктивной подсветки/маршрутизации значений это даёт ложные срабатывания. Перекликается с P3.7 (копия `isColorValue` в `TokenAutocomplete`) — чинить вместе, единым валидатором. Фикс: валидирующий парсер (или `colord`/`culori`), добавить `fr`, заякорить юнит вплотную к числу.

**P4.4. `normaliseFilePath`: JSDoc расходится с кодом + теряется колонка.** `component-bridge.ts:496–512`. JSDoc (`:496–498`) обещает чистку `/src/`, `/app/`, `/pages/`, `/components/`, `/node_modules/`, а массив `markers` (`:506`) содержит только `/src/`, `/app/`, `/node_modules/` — пути под `/pages/` и `/components/` агенту уходят абсолютными. Плюс React-путь через `_debugSource` (`:440`, `:443`) передаёт только `lineNumber` без `columnNumber`, поэтому `:line:col` теряет колонку (Vue-tracer-путь её сохраняет). Фикс: привести массив маркеров к JSDoc (или наоборот), пробрасывать `columnNumber` в React-ветке.

---

## Рекомендуемая последовательность

1. **Спринт «безопасность + порча данных» (P0)** — почти всё это маленькие локальные патчи: bind на 127.0.0.1 + origin-check + токен, try/catch + zod на входящие фреймы, удалить дублирующий keyboard-эффект, починить селекторы (P0.4, P0.5), NaN/unit-guard в NumberInput, сохранить порядок transform. P0.6 и P0.8 — по ~полдня.
2. **P1 quick wins** — P1.1, P1.3, P1.9 (одна-две строки), затем гонки (P1.2, P1.7, P1.8) и DragControls-баги (P1.10–P1.11).
3. **P2 утечки** — release стрима захвата, очистка реестра элементов, `attributeFilter`, объединение rAF-циклов, селекторные подписки zustand + `memo`.
4. **P3 параллельно/после** — начать с типизированного протокола (P3.1) и вынесения парсеров под тесты (P3.3): максимальный защитный эффект на будущее.
