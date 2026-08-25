import {
  ICallDurationMap,
  IFunnelEntry,
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

export function fromApiResponse(payload: ILastTouchSettingsPayload): ILastTouchFormState {
  const funnels: IFunnelEntry[] = payload.funnels === null
    ? []
    : payload.funnels.map((entry) => ({
        pipelineId: Number(entry.pipeline_id),
        statusIds: dedupeNumbers(safeNumberList(entry.status_ids)),
      }));

  const callStatuses = payload.call_statuses === null
    ? []
    : dedupeNumbers(safeNumberList(payload.call_statuses));

  const minCallDurations: ICallDurationMap = {};
  const durationMap = payload.min_call_duration_sec_by_status;
  if (durationMap !== null) {
    Object.keys(durationMap).forEach((key) => {
      const status = Number(key);
      if (Number.isNaN(status)) {
        return;
      }
      const value = durationMap[key];
      const sec = typeof value === 'number' ? value : Number(value);
      if (!Number.isNaN(sec)) {
        minCallDurations[status] = sec;
      }
    });
  }

  return {
    funnels,
    callStatuses,
    minCallDurations,
    customFieldId: payload.custom_field_id ?? null,
    disabledTouchTypes: payload.disabled_touch_types === null ? [] : [...payload.disabled_touch_types],
  };
}

export function toApiPayload(form: ILastTouchFormState): ILastTouchSettingsPayload {
  const funnels = form.funnels
    .filter((f) => f.statusIds.length > 0)
    .map((f) => ({ pipeline_id: f.pipelineId, status_ids: dedupeNumbers(f.statusIds) }));

  const minCallDurations: Record<string, number> = {};
  form.callStatuses.forEach((status) => {
    if (!Object.prototype.hasOwnProperty.call(form.minCallDurations, status)) {
      return;
    }
    const sec = form.minCallDurations[status];
    if (Number.isInteger(sec) && sec >= 0) {
      minCallDurations[String(status)] = sec;
    }
  });

  return {
    funnels: funnels.length ? funnels : null,
    call_statuses: form.callStatuses.length ? dedupeNumbers(form.callStatuses) : null,
    min_call_duration_sec_by_status: Object.keys(minCallDurations).length ? minCallDurations : null,
    custom_field_id: form.customFieldId ?? null,
    disabled_touch_types: form.disabledTouchTypes.length ? [...form.disabledTouchTypes] : null,
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

const mapsEqual = (a: ICallDurationMap, b: ICallDurationMap): boolean => {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  return keysA.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) && a[Number(key)] === b[Number(key)],
  );
};

export function isFormDirty(form: ILastTouchFormState, baseline: ILastTouchFormState): boolean {
  return (
    !arraysEqual(form.funnels, baseline.funnels) ||
    !arraysEqual(form.callStatuses, baseline.callStatuses) ||
    !mapsEqual(form.minCallDurations, baseline.minCallDurations) ||
    form.customFieldId !== baseline.customFieldId ||
    !arraysEqual(form.disabledTouchTypes, baseline.disabledTouchTypes)
  );
}
