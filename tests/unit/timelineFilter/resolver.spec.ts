import { describe, it, expect, vi, beforeEach } from 'vitest';

// Гейты резолва (план §5.2): pipeline_id + status_ids + mode; base/custom выбор ответственного;
// 409 not_synced / сеть — тихий выход без исключений. Транспорт amo v4 и backend-seams — моки.

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('axios', () => ({ __esModule: true, default: { get: getMock } }));
vi.mock('../../../src/timelineFilter/settingsProvider', () => ({
  loadTimelineFilterSettings: vi.fn(),
  saveTimelineFilterSettings: vi.fn(),
}));
vi.mock('../../../src/timelineFilter/targetUsersProvider', () => ({
  loadTargetUsers: vi.fn(),
}));

import { resolveTargets, clearStfResolveCache, extractStfLead } from '../../../src/timelineFilter/resolver';
import { loadTimelineFilterSettings } from '../../../src/timelineFilter/settingsProvider';
import { loadTargetUsers } from '../../../src/timelineFilter/targetUsersProvider';
import type { IFunnelFilterSettings } from '../../../src/interfaces/ITimelineFilterSettings';

const settingsMock = vi.mocked(loadTimelineFilterSettings);
const targetUsersMock = vi.mocked(loadTargetUsers);

function funnel(overrides: Partial<IFunnelFilterSettings> = {}): IFunnelFilterSettings {
  return {
    pipeline_id: 7,
    status_ids: [11, 22],
    mode: 'base',
    custom_field_id: null,
    hide_system: true,
    hide_pinned_no_target: false,
    hide_no_author: true,
    ...overrides,
  };
}

function mockLead(lead: Record<string, unknown>): void {
  getMock.mockResolvedValue({ data: { _embedded: { leads: [lead] } } });
}

const BASE_LEAD = { id: 42661594, pipeline_id: 7, status_id: 11, responsible_user_id: 10722265 };

beforeEach(() => {
  vi.clearAllMocks();
  clearStfResolveCache();
  settingsMock.mockResolvedValue({ saved: true, settings: { funnels: [funnel()] } });
  targetUsersMock.mockResolvedValue({ group_id: 3, target_user_ids: [10722265, 10136549] });
});

describe('resolver: гейты (план §5.2)', () => {
  it('mode=off → null (тихий выход), target-users не запрашивается', async () => {
    settingsMock.mockResolvedValue({ saved: true, settings: { funnels: [funnel({ mode: 'off' })] } });
    mockLead(BASE_LEAD);

    await expect(resolveTargets('42661594')).resolves.toBeNull();
    expect(getMock).toHaveBeenCalledWith('/api/v4/leads/42661594');
    expect(targetUsersMock).not.toHaveBeenCalled();
  });

  it('status_id ∉ cfg.status_ids → null, target-users не запрашивается', async () => {
    mockLead({ ...BASE_LEAD, status_id: 99 }); // стадия вне выбранных в настройках

    await expect(resolveTargets('42661594')).resolves.toBeNull();
    expect(targetUsersMock).not.toHaveBeenCalled();
  });

  it('pipeline_id не настроен → null (cfg не найден)', async () => {
    mockLead({ ...BASE_LEAD, pipeline_id: 8 });

    await expect(resolveTargets('42661594')).resolves.toBeNull();
    expect(targetUsersMock).not.toHaveBeenCalled();
  });

  it('funnels=null (виджет выключен) → null без единого amo-запроса', async () => {
    settingsMock.mockResolvedValue({ saved: false, settings: { funnels: null } });

    await expect(resolveTargets('42661594')).resolves.toBeNull();
    expect(getMock).not.toHaveBeenCalled();
  });

  it('backend настроек недоступен (null) → null, не бросает', async () => {
    settingsMock.mockResolvedValue(null);

    await expect(resolveTargets('42661594')).resolves.toBeNull();
  });

  it('amo-запрос упал (сеть/токен) → null, не бросает (R9)', async () => {
    getMock.mockRejectedValue(new Error('network down'));

    await expect(resolveTargets('42661594')).resolves.toBeNull();
    expect(targetUsersMock).not.toHaveBeenCalled();
  });
});

describe('resolver: выбор ответственного (Q1)', () => {
  it('mode=base → lead.responsible_user_id', async () => {
    mockLead(BASE_LEAD);

    const result = await resolveTargets('42661594');
    expect(targetUsersMock).toHaveBeenCalledWith(10722265);
    expect(result?.targetIds).toEqual(new Set([10722265, 10136549]));
    expect(result?.cfg.pipeline_id).toBe(7);
  });

  it('mode=custom: значение кастомного поля (строка) → Number(user_id)', async () => {
    settingsMock.mockResolvedValue({
      saved: true,
      settings: { funnels: [funnel({ mode: 'custom', custom_field_id: 2307846 })] },
    });
    mockLead({
      ...BASE_LEAD,
      custom_fields_values: [{ field_id: 2307846, values: [{ value: '13159601' }] }],
    });

    const result = await resolveTargets('42661594');
    expect(targetUsersMock).toHaveBeenCalledWith(13159601);
    expect(result?.targetIds).toEqual(new Set([10722265, 10136549]));
  });

  it('mode=custom: поле пусто → fallback на базового ответственного', async () => {
    settingsMock.mockResolvedValue({
      saved: true,
      settings: { funnels: [funnel({ mode: 'custom', custom_field_id: 2307846 })] },
    });
    mockLead({ ...BASE_LEAD, custom_fields_values: [{ field_id: 2307846, values: [{ value: '' }] }] });

    await resolveTargets('42661594');
    expect(targetUsersMock).toHaveBeenCalledWith(10722265); // fallback: lead.responsible_user_id
  });

  it('mode=custom: значение NaN/0 → fallback на базового ответственного', async () => {
    settingsMock.mockResolvedValue({
      saved: true,
      settings: { funnels: [funnel({ mode: 'custom', custom_field_id: 2307846 })] },
    });
    mockLead({ ...BASE_LEAD, custom_fields_values: [{ field_id: 2307846, values: [{ value: 'abc' }] }] });

    await resolveTargets('42661594');
    expect(targetUsersMock).toHaveBeenCalledWith(10722265);
  });

  it('mode=custom: поле отсутствует в сделке (протухший id) → fallback на базового', async () => {
    settingsMock.mockResolvedValue({
      saved: true,
      settings: { funnels: [funnel({ mode: 'custom', custom_field_id: 999 })] },
    });
    mockLead(BASE_LEAD);

    await resolveTargets('42661594');
    expect(targetUsersMock).toHaveBeenCalledWith(10722265);
  });

  it('нет ни базового, ни кастомного ответственного → null', async () => {
    mockLead({ ...BASE_LEAD, responsible_user_id: null });

    await expect(resolveTargets('42661594')).resolves.toBeNull();
    expect(targetUsersMock).not.toHaveBeenCalled();
  });
});

