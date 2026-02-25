export const YANDEX_SDK_SCRIPT_SRC = '/sdk.js';
export const YANDEX_SDK_SCRIPT_MARKER_ATTR = 'data-yandex-sdk';
export const YANDEX_SDK_SCRIPT_LOAD_TIMEOUT_MS = 5_000;

export const YANDEX_LIFECYCLE_EVENTS = Object.freeze({
  pause: 'game_api_pause',
  resume: 'game_api_resume',
});

export type YandexLifecycleEvent =
  (typeof YANDEX_LIFECYCLE_EVENTS)[keyof typeof YANDEX_LIFECYCLE_EVENTS];
