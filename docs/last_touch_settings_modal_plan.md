# План: модалка настроек LastTouch — фича «Последнее касание клиента» (фронтэнд виджета)

Дата: 2026-08-24

Контекст: бэк реализован по `../back/docs/last_touch_endpoints_plan.md` (§10 — статус: завершено).
Доступны два эндпоинта настроек amo-аккаунта. Задача этого плана — UI в виджете для управления
настройками расчёта последнего касания: современный дизайн, удобный UX, SOLID-архитектура,
совместимость с `.eslintrc` (airbnb-base) и существующими паттернами проекта.

---

## 1. Цель и рамки

Одна модалка в настройках виджета amoCRM, открываемая из `Settings.vue`, управляющая пятью полями
настроек последнего касания аккаунта:

| Поле API (snake_case) | Тип JSON | Что управляет |
|---|---|---|
| `funnels` | `{pipeline_id: int, status_ids: int[]}[] \| null` | фильтр сделок по воронкам/статусам |
| `call_statuses` | `int[] (1..7) \| null` | разрешённые статусы звонков |
| `min_call_duration_sec_by_status` | `{status: sec} \| null` | мин. длительность касания-звонка по статусу |
| `custom_field_id` | `int \| null` | кастомное поле сделки для записи даты касания |
| `disabled_touch_types` | `string[] \| null` | отключённые типы касаний |

**Входит в итерацию:** только GET/PUT `/api/last-touch/settings`. Эндпоинт `/interactions` —
вспомогательная отладочная таблица, в эту итерацию НЕ входит (OCP: при надобности добавится
отдельным интерфейсом + компонентом без правки текущих слоёв).

**Не меняется:** расчётный механизм бэка, `index.js`-логика mount'а настроек виджета, manifest.

---

## 2. Контракт API (зафиксирован бэком)

| Метод | Путь | Права | Ответ / ошибки |
|---|---|---|---|
| GET | `/api/last-touch/settings` | любой аутентифицированный | `200 {saved: bool, settings: {...}}`; нет строки в БД → все поля `null`, `saved:false`. 401 — без токена; 422 `'amo account not bound'` — токен не привязан к аккаунту |
| PUT | `/api/last-touch/settings` | только админ (`CurrentUserAdmin`) | тело = тот же shape, **полная замена** (отсутствующий ключ / `null` = «не задано»); `200 settings` — ровно сохранённые нормализованные значения. 403 — не админ; 422 `{message, errors:{last_touch_settings: [...]}}` — ошибки домена на русском (содержат имя поля) |

Допустимые `disabled_touch_types` (`TouchTypes::TOGGLEABLE_TOUCH_TYPES`, 12 значений):
`incoming_call`, `outgoing_call`, `incoming_mail`, `outgoing_mail`, `incoming_chat_message`,
`outgoing_chat_message`, `incoming_sms`, `outgoing_sms`, `common_note_added`,
`attachment_note_added`, `chat_reply`, `chat_first`.

Ключевые семантики для UI:
- «не задано» (`null`) ≠ «пустой список»: в ответах бэка пустые значения приходят как `null`;
  на запись отправляем `null`, если секция не заполнена.
- PUT — полная замена: каждый save обязан содержать ВСЕ ПЯТЬ ключей (гарантирует маппер, §4).

---

## 3. Архитектура: слои и SOLID

```text
Vue SFC (только разметка/взаимодействие)          Composable (состояние формы + оркестрация)     Driver (HTTP-граница)
─────────────────────────────────────             ────────────────────────────────────            ─────────────────────────
LastTouchSettingsModal.vue                        useLastTouchSettings.ts:                      LastTouchSettingsApi implements
 ├ LastTouchFunnelsSection.vue                     - загрузка GET + pipelines/CF                  ILastTouchSettingsApi (DIP):
 ├ LastTouchCallStatusesSection.vue                - reactive-форма, machine loading/saving        get(): Promise<ILastTouchSettingsResponse>
 ├ LastTouchCustomFieldSection.vue                 - валидация-страховка перед save                save(payload): Promise<ILastTouchSettingsPayload>
 └ LastTouchDisabledTypesSection.vue               - маппинг форма ↔ payload (чистые функции       (host через конструктор, как SettingsApi;
       ↓ props/emits (нет HTTP!)                    из mapper-модуля)                              sendRequest → $authorizedAjax)
                                                                                                     catch: 403/422 → типизированная ошибка
helpers/lastTouchSettingsMapper.ts — чистые функции fromApiResponse()/toApiPayload()
constants/lastTouch.ts — TOGGLEABLE_TOUCH_TYPES + RU-лейблы, CALL_STATUSES meta
```

