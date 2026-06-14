# Карта тестового покрытия live-studio

**Назначение документа:** снимок текущего покрытия по модулям и план добора **юнит-тестов чистой логики**, дополняющий `docs/integration-tests-plan.md`. Тот план — bug-driven (фиксирует находки `docs/code-review-2026-06-10.md` как красные тесты и страхует рефакторинги). Этот — gap-driven: что вообще не покрыто, отсортированное по риску, с явной пометкой пересечений.

**Как читать колонку «Статус плана»:**
- `🟢 в IT-плане` — закрыто в `integration-tests-plan.md`, здесь не повторяем, только ссылаемся;
- `🟡 частично` — смежная область есть в IT-плане, но конкретная функция/ветка не названа;
- `🔴 не покрыто` — нет ни тестов, ни записи в IT-плане. **Основная работа этого документа.**

**Базовые правила** (раннер, fake timers, изоляция, jsdom-ограничения, отсутствие globals) — см. §0–§1 `integration-tests-plan.md`. Не дублируем.

---

## 0. Снимок на 2026-06-14

- **Исходники (не тесты):** 84 файла. **Тест-файлы:** 7. **Тестов:** 39 (все зелёные, `npm test`).
- Покрыта почти исключительно чистая логика-«островки». Вся stateful/событийная механика (WS, long-poll, undo/redo, DOM-мутации, наблюдатели) — без юнит-тестов; частично закрывается интеграционными в IT-плане.
- **Нет измерения покрытия.** Цифры ниже — экспертная оценка. Первый шаг (§5, шаг 0) — поставить `@vitest/coverage-v8`, чтобы дальше мерить по факту.

### Что уже покрыто (использовать как образцы)

| Модуль | Тест-файл | Что закрыто |
|---|---|---|
| `state/validate-token.ts` | `validate-token.test.ts` | полно, edge-кейсы |
| `components/DesignMdPanel/design-md-parse.ts` | `design-md-parse.test.ts` | YAML-фронтматтер, контраст WCAG, циклы рефов |
| `utils/markdown.ts` | `markdown.test.ts` | XSS/скрипты, верность разметки |
| `utils/edit-command.ts` | `edit-command.test.ts` | сериализация (но `applyEditCommandPreview` — нет) |
| `bridge/variants-bridge.ts` | `variants-bridge.test.ts` | inject/swap/accept/ошибка (но контроллер `suppressDepth` — нет) |
| `server/bridge.ts` (variant task) | `bridge.variant-task.test.ts` | стейт-машина варианта (5 из 30+ методов) |
| `PropertiesPanel/inputs/CreateVariableForm.tsx` | `CreateVariableForm.test.tsx` | submit/дубликат/Escape (на хрупких index-селекторах) |

---

## 1. Сервер

| Модуль | Логика | Риск | Статус плана |
|---|---|---|---|
| `server/bridge.ts` | long-poll resolver, switch сообщений, polling-grace таймеры, heartbeat, watch DESIGN.md, кап очередей, EADDRINUSE-ретрай | **HIGH** | 🟡 частично — IT §2 закрывает malformed/lost-update/конкурентные геты/TTL/кап/`stop()`; **не названо**: polling-grace стейт, heartbeat-терминация мёртвых клиентов, debounce DESIGN.md, EADDRINUSE-ретрай |
| `server/serve.ts` | роутинг 9 MCP-экшенов, `handleGetAction` (приоритет variant-task, re-check после long-poll), валидации | **HIGH** | 🟡 частично — IT §2 `serve.mcp.test.ts` закрывает фейл-нотификации/таймауты; **не названо**: per-action валидация (`ask` без `options`, `variant-result` без `html`), приоритет variant-task в `handleGetAction` |
| `server/cli.ts` | парсинг argv, валидация порта `[1,65535]`, dispatch install/serve | MED | 🔴 не покрыто |
| `server/install.ts` | merge `.mcp.json`, запись skill-файлов, `getMcpEntry` (local bin vs npx) | MED | 🟢 в IT-плане (§2 `install.test.ts`) |
| `server/project-root.ts` | walk-up до package.json | LOW | 🟢 в IT-плане (§2, через `findUp`) |
| `server/skill.ts`, `prompts/variant.ts` | константы-строки | — | не тестировать (нет логики) |

### Новые задачи (🔴/🟡 не названное)

