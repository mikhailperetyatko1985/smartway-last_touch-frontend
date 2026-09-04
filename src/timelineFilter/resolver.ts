import axios from 'axios';
import { IFunnelFilterSettings } from 'interfaces/ITimelineFilterSettings';
import { loadTimelineFilterSettings } from './settingsProvider';
import { loadTargetUsers } from './targetUsersProvider';

// Расчёт целевых менеджеров (план §5.2): единственный прямой amoCRM-запрос фильтра —
// GET /api/v4/leads/{id} через тот же транспорт, что и AmoPipelineApi/AmoManagerApi
// (axios на subdomain аккаунта, относительный путь). Дальше — только наш backend (seam loadTargetUsers).

export interface IStfResolution {
  cfg: IFunnelFilterSettings;
  targetIds: Set<number>;
}

const LEADS_URL = '/api/v4/leads';

interface ILedCustomFieldValue {
  value?: unknown;
}

// amoCRM v4 HAL: custom_fields_values[].{field_id, values[]}; у text-поля value — строка, у numeric — число
interface ILeadCustomFieldsValue {
  field_id?: number | null;
  values?: ILedCustomFieldValue[] | null;
}

export interface ILeadSnapshot {
  id: number;
  pipeline_id?: number | null;
  status_id?: number | null;
  responsible_user_id?: number | null;
  custom_fields_values?: ILeadCustomFieldsValue[] | null;
}

interface ILeadsHalResponse {
  _embedded?: { leads?: ILeadSnapshot[] } | null;
}

// Единый кэш резолва на leadId на время жизни маунта (§5.2): SPA-переход между карточками —
// новый leadId через render()/страховочный интервал (п. 5.1.2). Отрицательные результаты НЕ
// кешируем: при недоступном backend/неактивной стадии повторный резолв при следующем render'е
// обязан иметь шанс активировать фильтр, не дожидаясь перезагрузки страницы.
const resolveCache = new Map<string, IStfResolution>();

export function clearStfResolveCache(): void {
  resolveCache.clear();
}

// SPA-переходы между карточками: URL деталки — /leads/detail/{id} (research §2)
export function getCurrentLeadId(): string | null {
  if (typeof window === 'undefined' || !window.location?.pathname) {
    return null;
  }
  const match = window.location.pathname.match(/\/leads\/detail\/(\d+)/);
  return match ? match[1] : null;
}

function extractLead(data: unknown): ILeadSnapshot | null {
  const embedded = (data as ILeadsHalResponse | null)?._embedded;
  return embedded?.leads?.[0] ?? null;
}

// mode=custom: user_id из кастомного поля; пусто/NaN/отсутствующее поле → 0 (fallback на базового, ТЗ Q1)
function customResponsibleId(lead: ILeadSnapshot, customFieldId: number | null): number {
  if (customFieldId === null || !lead.custom_fields_values) {
    return 0;
  }

  for (const cfv of lead.custom_fields_values) {
    if (cfv.field_id !== customFieldId) {
      continue;
    }
    const value = Number(cfv.values?.[0]?.value);
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
  }

  return 0; // «протухшее» custom_field_id (§3.1) — рантайм-фолбэк на базового ответственного
}

/**
 * ГЕЙТ (план §5.2): cfg по lead.pipeline_id; нет cfg || mode=off || lead.status_id ∉ cfg.status_ids
 * → null (виджет молчит, показ без фильтра). 409 not_synced / сеть без кеша в loadTargetUsers — тоже null.
 * Никогда не бросает: любая ошибка — тихая деградация (R9).
 */
export async function resolveTargets(leadId: string): Promise<IStfResolution | null> {
  const cached = resolveCache.get(leadId);
  if (cached) {
    return cached;
  }

  const settings = await loadTimelineFilterSettings();
  const funnels = settings?.settings?.funnels;
  if (!funnels || funnels.length === 0) {
    return null; // виджет выключен везде (§3)
  }

  let lead: ILeadSnapshot | null = null;
  try {
    const response = await axios.get<ILeadsHalResponse>(`${LEADS_URL}/${leadId}`);
    lead = extractLead(response.data);
  } catch {
    return null; // сеть/авторизация — тихая деградация (R9)
  }

  if (!lead) {
    return null;
  }

  const cfg = funnels.find((funnel) => funnel.pipeline_id === lead.pipeline_id);
  if (!cfg || cfg.mode === 'off') {
    return null; // сделка вне настроенных воронок или воронка выключена
  }
  if (typeof lead.status_id !== 'number' || !cfg.status_ids.includes(lead.status_id)) {
    return null; // сделка вне активных стадий — виджет молчит (§3: без стадии не работает)
  }

  let responsibleId = 0;
  if (cfg.mode === 'custom') {
    const customId = customResponsibleId(lead, cfg.custom_field_id);
    responsibleId = customId > 0 ? customId : lead.responsible_user_id ?? 0; // fallback: пусто/NaN/0
  } else {
    responsibleId = lead.responsible_user_id ?? 0;
  }

  if (!Number.isFinite(responsibleId) || responsibleId <= 0) {
    return null; // ни базового, ни кастомного ответственного — фильтровать не по кому
  }

  const targetUsers = await loadTargetUsers(responsibleId);
  if (!targetUsers) {
    return null; // 409 not_synced / backend недоступен без кеша → тихий выход (виджет молчит)
  }

  const targetIds = new Set<number>();
  for (const id of targetUsers.target_user_ids ?? []) {
    if (Number.isInteger(id)) {
      targetIds.add(id);
    }
  }

  const resolution: IStfResolution = { cfg, targetIds };
  resolveCache.set(leadId, resolution);
  return resolution;
}