Распределение принципов:

- **SRP**: SFC-секции — только разметка своего блока (props → emits); composable — единственная
  точка состояния формы и жизненного цикла запросов; driver — только HTTP и перевод ошибок в
  понятный UI слой; mapper — чистые преобразования форм; константы — справочники.
  Ни один SFC не вызывает API напрямую.
- **OCP**: новый допустимый тип касания / статус звонка добавляется строкой в `constants/lastTouch.ts`
  (лейбл + значение), без правки компонентов/composable/driver; будущий `/interactions` — отдельный
  интерфейс `ILastTouchInteractionsApi` + driver, без изменения существующих контрактов.
- **LSP**: компоненты зависят от интерфейса `ILastTouchSettingsApi`, а не от класса; мок в storybook/
  ручных тестах подменяется без правки composable.
- **ISP**: контракт драйвера — ровно два метода по одной сущности (`get`/`save`); interactions-контракт
  (при надобности) будет отдельным интерфейсом, а не расширением этого.
- **DIP**: composable получает API через `useAmoCrmStore().getApi.value.lastTouchSettingsApi`
  (инстанс ставится в `index.js` как остальные драйверы); SFC не знают ни о driver'е, ни о store.

**Правило границ:** между UI-слоем и composable передаются типизированные формы (§4), между
composable и API — только snake_case payload из `ILastTouchSettings.ts`. Вложенные «карты» статус→секунды
существуют в JSON-форме API; внутри формы — тот же map (единая форма данных, без двойного представления).

---

## 4. Типы, константы, маппинг

### 4.1 `src/interfaces/ILastTouchSettings.ts`

```text
IFunnelEntry { pipelineId: number, statusIds: number[] }          // UI-форма (camelCase)
ICallDurationMap = Record<number, number>                         // status → minSec
ILastTouchFormState {
  funnels: IFunnelEntry[],                    // [] = фильтр выключен
  callStatuses: number[],                     // [] = все статусы
  minCallDurations: ICallDurationMap,         // {} = без лимитов; ключи только из callStatuses (решение §9.2)
  customFieldId: number | null,               // null = запись в поле выключена
  disabledTouchTypes: string[],               // [] = все типы включены
}
ILastTouchSettingsPayload {                    // JSON-форма API, snake_case; «не задано» = null
  funnels: { pipeline_id: number, status_ids: number[] }[] | null,
  call_statuses: number[] | null,
  min_call_duration_sec_by_status: Record<string, number> | null,
  custom_field_id: number | null,
  disabled_touch_types: string[] | null,
}
ILastTouchSettingsResponse { saved: boolean, settings: ILastTouchSettingsPayload }
```

### 4.2 `src/interfaces/ILastTouchSettingsApi.ts`

`get(): Promise<ILastTouchSettingsResponse>`, `save(payload): Promise<ILastTouchSettingsPayload>`.

### 4.3 `src/constants/lastTouch.ts` (аналог бэкенд-справочника, единая точка)

- `TOGGLEABLE_TOUCH_TYPES: { value: string; labelRu: string }[]` — 12 пар по
  `TouchTypes::TYPE_LABELS`: вх./исх.звонок, письмо(вх./исх.), чат(вх./исх.), SMS(вх./исх.),
  заметка, файл, чат-ответ, чат-первый. Лейбл `incoming_chat_message` = «чат(вх.)» (решение §9).
- `CALL_STATUSES: { value: number (1..7); labelRu: string }[]` — статусы звонков amoCRM
  (предоставлено пользователем, решение §9):
  1=«Оставил сообщение», 2=«Перезвонить позже», 3=«Нет на месте», 4=«Разговор состоялся»,
  5=«Неверный номер», 6=«Не дозвонился», 7=«Номер занят».
- Группировка типов для UI (звонки/почта/чат/SMS/заметки) — только порядок отображения.

### 4.4 `src/helpers/lastTouchSettingsMapper.ts` — чистые функции, без Vue/Laravel-зависимостей:

- `fromApiResponse(payload): ILastTouchFormState` — `null → []/{}/null`; нормализация ключей map
  к number; дубли `status_ids` выкидываются (страховка); неизвестный pipeline_id сохраняется как есть.
