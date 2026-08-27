import {
  ICallDurationMap,
  IFunnelEntry,
  IFunnelEntryPayload,
  ILastTouchFormState,
  ILastTouchSettingsPayload,
} from 'interfaces/ILastTouchSettings';

function dedupeNumbers(arr: number[]): number[] {
  const seen = new Set<number>();
  return arr.filter((num) => {
    if (seen.has(num)) {
      return false;
    }
    seen.add(num);
    return true;
  });
}

const safeNumberList = (values: unknown[]): number[] =>
  values.reduce<number[]>((acc, value) => {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isNaN(num)) {
      acc.push(num);
    }
    return acc;
  }, []);

const safeDurationMap = (value: unknown): ICallDurationMap => {
  const result: ICallDurationMap = {};
  if (value === null || typeof value !== 'object') {
    return result;
  }
  Object.keys(value as Record<string, unknown>).forEach((key) => {
    const status = Number(key);
    if (Number.isNaN(status)) {
      return;
    }
    const raw = (value as Record<string, unknown>)[key];
    const sec = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isNaN(sec)) {
      result[status] = sec;
    }
  });
  return result;
};

const mapFunnelFromApi = (entry: IFunnelEntryPayload): IFunnelEntry => ({
  pipelineId: Number(entry.pipeline_id),
  statusIds: dedupeNumbers(safeNumberList(entry.status_ids ?? [])),
  callStatuses: dedupeNumbers(safeNumberList(entry.call_statuses ?? [])),
  minCallDurations: safeDurationMap(entry.min_call_duration_sec_by_status ?? {}),
  disabledTouchTypes: entry.disabled_touch_types === null || entry.disabled_touch_types === undefined
    ? []
    : [...entry.disabled_touch_types],
  responsibleCustomFieldId: entry.responsible_custom_field_id ?? null,
});

export function fromApiResponse(payload: ILastTouchSettingsPayload): ILastTouchFormState {
  const funnels: IFunnelEntry[] = payload.funnels === null
    ? []
    : payload.funnels.map(mapFunnelFromApi);

  return {
    funnels,
    customFieldId: payload.custom_field_id ?? null,
  };
}

const mapFunnelToApi = (f: IFunnelEntry): IFunnelEntryPayload => {
  const minCallDurations: Record<string, number> = {};
  f.callStatuses.forEach((status) => {
    if (!Object.prototype.hasOwnProperty.call(f.minCallDurations, status)) {
      return;
    }
    const sec = f.minCallDurations[status];
    if (Number.isInteger(sec) && sec >= 0) {
      minCallDurations[String(status)] = sec;
    }
  });

  return {
    pipeline_id: f.pipelineId,
    status_ids: dedupeNumbers(f.statusIds),
    call_statuses: dedupeNumbers(f.callStatuses),
    min_call_duration_sec_by_status: minCallDurations,
    disabled_touch_types: [...f.disabledTouchTypes],
    responsible_custom_field_id: f.responsibleCustomFieldId,
  };
};

export function toApiPayload(form: ILastTouchFormState): ILastTouchSettingsPayload {
  const funnels = form.funnels
    .filter((f) => f.statusIds.length > 0)
    .map(mapFunnelToApi);

  return {
    funnels: funnels.length ? funnels : null,
    custom_field_id: form.customFieldId ?? null,
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && arraysEqual(a, b);
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  const recordA = a as Record<string, unknown>;
  const recordB = b as Record<string, unknown>;
  const keysA = Object.keys(recordA);
  const keysB = Object.keys(recordB);
  if (keysA.length !== keysB.length) {
    return false;
  }
  return keysA.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(recordB, key) && deepEqual(recordA[key], recordB[key]),
  );
}

function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((item, index) => deepEqual(item, b[index]));
}

export function isFormDirty(form: ILastTouchFormState, baseline: ILastTouchFormState): boolean {
  return (
    !arraysEqual(form.funnels, baseline.funnels) ||
    form.customFieldId !== baseline.customFieldId
  );
}
