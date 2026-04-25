# Architecture Review — Live Studio

> Анализ архитектурных возможностей для углубления модулей (deepening opportunities).
> Используется терминология: **module**, **interface**, **seam**, **adapter**, **depth**, **leverage**, **locality**.
> Методология: [improve-codebase-architecture](https://github.com/mattpocock/skills/tree/main/improve-codebase-architecture) (Matt Pocock).

**Дата:** 2026-04-25
**Кодовая база:** ~16K LOC TS/TSX + 3.5K CSS, 114 файлов
**Статус:** Phase 2 complete — кандидаты представлены, Phase 3 (Grilling Loop) по запросу

---

## Обзор модулей

| Модуль | LOC | Глубина |
|--------|-----|---------|
| `server/bridge.ts` (DevToolsBridge) | 669 | **Deep** — multi-client WS, promise-based long-poll, heartbeat, DESIGN.md watcher |
| `client/bridge/dom-bridge.ts` | 360 | **Deep** — element registry, selector builder, DOM tree walker, shadow DOM |
| `client/bridge/component-bridge.ts` | 520 | **Deep** — multi-framework detection (React 16-19, Vue 2-3), fiber walking |
| `client/bridge/style-bridge.ts` | 103 | Moderate — computed/inline/matched-rule fetching |
| `client/bridge/token-bridge.ts` | 32 | **Shallow** — одна функция |
| `state/slices/dom-slice` | 139 | **Deep** — tree traversal, multi-select, recursive mutation |
| `state/slices/edit-slice` | 132 | **Deep** — coalescing, enrichment pipeline, copy-on-write |
| `state/slices/styles-slice` | 90 | **Shallow** — mostly setters |
| `state/slices/ui-slice` | 93 | Medium — mutual exclusion, localStorage |
| `state/slices/panels-slice` | 100 | Medium — dock claims computation |
| `state/slices/chat-slice` | 82 | Medium — message cap, dedup, lifecycle |
| `state/slices/component-slice` | 47 | **Shallow** — setter + equality guard |
| `state/slices/design-md-slice` | 20 | **Shallowest** — одно поле |
| `state/slices/error-slice` | 36 | **Shallowest** — pure getters/setters |
| `components/` (38 файлов) | 10,253 | Mixed — есть deep (DragControls 1422 LOC), есть shallow |
| `hooks/` (9 файлов) | 1,802 | Mixed — `use-mcp-direct` 365 LOC перегружен |

**Связи между слайсами:** Все 9 slices полностью независимы друг от друга. Пересечения только через store.ts (composition) и 2 runtime-зависимости: `edit-slice` → `dom-bridge` + `component-bridge`.

---

## Кандидаты для Deepening

### 1. Unsafe cross-slice coupling: `edit-slice` → `dom-slice`

**Files:** `src/client/state/slices/edit-slice.ts` (~строка 104), `dom-slice.ts`, `store.ts`

**Problem:** `edit-slice.queueEdit` читает `selectedNodeId` из dom-slice через небезопасный каст `_get() as EditSlice & { selectedNodeId?: number | null }`. Это нарушает seam между слайсами — интерфейс edit-slice неявно зависит от поля, которое ему не принадлежит. Если dom-slice переименует поле — каст молча сломается.

**Solution:** Ввести port (интерфейс) `SelectedElementProvider` — чистую функцию, которую edit-slice принимает через параметр или внешний dependency injection. Dom-slice реализует port, edit-slice зависит только от интерфейса.

**Benefits:**
- **Locality:** ответственность за "какой элемент сейчас выбран" остаётся в dom-slice, а edit-slice получает данные через seam, а не через unsafe cast
- **Leverage:** edit-slice становится тестируемым без реального dom-slice — можно подставить mock-провайдер
- Тесты: интерфейс `SelectedElementProvider` становится test surface

---

### 2. DOM side-effects inside state mutation: `edit-slice.enrichChange`

**Files:** `src/client/state/slices/edit-slice.ts`, `src/client/bridge/dom-bridge.ts`, `src/client/bridge/component-bridge.ts`

**Problem:** `enrichChange` вызывает `getElementById` (DOM API) и `detectComponent`/`getTracerInfo` (fiber walking) **внутри immer-мутации**. Zustand slice вызывает побочные эффекты (чтение реального DOM) в том, что должно быть чистым state transition. Это:
- Нарушает **locality** — логика enrichment размазана между state и DOM
- Делает slice нетестируемым без реального DOM
- Может вызвать stale reads если DOM изменился между вызовами

**Solution:** Вынести enrichment в отдельный adapter — `ChangeEnricher` порт. Функция `enrichChange` становится pure, принимает готовый `EnrichedChange` снаружи. Enrichment pipeline — отдельный шаг до записи в state.

**Benefits:**
- **Locality:** enrichment logic в одном месте, state mutation чистая
- **Leverage:** можно тестировать enrichment отдельно (mock DOM), state mutation отдельно (pure)
- Интерфейс `ChangeEnricher` = реальный seam (production DOM adapter + test stub adapter)

---

### 3. Pseudo-derived `selectedNodeId` maintained by store root

**Files:** `src/client/state/store.ts` (set wrapper), `src/client/state/slices/dom-slice.ts`

**Problem:** `selectedNodeId` — поле в dom-slice, но его значение поддерживается корневым set wrapper: `state.selectedNodeId = state.selectedNodeIds.at(-1)`. Это:
- Скрытый invariant — авторы slices не знают, что любая мутация триггерит sync
- Нарушает interface dom-slice: поле выглядит как обычное, но на деле derived
- Каждое обновление store (из любого слайса) пересчитывает это поле

**Solution:** Сделать `selectedNodeId` настоящим derived value через Zustand selector: `const selectedNodeId = useStore(s => s.selectedNodeIds.at(-1))`. Убрать sync из set wrapper.

**Benefits:**
- **Leverage:** интерфейс dom-slice становится честным — поля = то, что написано в slice
- **Locality:** логика "последний выбранный элемент" в одном месте (selector), а не размазана по set wrapper
- Устраняет hidden coupling — set wrapper становится trivial

---

### 4. Pass-through slices и token-bridge

**Files:** `src/client/state/slices/component-slice.ts` (47 LOC), `design-md-slice.ts` (20 LOC), `error-slice.ts` (36 LOC), `src/client/bridge/token-bridge.ts` (32 LOC)

**Problem:** Эти модули — pass-through modules. Каждый предоставляет интерфейс почти такой же сложный, как реализация. Применим deletion test: если удалить `design-md-slice` и заменить прямым вызовом `set({ designMd: { content } })` — сложность не появится в N местах. Модуль не зарабатывает своё существование.

**Solution:** Объединить `design-md-slice`, `error-slice` и `component-slice` в один `ui-meta-slice` (или расширить `ui-slice`). `token-bridge.ts` (32 LOC) слить в `style-bridge.ts`.

**Benefits:**
- **Leverage:** укрупнённый slice имеет более осмысленный интерфейс
- Уменьшает cognitive overhead — 9 slices → 6 slices
- Убирает indirection, которая не несёт нагрузку

---

### 5. Duplicated overlay detection logic

**Files:** `src/client/bridge/dom-bridge.ts` (`isOverlay`), `src/client/hooks/use-page-bridge.ts` (inline reimplementation)

**Problem:** Логика проверки "это overlay-элемент?" продублирована: функция `isOverlay` в dom-bridge и inline-реимплементация (~5 строк) в use-page-bridge. Это нарушает **locality** — баг в одной копии не фиксит другую.

**Solution:** Всегда импортировать `isOverlay` из dom-bridge. Удалить дубликат.

**Benefits:**
- **Locality:** одно место для логики overlay detection
- Нулевой риск рассинхронизации

---

### 6. Server MCP surface: single tool, if/else dispatch

**Files:** `src/server/serve.ts` (~строка 105), `src/server/bridge.ts`

**Problem:** Весь MCP surface — один tool `live-studio` с action enum и if/else диспетчеризацией. Это shallow module: интерфейс (один tool + 6 action'ов) почти так же сложен, как реализация. Каждый action имеет разные зависимости, сигнатуры ответов и side effects.

**Solution:** Разделить на несколько MCP tools: `get-changes`, `ask-question`, `send-message`, `wait-for-message`, `report-error`, `clear-error`. Каждый tool = deep module с чётким интерфейсом.

**Benefits:**
- **Leverage:** каждый tool имеет small interface с clear semantics
- Тестируемость: можно тестировать каждый tool изолированно
- AI-агенту проще понять capabilities — не нужно гадать какие actions доступны

---

### 7. Missing shared types

**Files:** `src/server/bridge.ts` (UserMessage, Change, Viewport), `src/client/bridge/component-bridge.ts` (ComponentProps), `src/client/hooks/use-mcp-direct.ts` (ChatAttachment)

**Problem:** Ключевые типы дублируются: `UserMessage` на сервере и `ChatAttachment` на клиенте описывают одно и то же. `Change`, `Viewport`, `DomTreeNode` определены локально без общего источника truth. Нарушает interface — caller не может быть уверен, что его тип совпадает с типом на другом конце seam.

**Solution:** Создать `src/types.ts` с shared types для протокола WS-коммуникации. Оба конца (server bridge и client hooks) импортируют оттуда.

**Benefits:**
- **Leverage:** одно изменение типа автоматически ломает оба конца при компиляции
- Устраняет silent type drift между сервером и клиентом

---

## Приоритеты

| # | Кандидат | Severity | Effort | Impact |
|---|----------|----------|--------|--------|
| 1 | Unsafe cross-slice coupling | High | Medium | Устраняет hidden dependency, открывает testability |
| 2 | DOM side-effects in state mutation | High | Medium | Чистое разделение state/DOM |
| 3 | Pseudo-derived selectedNodeId | Medium | Low | Убирает hidden invariant из store root |
| 4 | Pass-through slices | Low | Low | Упрощает cognitive overhead |
| 5 | Duplicated overlay detection | Low | Trivial | One-line fix |
| 6 | Single MCP tool dispatch | Medium | High | Улучшает AI-navigability |
| 7 | Missing shared types | Medium | Medium | Предотвращает type drift |

---

## Что отсутствует

- **`CONTEXT.md`** — доменная модель не документирована. Без неё невозможно использовать доменный язык в описаниях модулей (например, "order intake module" vs "order service").
- **`docs/adr/`** — архитектурные решения не записаны. Решение о 9 независимых slices, о single MCP tool, о bridge architecture — всё это implicit knowledge.

Рекомендуется создать `CONTEXT.md` и начать записывать ADR по ключевым решениям.
