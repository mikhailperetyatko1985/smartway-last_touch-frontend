# Саммари результатов реализации — «Фильтрация событий timeline сделки»

Дата: 2026-09-04. План: `timeline_filter_plan.md`. Исследование: `research_timeline_dom.md`.
Реализация организована последовательными подэтапами A–F (оркестратор + субагенты-кодеры).
Все ПИ-проверки в amoCRM — строго read-only, состояние сделки 42661594 и связанных сущностей не изменялось; временные DOM-эксперименты откатаны полностью (скриншоты `research_screens/pi_01…pi_04`).

## Итоговая таблица

| Подэтап | Объём | Ключевые артефакты | verificация |
|---|---|---|---|
| A — DOM-исследование | Этап 0/п. 2.2 | `research_timeline_dom.md`, `tests/fixtures/timeline/` (20 outerHTML-фикстур + README с verdict'ами), финальный алгоритм classify (приоритеты pinned → system → no-author → target; UUID-авторы отсекаются; разделители дат — пересчёт с нуля на каждом проходе) | dry-run на 346 событиях: 206/346 скрыто при target set B + дефолтном cfg; эксперимент со скрытием pinned — без артефактов, откатан |
| B — Backend (`back/`) | Задача 0 / Этап 2a | Миграции: `timeline_filter_settings`, `timeline_filter_user_groups`, `timeline_filter_users`, `timeline_filter_sync_states`; Model/Domain (VO `FunnelFilterSettings`)/DTO/FormRequest/Service/Controller; джоба `SyncTimelineUsersAndGroupsJob` (ShouldQueue, tries=3, backoff 60/300, write-snapshot upsert+delete-stale в транзакции, lock через `lockForUpdate` + stale-рекавери 2 ч); 5 endpoints в группе `AuthByDisposableToken` | 56 новых тестов; PUT-валидация `status_ids` (непустой, без дублей) в т.ч. 422-кейсы |
| C — Проводка виджета | Задачи 1a, 2b / Этап 1 | `src/drivers/backend/TimelineFilterSettingsApi.ts`, `TimelineTargetUsersApi.ts` (транспорт `$authorizedAjax`, типизированные ошибки); `src/timelineFilter/cache.ts` (SWR, TTL 30 мин, in-flight дедуп, ключи `stf_*:<hostname>`), `settingsProvider`, `targetUsersProvider`; `mountTimelineFilter()` в `render()` (`src/index.js` — только аддитивные строки, try/catch R11) | tsc 0 новых, build exit 0, eslint 0; манифест не тронут |
| D — Модалка настроек | Задача 1 / Этап 2b | `TimelineFilterSettings.vue` + `useTimelineFilterSettings.ts`: карточки воронок (+добавить/удалить), pipeline-selector по ещё не добавленным, обязательный мульти-селект стадий (≥1), mode off/base/custom (fallback на базового при пустом custom-поле), hide-флаги; ошибки 422 по карточкам (`funnels.N.*`), 403-баннер; кнопка «Синхронизировать сотрудников и группы»: 202/409-already_running → polling 2.5 с (потолок 120 с) → toast + `resetStfTargetUsersCache()`; показ `last_synced_at` | tsc/build/eslint зелёные; last_touch-файлы не тронуты (свой контейнер `#smartway-timeline-filter-settings`, R12) |
| E — Runtime-фильтрация | Задачи 2,3,4,5,6 / Этап 4 | `resolver.ts` — гейт `pipeline_id + status_ids` сделки, base/custom ответственный с fallback, `loadTargetUsers`, 409 → тихий выход; `classifier.ts` — чистая функция по research §6, отклонений 0; `hider.ts` — `display:none !important` + `dataset.stfHidden` с сохранением исходного inline-display, второй проход разделителей всегда с нуля; `button.ts` — `#stf-toggle-btn` перед `.js-notes`, счётчик, filtered↔allShown; `observer.ts` — childList-only, debounce 250 мс, идемпотентный полный проход; vitest+jsdom (devDeps, `npm run test:unit`) | 84 unit-теста (по всем 19 event-фикстурам + негативные cfg-вариации + симуляция пересборки DOM) |
| F — Canary + финальная верификация | Этап 5 | `canary.ts`: чек якорей (вкл. `_grouped`, R16) на каждом processList, N=5 подряд → тихая деактивация (unhideAll по нашей метке, снятие кнопки, disconnect, `phase='disabled'`), TTL disabled 24 ч, diagnostic ring-buffer `stf_diagnostics_v1` (cap 50); `destroyTimelineFilter()`; teardown при уходе с деталки; diagnostic при 409-SWR-stale | **Widget:** tsc — 0 в src (89 baseline node_modules), eslint 0, **test:unit 100/100** (84+16 canary), build exit 0 → `build/widget.zip` (~998 KiB script.js; vitest/jsdom не в бандле). **Backend:** 520 passed / 1 failed — предсуществующий live-smoke `CheckConnectTest` (baseline тоже fail). **ПИ (read-only):** все selector'ы резолвятся (14 типов wrapper'ов, `_grouped` 49, pinned 3, разделители 12); dry-run 206/346 — точное совпадение с исследованием; скрытие 10 узлов (pinned/system/mail) — артефактов нет, откат verified (инвентарь 346/206 идентичен baseline, скриншот = исходный) |

## Отклонения/решения, зафиксированные в ходе реализации

1. Статус синка — своя таблица `timeline_filter_sync_states` + атомарный claim (`lockForUpdate`) вместо кэш-локов (кэш в проекте ненадёжен); stale-рекавери 2 ч.
2. Дубли `pipeline_id` и дубли стадий в `status_ids` → 422 (не merge/dedup).
3. Per-account scope localStorage-кешей — `location.hostname` (субдомен инсталляции уникален на аккаунт; точка замены `getAccountScope()` в `cache.ts`).
4. `hideNode` сохраняет/восстанавливает исходный inline `display` (`dataset.stfPrevDisplay`) — иначе затирался amo-layout и нарушалось «полное восстановление».
5. При `hide_system=false` system-события SHOW безусловно (research §6), включая no-author — расхождение с примечанием README фикстур решено в пользу research (правки при отказе: 1 строка в `classify` + 5 ожиданий).
6. Дефолты новой карточки в модалке: `mode=base`, все hide-флаги включены.
7. `leadId` из URL `/leads/detail/{id}` (не `AMOCRM.data.current_id`).

## Остаток для боевого включения (шаг с человеком)

Установка `build/widget.zip` в amo-аккаунт (dev-proxy :9012, Makefile) → настройка воронки+стадий в модалке → «Синхронизировать сотрудников и группы» → проверка фильтрации на деталке + наблюдение за `stf_diagnostics_v1`/canary.

## Открытые вопросы заказчику (свежая редакция §9 плана)

1–5 — прежние (поле «доп. ответственный», fallback custom-поля, юзер без группы, `opened_talks`, плановый sync).
6. Почта: 100% писем попадает под `hide_no_author` (0 числовых авторов) — приемлемо?
7. Приоритет «system бьёт автора» (R4) — подтвердить; учёт расхождения README vs research (см. решения п. 5).
8. `409 not_synced` при тёплом кеше: SWR-stale + diagnostic без UI-подсказки — достаточно?
9. E2E-верификация установленного виджета на ПИ — отдельный шаг (см. выше).
