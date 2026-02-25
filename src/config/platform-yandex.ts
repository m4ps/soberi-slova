export const YANDEX_SDK_SCRIPT_SRC = '/sdk.js';
export const YANDEX_SDK_SCRIPT_MARKER_ATTR = 'data-yandex-sdk';
export const YANDEX_SDK_SCRIPT_LOAD_TIMEOUT_MS = 5_000;
export const YANDEX_LEADERBOARD_NAME = 'all-time-score';
export const YANDEX_PERSISTENCE_LOCAL_STORAGE_KEY = 'endless-word-grid/session/v1';
export const YANDEX_PERSISTENCE_CLOUD_DATA_KEY = 'endlessWordGridSessionV1';
export const YANDEX_PERSISTENCE_CLOUD_STATS_KEY = 'allTimeScore';
export const YANDEX_LEADERBOARD_RETRY_BACKOFF_MS = [500, 1_500, 4_000] as const;

export const YANDEX_LIFECYCLE_EVENTS = Object.freeze({
  pause: 'game_api_pause',
  resume: 'game_api_resume',
});

export type YandexLifecycleEvent =
  (typeof YANDEX_LIFECYCLE_EVENTS)[keyof typeof YANDEX_LIFECYCLE_EVENTS];
