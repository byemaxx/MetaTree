/**
 * Application version configuration.
 * Keep this as the single source of truth for UI version display.
 */
(function setAppVersion(global) {
    if (!global) return;
    global.APP_VERSION = 'v1.2.1';
})(typeof window !== 'undefined' ? window : null);
