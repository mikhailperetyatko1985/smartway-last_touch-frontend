/**
 * POC «Фильтрация событий timeline сделки» — вставлять в консоль на
 * https://smartwaytoday.amocrm.ru/leads/detail/<id>
 *
 * Read-only: ничего не удаляет из DOM, только вешает display:none !important
 * и data-stf-hidden=1 на нерелевантные события. Кнопка-переключатель над списком.
 *
 * Перед запуском задать:
 *   TARGET_MANAGER_IDS — числовые user_id целевых менеджеров (ответственный + группа)
 */
(function () {
  'use strict';

  if (window.__STF_POC__) { window.__STF_POC__.destroy(); }

  var TARGET_MANAGER_IDS = [10722265]; // TODO(POC): сюда вписать user_id целевых менеджеров
  var CFG = {
    hideSystem: true,        // технические (смена полей/этапов/тегов/сервисные)
    hidePinned: false,       // скрывать ли закрепленные без целевых авторов
    hideNoAuthor: true,      // события без идентифицируемого автора (боты, триггеры, строки бесед)
    debounceMs: 250
  };

  var LIST_SEL = '.notes-wrapper__notes.js-notes';
  var BTN_ID = 'stf-poc-toggle-btn';
  var targetSet = {};
  TARGET_MANAGER_IDS.forEach(function (id) { targetSet[id] = true; });

  var state = 'filtered'; // 'filtered' | 'allShown'
  var mo = null;
  var routeTimer = null;
  var currentList = null;

  function toInt(v) {
    var n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }

  function collectAuthorIds(wrapper) {
    var ids = [];
    var nodes = wrapper.querySelectorAll('.feed-note__amojo-user[data-id], .feed-note__responsible [data-id]');
    for (var i = 0; i < nodes.length; i++) {
      var n = toInt(nodes[i].getAttribute('data-id'));
      if (n !== null) ids.push(n);
    }
    var avatars = wrapper.querySelectorAll('div.n-avatar[id]');
    for (var j = 0; j < avatars.length; j++) {
      var a = toInt(avatars[j].getAttribute('id'));
      if (a !== null) ids.push(a);
    }
    return ids;
  }

  function isSystem(wrapper) {
    return wrapper.classList.contains('feed-note-wrapper_system');
  }

  function isPinned(wrapper) {
    return !!wrapper.querySelector('.js-note-pinned');
  }

  // true => скрыть
  function shouldHide(wrapper) {
    if (isPinned(wrapper) && !CFG.hidePinned) return false;
    if (isSystem(wrapper)) {
      return !!CFG.hideSystem;
    }
    var authors = collectAuthorIds(wrapper);
    if (!authors.length) return !!CFG.hideNoAuthor;
    for (var i = 0; i < authors.length; i++) {
      if (targetSet[authors[i]]) return false; // хоть один целевой — показываем целиком (Q2)
    }
    return true;
  }

  function hideNode(el) {
    el.style.setProperty('display', 'none', 'important');
    el.setAttribute('data-stf-hidden', '1');
  }

  function showNode(el) {
    if (el.getAttribute('data-stf-hidden') === '1') {
      el.style.removeProperty('display');
      el.removeAttribute('data-stf-hidden');
    }
  }

  function wrappers(list) {
    return Array.prototype.filter.call(list.children, function (el) {
      return el.classList && el.classList.contains('feed-note-wrapper');
    });
  }

  // разделитель скрыт, если между ним и следующим разделителем нет видимых событий
  // (порядок old->new сверху вниз: label относится к событиям ниже себя)
  function processSeparators(list) {
    var kids = Array.prototype.slice.call(list.children);
    var hasVisible = false;
    for (var k = kids.length - 1; k >= 0; k--) {
      var el = kids[k];
      if (!el.classList) continue;
      if (el.classList.contains('note-time-label__wrapper')) {
        if (hasVisible) showNode(el); else hideNode(el);
        hasVisible = false;
      } else if (el.classList.contains('feed-note-wrapper')) {
        if (el.getAttribute('data-stf-hidden') !== '1') hasVisible = true;
      }
    }
  }

  function processList() {
    var list = document.querySelector(LIST_SEL);
    if (!list) return;
    currentList = list;
    var hidden = 0;
    var ws = wrappers(list);
    for (var i = 0; i < ws.length; i++) {
      if (state === 'allShown') { showNode(ws[i]); continue; }
      if (shouldHide(ws[i])) { hideNode(ws[i]); hidden++; } else { showNode(ws[i]); }
    }
    processSeparators(list);
    updateButton(hidden, ws.length);
  }

  function ensureButton() {
    var list = document.querySelector(LIST_SEL);
    if (!list) return;
    var host = list.parentElement; // .notes-wrapper__scroller-inner
    var btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = BTN_ID;
      btn.type = 'button';
      btn.setAttribute('class', 'button button-small');
      btn.setAttribute('style', 'display:block;margin:4px auto;');
      btn.addEventListener('click', function () {
        state = (state === 'filtered') ? 'allShown' : 'filtered';
        processList();
      });
      host.insertBefore(btn, list);
    }
  }

  function updateButton(hidden, total) {
    var btn = document.getElementById(BTN_ID);
    if (!btn) return;
    if (state === 'filtered') {
      btn.textContent = 'Показать все события' + (hidden ? ' (' + hidden + ' скрыто из ' + total + ')' : '');
      btn.style.display = hidden ? 'block' : 'none';
    } else {
      btn.textContent = 'Скрыть нерелевантные';
      btn.style.display = 'block';
    }
  }

  var debounceId = null;
  function scheduleProcess() {
    if (debounceId) clearTimeout(debounceId);
    debounceId = setTimeout(processList, CFG.debounceMs);
  }

  function attachObserver(list) {
    if (mo) mo.disconnect();
    mo = new MutationObserver(scheduleProcess);
    mo.observe(list, { childList: true }); // ТОЛЬКО childList — без subtree (шум fixer'ов)
  }

  function watchRoute() {
    // SPA-страховка: перерендер блока / переход между сделками
    routeTimer = setInterval(function () {
      var list = document.querySelector(LIST_SEL);
      if (!list) { if (mo) mo.disconnect(); return; }
      var btn = document.getElementById(BTN_ID);
      if (list !== currentList || !btn) {
        currentList = list;
        ensureButton();
        attachObserver(list);
      }
      scheduleProcess();
    }, 1000);
  }

  function destroy() {
    if (mo) mo.disconnect();
    if (routeTimer) clearInterval(routeTimer);
    var btn = document.getElementById(BTN_ID);
    if (btn) btn.remove();
    document.querySelectorAll('[data-stf-hidden="1"]').forEach(showNode);
    window.__STF_POC__ = null;
  }

  // ==== start ====
  currentList = document.querySelector(LIST_SEL);
  if (!currentList) {
    console.warn('[STF POC] Блок истории не найден — откройте деталку сделки и повторите.');
    return;
  }
  ensureButton();
  attachObserver(currentList);
  watchRoute();
  processList();
  console.info('[STF POC] enabled;', {
    targets: TARGET_MANAGER_IDS,
    cfg: CFG,
    note: 'stop: window.__STF_POC__.destroy(); set targets: window.__STF_POC__.setTargets([ids])'
  });

  window.__STF_POC__ = {
    destroy: destroy,
    refresh: processList,
    setTargets: function (ids) {
      targetSet = {};
      ids.forEach(function (id) { targetSet[id] = true; });
      processList();
    }
  };
})();