- `toApiPayload(form): ILastTouchSettingsPayload` — пустые значения → `null` (семантика «не задано»);
  **всегда все пять ключей**; map длительностей строится только по включённым статусам (§9.2).
- `isFormDirty(form, baseline)` — для UX-подсказки о несохранённых изменениях (опционально).

---

## 5. Driver и интеграция в store

1. **`src/drivers/backend/LastTouchSettingsApi.ts`** (`implements ILastTouchSettingsApi`,
   `constructor(host)`) — шаблон: `SettingsApi`:
   - пути в константе `api = { settings: '/api/last-touch/settings' }`;
   - `get()` → `sendRequest(host + api.settings, MethodsEnum.get)`;
   - `save(payload)` → `sendRequest(..., MethodsEnum.put, JSON.stringify(payload))` (паттерн
     `longLivedToken`: тело строкой, contentType уже `application/json` по умолчанию);
    - catch: форма режекта зафиксирована (§9.1): `$authorizedAjax` возвращает jQuery-`$.Deferred`,
      при ошибке reject получает **jqXHR** → `e.status` / `e.responseText`:
      403 → «Сохранение доступно только администраторам аккаунта»; 422 → JSON из `responseText`
      (`{message, errors}`), текст из `errors.last_touch_settings[0]`, fallback `message`;
      прочее/сеть/CORS (`status === 0`) — generic «попробуйте позже». Бросать дальше типизированное
      исключение с кодом (403/422/network) и текстом — composable сам решает, показывать/отменять.
2. **`src/interfaces/IApi.ts`**: + `lastTouchSettingsApi: ILastTouchSettingsApi`.
3. **`src/stores/useAmoCrmStore.ts`**: `setApi(...)` — +5-й параметр, запись в `instance.api`.
4. **`src/index.js`**: `new LastTouchSettingsApi(host)` в вызове `setApi` (рядом с `PrivilegesApi`).

---

## 6. UI/UX: структура модалки и дизайн

Контейнер — существующий `UiModalContainer` (белый, p28). Ширина ограничена окном настроек amoCRM;
макет одноколоночный, секции-карточки, скролл внутри модалки при переполнении. Палитра — та же
amoCRM: текст `#363b44`, границы `#e8eaeb`, hover `#f5f5f5`, выбранный `#e6f7ff`, акцент `#21a6d8`.

```text
┌───────────────────────────────────────────────────────────────┐
│  Настройки последнего касания                          [✕]     │
│  (hint: изменения применяются ко всему amo-аккаунту)           │
│                                                               │
│ ┌ ВОРОНКИ И СТАТУСЫ СДЕЛОК ────────────────────────────────┐  │
│ │ Пусто = касания считаются по всем воронкам и статусам.    │  │
│ │ [ Воронка: «Продажи» ▾ ]  [✓ Ст1] [✓ Ст2] [✕ Ст3] … [+]  │  │
│ │ [ + Добавить воронку ]   (дубликат одной воронки нельзя)  │  │
│ └───────────────────────────────────────────────────────────┘  │
 │ ┌ ЗВОНКИ ──────────────────────────────────────────────────┐  │
 │ │ Пусто = все статусы звонков считаются касаниями.          │  │
 │ │ [✓ Разговор состоялся] [ ] Не дозвонился … (7 статусов)   │  │
 │ │   мин. длительность: [ 30 ] сек (рядом только с включ.)   │  │
│ └───────────────────────────────────────────────────────────┘  │
│ ┌ ПОЛЕ ЗАПИСИ ДАТЫ КАСАНИЯ ────────────────────────────────┐  │
│ │ [ Выбрать поле (тип «дата-время») ▾ ]   hint: пусто =     │  │
│ │ запись не выполняется                                     │  │
│ └───────────────────────────────────────────────────────────┘  │
│ ┌ ТИПЫ КАСАНИЙ ────────────────────────────────────────────┐  │
│ │ Звонки:   [вх.звонок ●—] [исх.звонок ●—]                  │  │
│ │ Почта:    …   Чат: …   SMS: …   Заметки: …               │  │
│ │ (выкл = не считается касанием)                            │  │
│ └───────────────────────────────────────────────────────────┘  │
│ [Ошибка 422/403 — баннер с текстом бэка, при наличии]         │
│                                   [ Отмена ]  [ Сохранить ]    │
└───────────────────────────────────────────────────────────────┘
```

