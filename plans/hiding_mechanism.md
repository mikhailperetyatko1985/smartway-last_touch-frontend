# Механизм скрытия событий — детальное описание для верификации

Источник истины по коду: `src/timelineFilter/{index,resolver,classifier,hider,button,observer,canary}.ts`.
Соответствие: план §5.2–5.5, `research_timeline_dom.md` §3/§6. Все строки кода в примерах — фактические.

## 0. Главный инвариант

Фильтрующего кода не существует, пока не построен **resolution** = `{cfg, targetIds}`.
Все три уровня «молчания» предшествуют любому `display:none`:

1. **canary-disabled** (persisted флаг `stf_canary_v1:<hostname>`, TTL 24 ч) — `mountTimelineFilter()` выходит до любой работы (`index.ts:87-91`).
2. **resolution = null** → `phase='inactive'`, `<html data-stf-timeline-filter="inactive">`, кнопки/observer нет (`index.ts:193-196`).
3. Только `resolution ≠ null` → `activate()` → кнопка + observer + первый `processList` (`index.ts:201-230`).

## 1. Гейт до классификации (resolver.ts)

Триггер: legacy `render()` в `src/index.js` → `mountTimelineFilter(widget)` в `try/catch` (R11).
Гейт сущности: `AMOCRM.data.current_entity === 'leads' && is_card` (иначе полный teardown, `index.ts:100-111`).

Последовательность `resolveTargets(leadId)` (`leadId` — из URL `/leads/detail/(\d+)`, не из `AMOCRM.data`):

```
0. resolveCache.get(leadId)               // позитивный кэш на жизнь маунта; НЕгативные результаты НЕ кешируются
1. loadTimelineFilterSettings()           // SWR localStorage stf_settings (TTL 30 мин) + backend GET
   → !funnels || funnels.length===0       → null   («виджет выключен везде», план §3)
2. GET /api/v4/leads/{id}                 // axios на subdomain аккаунта; catch(любая ошибка) → null (R9)
3. cfg = funnels.find(pipeline_id === lead.pipeline_id)
   !cfg || cfg.mode==='off'               → null
4. typeof lead.status_id!=='number'
   || !cfg.status_ids.includes(status_id) → null   // сделка вне активных стадий воронки
5. responsibleId:
   mode=base   → lead.responsible_user_id ?? 0
   mode=custom → cf = Number(custom_fields_values[field_id===cfg.custom_field_id].values[0].value)
                 cf>0 ? cf : (lead.responsible_user_id ?? 0)   // fallback: пусто/NaN/0/«протухшее» field_id
   responsibleId<=0                                        → null
6. loadTargetUsers(responsibleId)         // seam: дедуп + stf_target_users_v1 (TTL 30 мин, SWR)
   null (409 not_synced без кеша / backend down)           → null
7. targetIds = Set(только Number.isInteger из target_user_ids)
```

**Гонка SPA:** каждый (re)резолв увеличивает `runtime.epoch`; вернувшийся результат с чужим epoch или чужим `leadId` отбрасывается (`index.ts:175-189`). Повторный `render()` той же **активной** карточки — no-op (одна выборка на открытие); повторный `render()` карточки в `inactive` — **разрешает повторный резолв** (смена этапа amo → `status_id` мог войти в `status_ids`, `index.ts:149-160`).

## 2. Классификация конкретного wrapper'а (classifier.ts)

`classify(wrapper, cfg, targetIds) → 'show' | 'hide'` — чистая функция, 4 уровня приоритета, проверяются строго сверху вниз, первый совпавший даёт вердикт:

```
P1  isPinned(wrapper) && !cfg.hide_pinned_no_target  → SHOW
    // isPinned = wrapper.querySelector('.js-note-pinned') !== null
    // pinned-оверлей живёт ВНУТРИ обычного wrapper'а -note — поэтому проверка «внутри», не секция
P2  isSystem(wrapper)  →  cfg.hide_system ? HIDE : SHOW
    // isSystem = classList.contains('feed-note-wrapper_system')
    // БЕЗУСЛОВНО до автора: system-событие с целевым автором скрывается при hide_system=true (R4)
    // и показывается при hide_system=false даже вообще без автора (см. нюанс Н1)
P3  authors = collectAuthors(wrapper)
    if authors.size === 0 → cfg.hide_no_author ? HIDE : SHOW
    // боты/триггеры, ВСЯ почта, задачи без чипа, бары opened_talks
P4  ∃ id ∈ authors: targetIds.has(id) ? SHOW : HIDE
```

