# HTML-фикстуры для юнит-тестов классификатора timeline-фильтра

Read-only снимки `outerHTML` реальных узлов блока «История» сделки 42661594 (amoCRM, 2026-09-03).
Данные внутренние и оставлены как есть. Каждый файл — один прямой ребёнок `.notes-wrapper__notes.js-notes`.

## Канонический target set и cfg для ожидаемых вердиктов

```
targetIds = {10722265 /*Лещёв Александр, ответственный сделки*/, 10136549 /*Силкина Лилия*/,
             12830901 /*Головнин Артём*/, 13159601 /*Ильенкова Виктория*/}   // «группа» гипотетическая (B)
cfg = { hideSystem: true, hideNoAuthor: true, hidePinnedNoTarget: false }    // дефолт ТЗ
```

Правило вердикта: `classify()` из `plans/research_timeline_dom.md` §6. Авторы собираются рекурсивно
(`.feed-note__amojo-user[data-id]` + `div.n-avatar[id]`, только числовые id; UUID отбрасываются).

## Фикстуры и ожидаемые вердикты

| Файл | Тип/анкоры | Числовые авторы в ноде | Вердикт (B, дефолт) | Комментарий для теста |
|---|---|---|---|---|
| `note_with_author.html` | `-note`, чип `.feed-note__responsible > .feed-note__amojo-user[data-id]` | 10722265 | **SHOW** | обычный случай target-match; вложенный `span.control-user_state[data-id]`-дубль не должен дублировать автора (Set) |
| `note_no_author.html` | `-note`, чип БЕЗ data-id («Копирование сделок от «Команда F5»») | — | **HIDE** (no-author) | при `hideNoAuthor:false` → SHOW. В API такое событие имеет `created_by=0` |
| `pinned_note.html` | `-note` + `.js-note-pinned` (overlay, inline-стили placeholder/overlay сохранены как есть) | 10722265 | **SHOW** | правило pinned срабатывает ПЕРВЫМ (hidePinnedNoTarget=false); при `hidePinnedNoTarget:true` вердикт по авторам — всё равно SHOW. Тестировать, что placeholder-height на wrapper'е не должен меняться классификатором |
| `system_lead_created.html` | `_system lead_created _grouped`, капсула «Создание: 2 события» + `js-grouped-expand` | — | **HIDE** (system) | НОВЫЙ подтип, отсутствовавший в исходном плане; без авторов, без `.js-grouped-subviews` в DOM |
| `system_field_changed_plain.html` | `_system field_changed`, «Для поля … установлено значение…» | 12830901 | **HIDE** (system бьёт автора — R4) | при `hideSystem:false` → SHOW. Ключевой кейс приоритета |
| `system_field_changed_grouped.html` | `_system field_changed _grouped`, «N событий» | — | **HIDE** (system) | свёрнутая капсула; после клика «Развернуть» появятся субвью — классификация не меняется |
| `system_contact_created.html` | `_system contact_created`, ссылка на контакт | 12830901 | **HIDE** (R4) | system с целевым автором скрывается при дефолте; `hideSystem:false` → SHOW |
| `system_tag_event.html` | `_system tag_event`, чип без data-id («Триггеры от «Команда F5»») | — | **HIDE** (system; no-author бы дал тот же результат) | |
| `system_service_message.html` | `_system service_message`, ссылка на родительскую сделку, ЧИПОВ НЕТ ВООБЩЕ | — | **HIDE** (system) | отличие от tag_event: `.feed-note__amojo-user` отсутствуют полностью |
| `system_main_user_changed_plain.html` | `_system main_user_changed`, «смена ответственного: с X на Y», чип без data-id | — | **HIDE** (system) | двойной edge: при `hideSystem:false` всё равно HIDE через no-author (у чипа нет data-id) |
| `system_lead_status_changed_with_author.html` | `_system lead_status_changed`, «Новый этап» | 10722265 | **HIDE** (R4: целевой менеджер сдвинул этап, но system-правило первее) | при `hideSystem:false` → SHOW. Фиксирует спорное поведение для открытого вопроса 7 |
| `call_in_out_with_author.html` | `-call_in_out`, «Исходящий звонок от: … кому: +7…» | 12830901 | **SHOW** | простой звонок; inline-стили (`display:flex`) не должны трогаться |
| `call_in_out_grouped_complex.html` | `-call_in_out grouped-complex`, `.js-grouped-subviews` с 7 вложенными wrapper'ами-звонками | 12830901, 12499693 (+ внешний «Алексей» без числового user_id) | **SHOW** (Q2: есть целевой в субвью) | при target set A={10722265} → HIDE. Проверяет рекурсивный сбор авторов и Set-дедуп (id 12830901 встречается многократно) |
| `mail_message.html` | `-mail_message`, «Исходящее письмо, от: … кому: …» | — (только `.feed-note__amojo-user` БЕЗ data-id = имена/почта контактов) | **HIDE** (no-author; дефолт скрывает 100% писем!) | при `hideNoAuthor:false` → SHOW. Отдельный открытый вопрос 6 для заказчика |
| `task_with_author.html` | `-task`, data-id числовой, ОДИН wrapper с ДВУМЯ чипами | 10136549, 12830901 | **SHOW** | проверяет дедуп и «хоть один целевой» |
| `task_no_author.html` | `-task`, создатель plain text («от … для …»), чипов нет | — | **HIDE** (no-author) | при `hideNoAuthor:false` → SHOW |
| `amojo_message.html` | `-amojo`, data-id = UUID; чипы author/recipient с UUID data-id; `div.n-avatar[id="12830901"]` | 12830901 (avatar) | **SHOW** | КРИТИЧНО: UUID в `.feed-note__amojo-user[data-id]` не должны приниматься за user_id; числовой автор — только из `div.n-avatar[id]` |
| `undefined_grouped_complex_talks.html` | `-undefined grouped-complex`, header «Продажи ПНЗ 1» (Telegram), replied-to чип UUID + avatar **69264322** (внешний участник, не amo-юзер!), вложенный `-amojo` с `div.n-avatar[id="10136549"]`, строка «Беседа № A75637» | 69264322, 10136549 | **SHOW** для B (10136549 в субвью); **HIDE** для A={10722265} | внешний id 69264322 никогда не попадает в targetIds → безопасен; правило Q2 по рекурсии |
| `opened_talks.html` | `-opened_talks`, data-id=`opened-talk-75637`, «Еще 2 открытые беседы», placeholder `height:1px` + fixer с inline top | — (авторов в DOM нет) | **HIDE** (no-author; дефолт ТЗ Q4) | при `hideNoAuthor:false` → SHOW. Строки отдельных сообщений бесед живут НЕ здесь, а в `-undefined`-капсулах |
| `separator_date_label.html` | `.note-time-label__wrapper.js-notes-timeline-point[data-point="Апрель"]` | — | **CONTEXTUAL** | не классифицируется сам: виден, только если между ним и следующим разделителем ниже есть ≥1 SHOW-wrapper (второй проход снизу вверх). ВАЖНО для теста: нода разделителя НЕ переживает пересборку при догрузке → состояние на ней (dataset/inline) не может сохраняться; вердикт всегда пересчитывается |

## Тестовые сценарии, которые должны покрываться

1. Каждый файл по отдельности — вердикт из таблицы (target B + дефолтный cfg).
2. Капсулы (`call_in_out_grouped_complex`, `undefined_grouped_complex_talks`) для target set A={10722265} → HIDE.
3. `hideSystem:false` — перевернуть вердикты system-фикстур, кроме тех, что падают в no-author (`system_main_user_changed_plain`).
4. `hideNoAuthor:false` — почта/задачи/opened_talks/заметки без авторов → SHOW.
5. `hidePinnedNoTarget:true` + pinned с НЕцелевым автором (сделать вариант из `pinned_note.html`) → HIDE; overlay-скрываемость = display:none на wrapper'е целиком.
6. Разделитель: последовательность `[separator, hidden-wrapper, separator]` → первый разделитель HIDE (нет видимых до следующего), второй — по контексту ниже.
