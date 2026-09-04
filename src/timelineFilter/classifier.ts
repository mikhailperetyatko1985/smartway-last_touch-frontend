import { IFunnelFilterSettings } from 'interfaces/ITimelineFilterSettings';

// Чистый классификатор события timeline (план §5.3 / research_timeline_dom.md §6).
// Никакого обращения к сети/глобалкам — только DOM API: тестируется на jsdom-фикстурах.

export type STFVerdict = 'show' | 'hide';

const AUTHOR_CHIP_SELECTOR = '.feed-note__amojo-user[data-id]';
const AVATAR_SELECTOR = 'div.n-avatar[id]';
const SYSTEM_CLASS = 'feed-note-wrapper_system';
const PINNED_SELECTOR = '.js-note-pinned';

// Только ЧИСЛОВЫЕ id: UUID (чаты), base62, opened-talk-* → null (research §1/§2)
export function toIntOrNull(raw: string | null | undefined): number | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number.parseInt(trimmed, 10);
  return Number.isFinite(value) ? value : null;
}

// Авторы события рекурсивно: чипы + avatars вложенных субвью капсул (Q2).
// Вложенный дубль span.control-user_state[data-id] с тем же id не даёт новых
// значений благодаря Set; у -amojo/-undefined числовой автор = div.n-avatar[id].
export function collectAuthors(wrapper: Element): Set<number> {
  const authors = new Set<number>();

  wrapper.querySelectorAll(AUTHOR_CHIP_SELECTOR).forEach((chip) => {
    const id = toIntOrNull(chip.getAttribute('data-id'));
    if (id !== null) {
      authors.add(id);
    }
  });

  wrapper.querySelectorAll(AVATAR_SELECTOR).forEach((avatar) => {
    const id = toIntOrNull(avatar.id);
    if (id !== null) {
      authors.add(id);
    }
  });

  return authors;
}

export function isSystem(wrapper: Element): boolean {
  return wrapper.classList.contains(SYSTEM_CLASS);
}

// Закреплённые — не отдельная секция: div.js-note-pinned внутри обычного wrapper'а (research §2)
export function isPinned(wrapper: Element): boolean {
  return wrapper.querySelector(PINNED_SELECTOR) !== null;
}

/**
 * Приоритет правил (сверху вниз, research §6): pinned → system → no-author → target-match.
 * - pinned: !cfg.hide_pinned_no_target → SHOW даже без целевого автора (Q4-дефолт);
 * - system БЬЁТ автора (R4 зафиксировано dry-run'ом: смены этапов/контакты с целевым автором скрываются);
 * - no-author: боты/триггеры, почта (числовых авторов нет), задачи без чипа, opened_talks;
 * - target-match: хоть один целевой в субвью капсулы → SHOW целиком (Q2).
 */
export function classify(
  wrapper: Element,
  cfg: IFunnelFilterSettings,
  targetIds: Set<number>,
): STFVerdict {
  if (isPinned(wrapper) && !cfg.hide_pinned_no_target) {
    return 'show'; // приоритет 1
  }

  if (isSystem(wrapper)) {
    return cfg.hide_system ? 'hide' : 'show'; // приоритет 2
  }

  const authors = collectAuthors(wrapper); // приоритет 3
  if (authors.size === 0) {
    return cfg.hide_no_author ? 'hide' : 'show';
  }

  for (const id of authors) { // приоритет 4
    if (targetIds.has(id)) {
      return 'show';
    }
  }

  return 'hide';
}