describe('resolver: backend target-users (seam)', () => {
  it('409 not_synced → seam отдаёт null → тихий выход без исключений', async () => {
    // TimelineTargetUsersApi бросает TimelineTargetUsersError('not_synced') на 409;
    // provider loadTargetUsers перехватывает и отдаёт null при пустом кеше — именно этот контракт проверяем
    mockLead(BASE_LEAD);
    targetUsersMock.mockResolvedValue(null);

    await expect(resolveTargets('42661594')).resolves.toBeNull();
  });

  it('единый кэш резолва на leadId: повторный вызов — без повторного amo-запроса', async () => {
    mockLead(BASE_LEAD);

    const first = await resolveTargets('42661594');
    const second = await resolveTargets('42661594');

    expect(first).not.toBeNull();
    expect(second).toBe(first); // тот же объект из кеша
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(targetUsersMock).toHaveBeenCalledTimes(1);
  });

  it('разные leadId — независимые резолвы', async () => {
    mockLead(BASE_LEAD);

    await resolveTargets('42661594');
    await resolveTargets('42661595');

    expect(getMock).toHaveBeenCalledTimes(2);
  });
});

// РЕГРЕССИЯ H2 (корневая причина «фильтр не работает»): GET /api/v4/leads/{id} отдаёт лид ПЛОСКО
// на верхнем уровне ({ id, pipeline_id, status_id, ... }), а _embedded содержит только { tags: [...] }.
// Старый extractLead читал _embedded.leads[0] → всегда null → фильтр никогда не активировался.
describe('resolver: форма ответа amo v4 (регрессия H2)', () => {
  it('плоский лид на верхнем уровне (реальный GET /api/v4/leads/{id}) → резолв проходит', async () => {
    getMock.mockResolvedValue({ data: BASE_LEAD }); // без _embedded вообще

    const result = await resolveTargets('42661594');

    expect(targetUsersMock).toHaveBeenCalledWith(10722265);
    expect(result?.cfg.pipeline_id).toBe(7);
    expect(result?.targetIds).toEqual(new Set([10722265, 10136549]));
  });

  it('плоский лид + _embedded.tags (точная PROD-форма: tags есть, leads НЕТ) → резолв проходит', async () => {
    getMock.mockResolvedValue({ data: { ...BASE_LEAD, _embedded: { tags: [{ id: 1, name: 'x' }] } } });

    const result = await resolveTargets('42661594');

    expect(result).not.toBeNull();
    expect(targetUsersMock).toHaveBeenCalledOnce();
  });

  it('id приходит строкой в плоском ответе → всё равно извлекается', async () => {
    getMock.mockResolvedValue({ data: { ...BASE_LEAD, id: String(BASE_LEAD.id) } });

    const result = await resolveTargets('42661594');

    expect(result).not.toBeNull();
  });

  it('ответ без объекта лида (только _links/ошибка-обёртка) → null, не бросает', async () => {
    getMock.mockResolvedValue({ data: { _links: { self: {} } } });

    await expect(resolveTargets('42661594')).resolves.toBeNull();
    expect(targetUsersMock).not.toHaveBeenCalled();
  });

  it('плоский лид без pipeline_id (поле не пришло) → null по гейту воронок', async () => {
    const { pipeline_id: _omit, ...noPipeline } = BASE_LEAD;
    getMock.mockResolvedValue({ data: noPipeline });

    await expect(resolveTargets('42661594')).resolves.toBeNull();
    expect(targetUsersMock).not.toHaveBeenCalled();
  });
});

describe('extractStfLead: seam извлечения снапшота', () => {
  it('плоская форма → сам объект', () => {
    const lead = extractStfLead({ id: 1, pipeline_id: 7, status_id: 11 });
    expect(lead?.status_id).toBe(11);
  });

  it('HAL-форма _embedded.leads[0] → вложенный лид (совместимость со списочными ответами)', () => {
    const lead = extractStfLead({ _embedded: { leads: [{ id: 2, status_id: 5 }] } });
    expect(lead?.id).toBe(2);
  });

  it('пусто/null/чужая форма → null', () => {
    expect(extractStfLead(null)).toBeNull();
    expect(extractStfLead(undefined)).toBeNull();
    expect(extractStfLead({})).toBeNull();
    expect(extractStfLead({ _embedded: {} })).toBeNull();
  });
});
