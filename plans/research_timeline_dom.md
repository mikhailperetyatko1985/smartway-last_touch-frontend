# Отчёт: DOM-исследование блока «История» сделки 42661594 (подэтап A)

Дата: 2026-09-03. Метод: chrome-devtools MCP на уже открытой деталке `https://smartwaytoday.amocrm.ru/leads/detail/42661594`,
строго read-only (DOM/network), один эксперимент со временными inline-style с полным откатом (скриншоты в `research_screens/`).

Исходное состояние: 344 прямых ребёнка `.js-notes`; после догрузки вверх — 346 (+2 события, история
догружена до «Создание» 14.04.2026; вниз — до последнего звонка 02.09.2026).

## 1. Верификация фактов п. 2.2 плана

| Факт п. 2.2 | Статус | Детали |
|---|---|---|
| `.notes-wrapper > .notes-wrapper__scroller > .js-notes` | ✅ с уточнением | Между scroller и списком есть `.notes-wrapper__scroller-inner`; внутри него: `feed-search-wrapper`, **`.notes-wrapper__load-more` (над списком, «Загрузить еще»)**, сам список, затем прочие блоки. Кнопку фильтра ставить в `scroller-inner` перед `.js-notes` — корректно |
| Событие = прямой ребёнок `div.feed-note-wrapper-{type}[data-id]`, разделители = `div.note-time-label__wrapper.js-notes-timeline-point[data-point]` | ✅ | Все 346 детей — div; у разделителей `data-point` = локализованное имя месяца/дата («Апрель», «07.08.2026») |
| Типы = семантические классы (не minified) | ✅ | Полный инвентарь ниже, §2 |
| `feed-note-wrapper_system` + подтипы `-field_changed, -service_message, -tag_event, -lead_status_changed, -main_user_changed, -contact_created` | ⚠️ неполный список | **Найден новый подтип: `-lead_created`** (событие «Создание», 1 шт., несёт ещё и `_grouped`). Каждый system-wrapper несёт ровно ОДИН семантический подтип + `_system` |
| Группировки `feed-note-wrapper-grouped-complex` с `.js-grouped-subviews` | ✅ + новый класс | 23 капсулы: `-call_in_out` (14; внутри 2–7 вложенных wrapper'ов-звонков) и `-undefined` (9; внутри 1–2 вложенных `-amojo`). У контейнера `.js-grouped-subviews` тоже класс `feed-note__body-subviews[_amojo-ex]`. **НОВЫЙ суффикс `feed-note-wrapper_grouped`** на system-событиях: свёрнутые капсулы («Изменение поля: N событий» / «Создание: 2 события», ссылка `js-grouped-expand` «Развернуть») — `.js-grouped-subviews` в DOM НЕТ (субвью рендерятся только после раскрытия) |
| Pinned не секция, а `div.js-note.js-note-pinned` внутри `-note` + placeholder-высота на wrapper'е | ✅ с уточнениями | Все 3 pinned — `-note`. Placeholder = inline `display:block;height:Npx` на wrapper'е. Overlay: `position:absolute`, **offsetParent = внешний `.notes-wrapper`** (не scroller!), z-index 4; карточки лежат sticky-стопкой у верха истории (`top:10/226/426px`), fixer переписывает `top`/`width` при скролле и даже placeholder-height (наблюдал 150→170) |
| Автор: `.feed-note__amojo-user[data-id]` (число), у ботов без data-id; amojo — `div.n-avatar[id]` | ✅ + уточнения | Внутри каждого чипа — **вложенный дубль `span.control-user_state[data-id]` с тем же id** (селектор `.feed-note__responsible [data-id]` из POC избыточен и двойно считает). У amojo: data-id у чипов = **UUID участника чата** (author+recipient по 2 шт.), числовой user_id — только в `div.n-avatar[id]`, ровно 1 на сообщение (= автор). Найдены UUID-«авторы» и у `-undefined` |
| `data-id`: base62, задачи — число, беседы `opened-talk-{id}`, чаты UUID; часть заметок без data-id | ✅ | Точно: note/call/mail/system = base62 (4 из 75 `-note` без data-id), task = числовой id задачи, amojo/-undefined = UUID сообщения, opened_talks = `opened-talk-{id}`. **Совпадение с API**: `item.id` == data-id wrapper'а (проверено на 3 items ответа) |
| Пагинация GET `/ajax/v3/leads/{id}/events_timeline/?filter[created_at][lt]=…&limit=100&…` | ✅ | URL подтверждён в network-логе; `filter[type][]` — 22 числовых type-id. Ответ HAL-JSON: `_embedded.items[]` с полями `id, type, created_by, responsible_user_id, author_name`; **`created_by = 0` у ботов/триггеров** (имя в `author_name`) |
| ⚠️ «пересборка списка теми же нодами» | ⚠️ ЧАСТИЧНО ОПОВЕРГНУТО | См. §3: wrapper'ы событий — да, разделители дат — НЕТ |

## 2. Полный инвентарь типов (346 узлов после догрузки)

| Тип | Кол-во | system | Автор(ы) в DOM | Примечание |
|---|---|---|---|---|
| `-note` | 75 | нет | 49 с числовым чипом; 26 — чип **без** data-id («Копирование сделок от «Команда F5»») | 3 из них — pinned-обёртки |
| `-call_in_out` | 55 | нет | всегда числовой чип (81 вложение, т.к. 14 капсул) | 14 = `grouped-complex` (2–7 субвью) |
| `-mail_message` | 26 | нет | **числовых авторов НЕТ** — только `.feed-note__amojo-user` без data-id (имя/почта контакта «от:», «кому:») | hide_no_author=true скроет ВСЕ письма |
| `-task` | 19 | нет | 3 wrapper'а с чипами (один — двойной чип); 16 без каких-либо чипов («от … для …» plain text) | data-id = числовой id задачи |
| `-amojo` | 38 | нет | `div.n-avatar[id]` числовой (автор); чипы = UUID author/recipient | ровно 1 avatar на сообщение |
| `-undefined` | 9 | нет | вложенные `-amojo`-субвью: avatars числовые, включая **69264322 — внешний участник чата** («Алексей», «Продажи ПНЗ 1»), не amo-юзер | все = `grouped-complex`; строки «Беседа № A…» живут здесь, НЕ в opened_talks |
| `-opened_talks` | 4 | нет | **авторов нет вообще** (4/4) | бары «Еще N открытые беседы»; placeholder `height:1px`, fixer c inline `top/bottom` |
| `-lead_created` | 1 | да | нет | НОВЫЙ подтип; `_grouped`-капсула «Создание: 2 события» |
| `-field_changed` | 70 | да | 3 plain с чипом (12830901); `_grouped`-капсулы без авторов | 45 из 70 — `_grouped` |
| `-contact_created` | 6 | да | **все с числовым автором** | system c целевым автором → R4 |
| `-tag_event` | 9 | да | чипы без data-id («Триггеры от «Команда F5»») | |
| `-service_message` | 8 | да | нет вообще (1 `_grouped`) | ссылки на сделки/URL в тексте |
| `-main_user_changed` | 6 | да | 2 чипа без data-id («Триггеры…»), 2 `_grouped`-капсулы, остальные без авторов | «смена ответственного: с X на Y» |
| `-lead_status_changed` | 8 | да | **7 c числовым автором** (5 — целевой менеджер!), 1 без автора | R4: смены этапов своим менеджером скрываются при hide_system=true |
| разделители дат | 12 | — | — | `data-point`=месяц/дата |

## 3. Поведение DOM при догрузке (критично для observer'а)

Наблюдение MutationObserver'ом (childList, только `.js-notes`) на цикле догрузки (+2 события):
- ~360 мутаций; **все** узлы списка удалились и вставились обратно.
- **Wrapper'ы событий: идентичность объектов СОХРАНЯЕТСЯ** — 334 из 346 добавленных узлов — те же объекты, что были удалены (identity reuse). Inline-стили на них переживают пересборку (проверено: placeholder-height pinned 206/190/150 не изменились) → `display:none !important` + dataset на wrapper'е **переживает догрузку** ✅.
- **Разделители дат: идентичность НЕ сохраняется** — все 12 заменены НОВЫМИ DOM-объектами (added-only = ровно 12, removed-only = ровно 12). Выводы:
  - состояние скрытия, хранённое в dataset/inline-style **разделителя**, теряется при каждой догрузке → второй проход по разделителям обязан пересчитывать их с нуля на каждом pass'е (алгоритм POC так и делает — зафиксировать как обязательное требование к классификатору, покрыть юнит-тестом);
  - observer дополнительно увидит removed+added для 12 разделителей — дебаунс это гасит.
- Догрузка вверх: автоскролл к `scrollTop=0` ИЛИ явный `.notes-wrapper__load-more`; когда история кончилась — элемент пустой (height 0). Наблюдали полный цикл до «Создание»; вниз истории догрузки нет (хвост = последнее событие).

## 4. Эксперимент со скрытием (R3, pinned-overlay)

Проведено временными inline-style (`display:none !important`), затем **полный откат** к исходным `style.cssText`
(скриншоты: `02_hide_experiment_step2.png`, `03_rollback_verified.png`; остатков в DOM нет — проверено).

Результаты:
1. Скрытие обычных wrapper'ов (lead_created, contact_created) — чистый reflow соседних узлов и sticky-стопки pinned, артефактов нет.
2. Скрытие **всего** pinned-wrapper (placeholder 190px + overlay): карточка исчезает из sticky-стопки, остальные две pinned не сдвигаются визуально, reflow потока корректный. `display:none !important` на wrapper'е **не трогается amo-fixers** (пережил скролл-циклы) ✅.
3. amo-fixers **активно переписывают** inline `top/width` pinned-overlay и даже placeholder-height при скролле → персистентно менять эти стили нельзя; единственный безопасный наш след — `display` на wrapper'е + dataset. Запасной вариант R3 («обнулить height») отклоняется: конфликтует с fixer'ом.
4. After-откат: все 3 карточки pinned на месте, layout идентичен исходному.

Вывод для механизма скрытия (§5.4): скрываем wrapper целиком (overlay — потомок, уйдёт вместе). Pinned с целевым автором SHOW'ится первыми правилом и не трогается.

## 5. Dry-run эвристики §5.3 на реальных событиях

Target-сеты (группы в amo не читаем из DOM — гипотетически):
- **A** = {10722265 Лещёв Александр} (только ответственный сделки);
- **B** = {10722265, 10136549 Силкина Лилия, 12830901 Головнин Артём, 13159601 Ильенкова Виктория} (ответственный + гипотетическая группа).

| Конфиг | A: скрыто/всего | B: скрыто/всего |
|---|---|---|
| hideSystem=true, hideNoAuthor=true (дефолт) | **329/346** (95%) | **206/346** (60%) |
| hideSystem=true, hideNoAuthor=false | 257/346 | 134/346 |
| hideSystem=false, hideNoAuthor=true | 221/346 | 98/346 |

Ключевые наблюдения по типам (дефолт, B):
- `-note` 44/31 show/hide — адекватно; капсулы звонков 40/15 и `-undefined` 5/9 — правило Q2 «хоть один целевой в субвью → SHOW целиком» работает;
- `-amojo` 36/38: скрытые 2 = сообщения внешних участников (avatar id вне target set, напр. 69264322) — корректно;
- **R4 подтверждён количественно**: при hideSystem=true скрываются system-события С ЦЕЛЕВЫМ автором: `-lead_status_changed` 8/8 (5 — смена этапов самим целевым менеджером!), `-contact_created` 6/6, field_changed c чипами. Приоритет «system бьёт автора» зафиксирован как поведение; если заказчику нужно видеть действия своего менеджера по этапам — нужен отдельный тумблер (открытый вопрос).
- **Почта**: 26/26 скрывается при hideNoAuthor=true (числовых авторов нет вообще) — значимое следствие, вынести в открытый вопрос (R6).
- Задачи: 16/19 «без автора» → судьба определяется hide_no_author; задачи, созданные юзерами, чипы несут.
- Разделители: второй проход скрывает 2–9 из 12 в зависимости от конфига — работает.
- Ошибок эвристики (неверный вердикт при известном авторе) не найдено; «4 задачи с автором» = 3 wrapper'а (один с двойным чипом) — Set-дедуп обязателен.

## 6. Финальный алгоритм скрытия

Приоритет правил (сверху вниз): **pinned → system → no-author → target-match**. Капсулы решаются на уровне wrapper'а
рекурсивным сбором авторов (вложенные субвью покрываются `querySelectorAll`).

```
classify(wrapper, targetIds /* Set<number> */, cfg) -> SHOW|HIDE:
  ids = Set()                                   // только ЧИСЛОВЫЕ id
  for c in wrapper.querySelectorAll('.feed-note__amojo-user[data-id]'): if (n=toInt(c.dataset.id)) != null: ids.add(n)   // UUID исключаются toInt'ом автоматически
  for a in wrapper.querySelectorAll('div.n-avatar[id]'):                if (n=toInt(a.id))        != null: ids.add(n)   // amojo/-undefined: автор; внешние участники — просто не попадут в targetIds
  isSystem = classList(wrapper).has('feed-note-wrapper_system')
  isPinned = !!wrapper.querySelector('.js-note-pinned')                // overlay всегда внутри -note wrapper'а (placeholder-height на нём)

  if isPinned and not cfg.hide_pinned_no_target: return SHOW           // Q4-дефолт: карточка pinned живёт даже без целевого автора
  if isSystem:                    return cfg.hide_system ? HIDE : SHOW // R4: system бьёт автора (задокументировано; опц. тумблер)
  if ids.empty:                   return cfg.hide_no_author ? HIDE : SHOW   // боты/триггеры, почта, задачи без чипа, opened_talks
  return ids.some(id => targetIds.has(id)) ? SHOW : HIDE               // Q2: один целевой в капсуле — SHOW целиком

hide(w):  w.style.setProperty('display','none','important'); w.dataset.stfHidden='1'
show(w):  снять оба (только если dataset.stfHidden=='1')

processList():   // debounce ~250 мс после childList-мутаций на .js-notes
  for w in list.children where classList.has('feed-note-wrapper'): применить classify
  ВТОРОЙ ПРОХОД по разделителям — ВСЕГДА С НУЛЯ (ноды разделителей НЕ переживают пересборку!):
    снизу вверх: note-time-label__wrapper видим, если между ним и СЛЕДУЮЩИМ разделителем ниже есть хотя бы один SHOW-wrapper
```

Рекомендации observer/debounce:
- `MutationObserver` на `.notes-wrapper__notes.js-notes`, `{childList:true}` без subtree/attributes (шум fixer'ов подтверждён: они переписывают inline-стили при скролле) — 250 мс дебаунс достаточен (пересборка = всплеск ~360 мутаций <1 c).
- processList идемпотентный full-pass по прямым детям (R5: часть узлов без data-id → событийно-ориентированная логика не годится).
- Состояние на нодах (dataset/inline) переживает пересборку для wrapper'ов; для разделителей — только пересчёт.
- Страховка SPA-перехода: проверка identity `.js-notes` раз в 1 c (паттерн POC `watchRoute`) — при замене ноды списка observer перевешивать.

## 7. Фикстуры (widget/tests/fixtures/timeline/)

20 файлов + README.md с вердиктами для target set B и дефолтного cfg:
note_with_author, note_no_author, pinned_note, system_lead_created (новый тип), system_field_changed_plain,
system_field_changed_grouped («N событий»), system_contact_created (R4), system_tag_event, system_service_message,
system_main_user_changed_plain (двойной edge: system+no-author), system_lead_status_changed_with_author (R4),
call_in_out_with_author, call_in_out_grouped_complex (7 субвью, авторы 12830901/12499693 + внешний «Алексей»),
mail_message (нет числовых авторов), task_with_author (двойной чип), task_no_author, amojo_message (UUID-чипы + numeric avatar),
undefined_grouped_complex_talks (внешний участник 69264322 + целевая Силкина в субвью), opened_talks, separator_date_label.

## 8. Риски/зависимости для этапов C–F (новые)

- **R14 (новый)**: amo-fixers переписывают inline `top/width` pinned-overlay и placeholder-height при скролле → не персистентно
  модифицировать эти стили; наш след — только `display` на wrapper'е. Проверено экспериментом, конфликтов нет.
- **R15 (новый)**: числовые id внешних участников чатов в `div.n-avatar[id]` (-amojo/-undefined) НЕ являются amo user_id
  (69264322). Вероятность коллизии с user_id мала; опциональный кросс-чек — по полному списку user'ов из backend-снапшота (таблица уже ведётся, §4 плана).
- **R16 (новый)**: `_grouped`-капсулы system-событий раскрываются кликом «Развернуть» (`js-grouped-expand`) — после раскрытия
  в DOM появляются субвью. Наш observer на childList родительского списка это не увидит (внутренняя мутация) — классификация
  wrapper'а уже финальна (system), поведение корректно; но канареечный чек якорей учитывать новый class `feed-note-wrapper_grouped`.
- R2 уточнить: «состояние переживает пересборку» — ТОЛЬКО для event-wrapper'ов; разделители регенерируются.
- Открытые вопросы заказчику (доп.): 6) почта всегда под hide_no_author (100% писем скрывается при дефолте); 7) system-события с целевым автором (этапы/создание контактов) — принять приоритет system или отдельный тумблер.

## 9. Скриншоты

- `research_screens/01_initial_state.png` — исходное состояние деталки;
- `research_screens/02_hide_experiment_step2.png` — эксперимент скрытия (3 hidden, sticky-стопка pinned);
- `research_screens/03_rollback_verified.png` — после полного отката (все 3 карточки pinned на месте).
