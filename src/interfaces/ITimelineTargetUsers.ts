// Контракты backend /api/timeline-filter/target-users и users/sync (план §4.2–4.3)

export type ITimelineSyncState = 'idle' | 'queued' | 'running' | 'success' | 'failed';

// GET /target-users?responsible_user_id={id} → 200
export interface ITargetUsersResponse {
  group_id: number | null; // amo_group_id ответственного (null — без группы)
  target_user_ids: number[]; // ответственный + активные не-free участники его группы
}

// POST /users/sync → 202
export interface ISyncAcceptedResponse {
  state: 'queued';
}

// GET /users/sync-status → 200
export interface ISyncStatus {
  state: ITimelineSyncState;
  last_synced_at: string | null; // ISO 8601
  error: string | null;
}
