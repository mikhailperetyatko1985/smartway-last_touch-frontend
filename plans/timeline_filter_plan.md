# План реализации виджета «Фильтрация событий timeline сделки»

## 1. Цель и контекст

Виджет на детальной странице сделки скрывает в блоке «История» (events timeline) события,
инициаторы которых не относятся к целевым менеджерам группы ответственного по сделке.
Скрытие — только визуальное (display:none без удаления из DOM), с кнопкой переключения
«Показать все события» / «Скрыть нерелевантные».

Настройки привязаны к **конкретным воронкам и их стадиям**: админ добавляет воронку, выбирает
стадии внутри неё, на которых фильтр активен, и задаёт параметры скрытия в рамках этой воронки;
затем может добавить другую воронку со своими стадиями и настройками. Вне выбранных стадий
виджет не работает (показ без фильтра).

Решение по ТЗ: реализация **только через парсинг DOM** блока событий (штатного DOM-фильтра
по типам у amoCRM в интерфейсе нет — нативная фильтрация live на стороне API-пресетов).

## 2. Результаты исследования (2026-09-03)

### 2.1 Кодовая база
- Текущий проект `Smartway_last_touch` — **legacy-виджет amoCRM** (interface_version 1,
  AMD `define(...)`, глобалки `AMOCRM`/`APP`, `widget.$authorizedAjax`), locations `["settings","everywhere"]`.
- Есть доказанный опыт DOM-инъекций и MutationObserver (Vue-модальные окна, перехват `.widget_settings_block`).
- Сборка: webpack 5 + Vue 3 + TS, zip-pipeline (`make build-dev` / `build-prod`), dev-сервер HTTPS :9012 с proxy-архивом.
- REST v4 amoCRM уже используется напрямую (axios): `/api/v4/users`, `/api/v4/account?with=users_groups`,
  `/api/v4/leads/pipelines`, `/api/v4/leads/custom_fields`; кеш в `window.amo_api_cache` (TTL 15–30 c).
- **Решение:** **без нового виджета** — развитие текущего проекта `Smartway_last_touch`: модалка настроек
  timeline-фильтра добавляется в существующий UI `settings` (тот же перехват `.widget_settings_block` и
  `mountSettingsComponent`, что уже работает для last_touch), а runtime-фильтрация на деталке подключается
  из legacy-колбэка `render()` в `src/index.js` по образцу `private/Compas/widget/src/index.js`
  (config-идемпотентный маунтинг на карточку сделки). Манифест менять **не нужно**: `locations
  ["settings","everywhere"]` + `init_once: true` уже дают жизнь скрипта на деталке. Общий backend (`back/`)
  и общий OAuth-онбординг с текущим виджетом: бэкенд-обвязка (`env.js` host, `useAmoCrmStore.sendRequest`
  → `$authorizedAjax` → одноразовый токен, `SettingsApi` checkToken) уже на месте.
  **Хранилище настроек — серверный backend (`~/PhpstormProjects/private/Smartway_last_touch/back`)**,
  а НЕ legacy `widget.settings.storage`: CRUD по образцу LastTouch-настроек (см. п. 3.1).

### 2.2 DOM-исследование сделки 42661594 (chrome-devtools, read-only)
Ключевые факты (подтверждены на 344 элементах истории, 3 циклах догрузки):

- Структура: `.notes-wrapper > .notes-wrapper__scroller.custom-scroll > .notes-wrapper__scroller-inner > .notes-wrapper__notes.js-notes`;
  в `scroller-inner` над списком лежит явный элемент догрузки `.notes-wrapper__load-more` («Загрузить еще», пустой/height:0, когда история кончилась);
  событие = прямой ребёнок `div.feed-note-wrapper.feed-note-wrapper-{type}[data-id]`;
  разделители дат = `div.note-time-label__wrapper.js-notes-timeline-point[data-point]` (тоже прямые дети; `data-point` = имя месяца/дата).