Детали UX:
- **Loading**: skeleton (пульс) на весь контент до готовности GET + pipelines; save — спиннер/
  disabled на кнопке «Сохранить».
- **Воронки**: `UiSearchableSelect` по воронкам (`pipelineApi.list()`); статусы — чекбоксы-чипы
  внутри карточки (не `UiSelectableTable` — он тяжеловесен и скроллит сам). Строка без единого
  статуса не сохраняется (кнопка «Сохранить» не блокируется, маппер отбрасывает такие строки +
  подсказка под секцией; страховка соответствует правилу бэка `min:1`).
- **Звонки**: чипы 7 статусов с именами из `CALL_STATUSES`; input длительности (`type=number`,
  min 0, placeholder «без лимита») появляется только у включённых статусов.
- **Кастомное поле**: `UiSearchableSelect` по `pipelineApi.leadsCustomFields()`, отфильтрованному
  ТОЛЬКО по `type === date_time` (решение §9 — поля типа `date` не показываем); clear → null;
  hint: «поле должно быть типом „дата-время“».
- **Типы касаний**: новый базовый компонент `UiSwitch.vue` (toggle, props: modelValue/disabled,
  emit update) — современный вид «вкл/выкл»; по умолчанию все включены. Выключенный → попадает
  в `disabled_touch_types`.
- **Сохранение**: успех → уведомление `show_message` «Настройки последнего касания сохранены» +
  закрывание модалки (emit `apply`, как у token-модалок); ошибка 422/403 — баннер, форма не сбрасывается.
  Кнопка НЕ предблокируется для не-админа (предпроверки нет — решение §9.5): 403 → баннер
  «Сохранение доступно только администраторам аккаунта».
- Доступность: focus-ring на интерактивах, hover/active/disabled-состояния во всех контролах,
  текстовые hints для каждой секции («что значит пусто»).

---

## 7. Компоненты и composable (детально)

1. **`src/components/base/UiSwitch.vue`** — новый generic-примитив (без домена): `modelValue: boolean`,
   `disabled`; CSS-only toggle 28×16px, transition 0.15s; стиль в модулях CSS как у остальных base.
2. **`src/components/modals/lasttouch/LastTouchFunnelsSection.vue`** — props: `pipelines: IPipeline[]`,
   `modelValue: IFunnelEntry[]`; emits `update:modelValue`. Внутри: выбор воронки (список опций =
   pipelines минус уже добавленные), чипы статусов, delete-кнопка строки, add-кнопка.
3. **`src/components/modals/lasttouch/LastTouchCallStatusesSection.vue`** — props: `modelValue: {statuses:number[], durations: ICallDurationMap}`;
   рендер чипов + input длительности по включённым статусам.
4. **`src/components/modals/lasttouch/LastTouchCustomFieldSection.vue`** — props: `fields: ICustomField[]`,
   `modelValue: number|null`; search-select + clear.
5. **`src/components/modals/lasttouch/LastTouchDisabledTypesSection.vue`** — props: `modelValue: string[]`;
   рендер переключателей по группам из констант; emit разницы выбранных (disabled-список).
6. **`src/composables/useLastTouchSettings.ts`**:
   - состояние: `isLoading`, `isSaving`, `apiError: {title, text} | null`, `form: Ref<ILastTouchFormState>`,
     baseline после загрузки;
   - `load()`: параллельно GET настроек + `pipelineApi.list()` (custom fields — лениво при первом
     открытии секции/модалки, кеш 15 c уже есть в драйвере);
   - `save()`: страховочная валидация (строки funnels без status_ids отбрасываются; длительности —
     только целые ≥0) → `toApiPayload` → `api.save()` → успех: обновить baseline, emit-событие наружу;
     ошибка 403/422/сеть: заполнить `apiError`, не сбрасывать форму;
   - `resetToBaseline()`.
7. **`src/components/modals/LastTouchSettingsModal.vue`** — корень: `UiModalContainer`, секции,
   футер с кнопками (`UiButton`), баннер ошибки; на открытии вызывает composable.load();
   emits `apply` / `close` (контракт jenesius-vue-modal, как у token-модалок).

---

## 8. Интеграция в Settings.vue

По паттерну существующих модалок токена:
- `const isOpenLastTouchSettingsModal = ref(false)` + `<ui-button label="Настройки последнего касания" …/>`
  (блок «Доступные опции настроек»);