**S1. `serve.ts` — валидация и роутинг экшенов** (`serve.serve-actions.test.ts`, через `createServer(bridge)` шов из IT §6).
- `ask` без `options` → `errorResult`, не исключение.
- `variant-result` без `taskId`/`html` → `errorResult`; с неизвестным `taskId` → «No matching dispatched variant task».
- `variant-implemented` с чужим `taskId` → `errorResult`, активная задача не очищена.
- `handleGetAction`: variant-task, поставленная во время long-poll, попадает в ответ вместе с changes (re-check после ожидания).

**S2. `bridge.ts` — polling-grace и DESIGN.md** (дописать в WS-тесты IT §2 или отдельный `bridge.lifecycle.test.ts`, fake timers).
- `markPollingActive()` → broadcast только при смене состояния (guard `lastBroadcastedPolling`); `schedulePollingInactive()` ждёт 30s grace и не шлёт «inactive», если появился новый ждущий.
- DESIGN.md: 5 событий watcher за <150ms → `readDesignMd` вызван один раз (debounce); отсутствие файла → broadcast с `content: null`.
- heartbeat: клиент с `isAlive=false` на тике → `terminate()`.

**S3. `cli.ts` — парсинг аргументов** (`cli.test.ts`; вынести `parseArgs(argv)` в чистую функцию — тестовый шов, поведение 1:1).
- `--port 0` / `65536` / `-1` / `abc` → отклоняются (валидное сообщение/код выхода); `--help`/`--version` → ранний возврат без старта сервера; неизвестный флаг → ошибка.

---

## 2. Клиентские бриджи и утилиты

| Модуль | Чистота | Риск | Статус плана |
|---|---|---|---|
| `bridge/dom-bridge.ts` `buildSelector`/`buildElementSelector` | pure (CSS.escape, nth-of-type) | **HIGH** | 🟢 в IT-плане (§4.1 P0.4) |
| `bridge/component-bridge.ts` (≈488 строк): fiber-детект React/Vue, `normaliseFilePath`, фильтр пропов | pure+dom | **HIGH** | 🔴 не покрыто |
| `bridge/style-bridge.ts` `fetchMatchedRules` (media/supports/layer) | dom | MED | 🟢 в IT-плане (§4.3 P1.12) |
| `bridge/token-bridge.ts` `fetchDesignTokens` (`--*` из `:root`) | dom | MED | 🔴 не покрыто |
| `bridge/variants-bridge.ts` контроллер `suppressDepth`/preview-стейт | dom | MED | 🟡 частично (IT §4.2 — `isVariantSwapInProgress`; счётчик глубины не назван) |
| `utils/css-value.ts` `isColorValue`/`isNumericValue` (13+ форматов) | pure | **HIGH** | 🟡 частично (IT §3 `color.test.ts` — про парсер цвета; предикаты `css-value` отдельны) |
| `utils/dom-tree.ts` `findAncestorChain` | pure | MED | 🔴 не покрыто |
| `utils/edit-command.ts` `applyEditCommandPreview` | pure+dom+store | **HIGH** | 🔴 не покрыто (сериализация — да; превью — нет) |
| `utils/select-node.ts` оркестрация bridge+store | dom+store | MED | 🔴 не покрыто |
| `utils/screenshot.ts` / `use-screenshot` | dom (getDisplayMedia) | MED | 🔴 не покрыто — **вне jsdom**, см. примечание |

> **Примечание по `screenshot.ts`:** `getDisplayMedia`/canvas/`requestVideoFrameCallback` в jsdom не работают. Геометрию marquee (rect-математика) тестировать только как чистую функцию после выноса; capture-флоу — на e2e/Playwright или не тестировать. Не мокать медиа-API ради «интеграционного» теста — он проверит мок.

### Новые задачи

**C1. `component-bridge.ts` (самый крупный непокрытый модуль).** `component-bridge.test.ts`:
- `findUserComponentFiber`: цепочка Memo→ForwardRef→Button пропускает обёртки и возвращает пользовательский компонент; нет пользовательского — fallback.
- `normaliseFilePath`: `/src/App.tsx`→`src/App.tsx`, с `:line:col` сохраняется суффикс, `/node_modules/...` не ломается.
- фильтр пропов: служебные/функции отсекаются, сериализуемые остаются.

**C2. `css-value.ts` предикаты.** `css-value.test.ts`, таблично `it.each`:
- `isColorValue`: `#FFF`/`#aabbccdd`/`rgb(1 2 3 / .5)`/`hsl(120deg 50% 50%)`/`red`/`transparent` → true; `#gg`/`rgb()`/`var(--x)` → ожидаемое поведение зафиксировать.
- `isNumericValue`: `10.5em`/`-5px`/`45deg`/`0`/`2fr` → true; `auto`/`calc(...)` → зафиксировать факт.

