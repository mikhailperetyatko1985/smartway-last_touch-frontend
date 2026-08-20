export interface IAmoUser {
  amojo_id: string;
  api_key: string;
  group_mates_ids: number[],
  id: number;
  login: number;
  name: string;
  personal_mobile: string|null;
  photo: string;
  settings: {
    default_task_preset: string;
    feed_filter: [];
    is_can_show_about_rebranding: boolean;
    is_current_account_data_deleted: boolean;
    layout_width: {
      companies: { width: string },
      contacts: { width: string },
      customers: { width: string },
      leads: { width: string },
      unsorted: { width: string },
    };
    need_msec: boolean;
    need_open_talks_preview: boolean;
    notify_time_before_task: number;
  };
  sso_auth: boolean;
  theme: number;
  tour: boolean;
  user_rank: string;
  uuid: string;
}