- `watch(isOpenLastTouchSettingsModal, …)` → `openModal(LastTouchSettingsModal, {})`;
  `modal.on('close', () => closeModal())`, `modal.on('apply', () => closeModal())` — успех/уведомление
  показывает composable/driver (единая точка уведомлений уже в driver'е по паттерну SettingsApi).

---

## 9. Решения и закрытые вопросы (уточнено 2026-08-24)

1. **Форма ошибок `$authorizedAjax` — РАЗРЕШЕНО.** По официальной документации amoCRM
   (`/developers/content/web_sdk/mechanics#authorized_ajax`, `/oauth/disposable-tokens`): метод
   подмешивает заголовок `X-Auth-Token` (JWT disposable token, HS256) и возвращает jQuery
   `$.Deferred`; при ошибке reject получает **jqXHR** (`e.status`, `e.responseText`). Обработка в
   driver'е — по §5 п.1: 403 → баннер прав; 422 → JSON из `responseText` (`errors.last_touch_settings[0]`);
   прочее/сеть/CORS (`status === 0`) → generic. axios/fetch не нужны; CORS бэка уже разрешает
   `PUT` + `X-Auth-Token` (middleware `Cors`). Единственный остаток: лёгкая ручная сверка jqXHR-shape
   на реальном 422/403 при шаге 6 (чеклист §11).
2. **Лейблы — РАЗРЕШЕНО.** Лейблы статусов звонков 1..7 предоставлены пользователем из amoCRM
   (§4.3 `CALL_STATUSES`): 1=Оставил сообщение, 2=Перезвонить позже, 3=Нет на месте,
   4=Разговор состоялся, 5=Неверный номер, 6=Не дозвонился, 7=Номер занят. Лейбл
   `incoming_chat_message` = «чат(вх.)» (подтверждено). Fallback «Статус N» не нужен, но
   рендерер лейблов пишет `label ?? 'Статус N'` как страховку.
3. **Тип кастомного поля — РЕШЕНО: только `date_time`.** Бэк пишет unix ts в поле (live-проб G1 —
   CF 1582441 date_time, `LeadRepository::updateLeadCustomField`), чтение ожидает числовое значение;
   поля типа `date` в select не показываем + hint в UI (§6).
4. **Длительности при снятии статуса с чекбокса — РЕШЕНО:** из map удаляются (лимит применяется
   только включённым статусам; при повторном включении — заново, без «памяти»). Альтернатива
   (хранить скрытые значения) отклонена как лишнее состояние.
5. **Права админа — РЕШЕНО: предпроверки нет.** Надёжного флага на стороне виджета нет: JWT-токен
   содержит только account_id/user_id; `IWidget.isCurrentUserAdmin` в `index.js` не выставляется;
   `PrivilegesApi`/`IPrivilegesList` — мёртвый код (нигде не вызывается, а эндпоинт
   `/api/privileges/current-user` в last-touch-бэке отсутствует — проверено по routes). Кнопка
   «Сохранить» всегда активна; 403 → баннер «Сохранение доступно только администраторам аккаунта».
   Опциональный follow-up (вне итерации): тонкий GET `is_user_admin` на бэке (источник — тот же
   `AmoAccount::isCurrentUserAdmin()`, что и middleware `CurrentUserAdmin`) + предблокировка кнопки.
6. **Удалённые воронки/поля в сохранённых настройках** — бэк их не валидирует; UI: рендер «Воронка #ID»
   с warning-чипом, id сохраняется как есть (не молча удаляется).

---

## 10. Шаги реализации (порядок + критерии готовности)

Каждый шаг завершается: сборкой webpack без ошибок TS/ESLint (`npm run dev` / `npx webpack --mode development`)
и `npm run test` (eslint по .js). Файлы внутри шага независимы; порядок шагов линейный.

1. **Типы + константы** (§4): `ILastTouchSettings.ts`, `ILastTouchSettingsApi.ts`,
   `constants/lastTouch.ts` — все справочные данные уже зафиксированы в §9 (лейблы, типы),
   внешних уточнений не требуется.
   *Критерий:* сборка зелёная; значения `TOGGLEABLE_TOUCH_TYPES` совпадают с бэком (скросс-чек
   с `TouchTypes.php`); `CALL_STATUSES` = §9.2.
2. **Driver + store** (§5): `LastTouchSettingsApi.ts`, правки `IApi.ts`, `useAmoCrmStore.ts`,
   `index.js`. *Критерий:* сборка зелёная; ручная проверка в консоли amoCRM:
   `getApi.value.lastTouchSettingsApi.get()` возвращает `{saved, settings}`.
3. **Mapper** (§4.4): чистые функции + edge-кейсы (null↔пусто, quoted-ключи map, дубли status_ids).
   *Критерий:* сборка зелёная; ручные roundtrip-проверки в консоли (from→to → идентичный payload).
4. **UiSwitch** (§7.1) + базовые стили секций/баннера ошибки. *Критерий:* компонент рендерится,
   hover/focus/disabled состояния на месте; сборка зелёная.
5. **Секции-компоненты** (§7.2–7.5): по одной итерации с проверкой в изолированном storybook-обёртывании
   (временный mount из devtools / отдельного entry — не коммитится). *Критерий:* каждая секция работает
   с фиктивными props: воронки (add/remove/dedup/чипы), звонки (чипы+duration), CF-поле (search/clear),
   типы (переключатели, группировка).
6. **Composable** (§7.6): load/save/error machine + страховочная валидация. *Критерий:* ручные сценарии:
   open→load(saved=false) → заполнить всё → save(200) → reload(saved=true, значения те же);
   save при 403/422 (подделка через мок/консоль) — баннер, форма не слита.
7. **Корневая модалка + интеграция в Settings.vue** (§7.7, §8). *Критерий:* полный путь в amoCRM:
   Настройки виджета → «Настройки последнего касания» → все секции → сохранение; уведомление успеха;
   повторное открытие показывает сохранённые значения.
8. **Полировка UX/дизайна** (§6): spacing-ритм карточек, skeleton loading, empty-state тексты,
   hint'ы, мобильная ширина окна amoCRM, disabled-состояния при save; финальный pass по `.eslintrc`
   (airbnb: import/extensions never, semi always, no-console и т.п.). *Критерий:* чеклист §11 зелёный.

Зависимости: 1 → 2 → 3 → {4,5} → 6 → 7 → 8. Параллельно с 4–7 — сборка-гейт после каждого шага.

---

## 11. Ручной чеклист приёмки (amoCRM)

- [ ] Модалка открывается из настроек виджета; loading-skeleton до загрузки данных.
- [ ] `saved:false` → все секции в дефолтном состоянии (пусто/все типы включены).
- [ ] Воронки: добавление, выбор ≥1 статуса, удаление строки; дубликат воронки недоступен.
- [ ] Звонки: чипы 1..7; input длительности только у включённых; min 0, целые.
- [ ] CF: список только date_time-полей; clear → «не задано».
- [ ] Типы: переключатели по группам; выкл → попадает в payload `disabled_touch_types`.
- [ ] Save: спиннер на кнопке, успех → уведомление + закрытие; повторный GET совпадает с отправленным.
- [ ] Не-админ: save → баннер 403 (текст бэка/наш), форма не слита, данные не изменились.
- [ ] 422 от бэка (например, через подделку запроса в devtools) → текст `last_touch_settings` в баннере.
- [ ] Отмена/✕ — без сохранения; несохранённые изменения при повторном открытии не сохраняются.
- [ ] Сборка prod (`make build-dev`) собирается; eslint (`npm run test`) зелёный.

---

## 12. Итоговая карта файлов

| Файл | Действие |
|---|---|
| `src/interfaces/ILastTouchSettings.ts` | новый |
| `src/interfaces/ILastTouchSettingsApi.ts` | новый |
| `src/constants/lastTouch.ts` | новый |
| `src/helpers/lastTouchSettingsMapper.ts` | новый |
| `src/drivers/backend/LastTouchSettingsApi.ts` | новый |
| `src/composables/useLastTouchSettings.ts` | новый (новый каталог `composables`) |
| `src/components/base/UiSwitch.vue` | новый |
| `src/components/modals/LastTouchSettingsModal.vue` | новый |
| `src/components/modals/lasttouch/LastTouchFunnelsSection.vue` | новый |
| `src/components/modals/lasttouch/LastTouchCallStatusesSection.vue` | новый |
| `src/components/modals/lasttouch/LastTouchCustomFieldSection.vue` | новый |
| `src/components/modals/lasttouch/LastTouchDisabledTypesSection.vue` | новый |
| `src/interfaces/IApi.ts` | правка (+поле) |
| `src/stores/useAmoCrmStore.ts` | правка (setApi) |
| `src/index.js` | правка (инстанс драйвера) |
| `src/components/modals/Settings.vue` | правка (кнопка + openModal) |