**C3. `dom-tree.ts` `findAncestorChain`.** Цепочка из 5 узлов, цель в середине → массив предков по порядку; цель не найдена → null; защита от null-узлов.

**C4. `edit-command.ts` `applyEditCommandPreview`.** Применить preview style-команды к элементу → инлайн-стиль изменился; ветки для attr/text; откат preview не оставляет мусора.

**C5. `token-bridge.ts` `fetchDesignTokens`.** `:root { --a: 1px; --b: red }` + не-токен-свойство → возвращаются только `--*`; try/catch не падает при недоступном `:root`.

---

## 3. Состояние (Zustand-слайсы)

Слайсы — почти чистые редьюсеры, идеальные кандидаты на дешёвые юнит-тесты. В IT-плане **не фигурируют** (он интеграционный). Тестировать через `useStore.getState()` без рендера.

| Слайс | Нетривиальная логика | Риск | Статус |
|---|---|---|---|
| `edit-slice.ts` | `coalesceOrPush` (слияние последовательных правок, парс «A → B», детект цикла), `enrichChange` (инъекция source/component) | **HIGH** | 🟡 частично (IT §4.4 «undo-батчинг M7» — про UI; slice-уровень не назван) |
| `styles-slice.ts` | `addDesignToken` (find/update, идемпотентность), `createDesignToken` (DOM + `queueEdit`) | **HIGH** | 🔴 не покрыто |
| `dom-slice.ts` | `findNodePath`, `expandToNode` (пометка предков), `setNodeAttribute` (вложенный visit) | MED | 🔴 не покрыто |
| `panels-slice.ts` | `recomputeClaims` (производная ширина доков) | MED | 🔴 не покрыто |
| `component-slice.ts` | `sameComponent` (shallow-equal пропов) | MED | 🔴 не покрыто |
| `ui-slice.ts` | `toggleMinMax` (цикл 5 состояний), `toggleTheme` (localStorage) | MED | 🔴 не покрыто |
| `chat-slice.ts` | `addChatMessage` (авто-id/таймстемп, тримминг до 200), дедуп вложений | LOW | 🔴 не покрыто |
| `design-md-/error-/variants-slice` | тривиальные сеттеры | LOW | не тестировать |

### Новые задачи

**ST1. `edit-slice.coalesceOrPush`** (`edit-slice.test.ts`) — **высший приоритет среди слайсов:**
- merge: правки `color 4px→8px` затем `8px→12px` той же ноды/свойства → одна правка `4px→12px`;
- цикл: `4px→8px` затем `8px→4px` → правка удаляется (no-op);
- разные свойства/ноды → не сливаются.

**ST2. `styles-slice.addDesignToken`** — новый токен пушится; то же имя+значение → без изменений (идемпотентность); то же имя, новое значение → заменяется.

**ST3. `dom-slice.expandToNode` / `findNodePath`** — глубина 4, expand к листу → все предки помечены; путь к несуществующему id → null.

**ST4. `panels-slice.recomputeClaims`** — левые панели (300, 250) + правая (320) → `{left:300,right:320,bottom:0}`; все закрыты → нули.

**ST5. `ui-slice.toggleMinMax`** — полный цикл состояний (null→min→…→null) детерминирован; **+** `component-slice.sameComponent`, `chat-slice.addChatMessage` (тримминг до 200) — добить группой как дешёвые.

---

## 4. Хуки и компоненты