- Типы событий = семантические классы wrapper'а (НЕ minified): `-note`, `-call_in_out`, `-mail_message`,
  `-task`, `-amojo`, `-opened_talks` (беседа), `-undefined` (внешний канал/виджет),
  технические несут `feed-note-wrapper_system` (+ ровно один подтип: `-field_changed`, `-service_message`, `-tag_event`,
  `-lead_status_changed`, `-main_user_changed`, `-contact_created`, **`-lead_created`** [«Создание» — добавлено в доисследовании]), группировки: `feed-note-wrapper-grouped-complex`
  с `.js-grouped-subviews` (внутри — вложенные wrapper'ы с собственными авторами; звонки 2–7 субвью, `-undefined` 1–2 вложенных `-amojo`).
  **Дополнительно:** суффикс `feed-note-wrapper_grouped` на system-событиях = свёрнутая капсула («N событий», ссылка `js-grouped-expand`) — `.js-grouped-subviews` в DOM нет, субвью появляются только после раскрытия.
- Закреплённые: **не отдельная секция** — `div.js-note.js-note-pinned.feed-note-fixer` (прямой ребёнок) внутри обычного wrapper'а `-note`
  (placeholder = inline `display:block;height:Npx` на wrapper'е). Overlay — `position:absolute`, **offsetParent = внешний `.notes-wrapper`**, z-index 4;
  карточки лежат sticky-стопкой у верха истории, amo-fixers при скролле переписывают их `top/width` и даже placeholder-height → эти стили персистентно менять нельзя (проверено экспериментом: наш `display:none !important` на wrapper'е fixers не трогают).
- Автор события:
  - обычные события: `span.feed-note__amojo-user[data-id="<числовой user_id>"]` (у ботов/триггеров data-id отсутствует); внутри чипа — вложенный дубль `span.control-user_state[data-id]` с тем же id (сборка через Set, селектор `.feed-note__responsible [data-id]` избыточен и двойно считает);
  - amojo-сообщения: числовой user_id автора — только в `div.n-avatar[id]` (ровно 1 на сообщение); data-id у чипов `-amojo`/`-undefined` = **UUID участника чата** (author+recipient) — НЕ user_id;
  - у каждого вложенного субвью группировки — свой автор;
  - в `-amojo`/`-undefined` `div.n-avatar[id]` может быть числовым id **внешнего участника чата, не являющегося amo-юзером** (напр. 69264322) — в target set он не попадёт; опциональный кросс-чек по полному user-снапшоту backend'а.
- `data-id` wrapper'а совпадает с `item.id` из JSON timeline-API (проверено на реальных items), для задач — число, для бесед `opened-talk-{id}`,
  для чат-сообщений — UUID; часть заметок вообще без data-id → дедуп не только по id, но и по самим узлам. В API у ботов/триггеров `created_by=0` (имя в `author_name`).
- Пагинация: при скролле **к верху** (старые события сверху, порядок old→new) идёт
  `GET /ajax/v3/leads/{id}/events_timeline/?filter[created_at][lt]={ts}&limit=100&filter[type][0..21]=…&parent_element_type=2&parent_element_id={id}`,
  ответ — HAL-JSON (`_embedded.items[]` с полями `id, type, created_by, responsible_user_id, author_name`; у ботов/триггеров `created_by=0`), DOM домонтируется **prepend'ом** (также ловится явным `.notes-wrapper__load-more`).
- ⚠️ КРИТИЧНО для observer'а: при каждой догрузке amoCRM **пересобирает список**: все прямые дети удаляются и вставляются обратно.
  Подтверждено исследованием (2026-09-03, цикл +2 события): **event-wrapper'ы вставляются теми же DOM-объектами**
  (identity reuse; inline-стили/placeholder-height на них переживают пересборку) — но **разделители дат регенерируются как НОВЫЕ узлы**
  (все 12 заменены). Поэтому: (а) MutationObserver вешается на `.notes-wrapper__notes` с `{childList: true}` (без subtree —
  иначе шум от fixer'ов с inline style); (б) повторная обработка дешёвая, состояние скрытия хранится на самих нодах
  (data-атрибут + inline display), переживает removed/added **для wrapper'ов**; для разделителей состояние НЕ может сохраняться —
  второй проход обязан пересчитывать их с нуля на каждом pass'е; (в) дебаунс обработки 150–300 мс.
- Стабильные якоря: классы `feed-note-wrapper*`, `js-notes`, `note-time-label__wrapper`, `js-note-pinned`, `data-id`.
  Хрупкие: inline styles (`top/width/height` у pinned), minified-классы вне timeline, порядок нод.

## 3. Модель настроек виджета

Хранилище: **backend** (п. 3.1) — настройки едины для всего amo-аккаунта и не зависят от браузера/юзера
установки. UI настроек — **модалка внутри существующего виджета** (этот проект): в `settings()` колбэке
уже монтируется `components/modals/Settings.vue` в `.widget-settings__desc-space`; рядом добавляется
секция/модалка «Timeline Filter» (новый компонент `TimelineFilterSettings.vue`), загрузка/сохранение
**через API (GET/PUT)**, а не через `widget.settings.storage`. Сохранение — только для администратора аккаунта.
Без настройки воронки **и хотя бы одной её стадии** виджет в ней **не работает** (требование ТЗ).
UI: карточки воронок («+ Добавить воронку»); в карточке — выбор pipeline (только ещё не добавленные),
мульти-селект стадий этого pipeline (статусы берутся из `/api/v4/leads/pipelines`, тип `IPipelineStatus`
уже есть в проекте) и настройки скрытия в рамках воронки.

```ts
interface IFilterSettings {
  funnels: IFunnelFilterSettings[] | null; // null/[] = виджет выключен везде
}
interface IFunnelFilterSettings {
  pipeline_id: number;
  status_ids: number[];                   // стадии воронки, где фильтр АКТИВЕН; непустой массив;
                                          // сделка вне этих стадий → виджет молчит (показ без фильтра)
  mode: 'off' | 'base' | 'custom';      // кого считаем ответственным (ТЗ Q1: выбор по воронке)
  custom_field_id: number | null;       // для mode=custom: id text/numeric поля с user_id доп. ответственного
  hide_system: boolean;                 // ТЗ Q3: технические события (смена полей, теги, этапы, сервис-репорты виджетов/триггеров)
  hide_pinned_no_target: boolean;       // ТЗ Q4: закрепленные без целевых менеджеров
  hide_no_author: boolean;              // ТЗ Q5: события без идентифицируемого автора (боты, amojo-системные, строки бесед)
}
```

Поведение по ответам в ТЗ:
- Q1: в воронке выбирается ОДИН источник ответственного (базовый или из кастомного поля);
  целевые менеджеры = **все пользователи группы** этого ответственного + сам ответственный.
  Если в custom-поле пусто/не резолвится — fallback на базового (решение зафиксировать в UI настроек).
- Q2: группировки (капсулы звонков/изменений, смешанные сообщения) — если ХОТЬ ОДИН вложенный автор целевой,
  показываем капсулу ЦЕЛИКОМ.
- Примечание: на исследованной сделке поле «дополнительный ответственный» не найдено; кандидаты в аккаунте —
  text-поле «Сопровождение» (2307846, `"14079765"`) и numeric «Число» (2308878, `13159601` = user_id Ильенковой).
  Настройка `custom_field_id` позволяет выбрать любое text/numeric поле с user_id.

### 3.1 Хранение настроек — backend API (`back/`)

Полностью повторяет уже проверенный в проекте паттерн LastTouch-settings
(`LastTouchSetting` → `LastTouchSettings::fromRaw/toStorage` → `LastTouchSettingsDto` →
`UpdateLastTouchSettingsRequest::toDto` → `LastTouchSettingsService` → `LastTouchSettingsController`):

| Слой | Файл в `back/` (новый) | Образец-донор |
|---|---|---|
| Migration | `database/migrations/xxxx_create_timeline_filter_settings_table.php` | `2026_08_24_000001_create_last_touch_settings_table.php` |
| Model | `app/Models/TimelineFilterSetting.php` | `App\Models\LastTouchSetting` |
| Domain (нормализация/валидация при чтении) | `app/Services/Timeline/TimelineFilterSettings.php` | `App\Services\LastTouch\LastTouchSettings` |
| DTO | `app/Dtos/Timeline/TimelineFilterSettingsDto.php` | `App\Dtos\LastTouch\LastTouchSettingsDto` |
| FormRequest (PUT = полная замена всех воронок; отсутствующий ключ/null = «не задано») | `app/Http/Requests/UpdateTimelineFilterSettingsRequest.php` | `UpdateLastTouchSettingsRequest` |
| Service (`getForAccount` / `updateForAccount`) | `app/Services/Timeline/TimelineFilterSettingsService.php` | `LastTouchSettingsService` |
| Controller (тонкий; доменные ошибки → 422 `ValidationException`) | `app/Http/Controllers/TimelineFilterSettingsController.php` | `LastTouchSettingsController` |

- **Таблица `timeline_filter_settings`**: `id`, `amo_account_id` (int, **unique**), `funnels`
  (json, nullable — массив `IFunnelFilterSettings` из п. 3, включая `status_ids`), `timestamps`. Отсутствие
  строки = настройки по умолчанию (`funnels = null` → виджет выключен везде), GET при этом отвечает `{saved: false}`.
- **Routes** (`routes/api.php`, внутри существующей группы `AuthByDisposableToken`):
  - `GET /api/timeline-filter/settings` → `show` — `{saved, settings}`;
  - `PUT /api/timeline-filter/settings` → `update` — только с `middleware(CurrentUserAdmin)` (как у last-touch);
  - endpoints иерархии/синхронизации (`POST /users/sync`, `GET /users/sync-status`, `GET /target-users`) — п. 4.2–4.3.
- **Auth ничего нового не требует**: виджет шлёт запросы через `widget.$authorizedAjax` (одноразовый токен
  amoCRM) → `AuthByDisposableToken` резолвит `AmoAccountInterface` → `amo_account_id` из таблицы `accounts`;
  OAuth-онбординг (`/api/oauth/code`, long-lived токен) — общий с текущим виджетом.
- **Серверная валидация** в FormRequest/domain: enum `mode ∈ {off, base, custom}`; `custom_field_id` обязателен
  при `mode=custom` и числовой; булевы флаги; дедупликация `pipeline_id` в массиве `funnels` (одна воронка —
  одна запись настроек); `status_ids` — непустой массив числов id без дублей в пределах воронки. Валидация
  существования pipeline/статусов/поля в amo на этапе MVP не делается (фронт выбирает из актуального списка `/api/v4`),
  при «протухшем» id — рантайм-фолбэк: стадия сделки не совпала → виджет молчит; протухший custom-поле-id →
  фолбэк на базового ответственного (п. 5.2).

## 4. Иерархия «группы → пользователи» — своя БД на backend + job-синхронизация

**Решение: виджет НЕ дёргает `/api/v4/users` напрямую. Backend хранит полную иерархию пользователей и
их групп amoCRM в собственных таблицах (snapshot-модель), а не в кеше.** amoCRM API потребляется только
внутри асинхронной джобы по кнопке администратора «Синхронизировать сотрудников и группы» — это
закрывает ручные изменения состава групп без ожидания ТТЛ.

### 4.1 Хранилище иерархии (миграции `back/`)
- `timeline_filter_user_groups`: `id`, `amo_account_id`, `amo_group_id`, `name`, timestamps;
  unique (`amo_account_id`, `amo_group_id`).
- `timeline_filter_users`: `id`, `amo_account_id`, `amo_user_id`, `name`, `email`,
  `amo_group_id` (nullable rights.group_id), `is_active`, `is_free`, `role_id`, `synced_at`, timestamps;
  unique (`amo_account_id`, `amo_user_id`).
- Обновление — снапшот за один проход джобы: upsert по unique-ключу + delete-stale (юзеры/группы,
  исчезнувшие из выдачи амо) внутри транзакции.
- amo не шлёт событий об изменении состава групп (вебхуков на users в legacy-виджете нет) →
  актуальность снапшота = последняя синхронизация; `last_synced_at` отдаём в UI (см. 4.3), для
  «забывчивых» — опциональный периодический sync по `schedule:run` (см. открытый вопрос 5 и R13).

### 4.2 Синхронизация — асинхронная джоба с ретраем
- `POST /api/timeline-filter/users/sync` (`CurrentUserAdmin`) → диспатч
  `app/Jobs/SyncTimelineUsersAndGroupsJob` (по образцу `RunLastTouchCalculation`: `ShouldQueue`,
  `public int $tries = 3`, `backoff()` 60 с/300 с — запас на 429/таймауты амо), HTTP сразу `202` + идентификатор.
  Токен — long-lived_access из таблицы `accounts` (тот же клиент, что у расчётной джобы last-touch).
- Джоба: пагинированный обход `AmoCrmApiRepository::getUsers()` (user->getGroups/getRights) +
  `getGroups()` → сборка групп + юзеров → write-snapshot (4.1) в транзакции. Все попытки упали — статус
  `failed` + текст ошибки. Пустой ответ amo (0 юзеров) снапшот не затирает (защита от wipe).
- Защита от двойного старта (реализовано на Этапе 2a): таблица `timeline_filter_sync_states`
  (per-account state/last_synced_at/error) + атомарный claim под `lockForUpdate` (без кэш-локов — кэш в
  проекте ненадёжен); stale-рекавери: `queued|running` старше 2 ч разрешают перезапуск.
  `POST /users/sync` → `202 {state:"queued"}`, busy → `409 {error:"already_running"}`.
- **Валидация PUT (реализовано)**: дубли `pipeline_id` и дубли стадий внутри `status_ids` → 422 (не merge);
  `custom_field_id` при mode≠custom нормализуется/валидируется как null; hide_*-флаги обязательны в теле.

### 4.3 Статус и чтение (все эндпоинты — локальная БД, без обращений к амо)
- `GET /api/timeline-filter/users/sync-status` → `{ state: idle|queued|running|success|failed,
  last_synced_at, error? }` — крутится кнопка в модалке.
- `GET /api/timeline-filter/target-users?responsible_user_id={id}` →
  `{ group_id: int|null, target_user_ids: [int...] }` — из `timeline_filter_users`: ответственный +
  активные не-free (`is_active`, `!is_free`) его `amo_group_id`. Если снапшота нет вовсе —
  `409 {error: "not_synced"}` (UI модалки подсказывает нажать синк).

### 4.4 Слой виджета (тонкий, не источник истины)
- In-flight дедупликация `Promise` (несколько открытий деталки = 1 запрос) + localStorage
  `stf_target_users_v1`: `{ [responsibleUserId]: {group_id, target_user_ids, fetchedAt} }`,
  **TTL 30 мин (не больше)** + stale-while-revalidate — это защита от лишних запросов к НАШЕМУ
  backend, а не от обращения к амо.
- Кнопка в модалке настроек — **«Синхронизировать сотрудников и группы»** (НЕ «сброс кеша»):
  1. `POST /users/sync`, блокируется на `queued|running`, показывает спиннер;
  2. polling `GET /users/sync-status` (2–3 с, до терминального состояния, разумный таймаут ~2 мин);
  3. `success` — toast + обновление `last_synced_at` + локальный сброс `stf_target_users_v1`
     (в браузерах других юзеров — отработает TTL ≤30 мин; backend к этому времени уже актуален);
  4. `failed` — toast с текстом ошибки из статуса, кнопка разблокируется.
- Исследовательская справка по доке amoCRM (почему нельзя фильтровать группу запросом):
  `GET /api/v4/users` принимает только `with`/`page`/`limit` (max 250) — `filter[group_id]` отсутствует;
  `account?with=users_groups` отдаёт группы без состава — поэтому snapshot иерархии строится на backend.

## 5. Алгоритм работы виджета (runtime на деталке)

### 5.1 Инициализация и подключение к текущему виджету (паттерн Compas)
1. Точка входа на деталке — существующий колбэк `render()` в `src/index.js` (вызывается amoCRM при рендере
   страницы/карточки, `init_once` + `locations: everywhere` уже в манифесте). Компасовский паттерн
   (`private/Compas/widget/src/index.js`): config-таблица компонентов с идемпотентным маунтингом —
   `targetEntity: () => AMOCRM?.data?.current_entity === 'leads' && AMOCRM?.data?.is_card`,
   проверка `document.getElementById(componentId)` перед вставкой контейнера. Для timeline-фильтра
   Vue не маунтим: в `render()` добавляем вызов `mountTimelineFilter(widget)` — наш TS-модуль
   (кнопка + observer + классификатор), идемпотентность по `#stf-toggle-btn` / dataset-нод.
2. SPA-переходы между карточками: `render()` вызывается amo при каждой перерисовке (Compas на этом живёт),
   повторный маунт отсекается idempotency-проверкой; `setInterval(1s)` остаётся только страховкой на случай
   перерендера блока истории без повторного вызова `render()` — кнопка/состояние восстанавливаются идемпотентно.
3. Настройки читаются с backend: `GET /api/timeline-filter/settings` через новый драйвер
   `src/drivers/backend/TimelineFilterSettingsApi.ts` (по образцу `LastTouchSettingsApi`, хост из `env.js`;
   регистрация — в `setApi(...)` внутри `Widget()` в `src/index.js`).
   На runtime — кеш в localStorage (per-account, ключ `stf_timeline_filter_settings_v1`, **TTL 30 мин (не больше)** + SWR):
   модалка настроек после успешного PUT пишет свежий ответ в кеш; в других браузерах — устаревание по TTL
   + фоновое обновление при открытии деталки (сначала рендер по stale-кешу, как в п. 4). Если кеш пуст и
   backend недоступен — виджет молчит (показ без фильтра), пользователю ошибок не генерируем.
4. Аккаунт/токен: отдельный онбординг НЕ нужен — тот же аккаунт и тот же одноразовый токен, что уже
   использует last_touch (`checkToken` на странице настроек); timeline-настройки живут в той же таблице
   `accounts`-связки на backend.
5. Защита от регресса в общем `index.js`: весь timeline-код — отдельный модуль `src/timelineFilter/*`,
   вызываемый из `render()` одним try/catch'ем; при любом исключении last_touch-функционал не затрагивается.

### 5.2 Расчёт целевых менеджеров (асинхронно, до первой фильтрации)
```
lead = GET /api/v4/leads/{id}                      // единственный прямой amoCRM-запрос фильтра (need: responsible + CF + pipeline/status)
cfg = funnels.find(pipeline_id === lead.pipeline_id)
нет cfg или mode=off или lead.status_id ∉ cfg.status_ids → выход (виджет молчит, показ без фильтра)
responsibleId = mode=base ? lead.responsible_user_id
              : Number(customField(cfg.custom_field_id).value) || lead.responsible_user_id
// далее — НЕ amoCRM, а наш backend (п. 4, чтение из БД-снапшота),
// с in-flight дедупом и localStorage-кешем (TTL 30 мин, SWR):
{ group_id, target_user_ids } =
    TimelineTargetUsersApi.get(responsibleId)      // GET /api/timeline-filter/target-users
                                                   // 409 not_synced → выход (виджет молчит, дефолт = показ без фильтра)
targetIds = new Set(target_user_ids)
```
Активация привязана к **текущему** `status_id` сделки на момент резолва (одна выборка на открытие карточки;
`render()`/интервал-страховка п. 5.1 пересчитывают при SPA-переходе между карточками). Live-реакция на
смену стадии, пока карточка уже открыта, в MVP не требуется (перерисовка amo при смене этапа всё равно
вызывает `render()` → повторный резолв по текущему status_id).

### 5.3 Классификация события (wrapper → show/hide)
```
classify(wrapper):
  authors = Set()                       // только ЧИСЛОВЫЕ id; UUID исключаются toInt'ом
    for c in wrapper.querySelectorAll('.feed-note__amojo-user[data-id]'): addIfNumeric(authors, c.dataset.id)
    for a in wrapper.querySelectorAll('div.n-avatar[id]'):                addIfNumeric(authors, a.id)
  // (рекурсивно покрывает вложенные субвью капсул; inner control-user_state[data-id]-дубль не даёт новых id благодаря Set;
  //  у -amojo/-undefined числовой автор = div.n-avatar[id]; внешние участники чатов просто не попадут в targetIds)
  isSystem = 'feed-note-wrapper_system' в classList wrapper'а
  isPinned = wrapper.querySelector('.js-note-pinned') !== null
  if isPinned && !cfg.hide_pinned_no_target → SHOW   // приоритет 1 (Q4-дефолт)
  if isSystem  && !cfg.hide_system          → SHOW   // приоритет 2 — system бьёт автора (R4 зафиксировано dry-run'ом:
  if isSystem  && cfg.hide_system           → HIDE   //   lead_status_changed/контакты c целевым автором скрываются)
  if authors.isEmpty:                        // приоритет 3 — боты/триггеры, ВСЕ письма (числовых авторов нет),
      → cfg.hide_no_author ? HIDE : SHOW     //   задачи без чипа, бары opened_talks; строки сообщений бесед живут в -undefined-капсулах c авторами
  → authors.some(id ∈ targetIds) ? SHOW : HIDE       // приоритет 4; капсулы: хоть один целевой в субвью → SHOW целиком (Q2)
```
Приоритет подтверждён dry-run'ом на всех реальных событиях сделки 42661594 (см. `research_timeline_dom.md` §5–6);
спорные кейсы R4 — отдельный открытый вопрос заказчику.

### 5.4 Механизм скрытия
- `HIDE`: `wrapper.style.setProperty('display','none','important')` + `wrapper.dataset.stfHidden='1'`.
  Не удаляем из DOM, классы amo не трогаем (не мешаем их логике), dataset — наш единственный след.
- `SHOW`: снять inline-rule, удалить dataset. Скрытие переживает пересборку списка (ноды те же, inline style на ноде).
- Разделители дат: second-pass — `.note-time-label__wrapper` скрывается, если до следующего разделителя нет
  видимых wrapper'ов; при «Показать все» — все разделители восстановить. **Ноды разделителей регенерируются при каждой
  пересборке (доисследование 2026-09-03) → состояние на них не сохраняется, вердикт пересчитывается с нуля на каждом pass'е**
  (dataset/inline на разделителях полагать нельзя; покрыть юнит-тестом).
- Закреплённые: скрываем wrapper целиком (overlay — потомок, уйдёт вместе); проверено экспериментом: `display:none !important`
  переживает amo-fixers, sticky-стопка соседних pinned не ломается, артефактов нет (скриншоты в `research_screens/`).
  Запасной вариант R3 «обнулить placeholder height» **отклонён**: fixer'ы сами переписывают эти inline-стили при скролле → конфликт.
- Кнопка вставляется перед `.js-notes` (внутри `.notes-wrapper__scroller-inner`), идемпотентно по `id="stf-toggle-btn"`.
  Состояния: `filtered` («Показать все события») ↔ `allShown` («Скрыть нерелевантные»); в `allShown` observer
  не фильтрует новые порции; счётчик скрытых — в заголовке кнопки.

### 5.5 Observer
```
mo = new MutationObserver(debounce(250ms, processList))
mo.observe(listEl, { childList: true })   // ТОЛЬКО childList, без attributes/subtree
```
- `processList`: пройтись по `list.children` (прямые `.feed-note-wrapper`), применить классификатор, затем pass по разделителям.
- Идемпотентность обязательна: при догрузке прилетают removed+added для всех известных нод.
- Догрузка («Загрузить еще» / автоскролл к верху) ловится observer'ом, скролл сам не эмулируем.

## 6. Декомпозиция и оценка (соответствие ТЗ: backend + виджет)

| # | Задача | Ч |
|---|---|---|
| 0 | **Backend (`back/`)**: migration `timeline_filter_settings` (настройки) + `timeline_filter_user_groups`/`timeline_filter_users` (иерархия-снапшот, п. 4.1), Model/Domain/DTO/FormRequest/Service/Controller + routes настроек (GET/PUT, auth через `AuthByDisposableToken`); `SyncTimelineUsersAndGroupsJob` (ShouldQueue, tries=3 + backoff, пагинированный `AmoCrmApiRepository::getUsers()`, upsert-снапшот в транзакции, lock от двойного старта, статусы) + routes `POST /users/sync` (202/409), `GET /users/sync-status`, `GET /target-users` (чтение только из БД); юнит/feature-тесты, amo-API мокаем | 9 |
| 1 | **Модалка настроек в текущем виджете**: компонент `TimelineFilterSettings.vue` + врезка в существующий `settings()`/`mountSettingsComponent`, карточки воронок («+ Добавить воронку», pipeline selector по ещё не добавленным), **мульти-селект стадий pipeline (обязателен ≥1)**, mode off/base/custom, выбор custom-поля (только text/numeric), чекбоксы hide_system/hide_pinned/hide_no_author, загрузка/сохранение через backend API (п. 3.1), **кнопка «Синхронизировать сотрудников и группы»** с polling статуса джобы (п. 4.4) | 6 |
| 1a | Проводка в `src/index.js`: регистрация `TimelineFilterSettingsApi` в `setApi(...)`, mount-точка `mountTimelineFilter()` в `render()` по Compas-паттерну (p. 5.1), изоляция модуля `src/timelineFilter/*` | 1 |
| 2 | Кнопка «Показать все/Скрыть нерелевантные», SPA-безопасная идемпотентная инъекция | 2 |
| 2b | Драйверы `TimelineFilterSettingsApi` (GET/PUT настроек), `TimelineTargetUsersApi` (GET target-users) и sync-методы (`POST /users/sync`, `GET /users/sync-status`) + localStorage-кеши (SWR, TTL ≤30 мин) | 2 |
| 3 | Клиентский резолв target set: **привязка активности к `pipeline_id + status_id` сделки (п. 5.2)**, in-flight дедуп `Promise`, localStorage-кеш `stf_target_users_v1` (TTL ≤30 мин, SWR), base/custom выбор ответственного, обработка `409 not_synced` (тихая деградация + подсказка в модалке), после `success`-sync — локальный clear кеша | 3–4 |
| 4 | Классификатор: парсинг DOM-дерева `.js-notes` (типы по классам, авторы, субвью-капсулы, pinned, system), алгоритм show/hide + обработка разделителей | 12–16 |
| 5 | MutationObserver (debounce, childList, идемпотентность) | 2 |
| 6 | Механизм скрытия display:none !important с восстановлением, счётчик | 2 |
|   | **Итого** | **~31–35 (виджет) + 9 (backend) = 40–44** |

> Первичная оценка 30 ч покрывала только виджет. На backend перенесены и расширены: хранение настроек,
> своя БД-иерархия «группы → пользователи» (снапшот), асинхронная джоба синхронизации с ретраями и
> эндпоинты sync/sync-status/target-users (задача 0, 9 ч) — amoCRM users-API потребляется только джобой,
> чтения виджета идут в нашу БД. Новый виджет не создаётся — вместо «скелета» проводка в текущем
> `src/index.js` (задача 1a, 1 ч). Итог ~40–44 ч (учтена привязка настроек к стадиям воронки: +1 ч модалка, +0–1 ч runtime);
> удержание 30 ч возможно только сокращением
> объёма (например, MVP без `mode=custom`) — решение за заказчиком.


## 7. Этапы реализации с DoD

- **Этап 0 — ПИ в консоли (готовый скрипт `plans/poc_timeline_filter.js`)**: на 3+ сделках разных воронок
  проверить: корректность авторов по всем типам событий, поведение pinned-hide, layout при скрытии,
  работу при догрузке (скролл вверх) и «Загрузить еще», переключение кнопкой. DoD: нет визуальных артефактов,
  скрытые события полностью восстанавливаются.
- **Этап 1 — интеграция в текущий виджет (задача 1a)**: модуль `src/timelineFilter/*`, проводка в
  `src/index.js` (`render()` → `mountTimelineFilter()` по Compas-паттерну п. 5.1,
  `setApi(..., new TimelineFilterSettingsApi(host))`). Манифест не меняется
  (`settings`+`everywhere`, `init_once` уже есть).
  DoD: на деталке сделки ставится диагностический лог/маркер, на всех остальных сущностях тишина,
  регресса last_touch-функционала нет (ручной чек-лист: страница настроек, модалка взаимодействий, токен).
- **Этап 2a — backend: настройки + БД-иерархия + джоба синка (задача 0, `back/`)**.
  DoD: миграции (`timeline_filter_settings`, `timeline_filter_user_groups`, `timeline_filter_users`)
  создаются и откатываются; настройки: `GET` → `{saved: false, defaults}` у нового аккаунта, `PUT` —
  полная замена, 422 на невалидный `mode`/дубли `pipeline_id`/**пустой или невалидный `status_ids`
  (пустой массив, не-числа, дубли в пределах воронки)**, admin-only (403 для не-админа);
  **`POST /users/sync` → 202 + `SyncTimelineUsersAndGroupsJob` в очереди (мок amo-API: полный обход
  групп/юзеров, $tries=3 с backoff на фейковых 429/сбоях — 3-я попытка пишет `failed` со статусом;
  повторный sync во время работы → 409 `already_running`); после успеха таблицы = снапшот
  (проверка upsert + delete-stale транзакцией); `GET /sync-status` отдаёт жизненный цикл состояний**;
  **`GET /target-users` читает ТОЛЬКО БД: активные не-free участники группы ответственного; пустая
  таблица → 409 `not_synced`**; feature-тесты проходят.
- **Этап 2b — модалка настроек в текущем виджете (задачи 1, 2b)**.
  DoD: `TimelineFilterSettings.vue` монтируется в существующий flow `settings()`/`mountSettingsComponent`
  рядом с `Settings.vue` (тот же контейнер `.widget-settings__desc-space`); форма грузит GET и сохраняет PUT
  через `TimelineFilterSettingsApi` (не `widget.settings.storage`); **карточки воронок: добавление/удаление,
  pipeline-селектор только по ещё не добавленным воронкам, мульти-селект стадий (≥1 обязательно, список стадий
  из актуального `/api/v4/leads/pipelines`), без стадий воронка не сохраняема на фронте**; после успешного PUT localStorage-кеш
  (TTL 30 мин) обновляется ответом; **кнопка «Синхронизировать сотрудников и группы»**: POST sync →
  спиннер + polling sync-status → toast по success/failed, блокировка на queued|running, отображение
  `last_synced_at`; по success чистит `stf_target_users_v1` локально; не-админ кнопку не видит
  (`CurrentUserAdmin` на sync-эндпоинте); валидация «нет воронки → не работает» на фронте и дублируется на backend.
- **Этап 3 — целевые менеджеры (задачи 2b, 3)**. DoD: **фильтр активируется только на сделках из
  `pipeline_id` + `status_ids` настроек (на сделке другой воронки/стадии — виджет молчит, ноль запросов target-users)**;
  target set за <50 мс с тёплым localStorage-кешем
  и 1 round-trip к **нашему backend** на холодную (в network браузера — ноль запросов к `/api/v4/users`,
  проверить по amo-логам backend); `409 not_synced` → виджет молчит + в модалке виден баннер-подсказка
  про синхронизацию; **сценарий админа**: изменил группу в amo → нажал «Синхронизировать» → после
  `success` целевой set пересобран и фильтрация учитывает новый состав; при недоступном backend — рендер по stale, без ошибок.
- **Этап 4 — классификатор + скрытие + observer (задачи 2,4,5,6)**. DoD: unit-тесты классификатора на зафиксированных HTML-фикстурах (сохранить outerHTML образцов с 42661594); e2e-чеклист на 3 сделках.
- **Этап 5 — регрессионная защита**: чек-лист якорей (`feed-note-wrapper*`, `js-notes`, `js-note-pinned`) с «canary»: если якоря не найдены N раз подряд — виджет деактивируется тихо и пишет diagnostic в console/localStorage (не ломает UI).
  **Фактическая реализация (подэтап F, модуль `src/timelineFilter/canary.ts` + lifecycle `index.ts`):**
  - Чек-лист на каждом проходе `processList`: «якоря не найдены» ТОЛЬКО когда list `.notes-wrapper__notes.js-notes` существует, children>0, но ни один прямой ребёнок не несёт класс-якорь — токен `feed-note-wrapper*` (по границе токена: продолжение через `_`/`-`, включая подтипы и суффикс `_grouped` свёрнутых system-капсул, R16) либо `note-time-label__wrapper`. Нет списка / список пуст в моменте — нейтрально («допускать отсутствие», R16), счётчик не трогается.
  - Счётчик подряд провалов: in-memory + persist в `localStorage stf_canary_v1:<account>` (per-account scope как остальные stf-кеши); переживает перезагрузку страницы. **N=5** подряд `anchors-missing` → деактивация: `unhideAll` по НАШЕЙ метке `dataset.stfHidden` (не по классам — в моменте R1 их как раз нет), снятие кнопки, disconnect observer, остановка тиков/интервалов lifecycle, `phase='disabled'`; дальше на странице тишина.
  - Флаг disabled персистентен с **TTL 24 ч** (`disabledAt` в записи): читается ДО mount-работы (в т.ч. после перезагрузки — активация не стартует); по истечении TTL запись удаляется → «свежий старт». Чистка при заходе в settings-модалку сознательно НЕ сделана: открытие настроек не доказывает восстановления якорей, правило одно и простое (TTL).
  - Diagnostic при деактивации (R9 — тихая деградация, без UI/toast'ов): `console.warn('[STF] disabled: anchors not found')` + ring-buffer записей `{t, leadId, reason}` в `stf_diagnostics_v1:<account>` (cap 50). Нормальный успех обнуляет счётчик.
  - DoD закрыт: unit-тесты vitest/jsdom (`tests/unit/timelineFilter/canary.spec.ts`, 16 тестов) — симуляция «переверстки» (дети без якорей): 5 прогонов → деактивация + unhideAll; 4 провала + успех → обнуление; persist/TTL/ring-buffer. ПИ-чек: все selector'ы классификатора резолвятся на live DOM сделки 42661594, dry-run = 206/346 (совпадает с research §5).

### Журнал исполнения (статусы по подэтапам)

- Этап 0 / подэтап A — ПИ в консоли (`plans/poc_timeline_filter.js`), DOM-исследование сделки 42661594, фикстуры `tests/fixtures/timeline/`: **Executed**, 2026-09-03.
- Подэтап B (Этап 2a) — backend `back/`: миграции, Model/Domain/DTO/FormRequest/Service/Controller/routes, `SyncTimelineUsersAndGroupsJob` (tries=3, backoff, lock от двойного старта): **Executed**, 2026-09-04 (сьют: 520 passed / 1 pre-existing failed).
- Этап 1 + подэтап C — проводка `src/index.js` (Compas-паттерн), драйверы `TimelineFilterSettingsApi`/`TimelineTargetUsersApi`, SWR-кеши `stf_*_v1` (TTL 30 мин): **Executed**, 2026-09-04.
- Подэтап D (Этап 2b) — модалка настроек `TimelineFilterSettings.vue`: карточки воронок, мульти-селект стадий, кнопка синхронизации с polling: **Executed**, 2026-09-04.
- Этап 3 + подэтап E (Этапы 3–4) — резолв target set (гейты pipeline+status), классификатор/скрыватель/observer/кнопка, unit-тесты (84): **Executed**, 2026-09-04.
- Этап 5 / подэтап F — canary + тихая деактивация (TTL 24 ч) + diagnostic ring-buffer, `destroy()` lifecycle, финальная верификация обеих кодовых баз и read-only ПИ-чек: **Executed**, 2026-09-04.

## 8. Риски

| # | Риск | Митигация |
|---|---|---|
| R1 | amo переверстает блок / поменяет классы (главный, «хрупкость» из ТЗ) | Только семантические якоря + canary-автоотключение; фикстуры для регресс-тестов |
| R2 | Пересборка DOM при догрузке → мерцание скрытых | Состояние на нодах (dataset/inline), debounce observer, повторный проход не пересоздаёт ноды (подтверждено исследованием) |
| R3 | Pinned-overlay: скрытие wrapper'а с inline-height placeholder может сдвинуть/сломать позиционирование других pinned | Проверка на ПИ; запасной вариант — скрывать только `js-note-pinned` + обнулять placeholder height |
| R4 | Неоднозначность правил для system-событий с целевым автором (напр. `main_user_changed`, где целевой менеджер стал ответственным) | Формализовать приоритет правил на тест-площадке; при необходимости — отдельный тумблер |
| R5 | data-id отсутствует у части узлов — дедуп только по id ненадёжен | Идемпотентный full-pass по прямым детям вместо событий-ориентированной логики |
| R6 | Боты/виджеты без author: полезные события виджета SMARTWAY будут скрываться | `hide_no_author` с white-list по `title` источника (фолбэк-настройка) |
| R7 | Rate limit/лаги amoCRM users-API на больших аккаунтах | Архитектурно снято (п. 4): amo-API трогает только джоба (1 пагинированный обход на аккаунт, `tries=3` + backoff на 429); виджет читает target set из нашей БД через `GET /target-users` — без amo в критическом пути |
| R13 | Снапшот иерархии устаревает, если админ менял состав групп в amo, но не нажал «Синхронизировать» | `last_synced_at` в модалке + баннер при давнем синке; опция — плановый sync по `schedule:run` раз в ≤30 мин (тот же джоб-механизм), вынесено в открытый вопрос 5 |
| R8 | Модерация публичного виджета не пропустит DOM-хинтинг | Это внутренний (закрытый) виджет — публикация не требуется |
| R9 | Backend недоступен / токен не валиден на деталке (нет настроек вовсе) | Runtime — stale localStorage-кеш настроек (SWR, п. 5.1); при полном miss виджет молчит (показ без фильтра) — тихая деградация, тот же канал diagnostic, что canary (Этап 5) |
| R10 | Гонка записи: PUT админа A затирает параллельный PUT админа B (полная замена) | Принять as-is для MVP (та же семантика, что у last-touch); при необходимости — updated_at + If-Unmodified-Since |
| R11 | Общий `src/index.js`: ошибка в timeline-коде ломает last_touch (настройки, модалки) | Весь функционал — изолированный модуль `src/timelineFilter/*`, вызов из `render()` в try/catch; дефолт `funnels=null` → модуль не активируется; регресс-чеклист на Этапе 1 |
| R12 | Настройки виджета growing: в одной установке живут last_touch + timeline-фильтр — риск пересечения UI в `settings` | Отдельная секция/таб в модалке настроек, свои ключи localStorage (`stf_*`), свои endpoint'ы на backend — общих мутабельных состояний нет |

## 9. Открытые вопросы заказчику
1. Точное поле «дополнительный ответственный» (label/field_id) — на тестовой сделке не найдено; подтвердить id поля в проде.
2. Fallback при пустом custom-поле: базовый ответственный или показ без фильтра?
3. Целевые менеджеры: пользователь без группы (group_id = null) — показывать только самого ответственного?
4. События `-opened_talks` (строка «Беседа №…») — считать «без автора» (текущий дефолт, правило hide_no_author) или резолвить создателя через API-ответ (`created_by` у items беседы)?
5. Синхронизация иерархии — только ручная кнопка администратора (текущий план) или дополнительно плановый sync по `schedule:run` (раз в ≤30 мин, тот же джоб с ретраями) как страховку от «не нажали кнопку»? (+1–2 ч к задаче 0, если да)
6. **(из research §8)** Почта: при дефолте `hide_no_author=true` скрывается 100% писем (числовых авторов в DOM нет вообще). Принять или нужен белый-лист/резолв автора письма?
7. **(из research §8, уточнён на E/F)** System-события с целевым автором (смены этапов, создание контактов) — принять зафиксированный приоритет «system бьёт автора» (R4) или нужен отдельный тумблер? Связанное расхождение: примечание README фикстур про «no-author для system при `hide_system=false` → HIDE» противоречит финальному алгоритму research §6 (правило system — безусловное короткое замыкание: при `hide_system=false` любой system-вердикт = SHOW, в т.ч. без автора); на подэтапе E реализация и тесты зафиксированы по research (`classifier.spec.ts`, сценарий 3). Подтвердить заказчику итоговое поведение.
8. **(E/F)** SWR-stale при `409 not_synced` target-users: виджет продолжает фильтрацию по устаревшему кешу (план §5.2) и пишет diagnostic в `stf_diagnostics_v1` (без UI). Достаточно ли этого, или нужна явная подсказка юзеру на деталке?
9. **(F)** Полная e2e-верификация установленного виджета (dev-proxy :9012 по Makefile, установка архива в amo, настройки воронки+стадий через модалку, синк, реальная фильтрация) требует отдельного шага с участием человека — код-сторона готова к нему.