Сбор авторов `collectAuthors` (рекурсивно по всему поддереву wrapper'а — `querySelectorAll` покрывает вложенные субвью капсул `.js-grouped-subviews`):

- `.feed-note__amojo-user[data-id]` → `toIntOrNull(data-id)`;
- `div.n-avatar[id]` → `toIntOrNull(id)`;
- `toIntOrNull`: **только `/^\d+$/`** — UUID чатов, `opened-talk-{id}`, base62 и значения с мусором → `null`, в Set не попадают (research: amojo-чипы несут UUID, числовой автор amojo — только в avatar);
- `Set` дедуплицирует вложенный `span.control-user_state[data-id]` (дубль того же id внутри чипа);
- числовые id внешних участников чатов (не-amo юзеров) в avatar собираются, но в `targetIds` не найдутся (R15, см. нюанс Н5).

Правило Q2 следует из P4 автоматически: капсула (`-grouped-complex`) — один wrapper, один вердикт; `querySelectorAll` по поддереву собирает авторов **всех** субвью → «хоть один целевой → SHOW целиком».

### Таблица решений (для сверки с фикстурами, target set B = {10722265,10136549,12830901,13159601}, дефолтный cfg: все hide_*=true)

| Тип wrapper'а | Авторы | Правило-победитель | Verdict |
|---|---|---|---|
| `-note` с целевым автором | ∈B | P4 | SHOW |
| `-note` с нецелевым автором | ∉B | P4 | HIDE |
| `-note` pinned, автор нецелевой, `hide_pinned_no_target=true` | ∉B | P1 не сработал (флаг true) → проваливается в P3/P4 | HIDE |
| `-note` pinned, любого автора, `hide_pinned_no_target=false` | любые | P1 | SHOW |
| `feed-note-wrapper_system` (`-field_changed`, `-tag_event`, `-lead_status_changed`, `-main_user_changed`, `-lead_created`, …), автор целевой | ∈B | P2 | HIDE (R4) |
| system, hide_system=false, авторов нет | ∅ | P2 | SHOW (Н1) |
| `-mail_message` (26/26 без числовых авторов) | ∅ | P3 | HIDE |
| `-task` с чипом исполнителя/постановщика | ∈/∉B | P4 по наличию | SHOW/HIDE |
| `-amojo` c `div.n-avatar[id]=целевой` | ∈B | P4 | SHOW |
| `-amojo` только с UUID-чипами | ∅ | P3 | HIDE |
| `-call_in_out-grouped-complex`: 1 из 7 субвью целевая | ∈B | P4 (Q2) | SHOW целиком |
| `-undefined grouped-complex` (беседа; авторы во вложенных `-amojo`) | ∈/∉B | P4 | SHOW/HIDE |
| `-opened_talks` (бар «Беседа №…») | ∅ | P3 | HIDE |
| разделитель `.note-time-label__wrapper` | — | не классифицируется, §4 | — |

## 3. Сам физический скрытие/показ (hider.ts)

`hideNode(node)`:
```
если dataset.stfHidden==='1' → no-op                       // идемпотентность
dataset.stfPrevDisplay = style.display                     // ЗАПОМИНАЕМ исходный inline display amo
style.setProperty('display','none','important')            // important бьёт и amo-классы, и amo-inline
dataset.stfHidden = '1'                                    // наша единственная метка
```

`showNode(node)`:
```
если dataset.stfHidden!=='1' → no-op                       // НИКОГДА не трогаем ноды, которые не скрывали мы
prev = dataset.stfPrevDisplay
prev непустой → style.setProperty('display', prev)         // возврат amo-inline (display:flex у звонков и т.п.)
иначе         → style.removeProperty('display')            // возврат к решению amo-таблиц стилей
удалить dataset.stfPrevDisplay, dataset.stfHidden
```

Нюансы:
- **Н2. Сохранение `stfPrevDisplay` критично для DoD «полное восстановление»:** `setProperty` затирает исходный inline `display` ноды (amo ставит `display:block/flex` инлайном). Без сохранения показанное событие потеряло бы amo-layout. Пустая строка-предок (`prev===''`) корректно кавится в `removeProperty`.
- Если amo сама держала ноду с inline `display:none` — её же `none` и вернём при show (мы её не прятали → `hideNode` не вызывался; либо прятали поверх — prev='none' сохранён и восстановлен точно).
- Пины: `hide/show` **только по `dataset.stfHidden`** — чужие inline-стили (`top/width/height` у pinned-overlay, placeholder-height, которые amo-fixers переписывают при скролле) не читаются и не пишутся (R14).
- Скрытие переживает пересборку списка при догрузке: amo удаляет и вставляет **те же** DOM-объекты event-wrapper'ов → inline-стиль и dataset остаются на ноде, повторный проход — дешёвый no-op по уже скрытым (research §3).

## 4. Проход по списку (processList) — порядок, критичный для корректности

```
processList(listEl, cfg, targetIds, mode):
  mode='allShown':
     unhideAll(children wrappers+separators) → hiddenCount=0, только пересчёт totalWrappers → return
  mode='filtered':
     PASS 1 — processWrappers: линейный скан listEl.children;
              изо всех прямых детей берутся ТОЛЬКО .feed-note-wrapper (isEventWrapper);
              каждый → classify → hideNode/showNode; hiddenCount++ на hide.
              // полный проход, а не событийно-ориентированный (R5: часть узлов без data-id → дедуп по id невозможен)
     PASS 2 — processSeparators: С НУЛЯ, ВСЕГДА (см. Н3), снизу вверх:
              sectionHasVisibleWrapper = false
              for i = children.length-1 .. 0:
                 separator → его секция пуста? hideNode : showNode; флаг := false (граница секции)
                 wrapper   → !dataset.stfHidden → sectionHasVisibleWrapper = true
              // т.е. разделитель скрыт, если НИЖЕ него до следующего разделителя нет ни одного видимого события
     return {hiddenCount, totalWrappers}
```

- **Н3. Разделители не могут нести состояние:** при догрузке amo регенерирует их как **новые** DOM-узлы (все 12), в отличие от wrapper'ов. Поэтому pass 2 не сверяет прошлый вердикт, а пересчитывает по факту видимости wrapper'ов (подтверждено тестом «симуляция пересборки» в `hider.spec.ts`). `showNode` на свежеиспечённом разделителе — no-op (метки нет).
- Порядок pass'ов важен: separators читают `dataset.stfHidden` после того как pass 1 привёл wrapper'ы в соответствие вердиктам.
- Разделитель **первого** месяца (все события выше него скрыты, ниже — секция) скроется корректно: скан снизу вверх доходит до него с `sectionHasVisibleWrapper=false`.
- Разделители «хвоста» (последний разделитель + пустая зона до конца DOM) — аналогично.

## 5. Кто дёргает processList (триггеры)

| Триггер | Механизм | Где |
|---|---|---|
| Первый проход | `activate()` → `ensureAttached()`: блок истории может не быть в DOM — страховочный тик ждёт появления `.notes-wrapper__scroller-inner` + `.js-notes` | `index.ts:212-230` |
| Догрузка (скролл к верху / «Загрузить еще») | `MutationObserver(listEl, {childList:true})` **без subtree/attributes** (атрибуты = шум от amo-fixers с inline style); debounce `STF_DEBOUNCE_MS=250`: всплеск ~360 removed+added мутаций схлопывается в ОДИН `processAndPaint` | `observer.ts` |
| Замена самого list-узла / потеря кнопки | `tick()` раз в 1 с: `ensureAttached()` идемпотентно переподключает observer по `observer.target !== listEl` и красит; `updateToggleButton` после каждого прохода | `index.ts:232-326` |
| Клик toggle | `handleToggle()`: `filtered ↔ allShown` → `processAndPaint()`; в `allShown` observer продолжает считать счётчик, но не скрывает; при возврате в `filtered` — полный перепроход (свежие догруженные порции классифицируются) | `index.ts:298-307` |
| Смена карточки (SPA) | `onLeadIdChanged → teardownRuntime()`: disconnect observer + **`unhideAll(старый список)` (если он ещё `isConnected`) + удаление кнопки** → новый резолв с нуля | `index.ts:328-350` |

- `hiddenCount` — число скрытых **wrapper'ов** в последнем проходе (разделители в счётчик не входят); отображается в тексте кнопки `ensureToggleButton/updateToggleButton`, идемпотентно по `id="stf-toggle-btn"`, позиция — перед `.js-notes` внутри `scroller-inner`.
- `teardownRuntime` снимает скрытия со **старого** списка — на осколках DOM amo не остаётся наших `display:none` (но даже если список уже отсоединён и unhide не выполнен — новые карточки это новые ноды, состояние не протекает).
- `destroyTimelineFilter()` (`index.ts:352-364`) — полный явный shutdown (в prod не вызывается из `index.js` — seam).

## 6. Canary — последний предохранитель под每个 processList

`processAndPaint()` перед проходом: `stfCanaryOnProcess(checkStfAnchors(listEl), …)` (`index.ts:252-256`):
- «провал» = list существует, `children.length>0`, но **ни один** прямой ребёнок не имеет токена якоря `feed-note-wrapper*` (граница токена `_`/`-`, покрытие `_grouped`/`-lead_created`) или `note-time-label__wrapper`; пустой/отсутствующий list — нейтрально.
- 5 подряд провалов (`STF_CANARY_FAIL_LIMIT`) → `deactivateByCanary()`: **`unhideAll` по метке `dataset.stfHidden`** (не по классам), снятие кнопки, `observer.disconnect()`, stop tick, `phase='disabled'`, persist `stf_canary_v1` на 24 ч + `pushStfDiagnostic` в `stf_diagnostics_v1` (cap 50) + `console.warn('[STF] disabled…')`.
- `stfPrevDisplay` чистится тем же `showNode` — после деактивации на нодах не остаётся ни одного нашего следа.

## 7. Нюансы и потенциально спорные места (для целенаправленной проверки)

- **Н1 (открытый вопрос 7).** `hide_system=false` + system-событие **без автора** → SHOW (безусловное P2 по research §6; dry-run-цифры согласованы только с этим). В README фикстур было примечание с условной семантикой — расхождение реализовано в пользу research, зафиксировано тестом. Если заказчик выберет условную — меняется одна строка в `classify` (падать дальше в P3 при empty authors) + 5 ожиданий.
- **Н4. `hide_pinned_no_target=true` не «скрывает всё pinned»**, а лишь отключает P1Shield: pinned-заметка с целевым автором останется SHOW по P4; без автора уйдёт в P3. Имя флага вводит в заблуждение — семантика «pinned без целевых».
- **Н5 (R15).** Числовой `id` внешнего участника чата в `n-avatar` трактуется как author-id; фантомная коллизия с реальным amo user_id дала бы ложный SHOW. Вероятность мала; кросс-чек по снапшоту `timeline_filter_users` не делался.
- **Н6.** Свёрнутые `_grouped`-капсулы system-событий (48 шт. на сделок) не имеют `.js-grouped-subviews` до раскрытия; авторы субвью физически отсутствуют в DOM в момент классификации. Но это system → P2 и так решает исход; для НЕ-system свёрнутых капсул (если появятся) авторы из скрытых субвью не соберутся.
- **Н7.** Если amo пересохранит inline `display` скрытой ноды между проходами (зафиксируйте, если увидите): `dataset.stfHidden='1'`, но `display` не `none` → hide no-op, скрытие «слетит» до следующего show/hide-цикла. Страховка — только debounce-проходы.
- **Н8.** `resolveCache` и `epoch` живут в модульном замыкании до `clearStfResolveCache()`: смена настроек стадии в модалке НЕ влияет на уже открытую карточку без reload (`render()`/смена этапа — исключение, см. §1).
- **Н9.** 409 with тёплым SWR → показ по stale target-set с diagnostic-записью, а не молчание (открытый вопрос 8).
- **Н10.** `target_user_ids` с мусором (не целые числа) отфильтрованы `Number.isInteger` в `resolveTargets:134-139` — «дышащая» защита, тестом на backend контракт не покрыта (backend гарантирует int).

## 8. Чек-лист самостоятельной верификации

1. `npm run test:unit` — 100 тестов: `classifier.spec.ts` (53: 19 фикстур × verdict'ы README + вариации cfg), `hider.spec.ts` (6: идемпотентность, сохранение `display:flex`, пересборка с identity-reuse wrapper'ов и НОВЫМИ разделителями ×2 цикла), `resolver.spec.ts` (15: все гейты §1, fallback custom, 409→null), `observer.spec.ts` (4: debounce-граница 250 мс, 360 мутаций→1 проход), `button.spec.ts`, `canary.spec.ts` (16).
2. Живой DOM (read-only): `document.querySelectorAll('[data-stf-hidden]')` — только наши скрытия; `[data-stf-prev-display]` без `stfHidden` — течь; `<html data-stf-timeline-filter>` — mounted/active/inactive/disabled.
3. ПИ dry-run (отчёт F): при B+дефолт **206/346** заведомо ожидаемое число; сверяется мини-репликой `classify` в консоли.
4. Логику separators — вручную: скрыть все события месяца → месяц-разделитель должен стать невидим; показать все (toggle) → восстановлены 12/12 разделителей.