| Элемент | Логика | Риск | Статус плана |
|---|---|---|---|
| `use-mcp-direct.ts` | реконнект-бэкофф, офлайн-очередь (cap 50), роутинг 13 типов сообщений | **HIGH** | 🟢 в IT-плане (§4.6, mock-socket) |
| `use-undo.ts` / `use-apply-undo.ts` | стек undo/redo, слияние, обратное применение DOM-мутаций | **HIGH** | 🟡 частично (IT §4.4 — undo через клавиши; slice-логика `use-undo` отдельно не разложена) |
| `use-page-bridge.ts` | debounce MutationObserver, восстановление протухшего выделения, фильтр shadow-DOM/variant-swap | **HIGH** | 🟡 частично (IT §4.2 — подавление swap; debounce + stale-recovery не названы) |
| `use-keyboard.ts` | 8 биндингов, навигация по дереву | **HIGH** | 🟢 в IT-плане (§4.4) |
| `use-element-picker` / `use-inline-edit` / `use-selected-click-guard` | порядок capture-листенеров, shadow-guard, очередь правок | MED | 🟢 в IT-плане (§4.5) |
| `ColorInput.tsx` | HSVA↔RGBA↔HSLA конвертация | **HIGH** | 🟡 частично (IT §3 `color.test.ts` round-trip HSV↔RGB↔HEX; HSLA-ветка не названа) |
| `NumberInput.tsx` | конфиги единиц на свойство, клэмп | MED | 🟢 в IT-плане (§3 `number-commit.test.ts`) |
| `ContextMenu.tsx` | клэмпинг к краю вьюпорта | MED | 🔴 не покрыто |
| `ChatPanel.tsx` | дедуп авто-вложений, автоскролл | MED | 🔴 не покрыто |
| `Toolbar.tsx` | позиция drag в localStorage, клэмп границ | MED | 🔴 не покрыто |
| `DomTree/DomOperations.tsx` | add/remove/duplicate, replace-tag, якоря | MED | 🟡 частично (IT §4.4 P0.3 — дубликат; полный CRUD не назван) |
| `index.ts` `startStudio` | shadow DOM, тема, дедуп шрифтов, lifecycle | MED | 🔴 не покрыто |
| прочие (`Panel`, `Overlays/*`, секции, поповеры) | презентация | LOW | не приоритет |

### Новые задачи

**H1. `use-page-bridge` debounce + stale-recovery** (`use-page-bridge.test.tsx`, fake timers, jsdom):
- 10 мутаций за <debounce → `handleBodyDirty` один раз;
- мутация внутри shadow-root панели → `handleBodyDirty` НЕ вызван (уже частично в IT §4.2 — свериться, не дублировать);
- выделенный элемент откреплён → восстановление через селектор находит замену.

**H2. `ContextMenu` клэмпинг** — позиция у правого/нижнего края → `left/top` зажаты в пределах вьюпорта.

**H3. `ChatPanel` дедуп авто-вложений** — нода 5 уже в `pendingAttachments` → `autoAttachments` её отфильтровывает.

**H4. `index.ts startStudio` lifecycle** — повторный вызов не монтирует второй раз (`console.warn` + ранний выход); тема читается/пишется в localStorage; шрифт инжектится один раз.

> `ColorInput` HSLA-ветку и `DomOperations` полный CRUD добавлять к соответствующим тестам IT-плана (§3 / §4.4), не отдельным документом.

---

## 5. Порядок исполнения

**Шаг 0 (обязателен):** `npm i -D @vitest/coverage-v8`, добавить скрипт `"test:coverage": "vitest run --coverage"`, зафиксировать стартовую цифру. Все дальнейшие шаги мерить ею.

Приоритет — по ROI (дёшево + высокий риск + не пересекается с IT-планом):

1. **Слайсы ST1–ST5** — чистые редьюсеры, без рендера, максимум покрытия за минимум усилий. Начать с `ST1 edit-slice.coalesceOrPush` и `ST2 styles-slice`.
2. **Утилиты/бриджи C2–C5** (`css-value`, `dom-tree`, `edit-command preview`, `token-bridge`) — чистые, дешёвые.
3. **Сервер S1–S3** (`serve.ts` валидации, `bridge` polling/DESIGN.md, `cli` парсинг) — высокий риск, логика без DOM.
4. **`component-bridge` C1** — крупный, ценный, но трудозатратный (fiber-фикстуры).
5. **Хуки/компоненты H1–H4** — после установки `@testing-library/preact` (см. IT §7, devDeps).

**Definition of done:**
- `npm test` зелёный, без реальных таймаутов/sleep (fake timers);
- по каждому новому модулю покрыта названная функция и её ветки (не smoke);
- `test:coverage` показывает рост против стартовой цифры из шага 0;
- ни одна задача не дублирует уже существующий тест из `integration-tests-plan.md` (при пересечении — дописать в его файл, а не плодить новый).

---

## Приложение: что НЕ тестировать

- Строки-константы (`skill.ts`, `prompts/variant.ts`).
- Тривиальные сеттеры слайсов (`design-md-`, `error-`, `variants-slice`).
- Геометрия в jsdom (`getBoundingClientRect` = нули) — выносить в чистые функции, см. IT §5.
- Медиа/canvas-флоу `screenshot.ts` — e2e или никак, не мокать API.
- Чистая презентация (`Panel`, `Overlays/*`, большинство `sections/*`).
