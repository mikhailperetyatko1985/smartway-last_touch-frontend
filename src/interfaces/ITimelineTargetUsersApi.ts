import { ITargetUsersResponse, ISyncAcceptedResponse, ISyncStatus } from 'interfaces/ITimelineTargetUsers';

export interface ITimelineTargetUsersApi {
  // GET /api/timeline-filter/target-users?responsible_user_id={id} → 200 | 409 not_synced
  get(responsibleUserId: number): Promise<ITargetUsersResponse>;
  // POST /api/timeline-filter/users/sync → 202 {state:'queued'} | 409 already_running
  startSync(): Promise<ISyncAcceptedResponse>;
  // GET /api/timeline-filter/users/sync-status → {state, last_synced_at, error}
  syncStatus(): Promise<ISyncStatus>;
}
